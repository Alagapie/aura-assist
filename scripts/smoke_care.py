"""
Consent and daily-summary checks, in-process (no server needed).

    AURA_USE_BEDROCK=0 python scripts/smoke_care.py

The caregiver summary must never leave the house without the resident's
consent, must stop when consent is withdrawn, and must contain activity facts
only - never camera content.
"""

from __future__ import annotations

import asyncio
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("AURA_DB", os.path.join(tempfile.mkdtemp(), "care.db"))
os.environ["AURA_USE_BEDROCK"] = "0"

from server import agent, vision  # noqa: E402
from server.home_state import state  # noqa: E402
from server.mcp_tools import generate_daily_briefing  # noqa: E402

results: list[tuple[str, bool]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"  [{detail[:110]}]" if detail else ""))


async def say(text: str) -> str:
    return (await agent.invoke(text, "care"))["reply"]


async def main() -> int:
    state.reset()
    vision.forget_frames()

    print("[1] no consent, nothing shared")
    r = generate_daily_briefing("caregiver")
    check("tool refuses without consent", r.get("shared") is False, r["spoken"])
    reply = await say("How was Mum's day?")
    check("agent relays the refusal", "aren't being shared" in reply, reply)

    print("[2] resident grants consent by voice")
    reply = await say("Share my daily summary with my daughter.")
    check("consent recorded", state.preferences.get("share_with_caregiver") == "yes", reply)

    print("[3] caregiver summary: facts only")
    vision.describe_scene("living")  # creates object sightings that must NOT be shared
    await say("prepare for bed")
    await say("yes")
    r = generate_daily_briefing("caregiver")
    spoken = r["spoken"].lower()
    check("shared after consent", r.get("shared") is True, r["spoken"])
    check("mentions the routine", "bedtime routine ran" in spoken)
    check("mentions the front door", "front door" in spoken)
    check("no camera content", not any(w in spoken for w in ("phone", "wallet", "remote", "coffee table", "camera saw")))

    print("[4] consent withdrawn")
    reply = await say("Stop sharing my summary.")
    check("consent revoked", state.preferences.get("share_with_caregiver") == "no", reply)
    r = generate_daily_briefing("caregiver")
    check("refuses again after revoke", r.get("shared") is False)

    print("[5] reset forgets consent")
    await say("Share my daily summary with my daughter.")
    state.reset()
    check("reset clears consent", generate_daily_briefing("caregiver").get("shared") is False)

    failed = [n for n, ok in results if not ok]
    print("-" * 52)
    print(f"{len(results) - len(failed)} passed, {len(failed)} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
