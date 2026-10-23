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
import hashlib
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
            {"label": "mug", "location": "on the counter near the sink", "confidence": 0.91},
            {"label": "cutting board", "location": "center counter", "confidence": 0.88},
            {"label": "keys", "location": "on the counter next to the fruit bowl", "confidence": 0.83},
            {"label": "fruit bowl", "location": "on the kitchen counter", "confidence": 0.90},
            {"label": "dish towel", "location": "hanging on the oven handle", "confidence": 0.78},
        ],
        "hazards": [
            {"label": "knife near counter edge", "confidence": 0.74},
        ],
        "people_count": 0,
        "summary": "A mug and cutting board are on the counter. Keys are next to the fruit bowl. A knife appears close to the counter edge.",
    },
    "living": {
        "room": "living",
        "objects": [
            {"label": "remote", "location": "on the coffee table", "confidence": 0.95},
            {"label": "wallet", "location": "on the coffee table", "confidence": 0.88},
            {"label": "book", "location": "on the coffee table", "confidence": 0.85},
            {"label": "phone", "location": "on the coffee table", "confidence": 0.82},
            {"label": "throw blanket", "location": "draped over the sofa", "confidence": 0.80},
            {"label": "cushion", "location": "on the sofa", "confidence": 0.78},
            {"label": "plant", "location": "in the corner near the window", "confidence": 0.87},
        ],
        "hazards": [],
        "people_count": 0,
        "summary": "The living room is tidy. A remote, wallet, book and phone are on the coffee table. A throw blanket is draped over the sofa and there is a plant in the corner.",
    },
    "bedroom": {
        "room": "bedroom",
        "objects": [
            {"label": "phone", "location": "on the bedside table", "confidence": 0.92},
            {"label": "book", "location": "on the bedside table", "confidence": 0.86},
            {"label": "glasses", "location": "on the bedside table", "confidence": 0.80},
            {"label": "pillow", "location": "on the bed", "confidence": 0.95},
        ],
        "hazards": [],
        "people_count": 0,
        "summary": "The bedroom looks calm. A phone, book and glasses are on the bedside table.",
    },
    "fridge": {
        "room": "kitchen",
        "objects": [
            {"label": "milk", "location": "on the top shelf of the fridge", "confidence": 0.92},
            {"label": "orange juice", "location": "on the top shelf of the fridge", "confidence": 0.89},
            {"label": "leftover container", "location": "on the middle shelf of the fridge", "confidence": 0.84},
            {"label": "yogurt", "location": "on the middle shelf of the fridge", "confidence": 0.81},
            {"label": "eggs", "location": "in the egg tray on the fridge door", "confidence": 0.93},
            {"label": "butter", "location": "on the fridge door shelf", "confidence": 0.87},
            {"label": "vegetables", "location": "in the crisper drawer at the bottom", "confidence": 0.85},
            {"label": "cheese", "location": "on the lower shelf of the fridge", "confidence": 0.83},
        ],
        "hazards": [],
        "people_count": 0,
        "summary": "The fridge has milk and orange juice on the top shelf, leftovers and yogurt in the middle, eggs and butter on the door, vegetables in the crisper, and cheese on the lower shelf.",
    },
    "hallway": {
        "room": "hallway",
        "objects": [
            {"label": "front door", "location": "on the north wall", "confidence": 0.98},
            {"label": "coat rack", "location": "by the entryway", "confidence": 0.92},
            {"label": "shoes", "location": "near the front door", "confidence": 0.85},
            {"label": "umbrella", "location": "in the corner by the coat rack", "confidence": 0.88},
        ],
        "hazards": [],
        "people_count": 0,
        "summary": "The hallway is tidy, with a coat rack and shoes by the entryway.",
    },
}

# Every room in the 3D house can act as a camera, so describe_scene works for
# any of them even when the mock only has hand-written scenes for two.
_KNOWN_ROOMS = ("living", "bedroom", "kitchen", "bathroom", "hallway", "fridge")

# Cameras with no feed of their own: the simulator never posts a frame for
# them, so the simulated scene is the only answer even when Bedrock is on.
_NO_FEED_CAMERAS = {"fridge"}

