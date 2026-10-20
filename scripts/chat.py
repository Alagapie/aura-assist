"""
Terminal chat with the AuraAssist agent - type to it, see replies + tool calls.

    python scripts/chat.py

Commands inside the chat:
    reset      forget this conversation session (fresh pending state)
    quit       exit

Everything you type goes to POST /agent/invoke; the server must be running
on :8000. The tool log shows exactly what the agent did on your behalf.
"""

import json
import urllib.error
import urllib.request

BASE = "http://localhost:8000"
SESSION = "terminal-chat"


def send(message: str) -> dict:
    req = urllib.request.Request(
        BASE + "/agent/invoke",
        data=json.dumps({"message": message, "session_id": SESSION}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def main() -> None:
    print("AuraAssist chat - 'reset' to start over, 'quit' to exit\n")
    while True:
        try:
            msg = input("you> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not msg:
            continue
        if msg.lower() in ("quit", "exit", "q"):
            break
        if msg.lower() == "reset":
            req = urllib.request.Request(
                BASE + "/agent/reset",
                data=json.dumps({"session_id": SESSION}).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            urllib.request.urlopen(req, timeout=10).read()
            print("[session reset]\n")
            continue

        try:
            r = send(msg)
        except urllib.error.URLError as exc:
            print(f"[server unreachable on :8000 - start it with: python -m uvicorn server.main:app --port 8000]\n({exc})\n")
            continue

        print(f"nova> {r.get('reply', '(no reply)')}")
        for call in r.get("tool_calls", []):
            args = ", ".join(f"{k}={v!r}" for k, v in call.get("arguments", {}).items())
            print(f"      [tool] {call['name']}({args}) -> {call.get('result', '')}")
        if r.get("pending"):
            print(f"      [awaiting confirmation: {r['pending']}]")
        print()


if __name__ == "__main__":
    main()
