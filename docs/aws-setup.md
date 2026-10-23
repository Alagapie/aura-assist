# AWS setup (Bedrock + Nova Lite)

The agent runs in **mock mode with zero AWS** — do these steps only to switch to
the real LLM. Total cost for a hackathon demo: a few cents (Nova Lite is the
cheapest Bedrock model; ~$0.06 per 1M input tokens).

## 1. AWS account

If you don't have one: https://aws.amazon.com → **Create an AWS account**
(credit card required; free tier does not cover Bedrock, but demo usage is pennies).

## 2. Model access - no action needed (as of Oct 2026)

AWS **retired the "Model access" page**: serverless foundation models
(including Nova Lite) are now **automatically enabled on first use** in all
commercial regions. Your very first `check_bedrock.py` call enables it.
No console clicking required.

(IAM can still block you - that's the next step, not a model toggle.)

## 3. Create an IAM user (never use root keys)

1. Console → **IAM** → **Users** → **Create user**
   - Name: `aura-assist-dev`
   - Tick **Access key - Programmatic access** (in *Credentials type*)
2. Attach policy directly → search **AmazonBedrockFullAccess** → tick it
   - (Good enough for the hackathon. Tighter option later:
     scope it to `bedrock:InvokeModel` on the Nova Lite ARN only.)
3. Create the user → you'll see **Access key ID** and **Secret access key**
   - ⚠️ The secret is shown **once**. Download the .csv now.
   - If you lost it: delete the key and create a new one.

## 4. Fill in `.env`

```powershell
cd aura-assist             # the repository root
copy .env.example .env     # then edit .env in Notepad
```

```ini
AURA_USE_BEDROCK=1
AWS_ACCESS_KEY_ID=AKIA...your key...
AWS_SECRET_ACCESS_KEY=...your secret...
AWS_REGION=us-east-1
AURA_AGENT_MODEL=amazon.nova-lite-v1:0
```

`.env` is git-ignored — the keys never leave your machine.

## 5. Verify, then restart

```powershell
# 1. creds + model access actually work (does one real 1-token call):
python scripts/check_bedrock.py

# 2. restart the server so it reads .env:
#    stop the process on port 8000, then:
python -m uvicorn server.main:app --port 8000

# 3. confirm the engine switched:
curl http://localhost:8000/health      # "agent_engine": "bedrock"

# 4. full test suites still green (run MCP suite first - it wants fresh state):
python scripts/smoke_mcp.py
python scripts/smoke_agent.py
```

`smoke_agent.py` prints each response's `engine` field — every reply should say
`bedrock`, not `mock`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `UnrecognizedClientException` / `InvalidClientTokenId` | Wrong/expired access key ID or secret |
| `AccessDeniedException` on InvokeModel | IAM policy missing (models auto-enable now - no console toggle) |
| `ResourceNotFoundException: model id` | Wrong region or model id — check `AWS_REGION` and `AURA_AGENT_MODEL` |
| `expired-token` | You pasted an STS/console-session token; use the IAM user's long-term key |
| `/health` still says `mock` | `.env` not in the `aura-assist` folder, or server not restarted |

**Safety net:** if Bedrock is unreachable at runtime the agent auto-falls back
to the mock engine — the home never goes dark because of a credentials problem.
