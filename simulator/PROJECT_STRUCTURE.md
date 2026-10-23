# AuraAssist - Home Simulation

## Important Directory Structure

This repository contains **two** distinct components:

### 1. Home Simulation Web App (Current Folder)
- **Location**: `C:\Users\DELL\Desktop\HOME SIMULATION`
- **Purpose**: React 3D interface with Alexa voice assistant
- **Tech**: React, Three.js, Vite, Web Speech API
- **Main Files**:
  - `src/App.jsx` - Main application shell
  - `src/assistant/brain.js` - Voice command parser
  - `src/services/speech.js` - Speech recognition/synthesis
  - `src/ui/VoiceAssistant.jsx` - Alexa UI component

### 2. AuraAssist MCP Server (Separate Folder)
- **Location**: `C:\Users\DELL\Desktop\aura-assist`
- **Purpose**: FastAPI MCP server with AWS Bedrock integration
- **Tech**: Python, FastMCP, FastAPI, SQLite, AWS Bedrock
- **Main Files**:
  - `server/main.py` - FastAPI entry point
  - `server/mcp_tools.py` - 8 MCP tools
  - `server/agent.py` - AI agent (mock or Bedrock)
  - `server/vision.py` - VLM integration
  - `server/routines.py` - Multi-step workflows

## Quick Start

### Start the Web Simulator
```bash
cd "C:\Users\DELL\Desktop\HOME SIMULATION"
npm install
npm run dev
```

### Start the MCP Server
```bash
cd "C:\Users\DELL\Desktop\aura-assist"
pip install -r requirements.txt
uvicorn server.main:app --host 0.0.00 --port 8000 --reload
```

## Production Deployment

See `DEPLOYMENT_GUIDE.md` for comprehensive deployment instructions including:
- AWS Bedrock setup
- Docker containerization
- AWS App Runner deployment
- Security checklist
- Monitoring and scaling

## Voice Assistant Features

### Wake Words
- "Hey Alexa" - Primary wake word
- "Computer" - Alternative wake word

### Supported Commands
- Device control: "turn off the kitchen lights"
- Scenes: "movie mode", "good night", "leaving home"
- Questions: "what's on?", "where are my keys?"
- Navigation: "go to the kitchen"

### Browser Requirements
- Chrome or Edge (for Web Speech API)
- Microphone permissions
- HTTPS (for production microphone access)

## Environment Configuration

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

## Testing

### Run Web App Tests
```bash
npm run build
```

### Test MCP Server
```bash
cd "C:\Users\DELL\Desktop\aura-assist"
python scripts/smoke_mcp.py
python scripts/smoke_agent.py
```

## Support

For issues, please check:
- GitHub Issues tab
- `docs/` folder in `aura-assist` repository
