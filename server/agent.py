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

STYLE - your replies are spoken aloud, never read:
- Maximum 2 sentences. Round every number: "22C", never "22.3467C".
- Name at most 3 devices, then summarize ("and 4 more lights off").
- No markdown, no lists, no emoji. If a tool failed, say plainly what did \
not happen. Never pretend an action succeeded.

TOOL SELECTION:
- Single device control -> control_device
- "prepare for bed", "I'm leaving", "morning" -> run_routine with confirm=false \
FIRST; only call again with confirm=true after the user explicitly approves.
- "what changed / what happened today" -> get_recent_events
- "where are my keys/wallet/phone" -> find_object
- "what do you see / what's in the kitchen" -> describe_scene
- Accessibility or privacy preferences -> set_user_preference

SAFETY - hard rules, no exceptions:
- Unlocking is security-sensitive. The tool refuses unlock without confirm=true, \
and you must ask the user and receive a clear yes ("yes", "do it", "go ahead") \
before ever passing confirm=true.
- run_routine with confirm=true ONLY after you read the plan back and the user \
approved it. Ambiguous replies mean: ask again, do not act.
- You never infer who is home, anyone's health, or routines not requested.
- If a scene description mentions a hazard, state it plainly and offer one \
concrete next step. Do not dramatize.

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
        return f"{name}({arguments.get('camera_id')}): {len(data.get('objects', []))} objects, {len(data.get('hazards', []))} hazards"
    if name == "get_recent_events":
        return f"{data.get('count', 0)} events"
    if name == "get_home_snapshot":
        return f"snapshot: {len(data.get('devices', []))} devices"
    return name


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
    if name == "run_routine" and "steps" in data and arguments.get("confirm") is not True:
        session["pending"] = {"type": "routine", "name": arguments.get("routine_name")}
    elif name == "control_device" and data.get("status") == "needs_confirmation":
        session["pending"] = {"type": "unlock", "device_id": arguments.get("device_id")}
    elif name == "run_routine" and "applied" in data:
        session["pending"] = None
    elif name == "control_device" and data.get("status") == "ok":
        if not (session.get("pending") or {}).get("type") == "unlock":
            session["pending"] = session.get("pending")


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


def refresh_tool_specs() -> None:
    """Snapshot the live MCP tool registry into Bedrock Converse toolSpecs."""
    global _STATIC_TOOLS
    _STATIC_TOOLS = [
        {"toolSpec": {"name": t.name, "description": t.description or "",
                      "inputSchema": {"json": t.parameters}}}
        for t in mcp._tool_manager.list_tools()
    ]


async def invoke_bedrock(message: str, session_id: str) -> dict:
    session = _session(session_id)
    tool_log: list[dict] = []

    session["history"].append({"role": "user", "content": [{"text": message}]})
    if len(session["history"]) > MAX_HISTORY_MESSAGES:
        session["history"] = session["history"][-MAX_HISTORY_MESSAGES:]

    client = _bedrock_client()
    model = os.environ.get("AURA_AGENT_MODEL", "amazon.nova-lite-v1:0")

    for _ in range(MAX_TOOL_ROUNDS):
        response = client.converse(
            modelId=model,
            system=[{"text": SYSTEM_PROMPT}],
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


async def invoke_mock(message: str, session_id: str) -> dict:
    session = _session(session_id)
    tool_log: list[dict] = []
    text = message.lower().strip()
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

    # 2 - greetings / meta
    if re.fullmatch(r"(hi|hello|hey|yo|good (morning|evening)|greetings)[\s!.]*", plain):
        return _respond(session, "Hi! I can control the house, run routines, or tell you what's happening.", tool_log)
    if any(k in plain for k in ("what can you do", "help", "commands")):
        return _respond(session, 'Try "what\'s on", "turn off the kitchen lights", "prepare for bed", or "where are my keys".', tool_log)

    # 3 - routines (specific phrases only, before generic device control)
    routine = None
    if any(k in plain for k in ("bed", "sleep", "night")) and not _find_kind(text):
        routine = "bedtime"
    elif any(k in plain for k in ("leaving", "leaving home", "i'm off", "going out", "bye")):
        routine = "leaving_home"
    elif any(k in plain for k in ("morning", "wake up", "wake")) and not _find_kind(text):
        routine = "morning"
    if routine:
        data = await run("run_routine", {"routine_name": routine})
        steps = len(data.get("steps", []))
        if data.get("requires_confirmation") and steps:
            return _respond(session, f"{data['summary'].rstrip('.')} Shall I go ahead?", tool_log)
        return _respond(session, data.get("summary", "Done."), tool_log)

    # 4 - memory / vision / events
    if any(k in plain for k in ("where are", "where is", "find my", "lost")):
        obj = re.sub(r".*\b(?:where (?:are|is)|find my|lost my)\b", "", plain).strip() or "it"
        data = await run("find_object", {"object_name": obj})
        return _respond(session, data.get("spoken", data.get("message", "No sighting of that in the last week.")), tool_log)
    if any(k in plain for k in ("what changed", "what happened", "today", "recent")):
        data = await run("get_recent_events", {"since_minutes": 720})
        count = data.get("count", 0)
        return _respond(session, f"{count} events today - device changes, sightings and routines are all in the timeline.", tool_log) if count \
            else _respond(session, "Nothing has changed here today - it's been quiet.", tool_log)
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

    # 5 - device control
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

    # 6 - status
    if any(k in plain for k in ("what's on", "what is on", "status", "running")):
        snap = await run("get_home_snapshot", {})
        on = [d for d in snap.get("devices", [])
              if d.get("power") and d["type"] in ("light", "tv", "ac", "fan", "shower")]
        names = ", ".join(d["name"] for d in on[:3])
        more = f" and {len(on) - 3} more" if len(on) > 3 else ""
        alerts = snap.get("alerts", [])
        reply = (f"{len(on)} things are on: {names}{more}." if on else "Nothing is running right now.")
        if alerts:
            reply += f" Note: {alerts[0]['message']}."
        return _respond(session, reply, tool_log)

    # 7 - honest fallback
    return _respond(session, "Sorry - I didn't catch that. Try 'what's on', 'turn off the kitchen lights', or 'prepare for bed'.", tool_log)


# ------------------------------------------------------------------ entry ---

def _respond(session: dict, reply: str, tool_log: list[dict]) -> dict:
    session["turns"] += 1
    pending = session.get("pending")
    return {
        "reply": reply or "Done.",
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
