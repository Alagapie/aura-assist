"""
End-to-end check for the questions that were failing in the demo:

  * "what's on the coffee table"  -> describe_scene(living)
  * "where is my phone"            -> find_object / describe_scene sweep
  * "what's in the fridge"         -> describe_scene(fridge)
  * "what's happening"             -> get_home_snapshot

It drives the running server through the real MCP client (initialize,
tools/list, tools/call) and then through the agent endpoint, exactly like the
web client does.

Run the server first:  python -m uvicorn server.main:app --port 8000
Then:                  python scripts/smoke_vision_flow.py
"""

import asyncio
import json
import sys
import urllib.request

from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

BASE = "http://localhost:8000/mcp"
AGENT = "http://localhost:8000/agent/invoke"

FAILURES: list[str] = []


def post(url: str, payload: dict, timeout: int = 90) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def check(label: str, ok: bool, detail: str = "") -> None:
    mark = "PASS" if ok else "FAIL"
    print(f"  [{mark}] {label}{(' - ' + detail) if detail else ''}")
    if not ok:
        FAILURES.append(label)


def objects_of(result) -> list[dict]:
    return json.loads(result.content[0].text).get("objects", [])


async def main() -> int:
    # Fresh home + fresh sighting memory so the run is deterministic.
    req = urllib.request.Request(
        "http://localhost:8000/state/reset", data=b"{}",
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=10) as resp:
        resp.read()

    async with streamable_http_client(BASE) as (read, write):
        async with ClientSession(read, write) as session:
            init = await session.initialize()
            print(f"MCP handshake -> {init.server_info.name}")
            tools = await session.list_tools()
            print(f"tools/list    -> {len(tools.tools)} tools\n")

            # --- describe_scene(living): the coffee table -------------------
            print("describe_scene(living)")
            res = await session.call_tool("describe_scene", {"camera_id": "living"})
            data = json.loads(res.content[0].text)
            check("no error", "error" not in data, data.get("error", ""))
            labels = [o["label"] for o in data.get("objects", [])]
            check("phone on the coffee table",
                  any(o["label"] == "phone" and "coffee table" in o.get("location", "")
                      for o in data.get("objects", [])),
                  f"objects={labels}")
            check("source is reported", "source" in data, f"source={data.get('source')}")

            # --- describe_scene(fridge): the fridge camera ------------------
            print("\ndescribe_scene(fridge)")
            res = await session.call_tool("describe_scene", {"camera_id": "fridge"})
            data = json.loads(res.content[0].text)
            check("no error", "error" not in data, data.get("error", ""))
            labels = [o["label"] for o in data.get("objects", [])]
            check("has fridge contents", len(labels) > 0, f"objects={labels}")
            check("milk on the top shelf",
                  any(o["label"] == "milk" and "top shelf" in o.get("location", "")
                      for o in data.get("objects", [])),
                  f"objects={labels}")

            # --- find_object(phone): memory written by the scene above ------
            print("\nfind_object(phone)")
            res = await session.call_tool("find_object", {"object_name": "phone"})
            data = json.loads(res.content[0].text)
            check("found", data.get("found") is True, data.get("message", ""))
            check("located on the coffee table",
                  "coffee table" in str(data.get("spoken", "")).lower(),
                  data.get("spoken", ""))

            # --- find_object on an object nobody saw ------------------------
            res = await session.call_tool("find_object", {"object_name": "spaceship"})
            data = json.loads(res.content[0].text)
            check("unknown object is not invented", data.get("found") is False,
                  data.get("message", ""))

            # --- every room answers ------------------------------------------
            print("\ndescribe_scene for every room")
            for room in ("living", "bedroom", "kitchen", "bathroom", "hall", "fridge"):
                res = await session.call_tool("describe_scene", {"camera_id": room})
                data = json.loads(res.content[0].text)
                check(f"{room} answers", "error" not in data, data.get("error", ""))

    # --- the agent, the way the web client calls it -------------------------
    print("\nagent (/agent/invoke)")
    for question, must_contain in [
        ("what's on the coffee table?", "coffee table"),
        ("where is my phone?", "phone"),
        ("what's in the fridge?", "fridge"),
        ("what's happening?", ""),
    ]:
        turn = post(AGENT, {"message": question, "session_id": "smoke-vision"})
        reply = (turn.get("reply") or "").lower()
        tools_used = ", ".join(c.get("name", "?") for c in turn.get("tool_calls", []))
        ok = bool(reply) and (not must_contain or must_contain in reply)
        check(f'"{question}"', ok, f'-> "{turn.get("reply", "")}" [{tools_used}]')
        if "couldn" in reply or "could not" in reply:
            FAILURES.append(f'"{question}" answered with a failure')

    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) failed:")
        for f in FAILURES:
            print(f"  - {f}")
        return 1
    print("All vision / object-finding checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
