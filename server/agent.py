"""
The AuraAssist agent: natural language -> MCP tool calls -> spoken reply.

Two interchangeable engines, same contract:

  * Mock engine (default): a deterministic keyword router. It exercises the
    exact same MCP tools, honours the same confirmation rules, and produces
    the same `{reply, tool_calls}` shape as the Bedrock engine - so the whole
    product (UI, demo script, tests) runs with zero AWS setup.

  * Bedrock engine (AURA_USE_BEDROCK=1): Amazon Nova Lite via the Converse
    API with full toolConfig. The LLM chooses tools; this module never lets
    it bypass safety: unlocking and routine execution are downgraded to
    plan-only unless THIS turn's user message is an explicit approval.

The LLM (or the keywords) never mutates the home directly - every effect goes
through the MCP server's own tool dispatch (`mcp.call_tool`), the same path
Alexa+ uses. One execution path, one event log, every surface.
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime

from .mcp_tools import mcp

SYSTEM_PROMPT = """\
You are AuraAssist, the voice of a smart home. You control the home ONLY \
through the provided tools. Never guess device states - call get_home_snapshot \
first whenever the user asks about state ("is the door locked?", "what's on?").

PERSONALITY - you are a calm, dry home attendant, not a call-centre bot:
- Never open with "How can I assist you today" or any customer-service \
script. Never close with "feel free to ask" or "is there anything else I \
can help you with". Talk like a person who lives there too.
- A greeting gets ONE short sentence back. Match the user's energy, don't \
stage-manage it.
- You know this home. Refer to rooms by name, use the digest, skip what's \
boring. If nothing matters, say so plainly ("All quiet here.").

HOME STATUS BRIEFING - for "what's happening", "what's on", "status":
- get_home_snapshot returns a `digest` field with ready-made lines. Relay \
them nearly verbatim, in this order: any `digest.observations` first (one \
short line: "Your home is running normally." or "Needs attention:"), then \
the `digest.lines` group by group (Security, Climate, Lights, Curtains).
- `digest.observations` are verified facts worth surfacing (unlocked door, \
oven still on, AC running while in Away mode). They are observations, NOT \
suggestions; never invent extra ones.
- Never add devices or rooms the digest did not mention - the grouping is \
already the right level of detail. Do not re-state what is simply "off" \
beyond what the lines say.
- End with ONE short offer tied to what you just said ("Want the curtains \
closed?", "Shall I turn the lights off?").

STYLE - your replies are spoken aloud, never read:
- Maximum 2 sentences for ordinary replies. Status briefings may use up to 4 \
short lines - one per digest group. Round every number: "22C", never \
"22.3467C".
- Name at most 3 devices, then summarize ("and 4 more lights off").
- No markdown, no lists, no emoji. If a tool failed, say plainly what did \
not happen. Never pretend an action succeeded.

TOOL SELECTION:
- Single device control -> control_device
- "prepare for bed", "I'm leaving", "morning" -> run_routine with confirm=false \
FIRST; only call again with confirm=true after the user explicitly approves.
- "what changed / what happened today" -> get_recent_events; its digest field \
already groups the changes - relay it in exactly ONE sentence covering at most \
3 facts. Never list items one by one.
- "where are my keys/wallet/phone" -> find_object
- "what do you see / what's in the kitchen / what's on the table" -> describe_scene. \
Its result has detailed objects with locations - be PRECISE. If asked "what's on the X", \
look up objects where location mentions that surface. Give a direct answer naming \
the actual objects you see. Don't guess from stale data if fresh vision is available.
- Accessibility or privacy preferences -> set_user_preference

