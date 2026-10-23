# Production Deployment Guide - AuraAssist

This guide covers deploying AuraAssist for production use, including the MCP server, web simulator, and voice assistant.

## Prerequisites

- Node.js >= 18
- Python >= 3.10
- AWS Account (for Bedrock integration)
- Git

## Overview

AuraAssist consists of two main components:

1. **MCP Server** (`aura-assist/`) - Python FastAPI server exposing MCP tools
2. **Web Simulator** (`HOME SIMULATION/`) - React 3D interface

## Deployment Steps

### 1. AWS Setup (Optional but Recommended)

For production with real voice-to-text and AI capabilities:

1. Create IAM user with `AmazonBedrockFullAccess` policy
2. Configure credentials:
   ```bash
   cd "C:\Users\DELL\Desktop\aura-assist"
   copy .env.example .env
   # Edit .env with your AWS credentials
   ```

3. Verify setup:
   ```bash
   python scripts/check_bedrock.py
   ```

### 2. Deploy MCP Server

#### Option A: Local Server (Development/Testing)
```bash
cd "C:\Users\DELL\Desktop\aura-assist"
pip install -r requirements.txt
uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload
```

#### Option B: Docker Container
```bash
cd "C:\Users\DELL\Desktop\aura-assist"
docker build -t aura-assist .
docker run -p 8000:8000 --env-file .env aura-assist
```

#### Option C: AWS Deployment (Recommended for Production)

**Option C1: AWS App Runner (Easiest)**
```bash
# Connect your GitHub repository to App Runner
# App Runner will auto-build and deploy
```

**Option C2: AWSLambda + API Gateway**
- Package MCP server as a Lambda function
- Configure API Gateway with proxy integration
- Set up CORS headers

**Option C3: EC2 Instance**
```bash
# Create EC2 instance with security groupallowing port 8000
# SSH into instance and run:
git clone your-repo
cd aura-assist
pip install -r requirements.txt
nohup uvicorn server.main:app --host 0.0.0.0 --port 8000 > server.log 2>&1 &
```

### 3. Deploy Web Simulator

```bash
cd "C:\Users\DELL\Desktop\HOME SIMULATION"

# Install dependencies
npm install

# Build for production
npm run build

# Preview build
npm run preview
```

### 4. Configure Environment

**Web Simulator (.env):**
```bash
VITE_AURA_SERVER=https://your-mcp-server-domain.com
```

**MCP Server (.env):**
```ini
AURA_USE_BEDROCK=1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_REGION=us-east-1
AURA_AGENT_MODEL=amazon.nova-lite-v1:0
AURA_VLM_MODEL=amazon.nova-lite-v1:0
```

## Voice Assistant (Alexa) Configuration

### Wake Word Detection

The voice assistant supports:
- **"Hey Alexa"** - Wake word detection
- **"Computer"** - Alternative wake word
- Push-to-talk (Press microphone button)

### Browser Requirements

- Chrome/Edge (Safari and Firefox have limited Web Speech API support)
- Microphone permissions
- HTTPS (required for microphone access in production)

### Production Considerations

1. **Microphone Access**: Ensure your site uses HTTPS
2. **Voice Quality**: Test in target environment
3. **Wake Word Sensitivity**: Adjust `WAKE_WORDS` regex in `VoiceAssistant.jsx`
4. **Continuous Listening**: Consider battery impact on mobile devices

## Security Checklist

- [ ] HTTPS for all production deployments
- [ ] Environment variables not committed to git
- [ ] AWS credentials managed via IAM roles (not hardcoded)
- [ ] API rate limiting configured
- [ ] CORS properly configured for your domain
- [ ] Database backups configured
- [ ] Log monitoring enabled
- [ ] HTTPS certificate valid and not expired
- [ ] Regular security updates for dependencies

## Monitoring

### Health Checks
- MCP Server: `GET /health`
- Server Status: `GET /state`

### Logs
- MCP Server: Check `server.log` or CloudWatch
- Web Simulator: Browser developer console

## Scaling

### Horizontal Scaling
- MCP Server: Run multiple instances behind load balancer
- Web Simulator: CDN for static assets

### Vertical Scaling
- Increase instance size for Bedrock API calls
- Use RDS for database if SQLite becomes bottleneck

## Backup Strategy

### MCP Server Data
- Database file: `aura-assist/data/aura.db`
- Back up daily: `cp data/aura.db data/backup/aura-$(date +%Y%m%d).db`

### Web Simulator
- No server-side state required
- User preferences stored in browser localStorage

## Troubleshooting

### Voice Not Working
1. Check browser supports Web Speech API
2. Verify microphone permissions
3. Check browser console for errors

### MCP Server Not Connecting
1. Verify `VITE_AURA_SERVER` is correct
2. Check server logs for errors
3. Ensure firewall allows port 8000

### Bedrock Integration Issues
1. Verify AWS credentials in `.env`
2. Check IAM permissions
3. Confirm model access enabled in AWS console

## Support

For issues:
- GitHub Issues: Your repository issues page
- Documentation: See `docs/` folder
