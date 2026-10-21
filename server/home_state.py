"""
Home-state service: the server-side single source of truth for every device.

Every mutation goes through `HomeState.patch()`, which:
  1. applies the change optimistically,
  2. records an event in the memory store,
  3. notifies subscribers (the SSE stream the 3D simulator listens to).

Nothing else in the server is allowed to mutate `state.devices` directly - that
guarantees the event timeline can never miss a change, no matter which surface
issued it (voice agent, Alexa+, dashboard click, routine).
"""

from __future__ import annotations

import copy
import threading
from datetime import datetime, timezone

from . import event_store
from .devices import create_devices, describe

_ROOM_NAMES = {"living": "living room", "bedroom": "bedroom", "kitchen": "kitchen",
               "bathroom": "bathroom", "hallway": "hall"}
_AC_MODES = {"cool": "cooling", "heat": "heating", "fan": "fan mode", "dry": "drying"}


def _join(items: list[str]) -> str:
    """"a", "a and b", "a, b and c" - read-aloud list joining."""
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + f" and {items[-1]}"


class HomeState:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self.devices: dict[str, dict] = create_devices()
        self.active_mode: str = "Manual"
        self.preferences: dict[str, str] = {}
        self._subscribers: list = []

    # ------------------------------------------------------------ reads ----

    def snapshot(self, room: str | None = None) -> dict:
        with self._lock:
            devices = [
                copy.deepcopy(d) for d in self.devices.values()
                if room is None or d["room"] == room
            ]
            return {
                "active_mode": self.active_mode,
                "room": room or "whole home",
                "devices": devices,
                "alerts": self._alerts(devices),
                "server_time": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            }

    def digest(self, room: str | None = None) -> dict:
        """Grouped, prioritised briefing of the current state.

        Deterministic on purpose: the assistant relays these lines instead of
        enumerating 33 devices. Observations are computed from device state and
        the active mode ONLY - facts, never guesses about people (privacy line).
        """
        with self._lock:
            devices = [copy.deepcopy(d) for d in self.devices.values()
                       if room is None or d["room"] == room]
            mode = self.active_mode

        lines: list[str] = []
        observations: list[str] = []

        def where(d: dict) -> str:
            return _ROOM_NAMES.get(d["room"], d["room"])

        # --- security: locks, doors, sensors (what people worry about) -----
        locks = [d for d in devices if d["type"] == "lock"]
        doors = [d for d in devices if d["type"] == "door"]
        sensors = [d for d in devices if d["type"] == "sensor"]
        sec: list[str] = []
        for d in locks:
            if d.get("locked"):
                sec.append(f"{d['name'].replace(' Lock', '').lower()} locked")
            else:
                sec.append(f"{d['name'].replace(' Lock', '').lower()} unlocked")
                observations.append(f"The {d['name'].replace(' Lock', '').lower()} is unlocked.")
        for d in doors:
            if d.get("open"):
                sec.append(f"{d['name'].lower()} open")
                observations.append(f"The {d['name'].lower()} is open.")
            elif "entrance" in d["name"].lower() or "main" in d["name"].lower():
                sec.append(f"{d['name'].lower()} closed")
        for d in sensors:
            if str(d.get("value", "")).lower() not in ("closed", "shut"):
                sec.append(f"{d['name'].lower()} reports {d.get('value')}")
                observations.append(f"The {d['name'].lower()} reports {d.get('value')}.")
        if sec:
            lines.append("Security: " + _join(sec) + ".")

        # --- climate ------------------------------------------------------
        acs = [d for d in devices if d["type"] == "ac"]
        if acs:
            cl = []
            for d in acs:
                if d.get("power"):
                    mode_word = _AC_MODES.get(str(d.get("mode", "")).lower(), f"{d.get('mode')} mode")
                    cl.append(f"{where(d)} AC {mode_word} to {round(d.get('targetTemp', 22))}C")
                else:
                    cl.append(f"{where(d)} AC off")
            lines.append("Climate: " + _join(cl) + ".")

        # --- lights: grouped by room, on-list first ------------------------
        lights = [d for d in devices if d["type"] == "light"]
        on_rooms, off_rooms = [], []
        for r in dict.fromkeys(d["room"] for d in lights):
            label = _ROOM_NAMES.get(r, r)
            (on_rooms if any(d.get("power") for d in lights if d["room"] == r)
             else off_rooms).append(label)
        if lights:
            parts = [f"on in the {_join(on_rooms)}" if on_rooms else "",
                     f"off in the {_join(off_rooms)}" if off_rooms else ""]
            lines.append("Lights: " + "; ".join(p for p in parts if p) + ".")

        # --- curtains ------------------------------------------------------
        cur = [d for d in devices if d["type"] == "curtains"]
        if cur:
            lines.append("Curtains: "
                         + _join([f"{where(d)} {'open' if d.get('open') else 'closed'}" for d in cur])
                         + ".")

        # --- anything else running worth naming ----------------------------
        others = []
        for d in devices:
            if d["type"] == "tv" and d.get("power"):
                others.append("the TV on")
            elif d["type"] == "fan" and d.get("power"):
                others.append(f"{where(d)} fan on")
            elif d["type"] == "shower" and d.get("power"):
                others.append("the shower running")
            elif d["type"] == "cooker" and (d.get("heat", 0) or d.get("ovenOn")):
                others.append("the oven on")
                observations.append("The oven is still on.")
            elif d["type"] == "fridge" and (d.get("open") or d.get("freezerOpen")):
                observations.append("The fridge door is open.")
        if others:
            lines.append("Also running: " + _join(others) + ".")

        # --- verified-fact observation: Away mode but things still on ------
        if mode.lower() == "away":
            still = []
            if on_rooms:
                still.append("lights on")
            if any(d.get("power") for d in acs):
                still.append("the AC running")
            if others:
                still.append("other devices running")
            if still:
                observations.append(f"The home is in Away mode but still has "
                                    + _join(still) + ".")

        return {
            "headline": "Needs attention:" if observations else "All calm here.",
            "observations": observations[:3],
            "lines": lines,
            "mode": mode,
        }

    def device(self, device_id: str) -> dict | None:
        with self._lock:
            device = self.devices.get(device_id)
            return copy.deepcopy(device) if device else None

    def _alerts(self, devices: list[dict]) -> list[dict]:
        """Safety-relevant exceptions the assistant should surface proactively."""
        alerts = []
        for d in devices:
            if d["type"] == "lock" and not d.get("locked"):
                alerts.append({"device_id": d["id"], "level": "warning", "message": f"{d['name']} is unlocked"})
            if d["type"] == "door" and d.get("open") and d["room"] == "hallway":
                alerts.append({"device_id": d["id"], "level": "warning", "message": f"{d['name']} is open"})
            if d["type"] == "sensor" and d.get("value") in ("wet", "alarm", "open"):
                alerts.append({"device_id": d["id"], "level": "alert", "message": f"{d['name']}: {d['value']}"})
            if d["type"] == "cooker" and (d.get("ovenOn") or d.get("heat", 0) > 0):
                alerts.append({"device_id": d["id"], "level": "warning", "message": f"{d['name']} is still on"})
        return alerts

    # ----------------------------------------------------------- writes ----

    def patch(self, device_id: str, changes: dict, source: str = "mcp", command: str = "state.set") -> dict | None:
        """Apply a patch, record the event, notify subscribers. Returns the new state."""
        with self._lock:
            device = self.devices.get(device_id)
            if device is None:
                return None
            before = copy.deepcopy(device)
            device.update(changes)
            after = copy.deepcopy(device)

        changed = {k: (before.get(k), after.get(k)) for k in changes if before.get(k) != after.get(k)}
        if changed:
            event_store.record_event(
                kind="device_change",
                device_id=device_id,
                room=after["room"],
                source=source,
                detail={
                    "command": command,
                    "changed": {k: new for k, (_, new) in changed.items()},
                    "summary": f"{after['name']} is now {describe(after)}",
                },
            )
            self._notify()
        return after

    def set_mode(self, mode: str, source: str = "mcp") -> None:
        with self._lock:
            self.active_mode = mode
        event_store.record_event(kind="mode_change", source=source, detail={"mode": mode})
        self._notify()

    def set_preference(self, key: str, value: str) -> None:
        with self._lock:
            self.preferences[key] = value
        event_store.record_event(kind="preference", source="user", detail={"key": key, "value": value})

    def reset(self, source: str = "reset") -> None:
        """Restore every device to its catalogue default (tests / demo between takes).

        The event diary is wiped too, so a fresh take starts with a clean
        timeline. Subscribers are notified so the 3D view snaps back as well.
        """
        with self._lock:
            self.devices = create_devices()
            self.active_mode = "Manual"
            self.preferences = {}
        event_store.clear()
        event_store.record_event(kind="state_reset", source=source,
                                 detail={"note": "home restored to default state"})
        self._notify()

    # ----------------------------------------------------- subscriptions ----

    def subscribe(self, callback) -> None:
        """Register a `callback(snapshot_dict)` invoked after every change."""
        with self._lock:
            self._subscribers.append(callback)

    def _notify(self) -> None:
        snapshot = self.snapshot()
        for callback in list(self._subscribers):
            try:
                callback(snapshot)
            except Exception:  # a broken subscriber must never break the server
                pass


state = HomeState()
