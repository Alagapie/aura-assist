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


# Preference the resident controls. Until it is "yes", a caregiver gets nothing.
CAREGIVER_CONSENT = "share_with_caregiver"

_ROUTINE_NAMES = {"bedtime": "bedtime routine", "leaving_home": "leaving-home routine",
                  "morning": "morning routine"}


def _local_time(ts: str) -> str:
    return datetime.fromisoformat(ts).astimezone().strftime("%I:%M %p").lstrip("0")


def caregiver_consented() -> bool:
    from .home_state import state
    return str(state.preferences.get(CAREGIVER_CONSENT, "")).lower() in ("yes", "true", "on")


def _caregiver_briefing(events: list[dict]) -> dict:
    """
    What a family caregiver may see: activity facts only, and only with the
    resident's consent. Deliberately deterministic (no LLM rewrite) and
    deliberately narrow: routines, the front door, safety alerts. Never camera
    content, object sightings, or guesses about health or mood.
    """
    from .home_state import state

    if not caregiver_consented():
        event_store.record_event(kind="briefing_withheld", source="system", detail={"audience": "caregiver"})
        return {"audience": "caregiver", "shared": False,
                "spoken": "Daily summaries aren't being shared right now - the resident hasn't turned "
                          "sharing on, so nothing was sent.",
                "generated_at": datetime.now().isoformat(timespec="seconds"), "source": "consent_check"}

    facts: list[str] = []
    for e in reversed([e for e in events if e["kind"] == "routine_run"]):  # oldest first
        name = _ROUTINE_NAMES.get(e["detail"].get("routine"), "a routine")
        facts.append(f"The {name} ran at {_local_time(e['ts'])}.")

    lock = state.device("doorLock")
    if lock:
        facts.append("The front door is locked." if lock.get("locked") else "The front door is unlocked.")

    oven_used = any(e["kind"] == "device_change" and e.get("device_id") == "cooker"
                    and (e["detail"].get("changed", {}).get("ovenOn") or e["detail"].get("changed", {}).get("heat"))
                    for e in events)
    cooker = state.device("cooker") or {}
    oven_on = bool(cooker.get("ovenOn") or cooker.get("heat"))
    if oven_used or oven_on:
        facts.append("The oven was used today and is still on." if oven_on
                     else "The oven was used today and is now off.")

    others = [a["message"] for a in state.snapshot()["alerts"]
              if a["device_id"] not in ("doorLock", "cooker")]
    if others:
        facts.append("Worth checking: " + "; ".join(others) + ".")
    elif not oven_on:
        facts.append("No safety alerts are open.")

    spoken = "Here's today's summary, shared with permission. " + " ".join(facts)
    event_store.record_event(kind="briefing", source="system", detail={"audience": "caregiver", "shared": True})
    return {"audience": "caregiver", "shared": True, "spoken": spoken, "facts": facts,
            "generated_at": datetime.now().isoformat(timespec="seconds"), "source": "deterministic"}


def briefing(audience: str = "user") -> dict:
    """A calm daily summary from today's events. Never infers personal traits."""
    events = event_store.query_events(since_minutes=24 * 60, limit=200)
    if audience == "caregiver":
        return _caregiver_briefing(events)
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
