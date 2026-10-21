"""
Vision service: camera frame -> structured scene facts via a VLM.

Two paths, identical contract:

  * Bedrock (AURA_USE_BEDROCK=1 + AWS credentials) - a real Nova image call on
    the JPEG the simulator posts. This is the path the demo uses.
  * Mock - rich canned scenes per room, so the whole flow (describe -> event ->
    find_object) runs offline and never blocks on credentials.

Either way the result is normalised to the same JSON shape before anything else
sees it, so the tool contract, the sighting memory and the tests are unchanged.
"""

from __future__ import annotations

import json
import logging
import os
import re

from . import event_store

log = logging.getLogger("aura.vision")

# Structured scenes the mock VLM "sees". Mirrors the JSON contract documented
# in the hackathon plan: objects + hazards + confidence + a spoken summary.
_MOCK_SCENES = {
    "kitchen": {
        "room": "kitchen",
        "objects": [
            {"label": "mug", "location": "left of sink", "confidence": 0.91},
            {"label": "cutting board", "location": "center counter", "confidence": 0.88},
            {"label": "keys", "location": "on the counter next to the fruit bowl", "confidence": 0.83},
        ],
        "hazards": [
            {"label": "knife near counter edge", "confidence": 0.74},
        ],
        "people_count": 0,
        "summary": "A mug and cutting board are on the counter. A knife appears close to the counter edge.",
    },
    "living": {
        "room": "living",
        "objects": [
            {"label": "remote", "location": "on the sofa arm", "confidence": 0.93},
            {"label": "wallet", "location": "on the coffee table", "confidence": 0.86},
        ],
        "hazards": [],
        "people_count": 0,
        "summary": "The living room is tidy. A remote is on the sofa arm and a wallet is on the coffee table.",
    },
}

# Every room in the 3D house can act as a camera, so describe_scene works for
# any of them even when the mock only has hand-written scenes for two.
_KNOWN_ROOMS = ("living", "bedroom", "kitchen", "bathroom", "hall")

_PROMPT_RULES = (
    "You are a home camera assistant. Look at the image and describe only what "
    "is actually visible.\n"
    "Return ONLY a JSON object, with no markdown fences and no extra text, using "
    "exactly these keys:\n"
    '  "room": the room name as a single lowercase word,\n'
    '  "objects": array of {"label", "location", "confidence"} - one entry per '
    "notable object, location phrased like \"on the coffee table\", confidence a "
    "number 0-1,\n"
    '  "hazards": array of {"label", "confidence"} for anything unsafe '
    "(spill, sharp object near an edge, open flame, blocked exit),\n"
    '  "people_count": integer number of people visible,\n'
    '  "summary": one or two short spoken sentences about the scene.\n'
    "Rules: never identify or describe a person's identity, face or traits - only "
    "count them. Use the word 'possibly' in a label when you are unsure. Do not "
    "invent objects that are not there. Keep the summary short enough to speak "
    "aloud. Prioritise safety-relevant detail."
)


# --------------------------------------------------------------- parsing ----

