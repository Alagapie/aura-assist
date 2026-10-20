"""
Reasoning service: briefings and summaries via Bedrock, mock fallback built in.

Same contract as vision.py - set AURA_USE_BEDROCK=1 with AWS credentials to
route through Amazon Bedrock (Claude/Nova); otherwise a deterministic template
reads the event store directly so the demo is fully offline-capable.
"""

from __future__ import annotations

import os
from datetime import datetime

from . import event_store


def _bedrock_summarize(prompt: str) -> str | None:
    if os.environ.get("AURA_USE_BEDROCK") != "1":
        return None
    try:
        import boto3

        client = boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1"))
        response = client.converse(
            modelId=os.environ.get("AURA_REASONING_MODEL", "amazon.nova-lite-v1:0"),
            messages=[{"role": "user", "content": [{"text": prompt}]}],
            inferenceConfig={"maxTokens": 500, "temperature": 0.3},
        )
        return response["output"]["message"]["content"][0]["text"]
    except Exception:
        return None


def briefing(audience: str = "user") -> dict:
    """A calm daily summary from today's events. Never infers personal traits."""
    events = event_store.query_events(since_minutes=24 * 60, limit=200)
    device_changes = [e for e in events if e["kind"] == "device_change"]
    routines = [e for e in events if e["kind"] == "routine_run"]
    sightings = [e for e in events if e["kind"] == "object_sighting"]

    if not events:
        text = "It's been a quiet day - no home activity to report."
    else:
        bits = [f"{len(device_changes)} device changes"]
        if routines:
            bits.append(f"{len(routines)} routine{'s' if len(routines) != 1 else ''} run")
        if sightings:
            bits.append(f"{len(sightings)} object sighting{'s' if len(sightings) != 1 else ''}")
        open_alerts = [a for a in _alerts_summary()]
        text = "Today: " + ", ".join(bits) + "."
        if open_alerts:
            text += " Worth noting: " + "; ".join(open_alerts) + "."

    if audience == "caregiver":
        text = "Home activity summary. " + text + " No safety alerts require action." if not _alerts_summary() \
            else "Home activity summary. " + text

    custom = _bedrock_summarize(
        f"Summarize these smart-home events into 2 calm sentences for a {audience}. "
        f"No personal inferences, no alarmist language. Events: {[(e['kind'], e['detail'].get('summary', e['detail'])) for e in events[:30]]}"
    )
    spoken = custom or text
    event_store.record_event(kind="briefing", source="system", detail={"audience": audience})
    return {"audience": audience, "spoken": spoken, "event_count": len(events),
            "generated_at": datetime.now().isoformat(timespec="seconds"), "source": "bedrock" if custom else "mock"}


def _alerts_summary() -> list[str]:
    from .home_state import state

    return [alert["message"] for alert in state.snapshot()["alerts"]]