SAFETY - hard rules, no exceptions:
- Unlocking is security-sensitive. To request it you MUST first call \
control_device with action=unlock and confirm=false (the tool's refusal IS the \
formal confirmation request - relay its message to the user). Never just ask in \
text without calling the tool: the home state must record the pending request. \
Only after the user says a clear yes may you call it again with confirm=true.
- run_routine: call with confirm=false FIRST (the plan it returns is what you \
read back). Only call again with confirm=true after the user approves.
- Ambiguous replies mean: ask again, do not act.
- You never infer who is home, anyone's health, or routines not requested.
- If a scene description mentions a hazard, state it plainly and offer one \
concrete next step. Do not dramatize.
- Output ONLY the spoken reply. No <thinking> tags, no reasoning, no reasoning \
blocks - just the final answer text.

CONVERSATION: remember what the user confirmed or declined earlier in the \
session. If they decline an action, do not re-propose it unprompted.\
"""

# Sessions live in memory - fine for the demo, swapped for DynamoDB on AWS.
sessions: dict[str, dict] = {}

APPROVAL_WORDS = {"yes", "y", "yeah", "yep", "yup", "ok", "okay", "dokey", "sure",
                  "absolutely", "certainly", "fine", "good", "perfect", "great",
                  "sounds", "confirm", "confirmed", "approve", "approved", "proceed",
                  "continue", "please", "go", "ahead", "do", "it", "that's", "thats",
                  "right", "correct", "true", "really", "alright", "allright", "aye",
                  "thing", "for"}
DECLINE_WORDS = {"no", "n", "nope", "nah", "cancel", "cancelled", "stop", "don't",
                 "dont", "never", "mind", "nevermind", "leave", "it", "later",
                 "wait", "hold", "today", "skip", "not"}

MAX_TOOL_ROUNDS = 5
MAX_HISTORY_MESSAGES = 24

# Canonical routine phrases -> routine name. Shared by both engines so a
# demo-critical request behaves identically offline and on Bedrock.
_ROUTINE_PHRASES: list[tuple[str, tuple[str, ...]]] = [
    ("bedtime", ("prepare for bed", "get ready for bed", "time for bed",
                 "bedtime routine", "going to bed")),
    ("leaving_home", ("i'm leaving", "im leaving", "leaving now", "leaving home",
                      "i'm off", "im off", "going out", "heading out")),
    ("morning", ("morning routine", "wake up routine", "start the day")),
]

# Status/briefing phrases: the snapshot for these is fetched by code before
# the model runs, so a status question ALWAYS has fresh state (and the tool
# call is always visible in the log) no matter what the model feels like.
_STATUS_PHRASES = (
    "what's on", "what is on", "what's running", "what is running",
    "what's happening", "what is happening", "happening in", "happening at",
    "how's the house", "how is the house", "how's home", "how is home",
    "how are things", "state of the house", "state of the home",
    "check the house", "check the home", "house status", "home status",
    "everything ok", "everything okay", "all good", "briefing", "brief me",
    "what do we have", "status",
)


def _session(session_id: str) -> dict:
    return sessions.setdefault(session_id, {"history": [], "pending": None, "turns": 0})


def _tokens(text: str) -> list[str]:
    return re.sub(r"[^\w']+", " ", text.lower()).split()


def _is_approval(text: str) -> bool:
    """True only when the WHOLE message is approval words and connective filler.

    Deliberately strict: 'yes, do it' approves, but 'please turn off the lights'
    does not - a command issued while a confirmation is pending must never be
    mistaken for an approval of that pending action.
    """
    words = _tokens(text)
    return bool(words) and all(w in APPROVAL_WORDS for w in words)


def _is_decline(text: str) -> bool:
    words = _tokens(text)
    return bool(words) and all(w in DECLINE_WORDS for w in words)


# ------------------------------------------------------------- tool calls --

async def _call_tool(name: str, arguments: dict) -> tuple[dict, str]:
    """Run one tool through the MCP server's own dispatch. Returns (data, text)."""
    result = await mcp.call_tool(name, arguments)
    text = ""
    if getattr(result, "content", None):
        text = result.content[0].text if hasattr(result.content[0], "text") else str(result.content[0])
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        data = {"raw": text}
    if getattr(result, "isError", False) and "error" not in data:
        data = {"error": text or "tool failed"}
    return data, text


def _summarise_call(name: str, arguments: dict, data: dict) -> str:
    """One line for the on-screen tool-call log (the judging artifact)."""
    if "error" in data:
        return f"{name} → {data['error']}"
    if name == "control_device" and "before" in data:
        return f"{data.get('name', arguments.get('device_id'))}: {data['before']} → {data['after']}"
    if name == "run_routine":
        if "steps" in data:
            return f"{name}({arguments.get('routine_name')}) planned {len(data['steps'])} steps"
        return f"{name}({arguments.get('routine_name')}) applied {len(data.get('applied', []))} changes"
    if name == "find_object" and data.get("found"):
        return f"found {data['object']} at {data['location']}"
    if name == "describe_scene":
        obj_list = ', '.join([f"{o.get('label')} ({o.get('location')})" for o in data.get('objects', [])[:8]])
        return f"{name}({arguments.get('camera_id')}): {obj_list or 'nothing visible'}"
    if name == "get_recent_events":
        return f"{data.get('count', 0)} events"
    if name == "get_home_snapshot":
        return f"snapshot: {len(data.get('devices', []))} devices"
    return name


def _routine_reply(data: dict) -> str:
    """Spoken reply for a planned routine. plan_routine's summary is a dict
    ({spoken, actions, ...}); older plans used a plain string."""
    summary = data.get("summary")
    if isinstance(summary, dict):
        return summary.get("spoken") or "Done."
    if data.get("requires_confirmation") and data.get("steps"):
        return f"{summary} Shall I go ahead?"
    return summary or "Done."


def _apply_guardrails(calls: list[tuple[str, dict]], session: dict, user_text: str) -> list[tuple[str, dict]]:
    """
    Server-side enforcement, independent of what the model asked for:
    confirm=true only survives when the user's CURRENT message is an explicit
    approval AND a matching plan is pending in this session.
    """
    approved = _is_approval(user_text)
    pending = session.get("pending")
    safe = []
    for name, args in calls:
        args = dict(args or {})
        if name == "control_device" and args.get("action") == "unlock" and args.get("confirm"):
            if not (approved and pending and pending.get("type") == "unlock"):
                args["confirm"] = False
        if name == "run_routine" and args.get("confirm"):
            if not (approved and pending and pending.get("type") == "routine"
                    and pending.get("name") == args.get("routine_name")):
                args["confirm"] = False
        safe.append((name, args))
    return safe


def _track_pending(session: dict, name: str, arguments: dict, data: dict) -> None:
    """Remember what asked for confirmation, so a later 'yes' can unlock it."""
    if name == "run_routine" and data.get("steps") and arguments.get("confirm") is not True:
        session["pending"] = {"type": "routine", "name": arguments.get("routine_name")}
    elif name == "control_device" and data.get("status") == "needs_confirmation":
        session["pending"] = {"type": "unlock", "device_id": arguments.get("device_id")}
    elif name == "run_routine" and "applied" in data:
        session["pending"] = None
    elif name == "control_device" and data.get("status") == "ok":
        # The confirmation was consumed - the action it waited for happened.
        session["pending"] = None


# ------------------------------------------------------------ Bedrock path --

def _bedrock_client():
    import boto3
    return boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1"))


def _bedrock_tools() -> list[dict]:
    """MCP tool schemas -> Bedrock Converse toolSpec format. Refreshed from the
    live registry at startup, so a tool added to mcp_tools.py is instantly
    available to the agent with zero agent-code changes."""
    return _STATIC_TOOLS


# Populated at startup from the MCP tool registry (see refresh_tool_specs).
_STATIC_TOOLS: list[dict] = []
_DEVICE_INDEX: str = ""


def refresh_tool_specs() -> None:
    """Snapshot the live MCP tool registry into Bedrock Converse toolSpecs,
    plus build the device index the model uses to avoid inventing ids."""
    global _STATIC_TOOLS, _DEVICE_INDEX
    _STATIC_TOOLS = [
        {"toolSpec": {"name": t.name, "description": t.description or "",
                      "inputSchema": {"json": t.parameters}}}
        for t in mcp._tool_manager.list_tools()
    ]
    from .devices import create_devices
    _DEVICE_INDEX = "\n".join(
        f"- {d['id']} ({d['type']}, {d['room']}): {d['name']}"
        for d in create_devices().values()
    )


def _system_prompt() -> str:
    """System prompt + the exact device ids (grounding: models must not invent ids)."""
    return (SYSTEM_PROMPT
            + "\n\nEXACT DEVICE IDS - use these ids verbatim, never invent your own:\n"
            + _DEVICE_INDEX)


def _detect_routine(message: str) -> str | None:
    """Canonical routine phrases, routed by code (both engines agree on these).

    Deliberately narrow: only unambiguous, non-question phrases. Everything
    else (free-form like "I'm knackered, sort the house") still reaches the
    model, which may call run_routine itself.
    """
    plain = message.lower().strip()
    for name, phrases in _ROUTINE_PHRASES:
        if any(p in plain for p in phrases):
            return name
    return None


async def invoke_bedrock(message: str, session_id: str) -> dict:
    session = _session(session_id)
    tool_log: list[dict] = []

    # Approvals and declines are resolved by deterministic code, never by the
    # model - an LLM having a creative turn must not change what "yes" means.
    pending = session.get("pending")
    if pending:
        plain = message.lower().strip().rstrip("?.!")
        if _is_approval(plain):
            if pending["type"] == "routine":
                data, _ = await _call_tool(
                    "run_routine", {"routine_name": pending["name"], "confirm": True})
                tool_log.append({"name": "run_routine",
                                 "arguments": {"routine_name": pending["name"], "confirm": True},
                                 "result": _summarise_call("run_routine", {}, data)})
                _track_pending(session, "run_routine", {}, data)
                return _respond(session, data.get("summary", "Done."), tool_log)
            if pending["type"] == "unlock":
                guarded = _apply_guardrails(
                    [("control_device", {"device_id": pending["device_id"],
                                         "action": "unlock", "confirm": True})],
                    session, message)
                data, _ = await _call_tool(*guarded[0])
                tool_log.append({"name": guarded[0][0], "arguments": guarded[0][1],
                                 "result": _summarise_call(guarded[0][0], guarded[0][1], data)})
                session["pending"] = None
                if data.get("status") == "ok":
                    return _respond(session, "The front door is unlocked.", tool_log)
                return _respond(session, "That didn't go through - the door is still locked.", tool_log)
        if _is_decline(plain):
            session["pending"] = None
            return _respond(session, "Understood - nothing was changed.", tool_log)
        # Any other request moves on: a later "yes" must never approve a plan
        # the user walked away from.
        session["pending"] = None

    # Canonical routine phrases plan deterministically - asking twice must
    # always produce a plan to confirm, whatever the model feels like doing.
    routine = _detect_routine(message)
    if routine:
        args = {"routine_name": routine, "confirm": False}
        data, _ = await _call_tool("run_routine", args)
        tool_log.append({"name": "run_routine", "arguments": args,
                         "result": _summarise_call("run_routine", args, data)})
        _track_pending(session, "run_routine", args, data)
        reply = _routine_reply(data)

        # Keep the conversation coherent: later model turns must see this turn.
        session["history"].append({"role": "user", "content": [{"text": message}]})
        session["history"].append({"role": "assistant", "content": [{"text": reply}]})
        if len(session["history"]) > MAX_HISTORY_MESSAGES:
            session["history"] = session["history"][-MAX_HISTORY_MESSAGES:]
        return _respond(session, reply, tool_log)

    # Resolve item-location requests in code before the LLM. This keeps voice
    # queries grounded in sighting memory and the current camera view.
    if _LOCATION_Q.search(message.lower()):
        return _respond(session, await _locate_object(message, tool_log), tool_log)
    # Fridge-content questions: call describe_scene("fridge") for accurate inventory
    fridge_q = re.search(r"\b(what'?s|what is|show me|check|open|inside|in|contents? of)\b.*\b(fridge|refrigerator|freezer)\b"
                         r"|\b(fridge|refrigerator|freezer)\b.*\b(content|inside|have|got|contain)", message.lower())
    if fridge_q:
        data, _ = await _call_tool("describe_scene", {"camera_id": "fridge"})
        tool_log.append({"name": "describe_scene", "arguments": {"camera_id": "fridge"},
                         "result": _summarise_call("describe_scene", {"camera_id": "fridge"}, data)})
        if "error" in data:
            return _respond(session, "I couldn't inspect the fridge camera just now.", tool_log)
        if data.get("objects"):
            inv = "; ".join([f"{o['label']} {o.get('location', '')}".strip() for o in data["objects"]])
            message = (f"{message}\n\n[system: FRIDGE INVENTORY from describe_scene(fridge) - "
                       f"list these items precisely. Items: {inv}. Summary: {data.get('summary', '')}]")
        else:
            message = f"{message}\n\n[system: Fridge appears empty or camera unavailable.]"

    # Table/surface questions: force fresh vision for accuracy
    table_match = re.search(r"\bwhat(?:'s| is) on (?:the )?(.+?\b(?:coffee\s+table|table|stand|desk|shelf|counter|surface))\b", message.lower())
    if table_match:
        room_hint = session.get("room") or "living"
        # Try to infer room from context
        if "kitchen" in message.lower(): room_hint = "kitchen"
        elif "bedroom" in message.lower(): room_hint = "bedroom"
        elif "hall" in message.lower(): room_hint = "hallway"
        elif "bath" in message.lower(): room_hint = "bathroom"
        data, _ = await _call_tool("describe_scene", {"camera_id": room_hint})
        tool_log.append({"name": "describe_scene", "arguments": {"camera_id": room_hint},
                         "result": _summarise_call("describe_scene", {"camera_id": room_hint}, data)})
        if "error" in data:
            return _respond(session, f"I couldn't inspect the {room_hint} camera just now.", tool_log)
        if data.get("objects"):
            surface_hint = table_match.group(1).strip() if table_match else ""
            surface_hint = re.sub(r"^(?:the|my|this|that)\s+", "", surface_hint)
            all_objs = data["objects"]
            # Filter to objects on/near the mentioned surface if possible
            on_surface = [o for o in all_objs if surface_hint and surface_hint in o.get("location", "").lower()]
            objs_to_show = on_surface
            message = (f"{message}\n\n[system: VISION EVIDENCE from describe_scene({room_hint}) - "
                       f"use THESE exact observations, do NOT guess. Objects on/near surface: "
                       + "; ".join([f"{o['label']} at {o.get('location','unknown')}" for o in objs_to_show])
                       + f". All objects in room: "
                       + "; ".join([f"{o['label']} at {o.get('location','unknown')}" for o in all_objs])
                       + f"]. Summary: {data.get('summary','')}")
        else:
            message = f"{message}\n\n[system: VISION EVIDENCE shows no objects on that surface. Be precise based on what was seen.]"

    # Status questions: fetch the snapshot deterministically and hand the
    # digest to the model to phrase. The tool call is always visible either way.
    status_q = any(p in message.lower() for p in _STATUS_PHRASES)
    if status_q and not table_match:
        snap, _ = await _call_tool("get_home_snapshot", {})
        tool_log.append({"name": "get_home_snapshot", "arguments": {},
                         "result": _summarise_call("get_home_snapshot", {}, snap)})
        digest = snap.get("digest", {})
        message = (f"{message}\n\n[system: fresh snapshot fetched. Relay this digest "
                   f"per the briefing rules, do not re-fetch]\n"
                   + json.dumps(digest, ensure_ascii=False))

    session["history"].append({"role": "user", "content": [{"text": message}]})
    if len(session["history"]) > MAX_HISTORY_MESSAGES:
        session["history"] = session["history"][-MAX_HISTORY_MESSAGES:]

    client = _bedrock_client()
    model = os.environ.get("AURA_AGENT_MODEL", "amazon.nova-lite-v1:0")

    for _ in range(MAX_TOOL_ROUNDS):
        response = client.converse(
            modelId=model,
            system=[{"text": _system_prompt()}],
            messages=session["history"],
            toolConfig={"tools": _bedrock_tools()},
            inferenceConfig={"maxTokens": 400, "temperature": 0.2},
        )
        assistant_message = response["output"]["message"]
        session["history"].append(assistant_message)
        stop = response.get("stopReason")

        tool_uses = [b["toolUse"] for b in assistant_message.get("content", []) if "toolUse" in b]
        if stop != "tool_use" or not tool_uses:
            reply = next((b["text"] for b in assistant_message.get("content", []) if "text" in b), "")
            return _respond(session, reply, tool_log)

        # Guardrail pass, then execute through the MCP server itself.
        guarded = _apply_guardrails(
            [(u["name"], u.get("input", {})) for u in tool_uses], session, message)
        tool_results = []
        for (name, args), call in zip(guarded, tool_uses):
            data, _ = await _call_tool(name, args)
            tool_log.append({"name": name, "arguments": args,
                             "result": _summarise_call(name, args, data)})
            _track_pending(session, name, args, data)
            tool_results.append({
                "toolResult": {
                    "toolUseId": call["toolUseId"],
                    "content": [{"json": {k: v for k, v in data.items() if k != "state"}}],
                }
            })
        session["history"].append({"role": "user", "content": tool_results})

    return _respond(session, "I lost the thread there - could you say that again?", tool_log)


# --------------------------------------------------------------- mock path --

_ROOM_WORDS = {
    "living": ("living",), "bedroom": ("bedroom", "bed room"),
    "kitchen": ("kitchen",), "bathroom": ("bathroom", "bath ", "washroom"),
    "hallway": ("hallway", "hall ", "entrance", "porch"),
}
_KIND_TYPE = {
    "light": "light", "lights": "light", "lamp": "light", "lamps": "light",
    "tv": "tv", "television": "tv", "ac": "ac", "air": "ac", "fan": "fan",
    "curtains": "curtains", "curtain": "curtains", "shower": "shower",
    "cooker": "cooker", "oven": "cooker", "stove": "cooker",
}


def _find_room(text: str) -> str | None:
    for room, words in _ROOM_WORDS.items():
        if any(w in text for w in words):
            return room
    return None


def _find_kind(text: str) -> str | None:
    for word, dtype in _KIND_TYPE.items():
        if re.search(rf"\b{word}\b", text):
            return dtype
    return None


# ------------------------------------------------------- object location --

_LOCATION_Q = re.compile(r"\b(?:where (?:is|are|did)|find|locate|lost|seen)\b")
# "on the bedside table" -> "bedside"; "on the table" -> "table".
_SURFACE_RE = re.compile(
    r"\b(?:(coffee|bedside|kitchen|dining|side)\s+)?(table|desk|nightstand|stand|shelf|counter|sofa|couch|bed)\b")
# What the user says vs. what the VLM may write for the same surface.
_SURFACE_ALIASES = {
    "bedside": ("bedside", "nightstand", "night stand"),
    "nightstand": ("bedside", "nightstand", "night stand"),
    "sofa": ("sofa", "couch"),
    "couch": ("sofa", "couch"),
}
_SPOKEN_ROOM = {"living": "living room", "hallway": "hall"}
_FILLER = re.compile(
    r"\b(?:on|at|in|near|by|the|my|a|an|our|table|coffee|bedside|dining|side|desk|nightstand|stand|"
    r"shelf|counter|sofa|couch|bed|floor|located|location|where|is|are|it|did|i|leave|left|put|you|"
    r"have|seen|please|can|living|room|bedroom|kitchen|bathroom|hallway|hall)\b")


def _extract_item(message: str) -> tuple[str, tuple[str, ...]]:
    """'where is my phone on the bedside table?' -> ('phone', ('bedside', 'nightstand', ...)).

    The second value lists words the object's location must contain; empty
    when the user did not name a surface."""
    text = message.lower()
    tail = re.sub(r".*?\b(?:where (?:is|are|did)|find(?: my)?|locate|lost(?: my)?|seen)\b", "", text, count=1)
    surface: tuple[str, ...] = ()
    m = _SURFACE_RE.search(tail)
    if m:
        word = m.group(1) or m.group(2)
        surface = _SURFACE_ALIASES.get(word, (word,))
    item = re.sub(r"\s+", " ", _FILLER.sub(" ", tail)).strip(" ?.,!'’")
    return item or "it", surface


async def _locate_object(message: str, tool_log: list[dict]) -> str:
    """
    "Where is my X?" - look first, then remember.

    1. the room the user named, else every room the simulator has actually
       shown the camera (cached results, so this costs no extra VLM call),
    2. the sighting memory (find_object), which may be older,
    3. an honest answer about what could not be checked.
    """
    from . import vision
    from .event_store import search_terms

    item, surface = _extract_item(message)
    terms = search_terms(item)
    hinted = _find_room(message.lower())
    bedrock = os.environ.get("AURA_USE_BEDROCK") == "1"
    live = vision.live_cameras()
    if hinted:
        rooms = [hinted]
    elif live:
        rooms = live
    elif not bedrock:
        rooms = ["living", "kitchen", "bedroom"]   # offline demo: simulated scenes
    else:
        rooms = []

    unseen: list[str] = []
    for room in rooms:
        scene, _ = await _call_tool("describe_scene", {"camera_id": room})
        tool_log.append({"name": "describe_scene", "arguments": {"camera_id": room},
                         "result": _summarise_call("describe_scene", {"camera_id": room}, scene)})
        if "error" in scene:
            unseen.append(_SPOKEN_ROOM.get(room, room))
            continue
        for obj in scene.get("objects", []):
            label = obj.get("label", "").lower()
            where = obj.get("location", "").lower()
            if any(t in label for t in terms) and (not surface or any(s in where for s in surface)):
                spot = obj.get("location") or "in view"
                return f"I can see your {obj['label']} {spot} in the {_SPOKEN_ROOM.get(room, room)}."

    memory, _ = await _call_tool("find_object", {"object_name": item})
    tool_log.append({"name": "find_object", "arguments": {"object_name": item},
                     "result": _summarise_call("find_object", {"object_name": item}, memory)})
    if memory.get("found"):
        return memory.get("spoken", "I found a recent sighting.")

    if hinted and unseen:
        return f"I haven't had a camera view of the {unseen[0]} yet - open that room so I can look for your {item}."
    if not rooms or len(unseen) == len(rooms):
        return f"I don't have a camera view to check yet, and no recent sighting of your {item}."
    looked = [_SPOKEN_ROOM.get(r, r) for r in rooms if _SPOKEN_ROOM.get(r, r) not in unseen]
    return f"I can't see your {item} in the {_join_words(looked)}, and there's no recent sighting of it."


def _join_words(items: list[str]) -> str:
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + f" or {items[-1]}"


async def invoke_mock(message: str, session_id: str) -> dict:
    session = _session(session_id)
    tool_log: list[dict] = []
    # Typed and dictated text often drops the apostrophe ("whats in the bedroom").
    text = re.sub(r"\bwhats\b", "what's", message.lower().strip())
    plain = text.rstrip("?.!")
    pending = session.get("pending")

    async def run(name: str, args: dict) -> dict:
        data, _ = await _call_tool(name, args)
        tool_log.append({"name": name, "arguments": args,
                         "result": _summarise_call(name, args, data)})
        _track_pending(session, name, args, data)
        return data

    # 1 - resolve a pending confirmation first
    if pending:
        if _is_approval(plain):
            if pending["type"] == "routine":
                data = await run("run_routine", {"routine_name": pending["name"], "confirm": True})
                return _respond(session, data.get("summary", "Done."), tool_log)
            if pending["type"] == "unlock":
                guarded = _apply_guardrails(
                    [("control_device", {"device_id": pending["device_id"], "action": "unlock", "confirm": True})],
                    session, message)
                data, _ = await _call_tool(*guarded[0])
                tool_log.append({"name": guarded[0][0], "arguments": guarded[0][1],
                                 "result": _summarise_call(guarded[0][0], guarded[0][1], data)})
                session["pending"] = None
                if data.get("status") == "ok":
                    return _respond(session, "The front door is unlocked.", tool_log)
                return _respond(session, "That didn't go through - the door is still locked.", tool_log)
        if _is_decline(plain):
            session["pending"] = None
            return _respond(session, "Understood - nothing was changed.", tool_log)
        # Any other request moves on: a later "yes" must never approve a plan
        # the user walked away from.
        session["pending"] = None

    # 2 - greetings / meta
    if re.fullmatch(r"(hi|hello|hey|yo|good (morning|evening)|greetings)[\s!.]*", plain):
        return _respond(session, "Hi! I can control the house, run routines, or tell you what's happening.", tool_log)
    if any(k in plain for k in ("what can you do", "help", "commands")):
        return _respond(session, 'Try "what\'s on", "turn off the kitchen lights", "prepare for bed", or "where are my keys".', tool_log)

    # 3 - object location first: "where is my phone on the bedside table"
    # must never be read as a bedtime request.
    if _LOCATION_Q.search(plain):
        return _respond(session, await _locate_object(message, tool_log), tool_log)

    # 4 - routines (specific phrases only, before generic device control)
    question = re.match(r"(what|whats|what's|is|are|show|describe|check)\b", plain)
    routine = None
    if re.search(r"\b(bed|bedtime|sleep|night)\b", plain) and not _find_kind(text) and not question:
        routine = "bedtime"
    elif re.search(r"\b(leaving|i'm off|im off|going out|bye)\b", plain):
        routine = "leaving_home"
    elif re.search(r"\b(morning|wake up|wake)\b", plain) and not _find_kind(text) and not question:
        routine = "morning"
    if routine:
        data = await run("run_routine", {"routine_name": routine})
        return _respond(session, _routine_reply(data), tool_log)

    # 5 - memory / vision / events
    if any(k in plain for k in ("what changed", "what happened", "today", "recent")):
        data = await run("get_recent_events", {"since_minutes": 720})
        count = data.get("count", 0)
        return _respond(session, f"{count} events today - device changes, sightings and routines are all in the timeline.", tool_log) if count \
            else _respond(session, "Nothing has changed here today - it's been quiet.", tool_log)
    # Fridge content query: route to the fridge camera
    fridge_keywords = ("fridge", "refrigerator", "freezer")
    if any(k in plain for k in fridge_keywords) and any(k in plain for k in ("what", "in", "inside", "content", "have", "got", "show")):
        data = await run("describe_scene", {"camera_id": "fridge"})
        if "error" in data:
            return _respond(session, "I can't see inside the fridge right now.", tool_log)
        return _respond(session, data.get("summary", "The fridge contents are unclear."), tool_log)
    # Table/surface query: describe scene and filter by surface
    table_m = re.search(r"what.?s on (?:the )?(.+?)(?:table|stand|desk|shelf|counter)", plain)
    if table_m or any(k in plain for k in ("on the table", "on the counter", "on the coffee table", "on the desk")):
        room = _find_room(text) or "living"
        data = await run("describe_scene", {"camera_id": room})
        if "error" in data:
            return _respond(session, f"I don't have a camera covering the {room}.", tool_log)
        objs = data.get("objects", [])
        if objs:
            surface_objs = [o for o in objs if any(s in o.get("location", "").lower() for s in ("table", "counter", "stand", "desk", "shelf"))]
            named = surface_objs if surface_objs else objs[:4]
            parts = [f"{o['label']} ({o.get('location', 'in view')})" for o in named[:5]]
            return _respond(session, "On the table I can see: " + ", ".join(parts) + ".", tool_log)
        return _respond(session, data.get("summary", "Nothing on the table right now."), tool_log)
    if any(k in plain for k in ("what do you see", "what's in", "describe", "counter", "camera", "look like")):
        room = _find_room(text) or "kitchen"
        data = await run("describe_scene", {"camera_id": room})
        if "error" in data:
            return _respond(session, f"I don't have a camera covering the {room}.", tool_log)
        hazards = data.get("hazards", [])
        reply = data.get("summary", "Nothing notable in view.")
        if hazards:
            reply += f" Heads up: {hazards[0]['label']}."
        return _respond(session, reply, tool_log)


    # 6 - device control
    action = None
    if re.search(r"\b(off|shut|down|power down)\b", plain):
        action = "off"
    elif re.search(r"\b(on|start)\b", plain):
        action = "on"
    if re.search(r"\bunlock\b", plain):
        guarded = _apply_guardrails(
            [("control_device", {"device_id": "doorLock", "action": "unlock", "confirm": False})],
            session, message)
        data, _ = await _call_tool(*guarded[0])
        tool_log.append({"name": guarded[0][0], "arguments": guarded[0][1],
                         "result": _summarise_call(guarded[0][0], guarded[0][1], data)})
        if data.get("status") == "needs_confirmation":
            session["pending"] = {"type": "unlock", "device_id": "doorLock"}
            return _respond(session, "Unlocking the front door needs your confirmation - shall I?", tool_log)
        return _respond(session, "The front door is unlocked.", tool_log)
    if re.search(r"\block\b", plain) and "locked" not in plain:
        data = await run("control_device", {"device_id": "doorLock", "action": "lock"})
        return _respond(session, "The front door is locked.", tool_log)

    if action and _find_kind(text):
        room = _find_room(text)
        kind = _find_kind(text)
        snap = await run("get_home_snapshot", {"room": room} if room else {})
        targets = [d for d in snap.get("devices", [])
                   if d["type"] == kind and (not room or d["room"] == room)]
        if kind == "light" and not targets and room:
            targets = [d for d in snap.get("devices", []) if d["type"] == "light" and d["room"] == room]
        done = 0
        for d in targets[:8]:
            data = await run("control_device", {"device_id": d["id"], "action": action})
            if data.get("status") == "ok":
                done += 1
        if not targets:
            return _respond(session, f"I couldn't find a {kind}{' in the ' + room if room else ''}.", tool_log)
        where = f" in the {room}" if room else " around the house"
        return _respond(session, f"{done} {kind}{'' if done == 1 else 's'} switched {action}{where}.", tool_log)

    # 7 - status
    if any(k in plain for k in ("what's on", "what is on", "status", "running",
                                "happening", "house", "home", "quiet", "calm")) \
            and "happened" not in plain:
        snap = await run("get_home_snapshot", {})
        digest = snap.get("digest", {})
        obs = digest.get("observations", [])
        reply = " ".join(obs) if obs else digest.get("headline", "All calm here.")
        if digest.get("lines") and obs:
            reply += " " + " ".join(digest["lines"][:2])
        alerts = snap.get("alerts", [])
        if alerts and not obs:
            reply += f" Note: {alerts[0]['message']}."
        return _respond(session, reply, tool_log)

    # 8 - honest fallback
    return _respond(session, "Sorry - I didn't catch that. Try 'what's on', 'turn off the kitchen lights', or 'prepare for bed'.", tool_log)


# ------------------------------------------------------------------ entry ---

_THINKING = re.compile(r"<thinking>.*?</thinking>", re.DOTALL | re.IGNORECASE)


def _strip_reasoning(reply: str) -> str:
    """Remove any reasoning tags a model leaks through, collapse blank runs."""
    cleaned = _THINKING.sub("", reply or "")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def _respond(session: dict, reply: str, tool_log: list[dict]) -> dict:
    session["turns"] += 1
    pending = session.get("pending")
    return {
        "reply": _strip_reasoning(reply) or "Done.",
        "tool_calls": tool_log,
        "needs_user_input": bool(pending),
        "pending": (f"Confirm: {pending['name'].replace('_', ' ')}" if pending and pending["type"] == "routine"
                    else "Confirm: unlock the front door" if pending else None),
        "engine": "bedrock" if os.environ.get("AURA_USE_BEDROCK") == "1" else "mock",
        "timestamp": datetime.now().isoformat(timespec="seconds"),
    }


async def invoke(message: str, session_id: str = "default") -> dict:
    """One conversational turn. Bedrock when configured, mock engine otherwise."""
    if os.environ.get("AURA_USE_BEDROCK") == "1":
        try:
            return await invoke_bedrock(message, session_id)
        except Exception as exc:  # creds/network issues must never break the home
            fallback = await invoke_mock(message, session_id)
            fallback["engine"] = f"mock (bedrock unavailable: {type(exc).__name__})"
            return fallback
    return await invoke_mock(message, session_id)


def reset(session_id: str = "default") -> dict:
    sessions.pop(session_id, None)
    return {"status": "ok", "session_id": session_id}
