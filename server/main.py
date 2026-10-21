"""
AuraAssist server entry point.

FastAPI app that mounts the MCP server over Streamable HTTP at /mcp, plus two
plain HTTP conveniences for the 3D simulator bridge:

  GET  /health           - liveness probe
  GET  /events/state     - SSE stream of home-state snapshots (the 3D view subscribes)
  POST /state/patch      - optional non-MCP escape hatch used by the simulator's
                           optimistic commit path (same HomeState.patch underneath)
"""

from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

load_dotenv()  # reads .env: AWS creds, AURA_USE_BEDROCK, model ids

from . import agent
from .home_state import state
from .mcp_tools import mcp

# The MCP sub-app serves its endpoint at /mcp; mounted at "/" that becomes the
# public URL http://host:8000/mcp. Created at import time so the session
# manager exists before the lifespan below starts it.
mcp_app = mcp.streamable_http_app()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Mounted Starlette apps do not receive lifespan events, so the MCP
    # session manager's task group must be driven by the outer app itself.
    agent.refresh_tool_specs()

    # Bridge store notifications into each SSE subscriber's queue. This must
    # live here: passing `lifespan=` to FastAPI replaces @app.on_event("startup")
    # handlers entirely, so a startup hook would silently never run.
    loop = asyncio.get_running_loop()

    def publish(snapshot: dict) -> None:
        for q in list(_queues.values()):
            loop.call_soon_threadsafe(q.put_nowait, snapshot)

    state.subscribe(publish)
    async with mcp.session_manager.run():
        yield


app = FastAPI(title="AuraAssist MCP Server", version="0.1.0", lifespan=lifespan)

# The 3D simulator usually reaches us through the Vite dev proxy (same origin),
# but allow direct browser calls too (different ports, preview builds, the
# Streamable HTTP client in the browser). mcp-session-id is a response header the
# MCP client has to read, so it must be exposed explicitly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["mcp-session-id"],
)

_queues: set[asyncio.Queue] = {}


@app.get("/")
async def index() -> dict:
    """Landing page - this is an API server, so / lists what's available."""
    return {
        "service": "AuraAssist MCP Server",
        "status": "running",
        "endpoints": {
            "POST /agent/invoke": "chat with the agent {message, session_id} -> {reply, tool_calls}",
            "POST /agent/reset": "forget a conversation session",
            "GET  /health": "liveness probe + engine mode",
            "GET  /docs": "interactive API docs (Swagger)",
            "GET  /state": "current home snapshot (initial sync / debugging)",
            "GET  /events/state": "SSE stream of home-state snapshots",
            "POST /state/patch": "direct device patch (3D simulator bridge)",
            "POST /state/reset": "restore the default scene",
            "POST /mcp": "MCP Streamable HTTP endpoint (what clients connect to)",
        },
        "try": "python scripts/chat.py  -  talk to the agent in your terminal",
    }


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "service": "aura-assist",
        "devices": len(state.snapshot()["devices"]),
        "agent_engine": "bedrock" if os.environ.get("AURA_USE_BEDROCK") == "1" else "mock",
    }


@app.get("/state")
async def get_state() -> dict:
    """Current home snapshot - used for initial sync and debugging."""
    return state.snapshot()


@app.post("/state/reset")
async def state_reset() -> dict:
    """Restore the default scene (used by tests and between demo takes)."""
    state.reset()
    return {"status": "ok", "devices": len(state.snapshot()["devices"])}


@app.post("/agent/invoke")
async def agent_invoke(payload: dict) -> dict:
    """One conversational turn: text in, spoken reply + visible tool log out."""
    message = (payload.get("message") or "").strip()
    if not message:
        return {"error": "empty message"}
    return await agent.invoke(message, payload.get("session_id", "default"))


@app.post("/agent/reset")
async def agent_reset(payload: dict | None = None) -> dict:
    """Forget a conversation session (used between demo takes)."""
    return agent.reset((payload or {}).get("session_id", "default"))


@app.get("/events/state")
async def state_stream(request: Request) -> StreamingResponse:
    """SSE stream: first the current snapshot, then every subsequent change."""
    queue: asyncio.Queue = asyncio.Queue()
    _queues[id(queue)] = queue

    async def stream():
        try:
            yield f"data: {json.dumps(state.snapshot())}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    snapshot = await asyncio.wait_for(queue.get(), timeout=15)
                    yield f"data: {json.dumps(snapshot)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            _queues.pop(id(queue), None)

    return StreamingResponse(stream(), media_type="text/event-stream")


@app.post("/state/patch")
async def patch(payload: dict) -> dict:
    """Direct patch for the simulator's optimistic-commit bridge."""
    device = state.patch(payload["device_id"], payload.get("patch", {}), source=payload.get("source", "simulator"))
    if device is None:
        return {"error": f"unknown device '{payload.get('device_id')}'"}
    return {"status": "ok", "state": device}


# Streamable HTTP transport for MCP clients (Alexa+ simulator, web client).
# Mounted last so the specific routes above win the match.
app.mount("/", mcp_app)
