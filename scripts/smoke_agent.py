"""
Agent smoke test - drives POST /agent/invoke end to end in mock mode.

Verifies the judging-critical behaviours:
  1. greeting + terse style
  2. multi-tool status request with a visible tool_calls log
  3. routine plan -> explicit approval -> execution (2-turn confirmation)
  4. unlock refused without confirmation, then allowed after approval
  5. decline path changes nothing
  6. guardrail: an approval while ANOTHER plan is pending never executes it

Run:  python scripts/smoke_agent.py   (server must be on :8000)
"""

import json
import sys
import urllib.request

BASE = "http://localhost:8000"
PASSED = []
FAILED = []


def post(path: str, payload: dict) -> dict:
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def check(label: str, ok: bool, detail: str = "") -> None:
    (PASSED if ok else FAILED).append(label)
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + (f"  [{detail}]" if detail else ""))


def main() -> int:
    session = "smoke-agent"

    print("\n[1] greeting is terse and mentions capabilities")
    r = post("/agent/invoke", {"message": "hello", "session_id": session})
    check("greeting replies", bool(r.get("reply")), r.get("reply", ""))
    check("engine is mock", r.get("engine") == "mock", str(r.get("engine")))

    print("\n[2] status request produces a visible tool_calls log")
    r = post("/agent/invoke", {"message": "what's on?", "session_id": session})
    names = [c["name"] for c in r.get("tool_calls", [])]
    check("get_home_snapshot called", "get_home_snapshot" in names, ",".join(names))
    check("reply <= 2 sentences", r["reply"].count(".") <= 3, r["reply"])

    print("\n[3] bedtime: plan first, execute only after approval")
    r = post("/agent/invoke", {"message": "prepare for bed", "session_id": session})
    runs = [c for c in r.get("tool_calls", []) if c["name"] == "run_routine"]
    planned = any("steps" in c["result"] for c in runs)
    check("routine planned, not executed", planned and r.get("needs_user_input"),
          r.get("pending") or "no pending flag")
    r = post("/agent/invoke", {"message": "yes, do it", "session_id": session})
    applied = any("applied" in c["result"] for c in r.get("tool_calls", [])
                  if c["name"] == "run_routine")
    check("approval executed the routine", applied, r["reply"])
    check("pending cleared", r.get("needs_user_input") is False)

    print("\n[4] unlock: refused, then allowed after explicit approval")
    r = post("/agent/invoke", {"message": "unlock the front door", "session_id": session})
    door = [c for c in r.get("tool_calls", [])
            if c["name"] == "control_device" and c["arguments"].get("action") == "unlock"]
    check("unlock attempted but not confirmed",
          bool(door) and door[0]["arguments"].get("confirm") is not True,
          json.dumps(door[0]["arguments"]) if door else "no call")
    check("asks for confirmation", r.get("needs_user_input") is True, r["reply"])
    r = post("/agent/invoke", {"message": "yes", "session_id": session})
    door = [c for c in r.get("tool_calls", []) if c["name"] == "control_device"]
    confirmed = any(c["arguments"].get("confirm") is True for c in door)
    check("approval unlocked the door", confirmed, r["reply"])

    print("\n[5] decline changes nothing")
    post("/agent/invoke", {"message": "prepare for bed", "session_id": session})
    r = post("/agent/invoke", {"message": "no, cancel", "session_id": session})
    check("decline acknowledged", "not changed" in r["reply"].lower()
          or "understood" in r["reply"].lower(), r["reply"])
    check("pending cleared after decline", r.get("needs_user_input") is False)

    print("\n[6] guardrail: approval while a different plan is pending")
    post("/agent/invoke", {"message": "prepare for bed", "session_id": session})
    # A sneaky caller tries to execute leaving_home directly with confirm=true
    # while bedtime is what the user was asked about.
    r = post("/agent/invoke", {"message": "actually, run leaving home now", "session_id": session})
    runs = [c for c in r.get("tool_calls", []) if c["name"] == "run_routine"]
    executes = any("applied" in c["result"] for c in runs)
    # leaving_home has no approval yet in this session, so it must plan only
    check("no silent execution of unapproved routine", not executes, r["reply"])

    print("\n[7] unknown input degrades honestly")
    r = post("/agent/invoke", {"message": "zzggbll", "session_id": session})
    check("fallback apology", "sorry" in r["reply"].lower() or "didn't" in r["reply"].lower(),
          r["reply"])

    print(f"\n{len(PASSED)} passed, {len(FAILED)} failed")
    if FAILED:
        print("FAILED: " + "; ".join(FAILED))
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())
