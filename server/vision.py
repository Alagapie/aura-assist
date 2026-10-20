"""
Vision service: camera frame -> structured scene facts via a VLM.

Production path: Amazon Bedrock (Nova Lite) with an ImageBlock. Demo path:
rich canned scenes per room, so the whole flow (describe -> event -> find_object)
runs offline and never blocks on credentials. Set AURA_USE_BEDROCK=1 plus
AWS credentials to switch - the tool contract is identical either way.
"""

from __future__ import annotations

import base64
import os

from . import event_store

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

_PROMPT_RULES = (
    "Return only valid JSON with keys room, objects, hazards, people_count, summary. "
    "Never identify people. Use 'possibly' when confidence is low. Do not invent objects. "
    "Prioritize safety-relevant details. Keep the summary short enough to speak."
)


def _bedrock_describe(camera_id: str, image_bytes: bytes, mime: str = "image/jpeg") -> dict | None:
    """Real VLM call via Bedrock Converse. Returns None when unavailable."""
    if os.environ.get("AURA_USE_BEDROCK") != "1":
        return None
    try:
        import boto3

        client = boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1"))
        response = client.converse(
            modelId=os.environ.get("AURA_VLM_MODEL", "amazon.nova-lite-v1:0"),
            messages=[{
                "role": "user",
                "content": [
                    {"image": {"format": mime.split("/")[1], "source": {"bytes": image_bytes}}},
                    {"text": _PROMPT_RULES},
                ],
            }],
            inferenceConfig={"maxTokens": 700, "temperature": 0.1},
        )
        import json

        return json.loads(response["output"]["message"]["content"][0]["text"])
    except Exception:
        return None


def describe_scene(camera_id: str, image_path: str | None = None) -> dict:
    """
    Describe a camera frame. Records every object as a sighting event so
    find_object() can answer "where are my keys?" later.
    """
    result = None
    if image_path and os.path.exists(image_path):
        with open(image_path, "rb") as fh:
            result = _bedrock_describe(camera_id, fh.read())
    if result is None:
        result = _MOCK_SCENES.get(camera_id)
        source = "mock"
    else:
        source = "bedrock"

    if result is None:
        return {"error": f"no camera for '{camera_id}'", "available_cameras": list(_MOCK_SCENES)}

    # Every object becomes a memory entry - this is what makes finding work.
    for obj in result["objects"]:
        event_store.record_object_sighting(
            object_name=obj["label"],
            location=obj["location"],
            room=result["room"],
            confidence=obj["confidence"],
            camera_id=camera_id,
        )

    return {**result, "source": source, "camera_id": camera_id}
