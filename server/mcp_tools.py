"""
MCP tools: the ONLY surface through which clients (Alexa+, the web simulator,
the voice agent) may read or change the home.

All tools are registered on the shared `MCPServer` instance and run against
the same `state` and `event_store`, so every surface sees one consistent home.
"""

from __future__ import annotations

import os
import re
from datetime import datetime, timezone

from mcp.server.mcpserver import MCPServer

from . import event_store
from .devices import describe
from .home_state import state
from .routines import ROUTINES, plan_routine
from .routines import run_routine as _execute_routine
from .home_layout import guide_for
from .vision import camera_id_for
from .vision import describe_scene as _describe_scene
from .vision import pinpoint as _pinpoint

mcp = MCPServer(
    name="aura-assist",
    instructions=(
        "AuraAssist is a context-aware home companion. Use get_home_snapshot to "
        "understand the home before answering state questions, run_routine for "
        "multi-step workflows (always confirm first when required), and "
        "describe_scene for camera-based questions. Keep spoken replies short."
    ),
)


@mcp.tool()
def get_home_snapshot(room: str | None = None) -> dict:
    """
    Current state of the whole home, or a single room.

    Returns raw device state plus a ready-made `digest`: grouped, prioritised
    briefing lines (Security, Climate, Lights, Curtains) with `observations`
    for verified facts worth surfacing. RELAY THE DIGEST - never enumerate
    raw devices one by one.

    Args:
        room: Optional room filter - one of living, bedroom, kitchen, bathroom, hallway.
    """
    snap = state.snapshot(room)
    snap["digest"] = state.digest(room)
    return snap


@mcp.tool()
def control_device(device_id: str, action: str, value: str | int | None = None, confirm: bool = False) -> dict:
    """
    Control a single device.

    Args:
        device_id: The device identifier (see get_home_snapshot).
        action: One of: on, off, toggle, set, change_channel, lock, unlock, open, close, ring.
        value: New value for 'set' - brightness percent (1-100), target temperature,
               fan speed (1-3), TV volume (0-100), or cooker level (0-5).
               For 'change_channel' - the TV channel number.
        confirm: Must be true for unlock; unlocking without confirmation is refused.
    """
    device = state.device(device_id)
    if device is None:
        return {"error": f"unknown device '{device_id}'"}

    try:
        num = int(float(value)) if value not in (None, "") else None
    except (TypeError, ValueError):
        return {"error": f"'{value}' is not a number"}

    t = device["type"]
    if action in ("lock", "unlock"):
        if t != "lock":
            return {"error": f"{device['name']} is not a lock"}
        if action == "unlock" and not confirm:
            return {
                "status": "needs_confirmation",
                "message": f"Unlocking the {device['name']} is security-sensitive. Re-run with confirm=true after asking the user.",
            }
        patch = {"locked": action == "lock"}
    elif action in ("on", "off", "toggle"):
        if t not in ("light", "tv", "ac", "fan", "shower", "cooker"):
            return {"error": f"{device['name']} cannot be switched {'on/off'}"}
        on = not device.get("power") if action == "toggle" else action == "on"
        patch = {"power": on}
        if t == "cooker" and not on:
            patch = {"power": False, "heat": 0, "ovenOn": False}
    elif action == "open" or action == "close":
        if t not in ("door", "curtains"):
            return {"error": f"{device['name']} cannot be opened or closed"}
        patch = {"open": action == "open"}
    elif action == "ring":
        if t != "doorbell":
            return {"error": f"{device['name']} is not a doorbell"}
        patch = {"ringing": True}
    elif action == "change_channel":
        if t != "tv":
            return {"error": f"{device['name']} is not a TV"}
        if num is None:
            return {"error": "'change_channel' requires a channel number"}
        patch = {"power": True, "channel": num}
    elif action == "set":
        if num is None:
            return {"error": "'set' requires a numeric value"}
        if t == "light":
            patch = {"power": True, "brightness": min(max(num, 1), 100) / 100}
        elif t == "ac":
            patch = {"power": True, "targetTemp": min(max(num, 16), 30)}
        elif t == "fan":
            patch = {"power": True, "speed": min(max(num, 1), 3)}
        elif t == "tv":
            # 'set' is always volume; channels go through change_channel.
            patch = {"power": True, "volume": min(max(num, 0), 100), "muted": False}
        elif t == "cooker":
            level = min(max(num, 0), 5)
            patch = {"power": level > 0, "heat": level, "ovenOn": False}
        elif t == "shower":
            patch = {"power": num > 0, "temp": min(max(num, 24), 45)}
        else:
            return {"error": f"{device['name']} does not support numeric values"}
    else:
        return {"error": f"unknown action '{action}'"}

    before = describe(device)
    after = state.patch(device_id, patch, source="mcp", command=f"device.{action}")
    if action == "ring":
        state.patch(device_id, {"ringing": False}, source="mcp", command="device.ring_done")
    return {"status": "ok", "device_id": device_id, "name": device["name"],
            "before": before, "after": describe(after), "state": after}


