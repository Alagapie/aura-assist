# 🏠 AuraAssist - Context-Aware Home Assistant

**A privacy-first, hands-free Alexa+ home companion powered by Amazon Bedrock.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-18.3-green.svg)](https://react.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-blue.svg)](https://fastapi.tiangolo.com)
[![Bedrock](https://img.shields.io/badge/Amazon_Bedrock-Nova_Lite-orange.svg)](https://aws.amazon.com/bedrock/)
[![MCP](https://img.shields.io/badge/MCP-Streamable_HTTP-green.svg)](https://modelcontextprotocol.io/)

> **Production Ready**: ✅ Voice assistant with wake word, MCP server, Amazon Bedrock VLM integration, multi-step routines

---

## 🎯 Quick Start (5 Minutes)

### 1. Start the MCP Server
```bash
cd "C:\Users\DELL\Desktop\aura-assist"
pip install -r requirements.txt
uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload
```

Verify: `curl http://localhost:8000/health`

### 2. Start the Simulator
```bash
cd "C:\Users\DELL\Desktop\HOME SIMULATION"
npm run dev
```

### 3. Try the Voice Assistant
Press **V** or click the Alexa orb
- Say: **"Hey Alexa"** (wake word)
- Try: **"turn off the kitchen lights"** or **"prepare for bed"**

---

## ✨ Features

### Voice Assistant (Alexa)
- 🎤 **Wake Word Detection** - "Hey Alexa" / "Computer"
- 🗣️ **Speech Synthesis** - Alexa speaks replies
- 🎯 **Natural Language** - Understands commands
- 🔁 **Continuous Listening** - Auto-resume after wake word

### MCP Server
- ⚡ **Streamable HTTP** - MCP 2025-11-25 compliant
- 🧠 **Amazon Bedrock VLM** - Scene understanding
- 🔧 **8 MCP Tools** - Complete device control
- 🎭 **Safety Guardrails** - Confirmation required for sensitive actions
- 📅 **Event Memory** - Track all home activity

### Routines
- 🛌 **Bedtime** - Lock doors, turn off lights, set thermostat
- 🏠 **Leaving Home** - Secure the house automatically
- ☀️ **Morning** - Wake up routine with lights on

---

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│   Web Simulator (React/Three.js)    │
│  - 3D Scene                         │
│  - Voice Assistant (Alexa)          │
│  - MCP Client                       │
└────────────────┬────────────────────┘
                 │ HTTPS/Streamable HTTP
                 ▼
┌─────────────────────────────────────┐
│   AuraAssist MCP Server             │
│  - FastAPI Endpoint /mcp            │
│  - Amazon Bedrock (Nova Lite)       │
│  - SQLite Event Store               │
└─────────────────────────────────────┘
```

---

## 📦 MCP Tools

| Tool | Description |
|------|-------------|
| `get_home_snapshot` | Current home state |
| `describe_scene` | VLM scene understanding |
| `find_object` | Search object history |
| `get_recent_events` | Activity timeline |
| `run_routine` | Multi-step workflows |
| `control_device` | Device control |
| `generate_daily_briefing` | Daily summaries |
| `set_user_preference` | Settings |

---

## 🚀 Production Deployment

### AWS Setup (Required for Production)

1. Create IAM user with `AmazonBedrockFullAccess`
2. Generate access keys
3. Configure `.env`:
   ```bash
   cd "C:\Users\DELL\Desktop\aura-assist"
   copy .env.example .env
   # Edit .env with AWS credentials
   ```

4. Verify: `python scripts/check_bedrock.py`

### Deploy Server

**Docker:**
```bash
docker build -t aura-assist .
docker run -p 8000:8000 --env-file .env aura-assist
```

**Direct:**
```bash
uvicorn server.main:app --host 0.0.0.0 --port 8000
```

### Deploy Web App

```bash
npm run build
# Deploy dist/ with HTTPS
```

See **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** for complete instructions.

---

## 📖 Documentation

| Document | Description |
|----------|-------------|
| [QUICK_START.md](QUICK_START.md) | 5-minute getting started |
| [README.md](README.md) | Full project overview |
| [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) | Production deployment |
| [VOICE_ASSISTANT_READINESS.md](VOICE_ASSISTANT_READINESS.md) | Voice features verified |
| [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md) | Final verification |
| [FINAL_DEPLOYMENT_SUMMARY.md](FINAL_DEPLOYMENT_SUMMARY.md) | Deployment summary |

---

## 💰 Cost

| Mode | Daily Cost |
|------|-----------|
| Mock (Local) | $0 |
| Production (Bedrock) | ~$0.30 |

---

## 🔒 Security

- ✅ No hardcoded credentials
- ✅ AWS keys in `.env` (git-ignored)
- ✅ HTTPS required for production
- ✅ No facial recognition
- ✅ No personal data storage
- ✅ Microphone permission required

---

## 🌐 Browser Support

| Browser | Voice Support |
|---------|---------------|
| Chrome | ✅ Full (Recommended) |
| Edge | ✅ Full (Recommended) |
| Firefox | ⚠️ Text fallback |
| Safari | ⚠️ Limited |

---

## 📊 Tech Stack

**Web Simulator:**
- React 18.3 + Vite
- Three.js + React Three Fiber
- Web Speech API (voice)
- Zustand (state)

**MCP Server:**
- Python 3.10+
- FastAPI + FastMCP
- Amazon Bedrock (Nova Lite)
- SQLite

---

## 🧪 Testing

```bash
# Test MCP server
cd "C:\Users\DELL\Desktop\aura-assist"
python scripts/smoke_mcp.py
python scripts/smoke_agent.py

# Build web app
cd "C:\Users\DELL\Desktop\HOME SIMULATION"
npm run build
```

---

## 📝 Example Commands

```
"Hey Alexa, turn off the kitchen lights"
"Hey Alexa, prepare for bed"
"Hey Alexa, where are my keys?"
"Hey Alexa, movie mode"
"Hey Alexa, what's on?"
```

---

## 🆘 Troubleshooting

See **[FINAL_DEPLOYMENT_SUMMARY.md](FINAL_DEPLOYMENT_SUMMARY.md)** for:
- Voice assistant issues
- Server connection problems
- AWS setup issues
- Browser compatibility

---

## 📞 Support

- GitHub Issues: Issue tab
- Documentation: `docs/` folder
- Code: `src/` folder

---

## 📄 License

MIT License - See [LICENSE](LICENSE) for details.

---

## ✅ Production Checklist

| Feature | Status |
|---------|--------|
| Voice Assistant | ✅ |
| Wake Word Detection | ✅ |
| MCP Server | ✅ |
| Amazon Bedrock | ✅ |
| Routines | ✅ |
| Safety Guardrails | ✅ |
| Documentation | ✅ |
| Security | ✅ |

**Status**: ✅ **READY FOR PRODUCTION**

---

**Version**: 1.0  
**Last Updated**: October 22, 2026  
**Deployed**: October 22, 2026
