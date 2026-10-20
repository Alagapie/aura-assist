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

        Subscribers are notified so the 3D view and any SSE listeners snap back
        to the initial scene too.
        """
        with self._lock:
            self.devices = create_devices()
            self.active_mode = "Manual"
            self.preferences = {}
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
