"""
Put the home in the same starting state before every demo take.

    python scripts/demo_prep.py              # server on localhost:8000
    python scripts/demo_prep.py --base http://192.168.1.20:8000

1. resets every device, the event log, camera frames and the chat session,
2. turns the oven on (the kitchen scene's safety moment),
3. warms up the model with one throwaway question (the first call is slow),
4. waits until the simulator's cameras have seen the living room, kitchen and
   bedroom - open the 3D view and click through those rooms while it waits.

Sharing with a caregiver starts OFF; the demo turns it on by voice.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request

ROOMS = ("living", "kitchen", "bedroom")
SESSION = "web-sim"  # the chat panel's session id (simulator/src/ui/AuraChat.jsx)


def call(base: str, path: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(base + path, data=data, method="GET" if body is None else "POST",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as res:
        return json.load(res)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--base", default="http://localhost:8000")
    parser.add_argument("--timeout", type=int, default=300, help="seconds to wait for camera views")
    args = parser.parse_args()
    base, timeout = args.base.rstrip("/"), args.timeout

    health = call(base, "/health")
    print(f"server: {base} - engine {health['agent_engine']}")
    if health["agent_engine"] != "bedrock":
        print("  ! mock engine: set AURA_USE_BEDROCK=1 in .env for real vision and restart the server")

    call(base, "/state/reset", {})
    call(base, "/agent/reset", {"session_id": SESSION})
    print("reset: devices, event log, camera frames, chat session")

    call(base, "/state/patch", {"device_id": "cooker", "patch": {"power": True, "ovenOn": True}, "source": "demo_prep"})
    print("scene: oven on")

    t0 = time.time()
    call(base, "/agent/invoke", {"message": "what's happening?", "session_id": "demo-warmup"})
    print(f"warm-up: model answered in {time.time() - t0:.1f}s")

    print(f"cameras: open the 3D view and click {', '.join(ROOMS)} (about 10 s each)")
    deadline = time.time() + timeout
    seen: set[str] = set()
    while time.time() < deadline:
        live = set(call(base, "/health").get("live_cameras", []))
        for room in sorted((live & set(ROOMS)) - seen):
            print(f"  + {room} seen")
        seen |= live & set(ROOMS)
        if seen >= set(ROOMS):
            break
        time.sleep(2)
    missing = set(ROOMS) - seen
    if missing:
        print(f"  ! still not seen: {', '.join(sorted(missing))} - visit them before recording")
        return 1

    # The warm-up and camera tour leave nothing behind that the takes depend on,
    # except the sightings - which are exactly what "when did you last see my
    # glasses?" should find.
    print("ready: start recording")
    return 0


if __name__ == "__main__":
    sys.exit(main())
