"""
Routine Orchestrator: a deterministic workflow engine, deliberately NOT an LLM.

Every routine is plain data. Planning and execution are two separate phases:
`plan_routine()` inspects current home state and returns what *would* happen;
`run_routine()` executes an approved plan and records the outcome. Security
sensitive steps (unlocking, cooking) are never planned silently - they come
back as `exceptions` that Aura reads aloud and asks about.
"""

from __future__ import annotations

from . import event_store
from .devices import describe
from .home_state import HomeState

ROUTINES: dict[str, dict] = {
    "bedtime": {
        "description": "Secure the home and prepare it for sleep",
        "requires_confirmation": True,
        "steps": [
            {"action": "check_doors"},
            {"action": "lock_device", "target": "doorLock"},
            {"action": "control_device", "target": "ceilingLightA", "value": "off"},
            {"action": "control_device", "target": "ceilingLightB", "value": "off"},
            {"action": "control_device", "target": "tableLamp", "value": "off"},
            {"action": "control_device", "target": "floorLamp", "value": "off"},
            {"action": "control_device", "target": "kitchenLight", "value": "off"},
            {"action": "control_device", "target": "kitchenStrip", "value": "off"},
            {"action": "control_device", "target": "bathroomLight", "value": "off"},
            {"action": "control_device", "target": "hallLight", "value": "off"},
            {"action": "control_device", "target": "tv", "value": "off"},
            {"action": "set_thermostat", "target": "ac", "value": 22},
            {"action": "control_device", "target": "curtains", "value": "close"},
        ],
    },
    "leaving_home": {
        "description": "Prepare the home for absence",
        "requires_confirmation": True,
        "steps": [
            {"action": "check_doors"},
            {"action": "lock_device", "target": "doorLock"},
            {"action": "control_device", "target": "all_lights", "value": "off"},
            {"action": "control_device", "target": "tv", "value": "off"},
            {"action": "control_device", "target": "fan", "value": "off"},
            {"action": "control_device", "target": "rangeHood", "value": "off"},
            {"action": "control_device", "target": "shower", "value": "off"},
            {"action": "set_thermostat", "target": "ac", "value": 25},
            {"action": "close_covers"},
        ],
    },
    "morning": {
        "description": "A calm start to the day",
        "requires_confirmation": False,
        "steps": [
            {"action": "control_device", "target": "bedroomCurtains", "value": "open"},
            {"action": "control_device", "target": "bedroomLight", "value": "on"},
            {"action": "control_device", "target": "bedLampLeft", "value": "on"},
            {"action": "control_device", "target": "bedLampRight", "value": "on"},
            {"action": "control_device", "target": "kitchenLight", "value": "on"},
            {"action": "set_thermostat", "target": "ac", "value": 21},
        ],
    },
}

# Devices a "turn everything off" style step may never touch - the fridge,
# doors and the lock stay under explicit user control (mirrors the simulator).
PROTECTED_TYPES = {"fridge", "door", "lock"}


def _patch_for(state: HomeState, step: dict) -> tuple[str, dict] | None:
    """Translate one routine step into a concrete (device_id, patch), or None."""
    action, target, value = step["action"], step.get("target"), step.get("value")

    if action == "lock_device":
        device = state.device(target)
        if device and not device.get("locked"):
            return target, {"locked": True}
        return None  # already locked - nothing to do

    if action == "control_device" and target == "all_lights":
        return None  # handled as a batch by the caller

    if action == "control_device":
        device = state.device(target)
        if not device or device["type"] in PROTECTED_TYPES:
            return None
        if device["type"] == "light":
            return target, {"power": value == "on"}
        if device["type"] in ("tv", "ac", "fan", "shower", "cooker"):
            if value == "off" and device["type"] == "cooker":
                return target, {"power": False, "heat": 0, "ovenOn": False}
            return target, {"power": value == "on"}
        if device["type"] == "curtains":
            return target, {"open": value == "open"}
        return None

    if action == "set_thermostat":
        device = state.device(target)
        if device and device["type"] == "ac":
            return target, {"power": True, "targetTemp": value}
        return None

    if action == "close_covers":
        return None  # batch, handled by caller

    return None