@mcp.tool()
def run_routine(routine_name: str, confirm: bool = False) -> dict:
    """
    Plan or execute a multi-step household routine.

    With confirm=false (the default) this only PLANS: it reports what would
    change and any exceptions, without touching the home. Call again with
    confirm=true only after the user has approved the plan.

    Args:
        routine_name: One of: bedtime, leaving_home, morning.
        confirm: Execute the routine instead of only planning it.
    """
    if routine_name not in ROUTINES:
        return {"error": f"unknown routine '{routine_name}'", "available": list(ROUTINES)}
    if not confirm:
        return plan_routine(routine_name, state)
    return _execute_routine(routine_name, state)


def _digest(events: list[dict], cap: int = 12) -> dict:
    """Collapse raw events into a short human summary.

    A chatty diary (30 lock/unlock cycles from testing) must never again be
    relayed line-by-line: repeats are counted, same-type devices are grouped
    ("3 lights off"), and the raw list is capped.
    """
    from .devices import create_devices
    types = {d["id"]: d["type"] for d in create_devices().values()}
    groups: dict[tuple, dict] = {}
    for e in events:
        key = (e.get("device_id") or e.get("kind"), e.get("kind"))
        g = groups.setdefault(key, {"label": e.get("device_id") or e["kind"],
                                    "count": 0, "first_ts": e["ts"], "last_ts": e["ts"]})
        g["count"] += 1
        g["last_ts"] = e["ts"]

    # Group chatty same-type devices (e.g. 5 separate lights) into one line.
    buckets: dict[tuple, dict] = {}
    for g in groups.values():
        bkey = (types.get(g["label"], g["label"]), "churn" if g["count"] >= 3 else "once")
        b = buckets.setdefault(bkey, {"count": 0, "items": [], "last_ts": ""})
        b["count"] += 1
        b["items"].append(g["label"])
        b["last_ts"] = max(b["last_ts"], g["last_ts"])

    lines = []
    for (dtype, mode), b in sorted(buckets.items(), key=lambda kv: kv[1]["last_ts"], reverse=True):
        noun = f"{b['count']} {dtype} devices" if b["count"] > 1 else b["items"][0]
        if mode == "churn":
            lines.append(f"{noun}: changed repeatedly (last {b['last_ts'][11:19]})")
        else:
            lines.append(f"{noun}: {b['count']} change{'s' if b['count'] != 1 else ''}")
    return {"digest": lines[:8], "events": events[:cap],
            "events_truncated": len(events) > cap}


@mcp.tool()
def get_recent_events(since_minutes: int = 480, room: str | None = None, kind: str | None = None) -> dict:
    """
    Recent home events - device changes, object sightings, routine runs, alerts.
    Returns a digest (collapsed repeats) plus the most recent raw events.

    Args:
        since_minutes: How far back to look (default 8 hours).
        room: Optional room filter.
        kind: Optional event kind - device_change, object_sighting, routine_run, mode_change, preference.
    """
    events = event_store.query_events(since_minutes, room, kind)
    summary = _digest(events)
    return {"count": len(events), "since_minutes": since_minutes, **summary}


@mcp.tool()
def find_object(object_name: str, since_minutes: int = 10080) -> dict:
    """
    Where was an object last seen? Searches VLM-derived sighting events.

    Args:
        object_name: e.g. "keys", "phone", "wallet".
        since_minutes: Search window (default 7 days).
    """
    hits = event_store.find_object(object_name, since_minutes)
    if not hits:
        return {"found": False, "message": f"No sighting of '{object_name}' in the search window."}
    latest = hits[0]
    when = datetime.fromisoformat(latest["ts"]).astimezone().strftime("%I:%M %p").lstrip("0")
    return {
        "found": True,
        "object": latest["object"],
        "location": latest["location"],
        "room": latest["room"],
        "last_seen": latest["ts"],
        "spoken": f"Your {latest['object']} was last seen {latest['location']} at {when}.",
    }


def _with_prep(phrase: str, prep: str = "at the") -> str:
    """'front edge' -> 'at the front edge'; 'near the lamp' stays as it is."""
    phrase = phrase.strip().rstrip(".")
    first = phrase.split(" ", 1)[0].lower()
    return phrase if first in ("on", "at", "in", "near", "by", "beside", "next", "behind", "under", "against") \
        else f"{prep} {phrase}"


