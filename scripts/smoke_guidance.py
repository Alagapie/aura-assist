"""
Non-visual guidance checks, in-process (no server needed).

    python scripts/smoke_guidance.py

"Where are my glasses?" must say which surface (telling twin surfaces apart),
offer step-by-step directions instead of reading them out unasked, give them
on "yes", stop on "no thanks", and remember the precise spot.
"""

from __future__ import annotations

import asyncio
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("AURA_DB", os.path.join(tempfile.mkdtemp(), "guidance.db"))
os.environ["AURA_USE_BEDROCK"] = "0"

from server import agent, vision  # noqa: E402
from server.home_layout import guide_for  # noqa: E402
from server.home_state import state  # noqa: E402

results: list[tuple[str, bool]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"  [{detail[:110]}]" if detail else ""))


async def say(text: str) -> dict:
    return await agent.invoke(text, "guidance")


async def main() -> int:
    state.reset()
    vision.forget_frames()

    print("[1] layout tells twin surfaces apart")
    left = guide_for("bedroom", "on the nightstand", "next to the lamp, by the window")
    right = guide_for("bedroom", "on the nightstand", "near the bathroom door")
    check("window cue -> left bedside table", left and "by the big window" in left["label"], left and left["label"])
    check("bathroom cue -> far bedside table", right and "far side" in right["label"], right and right["label"])
    check("unknown surface -> no guess", guide_for("bedroom", "on the moon") is None)

    print("[2] where first, directions offered")
    r = await say("I can't find my glasses.")
    reply = r["reply"]
    check("names the surface", "bedside table" in reply, reply)
    check("gives the height", "knee height" in reply)
    check("offers directions", "directions from the bedroom door" in reply)
    check("route not read out unasked", "seven steps" not in reply)
    check("UI shows the offer", r.get("pending") == "Hear step-by-step directions?")

    print("[3] directions on yes")
    reply = (await say("Yes please."))["reply"]
    check("route from the door", reply.startswith("From the bedroom door"), reply)
    check("mentions obstacles", "bench" in reply)

    print("[4] 'no thanks' declines")
    await say("Where is my phone?")
    reply = (await say("No thanks."))["reply"]
    check("declined politely", reply == "Okay.", reply)

    print("[5] memory keeps the precise spot")
    reply = (await say("When did you last see my glasses?"))["reply"]
    check("memory answer is specific", "bedside table" in reply and " at " in reply, reply)

    failed = [n for n, ok in results if not ok]
    print("-" * 52)
    print(f"{len(results) - len(failed)} passed, {len(failed)} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
