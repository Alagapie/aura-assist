"""
Offline checks for the vision service - no AWS needed.

Covers the parts that actually break a demo: pulling JSON out of a model reply
that added fences or prose, coercing a sloppy payload into the right shape, the
mock fallback, and the frame cache that lets the agent analyse a real frame.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server import event_store, vision  # noqa: E402

passed = 0
failed = 0


def check(label: str, condition: bool) -> None:
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS  {label}")
    else:
        failed += 1
        print(f"  FAIL  {label}")


def main() -> int:
    print("Vision service checks")

    # --- tolerant JSON extraction -------------------------------------------
    check("plain JSON parses", vision._extract_json('{"room": "kitchen"}') == {"room": "kitchen"})
    fenced = '```json\n{"room": "hall", "objects": []}\n```'
    check("fenced JSON parses", vision._extract_json(fenced) == {"room": "hall", "objects": []})
    chatty = 'Sure! Here is the scene:\n{"room": "living", "objects": []}\nHope that helps.'
    check("JSON embedded in prose parses", vision._extract_json(chatty) == {"room": "living", "objects": []})
    check("garbage returns None", vision._extract_json("not json at all") is None)
    check("empty returns None", vision._extract_json("") is None)

    # --- normalisation ------------------------------------------------------
    sloppy = {
        "room": "Kitchen",
        "objects": [
            "Mug",  # bare string where an object was requested
            {"label": "keys", "location": "on the counter", "confidence": "0.9"},
            {"name": "board", "confidence": 5},  # over-range confidence
            {"label": ""},  # empty label, must be dropped
        ],
        "hazards": [{"label": "knife near edge", "confidence": 0.7}],
        "people_count": "2",
        "summary": "",
    }
    norm = vision._normalise(sloppy, "kitchen")
    check("normalise returns a dict", isinstance(norm, dict))
    check("room is lowercased first word", norm["room"] == "kitchen")
    check("bare string became an object", norm["objects"][0]["label"] == "Mug")
    check("string confidence coerced", norm["objects"][1]["confidence"] == 0.9)
    check("over-range confidence clamped to 1.0", norm["objects"][2]["confidence"] == 1.0)
    check("empty label dropped", all(o["label"] for o in norm["objects"]))
    check("people_count parsed from string", norm["people_count"] == 2)
    check("missing summary is generated", bool(norm["summary"]))

    check("no objects and no hazards -> None", vision._normalise({"room": "x"}, "x") is None)
    check("non-dict -> None", vision._normalise(["nope"], "x") is None)

    # --- image format -------------------------------------------------------
    check("jpeg mime", vision._image_format("image/jpeg") == "jpeg")
    check("jpg mime normalises", vision._image_format("image/jpg") == "jpeg")
    check("png mime", vision._image_format("image/png") == "png")
    check("unknown mime defaults to jpeg", vision._image_format("application/octet-stream") == "jpeg")

    # --- mock fallback ------------------------------------------------------
    event_store.clear()
    scene = vision.describe_scene("kitchen")
    check("mock kitchen has objects", len(scene["objects"]) >= 1)
    check("mock scene is tagged mock", scene["source"] == "mock")
    sightings = event_store.find_object("mug")
    check("mock sighting recorded for find_object", len(sightings) >= 1)

    event_store.clear()
    empty = vision.describe_scene("bedroom")
    check("known room without a scene still answers", empty.get("source") == "mock" and empty["objects"] == [])
    unknown = vision.describe_scene("garage")
    check("unknown camera reports an error", "error" in unknown)

    # --- frame cache (offline: Bedrock is off, so it still resolves to mock) --
    vision.remember_frame("living", b"\xff\xd8\xfffake-jpeg")
    check("frame is cached per camera", vision._last_frame.get("living") == b"\xff\xd8\xfffake-jpeg")

    print("----------------------------------------------------")
    print(f"{passed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
