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
    if "power" in patch:
        verb = "Turn on" if patch["power"] else "Turn off"
        return f"{verb} the {device['name']}"
    if "targetTemp" in patch:
        return f"Set the {device['name']} to {patch['targetTemp']}°C"
    if "open" in patch:
        return f"{'Open' if patch['open'] else 'Close'} the {device['name']}"
    return f"Update the {device['name']}"


def _plan_summary(name: str, planned: list[dict], exceptions: list[str]) -> str:
    if not planned and not exceptions:
        return "Everything is already set for that - nothing to change."
    parts = []
    if exceptions:
        parts.append("; ".join(exceptions))
    if planned:
        parts.append(f"{len(planned)} change{'s' if len(planned) != 1 else ''} ready")
    return ". ".join(parts) + "."


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
    result = {
        "routine": name,
        "applied": applied,
        "skipped": failed,
        "exceptions": plan["exceptions"],
        "summary": (
            f"{name.replace('_', ' ')} complete. {len(applied)} changes applied."
            + (f" Note: {'; '.join(plan['exceptions'])}." if plan["exceptions"] else "")
            + (f" {len(failed)} steps failed." if failed else "")
        ),
    }
    event_store.record_event(kind="routine_run", source=source,
                             detail={"routine": name, "applied": len(applied), "failed": len(failed)})
    return result