def _batch_steps(state: HomeState, step: dict) -> list[tuple[str, dict]]:
    """Expand the batch actions (all_lights / close_covers) into concrete patches."""
    if step["action"] == "control_device" and step.get("target") == "all_lights":
        return [
            (d["id"], {"power": False})
            for d in state.snapshot()["devices"]
            if d["type"] == "light" and d.get("power")
        ]
    if step["action"] == "close_covers":
        return [
            (d["id"], {"open": False})
            for d in state.snapshot()["devices"]
            if d["type"] == "curtains" and d.get("open")
        ]
    return []


def plan_routine(name: str, state: HomeState) -> dict:
    """Phase 1: what would this routine do right now? Never mutates anything."""
    routine = ROUTINES.get(name)
    if routine is None:
        return {"error": f"unknown routine '{name}'", "available": list(ROUTINES)}

    planned, exceptions = [], []
    for step in routine["steps"]:
        if step["action"] == "check_doors":
            for alert in state.snapshot()["alerts"]:
                if "door" in alert["message"].lower() or "lock" in alert["message"].lower():
                    exceptions.append(alert["message"])
            continue
        if step["action"] == "lock_device":
            device = state.device(step["target"])
            if device and not device.get("locked"):
                planned.append({"device_id": step["target"], "patch": {"locked": True},
                                "description": f"Lock the {device['name']}"})
            continue
        batch = _batch_steps(state, step)
        if batch:
            for device_id, patch in batch:
                device = state.device(device_id)
                planned.append({"device_id": device_id, "patch": patch,
                                "description": f"Turn off the {device['name']}" if "power" in patch
                                               else f"Close the {device['name']}"})
            continue
        resolved = _patch_for(state, step)
        if resolved:
            device_id, patch = resolved
            device = state.device(device_id)
            already = all(device.get(k) == v for k, v in patch.items())
            if not already:
                planned.append({"device_id": device_id, "patch": patch,
                                "description": _describe_step(device, patch)})

    return {
        "routine": name,
        "description": routine["description"],
        "requires_confirmation": routine["requires_confirmation"],
        "exceptions": exceptions,
        "steps": planned,
        "summary": _plan_summary(name, planned, exceptions),
    }


def _describe_step(device: dict, patch: dict) -> str:
    if "locked" in patch:
        return f"Lock the {device['name']}"
    if "targetTemp" in patch:   # before "power": a thermostat patch carries both
        return f"Set the {device['name']} to {patch['targetTemp']}°C"
    if "power" in patch:
        verb = "Turn on" if patch["power"] else "Turn off"
        return f"{verb} the {device['name']}"
    if "open" in patch:
        return f"{'Open' if patch['open'] else 'Close'} the {device['name']}"
    return f"Update the {device['name']}"


def _format_action_list(planned: list[dict]) -> str:
    """Format planned actions as a natural language list."""
    if not planned:
        return ""
    
    # Group by category
    lights = []
    locks = []
    thermostats = []
    tvs = []
    devices = []
    
    for step in planned:
        description = step.get('description', '').strip()
        if not description:
            continue
            
        if 'Lock' in description:
            # Extract device name
            parts = description.split()
            device_name = ' '.join(parts[2:]) if len(parts) > 2 else description
            locks.append(device_name)
        elif 'Set the' in description and 'AC' in description:
            thermostats.append(description)
        elif 'Switch the TV' in description or 'turn the TV' in description.lower():
            tvs.append(description)
        elif 'Turn off the' in description or 'Turn on the' in description:
            parts = description.split()
            if len(parts) > 3:
                device_name = ' '.join(parts[2:])
                if 'light' in device_name.lower():
                    lights.append(device_name)
                else:
                    devices.append(description)
            else:
                devices.append(description)
        elif 'Open' in description or 'Close' in description:
            devices.append(description)
        else:
            devices.append(description)
    
    # Build readable action list
    parts = []
    
    if thermostats:
        for t in thermostats:
            parts.append(f"  • {t}")
    
    if lights:
        if len(lights) == 1:
            parts.append(f"  • Turn off {lights[0]}")
        else:
            parts.append(f"  • Turn off {len(lights)} lights")
    
    if locks:
        if len(locks) == 1:
            parts.append(f"  • Lock {locks[0]}")
        else:
            parts.append(f"  • Lock {len(locks)} doors")
    
    if tvs:
        for t in tvs:
            parts.append(f"  • {t}")
    
    if devices:
        for d in devices[:2]:
            parts.append(f"  • {d}")
    
    if len(planned) > 5:
        extra = len(planned) - len(parts)
        parts.append(f"  • And {extra} more adjustments")
    
    return "\n".join(parts) if parts else ""