_JSON_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def _extract_json(text: str) -> dict | None:
    """
    Pull the JSON object out of a model reply.

    Nova usually obeys "only JSON", but a fenced block or a stray sentence still
    happens. Rather than throw and silently fall back to the mock, we try, in
    order: the whole string, a fenced block, then the first balanced {...}.
    """
    if not text:
        return None

    candidates: list[str] = [text.strip()]

    fence = _JSON_FENCE.search(text)
    if fence:
        candidates.append(fence.group(1).strip())

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        candidates.append(text[start : end + 1])

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except (ValueError, TypeError):
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def _as_float(value, default: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return max(0.0, min(1.0, number))


def _normalise(raw: dict, camera_id: str) -> dict | None:
    """
    Coerce a model payload into the exact shape the rest of the app expects.

    A VLM can omit a key, return a bare string where an object was asked for, or
    send a confidence as "high". Anything we cannot make sense of is dropped
    rather than allowed to crash the sighting loop.
    """
    if not isinstance(raw, dict):
        return None

    room_words = str(raw.get("room") or camera_id or "").strip().lower().split()
    room = room_words[0] if room_words else (camera_id or "unknown")

    def clean_items(key: str) -> list[dict]:
        items = raw.get(key)
        if not isinstance(items, list):
            return []
        cleaned = []
        for item in items:
            if isinstance(item, str):
                item = {"label": item}
            if not isinstance(item, dict):
                continue
            label = str(item.get("label") or item.get("name") or "").strip()
            if not label:
                continue
            entry = {"label": label, "confidence": _as_float(item.get("confidence"), 0.5)}
            location = str(item.get("location") or "").strip()
            if location:
                entry["location"] = location
            cleaned.append(entry)
        return cleaned

    objects = clean_items("objects")
    hazards = clean_items("hazards")
    if not objects and not hazards:
        # Nothing usable - better to say so than to record an empty sighting.
        return None

    try:
        people_count = max(0, int(raw.get("people_count", 0)))
    except (TypeError, ValueError):
        people_count = 0

    summary = str(raw.get("summary") or "").strip()
    if not summary:
        parts = [f"{o['label']} ({o.get('location', 'in view')})" for o in objects[:4]]
        summary = "I can see " + ", ".join(parts) + "." if parts else "The room looks clear."

    return {
        "room": room,
        "objects": objects,
        "hazards": hazards,
        "people_count": people_count,
        "summary": summary,
    }


# --------------------------------------------------------------- bedrock ----

_ALLOWED_FORMATS = {"jpeg": "jpeg", "jpg": "jpeg", "png": "png", "webp": "webp", "gif": "gif"}


def _image_format(mime: str) -> str:
    """Bedrock wants a bare format word, and only a few are valid."""
    guess = (mime or "image/jpeg").split("/")[-1].split(";")[0].strip().lower()
    return _ALLOWED_FORMATS.get(guess, "jpeg")


def _bedrock_describe(camera_id: str, image_bytes: bytes, mime: str = "image/jpeg") -> dict | None:
    """
    Real VLM call via Bedrock Converse. Returns a normalised dict, or None when
    Bedrock is off / unavailable / returned nothing usable - the caller then
    falls back to the mock scene so the demo never breaks.
    """
    if os.environ.get("AURA_USE_BEDROCK") != "1":
        return None
    if not image_bytes:
        return None

    try:
        import boto3
    except ImportError:
        log.warning("AURA_USE_BEDROCK=1 but boto3 is not installed; using mock vision")
        return None

    model_id = os.environ.get("AURA_VLM_MODEL", "amazon.nova-lite-v1:0")
    prompt = f"{_PROMPT_RULES}\nThe camera is in the {camera_id}."

    try:
        client = boto3.client(
            "bedrock-runtime",
            region_name=os.environ.get("AWS_REGION", "us-east-1"),
        )
        response = client.converse(
            modelId=model_id,
            messages=[{
                "role": "user",
                "content": [
                    {"image": {"format": _image_format(mime), "source": {"bytes": image_bytes}}},
                    {"text": prompt},
                ],
            }],
            inferenceConfig={"maxTokens": 900, "temperature": 0.1},
        )
        text = response["output"]["message"]["content"][0]["text"]
    except Exception as exc:  # noqa: BLE001 - any AWS/network error must not break the demo
        log.warning("Bedrock vision call failed (%s); using mock scene", exc)
        return None

    parsed = _extract_json(text)
    if parsed is None:
        log.warning("Bedrock vision returned unparseable text: %.120s", text)
        return None

    normalised = _normalise(parsed, camera_id)
    if normalised is None:
        log.warning("Bedrock vision returned no usable objects; using mock scene")
    return normalised


# ------------------------------------------------------------------ api -----

# The most recent frame the simulator posted per camera, so a later
# describe_scene(camera_id) call (e.g. from the agent over MCP) analyses the real
# room instead of the canned mock. Kept tiny and in-memory on purpose - it is a
# demo convenience, not a recording archive.
_last_frame: dict[str, bytes] = {}


def remember_frame(camera_id: str, image_bytes: bytes) -> None:
    """Cache a frame the simulator captured, for the next describe_scene call."""
    if camera_id and image_bytes:
        _last_frame[camera_id] = image_bytes


def describe_scene(camera_id: str, image_path: str | None = None,
                   image_bytes: bytes | None = None, mime: str = "image/jpeg") -> dict:
    """
    Describe a camera frame. Records every object as a sighting event so
    find_object() can answer "where are my keys?" later.

    A real frame may arrive as a path or as raw bytes (the simulator posts the
    latter). With no frame - or when Bedrock is off - the hand-written mock scene
    for that room is used, so the tooling still works offline.
    """
    frame = image_bytes
    if frame is None and image_path and os.path.exists(image_path):
        with open(image_path, "rb") as fh:
            frame = fh.read()
    if frame is None:
        # No frame given: use the most recent one the simulator posted for this
        # camera (see remember_frame), so an agent's describe_scene call sees the
        # real scene instead of the canned mock.
        frame = _last_frame.get(camera_id)

    result = _bedrock_describe(camera_id, frame, mime) if frame else None
    source = "bedrock" if result else "mock"

    if result is None:
        result = _MOCK_SCENES.get(camera_id)
        if result is None and camera_id in _KNOWN_ROOMS:
            # A room without a hand-written scene still gets an honest, empty
            # description instead of an error - the camera exists, it just saw
            # nothing worth reporting.
            result = {
                "room": camera_id,
                "objects": [],
                "hazards": [],
                "people_count": 0,
                "summary": f"The {camera_id} looks clear right now.",
            }

    if result is None:
        return {"error": f"no camera for '{camera_id}'", "available_cameras": list(_MOCK_SCENES)}

    # Every object becomes a memory entry - this is what makes finding work.
    for obj in result["objects"]:
        event_store.record_object_sighting(
            object_name=obj["label"],
            location=obj.get("location", "in view"),
            room=result["room"],
            confidence=obj["confidence"],
            camera_id=camera_id,
        )

    return {**result, "source": source, "camera_id": camera_id}
