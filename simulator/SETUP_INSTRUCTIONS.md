# AuraAssist - Setup Instructions

## Quick Start (Two-Terminal)

### Terminal 1: Start the MCP Server (Python)
```bash
cd "C:\Users\DELL\Desktop\aura-assist"
pip install -r requirements.txt
python -m uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload
```

**Server will start at:** `http://localhost:8000`

### Terminal 2: Start the 3D Simulator (React)
```bash
cd "C:\Users\DELL\Desktop\HOME SIMULATION"
npm run dev
```

**Simulator will start at:** `http://localhost:5173`

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Home Simulator (React)               │
│              Port: 5173 - Vite Dev Server               │
│                                                         │
│  Features:                                              │
│  - Interactive 3D smart home visualization              │
│  - Voice assistant with wake word support               │
│  - Device control via clicks or voice                   │
│  - AuraChat MCP client                                  │
└─────────────────────────────────────────────────────────┘
                            │
                            │ HTTP requests
                            │
┌─────────────────────────────────────────────────────────┐
│              AuraAssist MCP Server (Python)             │
│            Port: 8000 - FastAPI/Uvicorn                 │
│                                                         │
│  Features:                                              │
│  - MCP Streamable HTTP at /mcp                          │
│  - Amazon Bedrock VLM integration                       │
│  - Context-aware conversation agent                     │
│  - Object finding with event memory                     │
│  - Multi-step routines with confirmation                │
│  - Safety guardrails                                    │
└─────────────────────────────────────────────────────────┘
```

---

## Key Components

### 1. MCP Server (Python - `aura-assist`)
- **Location:** `C:\Users\DELL\Desktop\aura-assist`
- **Entry Point:** `server/main.py`
- **MCP Endpoint:** `/mcp`
- **Tools:** 8 MCP tools exposed

### 2. Web Simulator (React - `HOME SIMULATION`)
- **Location:** `C:\Users\DELL\Desktop\HOME SIMULATION`
- **Entry Point:** `src/App.jsx`
- **MCP Client:** `src/services/mcpClient.js`
- **Chat Panel:** `src/ui/AuraChat.jsx`

### 3. Voice Assistant (React)
- **Location:** `src/ui/VoiceAssistant.jsx`
- **Wake Word:** "Hey Alexa" or "Hey Aura"
- **Continuous Listening:** Default enabled

---

## Testing the Setup

### 1. Test Server Health
```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "aura-assist",
  "devices": 25,
  "agent_engine": "mock"
}
```

### 2. Test Chat Interface
- Open `http://localhost:5173`
- Press `A` to open AuraChat
- Type: "What's happening at home?"

### 3. Test Voice Assistant
- Press `V` to open Alexa
- Click the Ear icon to enable wake word
- Say: "Hey Alexa"
- Then ask: "Where is the phone?"

---

## MCP Tools Available

| Tool | Purpose |
|------|---------|
| `get_home_snapshot(room)` | Get current home state |
| `describe_scene(camera_id)` | Scene from camera view |
| `find_object(object_name, since_minutes)` | Find物品的最后位置 |
| `control_device(device_id, action, confirm)` | 控制设备 |
| `run_routine(routine_name, confirm)` | 运行多步骤例行程序 |
| `get_recent_events(since_minutes)` | 获取最近事件 |
| `generate_daily_briefing(audience)` | 生成每日摘要 |
| `set_user_preference(key, value)` | 设置用户偏好 |

---

## What's in the Repository

### Home Simulation (`HOME SIMULATION/`)
- 3D React/Three.js smart home visualizer
- Voice assistant (Alexa)
- AuraChat MCP client
- Device control UI

### MCP Server (`aura-assist/`)
- Python FastAPI server
- MCP Streamable HTTP endpoint
- Amazon Bedrock VLM integration
- Event memory and object tracking
- Routine orchestrator
- Safety guardrails

---

## Troubleshooting

### Server won't start
- Ensure Python 3.8+ is installed
- Run `pip install -r requirements.txt`
- Check port 8000 is not in use

### Simulator won't start
- Ensure Node.js 18+ is installed
- Run `npm run dev` from `HOME SIMULATION` folder
- Check port 5173 is not in use

### Can't connect to server
- Verify server is running on port 8000
- Check browser console for CORS errors
- Try opening `http://localhost:8000/health` directly in browser

---

## Next Steps

1. Start the Python server first
2. Start the React simulator
3. Test the chat interface
4. Test the voice assistant
5. Record demo video (3 minutes max)

---

**Status:** ✅ READY FOR DEMO
