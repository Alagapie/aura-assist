"""
Device catalogue for the AuraAssist mock smart home.

Ids, names, rooms and state fields mirror `src/config/devices.js` in the 3D
simulator exactly, so the two surfaces can share one source of truth later
(the simulator's `commit()` will target these very ids).
"""

from __future__ import annotations


def _d(device_id: str, dtype: str, room: str, name: str, **state):
    return {"id": device_id, "type": dtype, "room": room, "name": name, "online": True, **state}


DEVICE_LIST = [
    # ------------------------------- living room ---------------------------
    _d("ceilingLightA", "light", "living", "Ceiling Light · Left", power=True, brightness=0.85),
    _d("ceilingLightB", "light", "living", "Ceiling Light · Right", power=True, brightness=0.85),
    _d("sconceLeft", "light", "living", "Wall Sconce · Left", power=False, brightness=0.7),
    _d("sconceRight", "light", "living", "Wall Sconce · Right", power=False, brightness=0.7),
    _d("tableLamp", "light", "living", "Table Lamp", power=True, brightness=0.6),
    _d("floorLamp", "light", "living", "Floor Lamp", power=False, brightness=0.75),
    _d("tv", "tv", "living", "Living Room TV", power=False, volume=24, channel=1, muted=False),
    _d("ac", "ac", "living", "Living Room AC", power=True, targetTemp=22, mode="cool"),
    _d("fan", "fan", "living", "Standing Fan", power=False, speed=2, oscillate=True),
    _d("curtains", "curtains", "living", "Living Room Curtains", open=True),
    _d("entryDoor", "door", "living", "Door to Hall", open=False),
    # ------------------------------- bedroom -------------------------------
    _d("bedroomLight", "light", "bedroom", "Bedroom Ceiling Light", power=False, brightness=0.7),
    _d("bedLampLeft", "light", "bedroom", "Bedside Lamp · Left", power=False, brightness=0.5),
    _d("bedLampRight", "light", "bedroom", "Bedside Lamp · Right", power=False, brightness=0.5),
    _d("bedroomAC", "ac", "bedroom", "Bedroom AC", power=False, targetTemp=23, mode="cool"),
    _d("bedroomCurtains", "curtains", "bedroom", "Bedroom Curtains", open=True),
    _d("bedroomDoor", "door", "bedroom", "Bedroom Door", open=False),
    # ------------------------------- kitchen --------------------------------
    _d("kitchenLight", "light", "kitchen", "Kitchen Ceiling Light", power=True, brightness=0.9),
    _d("kitchenStrip", "light", "kitchen", "Under-Cabinet Strip", power=False, brightness=0.8),
    _d("fridge", "fridge", "kitchen", "Fridge-Freezer", power=True, open=False, freezerOpen=False, targetTemp=3),
    _d("cooker", "cooker", "kitchen", "Oven & Cooktop", power=False, heat=0, ovenOn=False),
    _d("rangeHood", "fan", "kitchen", "Range Hood", power=False, speed=1, oscillate=False),
    _d("hallKitchenDoor", "door", "kitchen", "Hall Door", open=False),
    # ------------------------------- bathroom -------------------------------
    _d("bathroomLight", "light", "bathroom", "Bathroom Light", power=True, brightness=0.85),
    _d("mirrorLight", "light", "bathroom", "Mirror Light", power=False, brightness=0.9),
    _d("bathFan", "fan", "bathroom", "Bathroom Exhaust", power=False, speed=1, oscillate=False),
    _d("shower", "shower", "bathroom", "Shower", power=False, temp=38),
    # ------------------------------- hallway --------------------------------
    _d("hallLight", "light", "hallway", "Hall Ceiling Light", power=True, brightness=0.8),
    _d("porchLight", "light", "hallway", "Entry Sconce", power=False, brightness=0.7),
    _d("doorLock", "lock", "hallway", "Front Door Lock", locked=True),
    _d("mainDoor", "door", "hallway", "Main Entrance Door", open=False),
    _d("doorbell", "doorbell", "hallway", "Doorbell", ringing=False),
    _d("entrySensor", "sensor", "hallway", "Entry Sensor", sensorKind="entry", value="closed"),
]

DEVICE_TYPES = {
    "light", "tv", "ac", "fan", "shower", "fridge", "cooker",
    "curtains", "door", "lock", "doorbell", "sensor",
}

ROOMS = ["living", "bedroom", "kitchen", "bathroom", "hallway"]


def create_devices() -> dict:
    """A fresh `{id: device}` map - the server's single source of truth."""
    return {d["id"]: dict(d) for d in DEVICE_LIST}


def describe(device: dict) -> str:
    """One-line spoken-friendly state, mirroring the simulator's formatter."""
    if not device:
        return "unknown"
    t = device["type"]
    if t == "light":
        return f"on at {round(device['brightness'] * 100)}%" if device.get("power") else "off"
    if t == "tv":
        if not device.get("power"):
            return "on standby"
        return f"on, channel {device['channel']}, volume {0 if device.get('muted') else device['volume']}%"
    if t == "ac":
        if not device.get("power"):
            return "off"
        return f"{device.get('mode', 'cool')} at {device['targetTemp']}°C"
    if t == "fan":
        return f"on, speed {device['speed']}" if device.get("power") else "off"
    if t == "shower":
        return f"running at {device['temp']}°C" if device.get("power") else "off"
    if t == "fridge":
        doors = [label for label, key in (("fridge door open", "open"), ("freezer door open", "freezerOpen")) if device.get(key)]
        return " · ".join(doors) if doors else f"closed, {device['targetTemp']}°C"
    if t == "cooker":
        if device.get("ovenOn"):
            return "oven on" + (f", hob level {device['heat']}" if device.get("heat") else "")
        return f"on, hob level {device['heat']}" if device.get("power") else "off"
    if t == "curtains":
        return "open" if device.get("open") else "closed"
    if t == "door":
        return "open" if device.get("open") else "closed"
    if t == "lock":
        return "locked" if device.get("locked") else "UNLOCKED"
    if t == "doorbell":
        return "ringing" if device.get("ringing") else "idle"
    if t == "sensor":
        return str(device.get("value"))
    return str(device.get("state", "unknown"))
