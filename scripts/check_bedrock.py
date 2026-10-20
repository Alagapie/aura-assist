"""
Check that AWS credentials + Bedrock model access actually work.

Does one tiny real Converse call (max 5 output tokens) and reports latency.
Run this AFTER filling in .env and BEFORE restarting the server.

    python scripts/check_bedrock.py
"""

import os
import sys
import time
from pathlib import Path

# Load .env the same way the server does (server.main calls load_dotenv).
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    print("note: python-dotenv not installed - relying on process env only")

MODEL = os.environ.get("AURA_AGENT_MODEL", "amazon.nova-lite-v1:0")
REGION = os.environ.get("AWS_REGION", "us-east-1")
KEY = os.environ.get("AWS_ACCESS_KEY_ID", "")
SECRET = os.environ.get("AWS_SECRET_ACCESS_KEY", "")

print(f"model={MODEL}  region={REGION}")
print(f"AWS_ACCESS_KEY_ID: {'set (' + str(len(KEY)) + ' chars)' if KEY else 'MISSING'}")
print(f"AWS_SECRET_ACCESS_KEY: {'set' if SECRET else 'MISSING'}")
if not (KEY and SECRET):
    print("\nFAIL: fill in .env first (copy .env.example -> .env)")
    sys.exit(1)

try:
    import boto3
    from botocore.config import Config
except ImportError:
    print("\nFAIL: boto3 not installed -> pip install boto3")
    sys.exit(1)

print("making one real Converse call ...")
t0 = time.time()
try:
    client = boto3.client(
        "bedrock-runtime",
        region_name=REGION,
        config=Config(read_timeout=30, connect_timeout=10),
    )
    resp = client.converse(
        modelId=MODEL,
        messages=[{"role": "user", "content": [{"text": "ping"}]}],
        inferenceConfig={"maxTokens": 5},
    )
except Exception as exc:
    print(f"\nFAIL: {type(exc).__name__}: {exc}")
    print("\nHints:")
    print("  UnrecognizedClientException / InvalidClientTokenId -> bad key pair")
    print("  AccessDeniedException -> IAM policy or model access not enabled")
    print("  ResourceNotFoundException -> wrong region or model id")
    print("  Full guide: docs/aws-setup.md")
    sys.exit(1)

dt = (time.time() - t0) * 1000
text = ""
for block in resp.get("output", {}).get("message", {}).get("content", []):
    text += block.get("text", "")
print(f"OK in {dt:.0f}ms - stopReason={resp.get('stopReason')} reply={text.strip()[:40]!r}")
print("Credentials and model access work. Restart the server now.")