def _spoken_actions(planned: list[dict]) -> str:
    """'turn off 6 lights, lock the Front Door Lock and close the Bedroom Curtains'.

    Lights are counted rather than named (nobody wants six names read out),
    every other step is named, and a long tail collapses into "N more"."""
    lights_on = lights_off = 0
    others: list[str] = []
    for step in planned:
        desc = step.get("description", "")
        if desc.startswith(("Turn on", "Turn off")) and any(
                w in desc.lower() for w in ("light", "lamp", "sconce", "strip")):
            if step["patch"].get("power"):
                lights_on += 1
            else:
                lights_off += 1
        elif desc:
            others.append(desc[0].lower() + desc[1:])

    parts = []
    if lights_off:
        parts.append(f"turn off {lights_off} light{'s' if lights_off != 1 else ''}")
    if lights_on:
        parts.append(f"turn on {lights_on} light{'s' if lights_on != 1 else ''}")
    if len(others) > 4:
        parts += others[:3] + [f"{len(others) - 3} more things"]
    else:
        parts += others
    return parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + f" and {parts[-1]}"


def _plan_summary(name: str, planned: list[dict], exceptions: list[str]) -> dict:
    """Generate Alexa-like conversational summary for a routine with detailed action preview.
    
    Returns both the spoken summary and the detailed action list for the UI to show.
    """
    if not planned and not exceptions:
        return {
            "spoken": "Everything's already set just like that.",
            "actions": [],
            "needs_confirmation": False,
        }
    
    spoken_parts = []
    
    if exceptions:
        exception_text = "; ".join(exceptions)
        spoken_parts.append(f"By the way, {exception_text.lower()}.")
    
    if planned:
        spoken_parts.append(f"For {name.replace('_', ' ')}, I'll {_spoken_actions(planned)}.")
        spoken_parts.append("Shall I go ahead?")
    
    spoken = " ".join(spoken_parts)
    
    return {
        "spoken": spoken,
        "actions": planned,
        "action_list": _format_action_list(planned),
        "needs_confirmation": len(planned) > 0,
    }


def run_routine(name: str, state: HomeState, source: str = "mcp") -> dict:
    """Phase 2: execute an approved plan. Records every outcome as an event."""
    plan = plan_routine(name, state)
    if "error" in plan:
        return plan

    applied, failed = [], []
    for step in plan["steps"]:
        before = state.device(step["device_id"])
        after = state.patch(step["device_id"], step["patch"], source=f"routine:{name}")
        if after is None:
            failed.append(f"{step['description']} (device missing)")
        else:
            applied.append(f"{step['description']}: {describe(before)} → {describe(after)}")

    state.set_mode(name if name in ("morning", "bedtime") else state.active_mode, source=f"routine:{name}")
    
    # Build Alexa-style summary
    applied_count = len(applied)
    failed_count = len(failed)
    
    if applied_count == 0 and failed_count == 0:
        summary_text = "Everything's already set just like that."
        spoken_summary = summary_text
    else:
        # Build natural language description
        parts = []
        spoken_parts = []
        
        if applied_count == 1:
            if applied:
                # Extract just the result from the first applied step
                result = applied[0].split(':')[-1].strip() if ':' in applied[0] else applied[0]
                parts.append(f"Done. {result}.")
                spoken_parts.append(f"Done! {result}")
        elif applied_count <= 3:
            parts.append(f"Done. I've updated {applied_count} settings for you.")
            spoken_parts.append(f"Done! I've updated {applied_count} settings for you.")
        else:
            parts.append(f"Done. {applied_count} things updated successfully.")
            spoken_parts.append(f"Done! {applied_count} things updated successfully.")
        
        if failed_count > 0:
            parts.append(f"{failed_count} steps didn't go through.")
            spoken_parts.append(f"But don't worry - {failed_count} steps didn't go through.")
        
        summary_text = " ".join(parts)
        spoken_summary = " ".join(spoken_parts)
    
    result = {
        "routine": name,
        "applied": applied,
        "skipped": failed,
        "exceptions": plan["exceptions"],
        "summary": summary_text,
        "spoken_summary": spoken_summary,
    }
    event_store.record_event(kind="routine_run", source=source,
                             detail={"routine": name, "applied": len(applied), "failed": len(failed)})
    return result