@mcp.tool()
def guide_to_object(object_name: str, camera_id: str, seen_location: str = "") -> dict:
    """
    Step-by-step, non-visual directions to an object a camera has found -
    for people with low vision. Combines a focused second look by the vision
    model (which surface, where on it, what it touches) with the home's
    layout (which of several similar surfaces, its height, and the walking
    route from the room's door, including obstacles).

    Args:
        object_name: What the person asked for, e.g. "glasses".
        camera_id: The room where it was seen, e.g. "bedroom".
        seen_location: What describe_scene said, e.g. "on the nightstand".
    """
    room = camera_id_for(camera_id)
    detail = _pinpoint(room, object_name) or {}
    surface_text = " ".join(filter(None, [str(detail.get("surface") or ""), seen_location]))
    cue_text = " ".join(str(v) for v in (detail.get("which_one"), detail.get("next_to"), detail.get("position_on_surface")) if v)
    guide = guide_for(room, surface_text, cue_text)

    plural = object_name.endswith("s") and not object_name.endswith("ss")
    be, they = ("are", "They're") if plural else ("is", "It's")
    prep = "in" if seen_location.strip().lower().startswith("in ") else "on"
    spot = guide["label"] if guide else (f"the {detail['surface']}" if detail.get("surface")
                                         else seen_location.strip().removeprefix("on ").removeprefix("in "))

    first = f"Your {object_name} {be} {prep} {spot}"
    position = str(detail.get("position_on_surface") or "").strip()
    # Camera-relative left/right would send someone the wrong way; generic
    # answers ("top", "on the surface") add nothing.
    if position and not re.search(r"\b(left|right)\b", position, re.I) \
            and position.lower() not in ("top", "on top", "surface", "on the surface", "on top of it"):
        first += ", " + _with_prep(position)
    neighbours = [_bare(n) for n in (detail.get("next_to") or []) if isinstance(n, str)
                  and _bare(n) and _bare(n) not in surface_text.lower()][:2]
    if neighbours:
        first += ", right next to the " + " and the ".join(neighbours)
    where = [first + "."]
    if isinstance(detail.get("orientation"), str) and 0 < len(detail["orientation"]) <= 70:
        where.append(f"{they} {detail['orientation'].rstrip('.')}.")
    if guide and guide.get("height"):
        where.append(f"That's {guide['height']} from the floor.")
    hazards = [h for h in (detail.get("hazards_near") or []) if isinstance(h, str)][:1]
    if hazards:
        where.append(f"Reach gently - there's {_article(_bare(hazards[0]))} right beside {'them' if plural else 'it'}.")
    directions = f"{guide['route']} {guide['obstacles']}" if guide else ""

    # Remember the precise spot, so "when did you last see..." can repeat it.
    precise = f"{prep} {spot}" + (f", next to the {neighbours[0]}" if neighbours else "")
    event_store.record_object_sighting(object_name, precise, room, 0.9, camera_id=room)

    return {
        "object": object_name, "room": room, "surface": spot,
        "detail": detail, "layout_used": bool(guide),
        "where": " ".join(where),
        "directions": directions,
        "entrance": guide["entrance"] if guide else None,
        "spoken": " ".join(where + ([directions] if directions else [])),
    }


def _bare(noun: str) -> str:
    """'a remote control' -> 'remote control'."""
    return re.sub(r"^(?:a|an|the)\s+", "", noun.strip().lower()).rstrip(".")


def _article(noun: str) -> str:
    return ("an " if noun[:1] in "aeiou" else "a ") + noun


# How many objects to hand back to the model. The VLM may see a dozen things;
# reading them all aloud is not what a spoken assistant does. The full list is
# still recorded as sightings (so find_object sees everything) - this only caps
# what the reply is built from.
_SPOKEN_OBJECT_LIMIT = 5


@mcp.tool()
def describe_scene(camera_id: str) -> dict:
    """
    Describe what a room camera currently sees - objects, hazards, summary.

    Args:
        camera_id: Room the camera covers - e.g. "kitchen", "living".
    """
    scene = _describe_scene(camera_id)
    if "error" in scene:
        return scene

    # Return all objects - we need full detail for accurate answers
    ranked = sorted(scene.get("objects", []), key=lambda o: o.get("confidence", 0), reverse=True)

    spoken = scene.get("summary", "")
    hazards = scene.get("hazards", [])
    if hazards:
        spoken = f"{spoken} Safety: {hazards[0].get('label', 'something unsafe')}."

    return {
        **scene,
        "objects": ranked,
        "all_objects": scene.get("objects", []),
        "object_count": len(scene.get("objects", [])),
        "spoken": spoken,
    }


@mcp.tool()
def generate_daily_briefing(audience: str = "user") -> dict:
    """
    A calm summary of today's home activity.

    The caregiver summary is only produced when the resident has set the
    `share_with_caregiver` preference to "yes"; otherwise nothing is shared.
    It contains activity facts only (routines, the front door, safety
    alerts) - never camera content or inferences about the person.

    Args:
        audience: "user" for a first-person daily recap, "caregiver" for a
                  consent-gated, neutral activity summary.
    """
    from .reasoning import briefing  # Bedrock-backed, mock fallback built in
    return briefing(audience)


@mcp.tool()
def set_user_preference(key: str, value: str) -> dict:
    """
    Store an accessibility or privacy preference.

    Args:
        key: e.g. "reply_length", "camera_kitchen_enabled", "briefing_time".
        value: The preference value.
    """
    state.set_preference(key, value)
    return {"status": "ok", "key": key, "value": value}
