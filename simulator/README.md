# AuraAssist - Context-Aware Home Assistant

**A privacy-first, hands-free home companion for Alexa+ with Amazon Bedrock integration.**

An interactive 3D smart home simulator with Alexa voice assistant, wake word detection, Amazon Bedrock VLM integration, and multi-step routines with safety guardrails.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-18.3-green.svg)](https://react.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-blue.svg)](https://fastapi.tiangolo.com)
[![Bedrock](https://img.shields.io/badge/Amazon_Bedrock-Nova_Lite-orange.svg)](https://aws.amazon.com/bedrock/)

## 🎯 Quick Start

### 1. Start the MCP Server (Required)

```bash
cd "C:\Users\DELL\Desktop\aura-assist"
pip install -r requirements.txt
uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload
```

Verify the server is running:
```bash
curl http://localhost:8000/health
# Expected: {"status": "ok", "service": "aura-assist", ...}
```

### 2. Start the Simulator

```bash
cd "C:\Users\DELL\Desktop\HOME SIMULATION"
npm run dev
```

Open your browser to `http://localhost:5175`

### 3. Use the Voice Assistant

Press **V** or click the Alexa orb to open the voice assistant.

**Wake Words:**
- "Hey Alexa" - Primary
- "Computer" - Alternative

**Try these commands:**
- "turn off the kitchen lights"
- "prepare for bed"
- "where are my keys?"
- "movie mode"
- "go to the kitchen"

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) | Production deployment instructions |
| [VOICE_ASSISTANT_READINESS.md](VOICE_ASSISTANT_READINESS.md) | Voice features verification |
| [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) | Directory organization |
| [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md) | Full production readiness checklist |

---

## ✨ Features

### Voice Assistant (Alexa)
- ✅ **Wake word detection** - "Hey Alexa" / "Computer"
- ✅ **Speech recognition** - Natural language commands
- ✅ **Speech synthesis** - Alexa speaks replies
- ✅ **Push-to-talk** - Button activation
- ✅ **Browser fallback** - Text chat when voice unavailable

### MCP Server (aura-assist/)
- ✅ **Streamable HTTP** - MCP 2025-11-25 compliant
- ✅ **8 MCP tools** - Complete device control and state
- ✅ **Bedrock VLM** - Amazon Nova Lite for scene understanding
- ✅ **Object finding** - Search event history
- ✅ **Routines** - Multi-step workflows with confirmation

### Safety & Security
- ✅ **Confirmation flow** - Required for unlocking devices
- ✅ **Routine guardrails** - Safe multi-step automation
- ✅ **Protected devices** - Fridge, doors, locks excluded from automation
- ✅ **Privacy-first** - No facial recognition, no personal data storage

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Web Simulator (Current Folder)               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐     │
│  │   3D Scene  │  │ Voice Alexa │  │   MCP Client        │     │
│  │  (Three.js) │  │ (Wake Word) │  │ (Browser)           │     │
│  └─────────────┘  └─────────────┘  └─────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                            │ HTTPS/Streamable HTTP
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                  AuraAssist MCP Server                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐     │
│  │  FastAPI    │  │   FastMCP   │  │  Amazon Bedrock     │     │
│  │  Endpoint   │  │  (Tools)    │  │  (Nova Lite)        │     │
│  └─────────────┘  └─────────────┘  └─────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Production Deployment

### AWS Bedrock Setup

1. Create IAM user with `AmazonBedrockFullAccess` policy
2. Generate access keys
3. Configure `.env` file:
   ```bash
   cd "C:\Users\DELL\Desktop\aura-assist"
   copy .env.example .env
   # Edit .env with your AWS credentials
   ```

4. Verify setup:
   ```bash
   python scripts/check_bedrock.py
   ```

### Deploy MCP Server

**Option A: Docker**
```bash
cd "C:\Users\DELL\Desktop\aura-assist"
docker build -t aura-assist .
docker run -p 8000:8000 --env-file .env aura-assist
```

**Option B: Direct Deployment**
```bash
cd "C:\Users\DELL\Desktop\aura-assist"
pip install -r requirements.txt
uvicorn server.main:app --host 0.0.0.0 --port 8000 --workers 4
```

### Deploy Web Simulator

```bash
cd "C:\Users\DELL\Desktop\HOME SIMULATION"

# Configure server URL
cp .env.example .env
# Edit VITE_AURA_SERVER in .env

npm run build
# Deploy dist/ to CDN/HTTP server with HTTPS
```

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for detailed instructions.

---

## 📦 MCP Tools

| Tool | Description |
|------|-------------|
| `get_home_snapshot` | Current home state with ready-made digest |
| `describe_scene` | VLM scene understanding (objects, hazards) |
| `find_object` | Search object event history |
| `get_recent_events` | Activity timeline and summaries |
| `run_routine` | Multi-step workflows with confirmation |
| `control_device` | Device control with safety guardrails |
| `generate_daily_briefing` | AI-generated daily summaries |
| `set_user_preference` | Accessibility and privacy settings |

---

## 🧪 Testing

### Run Tests

```bash
# Test MCP server
cd "C:\Users\DELL\Desktop\aura-assist"
python scripts/smoke_mcp.py
python scripts/smoke_agent.py

# Build web app (production check)
cd "C:\Users\DELL\Desktop\HOME SIMULATION"
npm run build
```

### Test Voice Assistant

1. Open app and press **V**
2. Enable wake word (Ear icon)
3. Say "Hey Alexa"
4. Try commands:
   - "what's on?"
   - "turn off the kitchen lights"
   - "prepare for bed"

---

## 💰 Cost Estimate

| Mode | Cost |
|------|------|
| **Mock (Local)** | $0 |
| **Production (Bedrock)** | ~$0.30/day (Nova Lite) |

---

## 🔧 Tech Stack

### Web Simulator
- React 18.3 + Vite
- Three.js + React Three Fiber
- Zustand (state management)
- Web Speech API (voice)
- Web Speech API (TTS)

### MCP Server
- Python 3.10+
- FastAPI
- FastMCP
- Amazon Bedrock (Nova Lite)
- SQLite

---

## 📝 Environment Configuration

### Web Simulator (.env)
```bash
VITE_AURA_SERVER=http://localhost:8000
```

### MCP Server (.env)
```ini
AURA_USE_BEDROCK=1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_REGION=us-east-1
```

---

## 🌐 Browser Support

| Browser | Voice Support | Notes |
|---------|--------------|-------|
| Chrome | ✅ Full | Recommended |
| Edge | ✅ Full | Recommended |
| Firefox | ⚠️ Limited | Text fallback only |
| Safari | ⚠️ Limited | Not recommended |

---

## 📖 Examples

### Voice Commands
```
"Hey Alexa, turn off the kitchen lights"
"Hey Alexa, prepare for bed"
"Hey Alexa, where are my keys?"
"Hey Alexa, movie mode"
"Hey Alexa, what's on?"
```

### MCP Tool Calls
```json
POST /mcp
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "run_routine",
    "arguments": {"routine_name": "bedtime", "confirm": false}
  }
}
```

---

## 🔒 Security

- ✅ No hardcoded credentials
- ✅ AWS keys in `.env` (git-ignored)
- ✅ Microphone permission required
- ✅ HTTPS enforced for production
- ✅ No facial recognition
- ✅ No personal data storage

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Test your changes
4. Submit a pull request

---

## 📄 License

MIT License - See [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- Amazon Bedrock for multimodal AI capabilities
- React Three Fiber for 3D rendering
- FastMCP for protocol compliance

---

## 📞 Support

For issues and questions:
- Check [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md) for production issues
- Review [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for setup problems
- Check browser console for voice assistant errors

---

**Status**: ✅ Production Ready  
**Version**: 1.0  
**Last Updated**: October 22, 2026