# What people (and the LLM) call a camera vs. its id in the simulator.
_CAMERA_ALIASES = {
    "hall": "hallway", "entrance": "hallway", "entrance hall": "hallway",
    "living room": "living", "livingroom": "living", "lounge": "living",
    "bath": "bathroom", "bed room": "bedroom", "refrigerator": "fridge",
}


def camera_id_for(name: str) -> str:
    """'Living Room' -> 'living'; unknown names pass through unchanged."""
    key = (name or "").strip().lower()
    return _CAMERA_ALIASES.get(key, key)

# Hard cap on what one frame may report. Nova Lite at temperature 0 can slide
# into a repetition loop ("garlic press, garlic crusher, garlic grinder, ...")
# that burns the whole token budget; the prompt asks for at most this many and
# _normalise enforces it.
_MAX_OBJECTS = 15

_PROMPT_RULES = (
    "You are analyzing a 3D render of a smart home room.\n"
    "RETURN ONLY RAW JSON. NO markdown, NO explanation, NO coordinates, NO bounding boxes.\n"
    "Format (summary FIRST):\n"
    '{"summary":"<what you see>","room":"<room_name>","objects":[{"label":"<object>","location":"<on/in which surface or spot>","confidence":<0-1>}],"hazards":[],"people_count":0}\n'
    "Rules:\n"
    "- Report ONLY what is actually visible in THIS image. The format above is a template, not content.\n"
    "- If the view is blocked or nothing is clearly visible, return an empty objects list and say so in the summary.\n"
    "- Set \"room\" to the camera room name you are given.\n"
    f"- List AT MOST {_MAX_OBJECTS} objects. Small movable items come first (phones, remotes, keys, wallets, cups, books, bottles, food), then a few large items (sofa, bed, TV, fridge).\n"
    "- Each object appears ONCE. Never list variants or synonyms of the same thing. If you are not sure what something is, leave it out.\n"
    "- Use specific labels ('milk carton', 'green bottle', 'phone'), never generic ones like 'object', 'item' or 'food item'.\n"
    "- location MUST be a natural phrase naming the surface or spot: 'on the coffee table', 'on the bedside table', 'on the kitchen counter', 'on the sofa', 'on the floor', 'on the top shelf'. Never 'in the kitchen', never coordinates.\n"
    "- For fridge scenes: describe shelf positions ('top shelf', 'middle shelf', 'door shelf', 'crisper drawer').\n"
    "- List hazards (knives near edges, wet floors, open flames) separately.\n"
    "- Keep the summary conversational and accurate - max 2 sentences.\n"
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
    if start != -1:
        complete, salvaged = _scan_json(text[start:])
        if complete:
            candidates.append(complete)
        if salvaged:
            candidates.append(salvaged)

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        except (ValueError, TypeError):
            # Try to clean up common issues
            cleaned = candidate
            cleaned = re.sub(r',\s*}', '}', cleaned)
            cleaned = re.sub(r',\s*]', ']', cleaned)
            cleaned = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', cleaned)
            try:
                parsed = json.loads(cleaned)
                if isinstance(parsed, dict):
                    return parsed
            except:
                continue
    return None


def _scan_json(text: str) -> tuple[str | None, str | None]:
    """
    Walk `text` (starting at its first "{") with a real bracket stack.

    Returns (complete, salvaged): `complete` is the first balanced object, if
    the reply contained one. When the reply was cut off by maxTokens instead,
    `salvaged` is the text up to the last fully-closed array element, with the
    still-open brackets closed in the right order - so a truncated object list
    keeps every object that arrived whole instead of losing the entire frame.
    """
    stack: list[str] = []
    in_string = escaped = False
    last_safe = -1          # index just after the last complete element
    safe_stack: list[str] = []
    for i, ch in enumerate(text):
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch in "{[":
            stack.append("}" if ch == "{" else "]")
        elif ch in "}]":
            if not stack:
                break
            stack.pop()
            if not stack:
                return text[: i + 1], None
            if stack[-1] == "]":
                # an element of an array just closed - a safe place to cut
                last_safe, safe_stack = i + 1, list(stack)
    if last_safe == -1:
        return None, None
    return None, text[:last_safe] + "".join(reversed(safe_stack))


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
        seen: set[tuple[str, str]] = set()
        for item in items:
            if len(cleaned) >= _MAX_OBJECTS:
                break
            if isinstance(item, str):
                item = {"label": item}
            if not isinstance(item, dict):
                continue
            label = str(item.get("label") or item.get("name") or "").strip()
            if not label:
                continue
            # The same thing listed twice (often a sign of a repetition loop).
            key = (label.lower(), str(item.get("location") or "").strip().lower())
            if key in seen:
                continue
            seen.add(key)
            entry = {"label": label, "confidence": _as_float(item.get("confidence"), 0.5)}
            location = str(item.get("location") or "").strip()
            if location:
                entry["location"] = location
            cleaned.append(entry)
        return cleaned

    objects = clean_items("objects")
    hazards = clean_items("hazards")
    if not isinstance(raw.get("objects"), list) and not isinstance(raw.get("hazards"), list):
        # Missing fields are malformed; explicit empty lists are a valid clear scene.
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


_TILE_NOTE = (
    "\nImage 1 is the whole room. Images 2-5 are zoomed-in quarters of the SAME room "
    "(top-left, top-right, bottom-left, bottom-right) so you can make out small objects. "
    "Use them to identify small items, but list each real object only once."
)


def _bedrock_describe(camera_id: str, image_bytes: bytes, mime: str = "image/jpeg",
                      tiles: list[bytes] | None = None) -> dict | None:
    """
    Real VLM call via Bedrock Converse. Returns a normalised dict, or None when
    Bedrock is off / unavailable / returned nothing usable.

    `tiles` are optional zoomed quarters of the same frame (JPEG). Sent in the
    same request, they roughly double the size of small objects for the model.
    """
    if os.environ.get("AURA_USE_BEDROCK") != "1":
        return None
    if not image_bytes:
        return None

    try:
        import boto3
        from botocore.config import Config
    except ImportError:
        log.warning("AURA_USE_BEDROCK=1 but boto3 is not installed; frame not analysed")
        return None

    model_id = os.environ.get("AURA_VLM_MODEL", "amazon.nova-lite-v1:0")
    tiles = [t for t in (tiles or []) if t][:4]
    prompt = f"{_PROMPT_RULES}{_TILE_NOTE if tiles else ''}\nThe camera is in the {camera_id}."
    images = [{"image": {"format": _image_format(mime), "source": {"bytes": image_bytes}}}]
    images += [{"image": {"format": "jpeg", "source": {"bytes": t}}} for t in tiles]

    try:
        client = boto3.client(
            "bedrock-runtime",
            region_name=os.environ.get("AWS_REGION", "us-east-1"),
            config=Config(
                connect_timeout=float(os.environ.get("AURA_VISION_CONNECT_TIMEOUT", "5")),
                read_timeout=float(os.environ.get("AURA_VISION_READ_TIMEOUT", "30")),
                # one retry: a throttled or slow first attempt was the most
                # common "camera frame could not be analyzed" in testing
                retries={"max_attempts": 2, "mode": "standard"},
            ),
        )
        response = client.converse(
            modelId=model_id,
            messages=[{"role": "user", "content": [*images, {"text": prompt}]}],
            inferenceConfig={"maxTokens": 1000, "temperature": 0.0},
        )
        text = response["output"]["message"]["content"][0]["text"]
    except Exception as exc:  # noqa: BLE001 - any AWS/network error must not break the demo
        log.warning("Bedrock vision call failed (%s); frame not analysed", exc)
        return None

    parsed = _extract_json(text)
    if parsed is None:
        log.warning("Bedrock vision returned unparseable text: %.200s", text)
        return None

    normalised = _normalise(parsed, camera_id)
    if normalised is None:
        log.warning("Bedrock vision returned no usable objects; frame not analysed")
    return normalised


# ------------------------------------------------------------------ api -----

# The most recent frame the simulator posted per camera, so a later
# describe_scene(camera_id) call (e.g. from the agent over MCP) analyses the real
# room instead of the canned mock. Kept tiny and in-memory on purpose - it is a
# demo convenience, not a recording archive.
_last_frame: dict[str, bytes] = {}
_last_tiles: dict[str, list[bytes]] = {}
_last_result: dict[str, tuple[str, dict]] = {}


def remember_frame(camera_id: str, image_bytes: bytes, tiles: list[bytes] | None = None) -> None:
    """Cache a frame (and its zoomed tiles) the simulator captured, for the
    next describe_scene call."""
    camera_id = camera_id_for(camera_id)
    if camera_id and image_bytes:
        digest = hashlib.sha256(image_bytes).hexdigest()
        cached = _last_result.get(camera_id)
        if cached and cached[0] != digest:
            _last_result.pop(camera_id, None)
        _last_frame.pop(camera_id, None)   # re-insert so live_cameras() is newest-first
        _last_frame[camera_id] = image_bytes
        _last_tiles[camera_id] = list(tiles or [])


def live_cameras() -> list[str]:
    """Cameras the simulator has posted a real frame for, most recent first."""
    return list(reversed(_last_frame))


def forget_frames() -> None:
    """
    Drop every cached frame. Called on /state/reset so a test run, or a fresh
    demo take, starts from the deterministic mock instead of whatever frame the
    simulator happened to post last.
    """
    _last_frame.clear()
    _last_tiles.clear()
    _last_result.clear()


def describe_scene(camera_id: str, image_path: str | None = None,
                   image_bytes: bytes | None = None, mime: str = "image/jpeg",
                   tiles: list[bytes] | None = None) -> dict:
    """
    Describe a camera frame. Records every object as a sighting event so
    find_object() can answer "where are my keys?" later.

    A real frame may arrive as a path or as raw bytes (the simulator posts the
    latter, plus optional zoomed `tiles`). With no frame - or when Bedrock is
    off - the hand-written mock scene for that room is used, so the tooling
    still works offline.
    """
    camera_id = camera_id_for(camera_id)
    frame = image_bytes
    if frame is None and image_path and os.path.exists(image_path):
        with open(image_path, "rb") as fh:
            frame = fh.read()
    if frame is None:
        # No frame given: use the most recent one the simulator posted for this
        # camera (see remember_frame), so an agent's describe_scene call sees the
        # real scene instead of the canned mock.
        frame = _last_frame.get(camera_id)
        tiles = _last_tiles.get(camera_id)

    frame_digest = hashlib.sha256(frame).hexdigest() if frame else None
    cached = _last_result.get(camera_id)
    if frame_digest and cached and cached[0] == frame_digest:
        return cached[1]

    bedrock_enabled = os.environ.get("AURA_USE_BEDROCK") == "1"
    source = "mock"
    result = None

    if frame and bedrock_enabled:
        result = _bedrock_describe(camera_id, frame, mime, tiles)
        if result is None:
            # A frame *was* captured but the model could not read it. Never
            # replace a failed real inference with the simulated scene - that
            # would be a fabricated fact dressed up as a camera reading.
            return {"error": "vision_model_unavailable", "message": "The camera frame could not be analyzed.",
                    "source": "bedrock_error", "camera_id": camera_id}
        source = "bedrock"
    elif bedrock_enabled and camera_id in _KNOWN_ROOMS and camera_id not in _NO_FEED_CAMERAS:
        # Live vision is on but the simulator has not shown us this room yet.
        # Answering from the canned scene here would report keys and wallets
        # that are not in the 3D house - and record them as sightings that
        # find_object would repeat for a week. Say so honestly instead.
        return {"error": "no_frame", "camera_id": camera_id, "source": "bedrock",
                "message": f"I haven't had a camera view of the {camera_id} yet."}
    else:
        # Bedrock is off (offline demo), or the camera has no feed of its own
        # (the fridge). Fall back to the simulated scene, which describes the
        # same house the 3D simulator renders.
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

    response = {**result, "source": source, "camera_id": camera_id,
                "simulated": source == "mock"}
    if frame_digest:
        _last_result[camera_id] = (frame_digest, response)
    return response
