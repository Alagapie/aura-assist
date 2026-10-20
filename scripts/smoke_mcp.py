"""
Smoke test: drives the running server through the real MCP client -
initialize, tools/list, tools/call - exactly like Alexa+ would.

Run the server first:  python -m uvicorn server.main:app --port 8000
Then:                  python scripts/smoke_mcp.py
"""

import asyncio
import json
import sys

from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

BASE = "http://localhost:8000/mcp"


async def main() -> int:
    async with streamable_http_client(BASE) as (read, write):
        async with ClientSession(read, write) as session:
            init = await session.initialize()
            print(f"initialize -> {init.server_info.name} v{init.server_info.version}")

            tools = await session.list_tools()
            names = [t.name for t in tools.tools]
            print(f"tools/list -> {len(names)} tools: {', '.join(names)}")
            for required in ("get_home_snapshot", "control_device", "run_routine",
                             "describe_scene", "find_object", "get_recent_events",
                             "generate_daily_briefing", "set_user_preference"):
                assert required in names, f"missing tool: {required}"

            # --- home snapshot --------------------------------------------
            snap = await session.call_tool("get_home_snapshot", {"room": "kitchen"})
            data = json.loads(snap.content[0].text)
            assert len(data["devices"]) >= 5, "kitchen snapshot too small"
            print(f"get_home_snapshot(kitchen) -> {len(data['devices'])} devices, "
                  f"{len(data['alerts'])} alerts")

            # --- control a device -----------------------------------------
            res = await session.call_tool("control_device", {"device_id": "kitchenLight", "action": "off"})
            out = json.loads(res.content[0].text)
            assert out["status"] == "ok" and out["after"] == "off", out
            print(f"control_device(kitchenLight, off) -> {out['before']} => {out['after']}")

            # --- unlock must demand confirmation ---------------------------
            res = await session.call_tool("control_device", {"device_id": "doorLock", "action": "unlock"})
            out = json.loads(res.content[0].text)
            assert out["status"] == "needs_confirmation", out
            print("control_device(unlock) without confirm -> correctly refused")

            res = await session.call_tool("control_device", {"device_id": "doorLock", "action": "unlock", "confirm": True})
            out = json.loads(res.content[0].text)
            assert out["status"] == "ok" and out["after"] == "UNLOCKED"
            print("control_device(unlock, confirm=true) -> allowed")

            # --- bedtime: plan then execute --------------------------------
            res = await session.call_tool("run_routine", {"routine_name": "bedtime"})
            plan = json.loads(res.content[0].text)
            assert plan["requires_confirmation"] and len(plan["steps"]) > 5, plan
            print(f"run_routine(bedtime) plan -> {len(plan['steps'])} steps, "
                  f"exceptions: {plan['exceptions']}")

            res = await session.call_tool("run_routine", {"routine_name": "bedtime", "confirm": True})
            done = json.loads(res.content[0].text)
            assert len(done["applied"]) > 5, done
            print(f"run_routine(bedtime, confirm) -> {done['summary']}")

            # --- vision -> sighting memory -> find_object -------------------
            res = await session.call_tool("describe_scene", {"camera_id": "kitchen"})
            scene = json.loads(res.content[0].text)
            assert scene["objects"] and scene["hazards"], scene
            print(f"describe_scene(kitchen) -> {len(scene['objects'])} objects, "
                  f"{len(scene['hazards'])} hazards ({scene['source']})")

            res = await session.call_tool("find_object", {"object_name": "keys"})
            found = json.loads(res.content[0].text)
            assert found["found"], found
            print(f"find_object(keys) -> {found['spoken']}")

            # --- events + briefing ------------------------------------------
            res = await session.call_tool("get_recent_events", {"since_minutes": 60})
            events = json.loads(res.content[0].text)
            assert events["count"] > 5, events
            print(f"get_recent_events -> {events['count']} events")

            res = await session.call_tool("generate_daily_briefing", {"audience": "caregiver"})
            brief = json.loads(res.content[0].text)
            print(f"generate_daily_briefing(caregiver) -> {brief['spoken'][:90]}...")

            # --- preference ---------------------------------------------------
            res = await session.call_tool("set_user_preference", {"key": "reply_length", "value": "short"})
            pref = json.loads(res.content[0].text)
            assert pref["status"] == "ok"
            print("set_user_preference(reply_length=short) -> ok")

    print("\nAll MCP smoke checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
