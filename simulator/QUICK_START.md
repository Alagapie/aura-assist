# 🚀 AuraAssist Quick Start Guide

## ⚡ Get Running in 5 Minutes

### Step 1: Start the MCP Server

```bash
cd "C:\Users\DELL\Desktop\aura-assist"
pip install -r requirements.txt
uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload
```

Verify: `curl http://localhost:8000/health`
Expected: `{"service": "aura-assist", "status": "ok", ...}`

### Step 2: Start the Simulator

```bash
cd "C:\Users\DELL\Desktop\HOME SIMULATION"
npm run dev
```

Open: `http://localhost:5175`

### Step 3: Use Alexa Voice Assistant

1. Press **V** or click the Alexa orb
2. Say **"Hey Alexa"** (or "Computer")
3. Try commands:
   - "turn off the kitchen lights"
   - "prepare for bed"
   - "where are my keys?"

---

## 🔑 Key Files

| File | Purpose |
|------|---------|
| `.env.example` | Copy to `.env` and add AWS credentials |
| `DEPLOYMENT_GUIDE.md` | Full production deployment |
| `README.md` | Project overview |
| `FINAL_DEPLOYMENT_SUMMARY.md` | This deployment summary |
| `PRODUCTION_CHECKLIST.md` | Verification checklist |

---

## 📊 What's Working

| Feature | Status |
|---------|--------|
| Voice Assistant ✅ | Wake word detection |
| Speech Recognition ✅ | "Hey Alexa" works |
| Speech Synthesis ✅ | Alexa speaks |
| MCP Server ✅ | 8 tools available |
| Amazon Bedrock ✅ | VLM integration |
| Routines ✅ | Bedtime, leaving home |
| Safety Guardrails ✅ | Required confirmations |

---

## 🐛 Troubleshooting

### Voice Not Working
- Check Chrome/Edge (not Firefox)
- Allow microphone permissions
- Check browser console

### Server Not Connecting
- Verify server running: `curl localhost:8000/health`
- Check `VITE_AURA_SERVER` in `.env`
- Ensure firewall allows port 8000

### AWS Not Connecting
- Copy `.env.example` to `.env`
- Add AWS credentials
- Verify IAM permissions

See `FINAL_DEPLOYMENT_SUMMARY.md` for detailed troubleshooting.

---

## 📞 Support

- GitHub Issues: Repository issues tab
- Documentation: See `docs/` folder
- Code: `src/ui/VoiceAssistant.jsx` (Alexa)

---

**That's it! You're ready to go!** 🎉
