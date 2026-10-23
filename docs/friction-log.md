# Friction log

Real problems we hit while building AuraAssist on **Amazon Bedrock (Converse API) with
Amazon Nova Lite**, the **MCP Python SDK**, and the browser APIs behind the 3D simulator.
Each entry names the commit or file where the fix lives, so it can be checked.

**Severity scale**
- **High:** broke a core or safety-critical flow.
- **Medium:** visible wrong behaviour, or a silent failure, with a workaround.
- **Low:** an annoyance, or a docs gap.

| # | Area | Problem | Severity |
|---|---|---|---|
| 1 | Bedrock · Nova Lite tool use | Model invented device IDs | High |
| 2 | Bedrock · Nova Lite tool use | Asked for confirmation in text instead of calling the tool; sometimes skipped tools | High |
| 3 | Bedrock · Nova Lite text | `<thinking>` blocks leaked into spoken replies | Medium |
| 4 | Bedrock · Nova Lite vision | Repetition loop at temperature 0 used up `maxTokens`, so the JSON was cut off | Medium |
| 5 | Bedrock · Nova Lite vision | JSON wrapped in markdown or prose despite "only JSON" | Low |
| 6 | Bedrock · Nova Lite vision | Small objects missed in whole-room frames | Medium |
| 7 | Bedrock · boto3 | Slow or throttled first multi-image call failed with default timeouts | Medium |
| 8 | Bedrock · docs | The "Model access" page that tutorials point to was retired | Low |
| 9 | MCP Python SDK + FastAPI | Mounted Streamable HTTP app needs manual lifespan wiring; startup hooks silently dropped | Medium |
| 10 | MCP Python SDK | No public API to export tool schemas for Bedrock `toolSpec` | Low |
| 11 | MCP in the browser | Responses can be JSON or SSE; `mcp-session-id` must be CORS-exposed | Low |
| 12 | Web Speech API | Not in Firefox; recognition stops by itself, which breaks the wake word | Low |

---

## 1. Nova Lite invented device IDs in tool calls (High)

- **Task attempted:** Let Nova Lite control the home through Converse tool use.
- **Steps:** Converted the 9 MCP tool schemas into Converse `toolSpec`s, passed them in
  `toolConfig`, and asked "turn off the kitchen lights".
- **Expected:** `control_device` calls using the home's real device IDs (`kitchenLight`).
- **Actual:** The model sometimes produced plausible IDs that don't exist, so the tool
  call failed.
- **Workaround:** At startup, inject the exact device ID index into the system prompt
  ("use these ids verbatim, never invent your own"). See
  [server/agent.py](../server/agent.py) (`refresh_tool_specs`, `_system_prompt`) and
  commit `792e1b0`.
- **Suggestion:**
  - Offer a strict mode in Converse that validates tool arguments against the
    `inputSchema` (including `enum`) before returning them.
  - Document how to ground tool arguments.

## 2. Confirmation asked in text instead of a tool call; some tool calls skipped (High)

- **Task attempted:** Safety flow for unlocking the front door and running routines.
  The model must call the tool with `confirm=false` so the server records a pending
  action that a later "yes" can approve.
- **Steps:** Prompted the model with the rule. Tested "unlock the front door", then "yes".
- **Expected:** A `control_device(doorLock, unlock, confirm=false)` call, then
  `confirm=true` after approval.
- **Actual:**
  - Sometimes the model replied "Are you sure?" in plain text with no tool call. No
    pending action was recorded, so the "yes" had nothing to approve.
  - On some turns it skipped tools entirely and described an action it never took.
- **Workaround:**
  - Approvals and declines are resolved by code before the model runs.
  - Canonical routine phrases are planned deterministically.
  - Unlocking and routine execution are downgraded to "plan only" unless the current
    message is an explicit approval.
  - After this, the live Bedrock agent suite passed 15/15 on 4 consecutive runs.
  - See commits `792e1b0` and `f199bc8`.
- **Suggestion:**
  - Publish Nova-specific tool-use reliability guidance, with patterns for "always
    express this through a tool call".
  - Document `toolChoice` behaviour for multi-turn flows.

## 3. `<thinking>` blocks leaked into replies (Medium)

- **Task attempted:** Speak Nova Lite's final answer aloud in the 3D home.
- **Expected:** Only the user-facing answer text.
- **Actual:** `<thinking>…</thinking>` text sometimes appeared in the reply and was read
  aloud.
- **Workaround:** A prompt rule plus a server-side regex strip (`_THINKING` in
  [server/agent.py](../server/agent.py)), commit `792e1b0`.
- **Suggestion:** Return reasoning as a separate content block, or add a parameter that
  suppresses it.

## 4. Vision repetition loop cut off the JSON (Medium)

- **Task attempted:** Turn a room camera frame into a structured JSON object list
  (temperature 0).
- **Expected:** A short list such as `phone, on the coffee table`.
- **Actual:** The model sometimes looped
  ("garlic press, garlic crusher, garlic grinder, …") until it hit `maxTokens`.
  The JSON came back cut off, and the whole frame was lost.
- **Workaround:**
  - Cap objects in the prompt and in code (`_MAX_OBJECTS = 15`).
  - A bracket-aware parser recovers every object that arrived whole from a cut-off
    reply (`_scan_json` in [server/vision.py](../server/vision.py)).
  - See commit `0a5bc48`.
- **Suggestion:** A native JSON / structured-output mode for Nova in Converse, and a
  repetition or frequency penalty parameter.

## 5. JSON wrapped in markdown or prose (Low)

- **Expected:** Raw JSON, as instructed.
- **Actual:** Occasionally a ```json fenced block, or a sentence before the object.
- **Workaround:** A tolerant parser that tries the whole string, then the fenced block,
  then the first balanced `{…}` (`_extract_json` in
  [server/vision.py](../server/vision.py)), commit `dca6a3b`.
- **Suggestion:** Same as #4: a guaranteed JSON output mode.

## 6. Small objects missed in whole-room frames (Medium)

- **Task attempted:** "Where is my phone?" answered from the live camera.
- **Expected:** The phone, remote and cup on the coffee table are detected.
- **Actual:** At whole-room scale, small items were often missed.
- **Workaround:** The simulator sends the whole-room frame plus four upscaled zoom
  tiles, so 5 images go in one Converse call. Commit `c586f5f`; see
  [simulator/src/services/cameraService.js](../simulator/src/services/cameraService.js).
- **Suggestion:** Document Nova's internal image resolution and best practice for
  multi-image tiling.

## 7. First multi-image call timed out or was throttled (Medium)

- **Expected:** A reply within boto3's default timeouts.
- **Actual:** The most common "camera frame could not be analysed" error in testing came
  from a slow or throttled first attempt.
- **Workaround:** botocore `Config(read_timeout=30, retries={"max_attempts": 2,
  "mode": "standard"})` in [server/vision.py](../server/vision.py), commit `0a5bc48`.
  If Bedrock is still unavailable, the agent falls back to the offline engine and says
  it couldn't look, rather than guessing.
- **Suggestion:** Recommend timeouts for multimodal Converse calls in the docs, and
  make throttling easier to tell apart from slow responses in client errors.

## 8. "Model access" page retired (Low)

- **Task attempted:** Enable Nova Lite following existing tutorials.
- **Expected:** A console page to request model access.
- **Actual:** The page no longer exists. Serverless models now turn on automatically
  on first use, but many guides still describe the old flow.
- **Workaround:** One tiny real Converse call with
  [scripts/check_bedrock.py](../scripts/check_bedrock.py) confirms both credentials and
  access. [docs/aws-setup.md](aws-setup.md) was updated (commit `45e1d09`).
- **Suggestion:** Add a banner on older docs and blog posts pointing to the new
  behaviour.

## 9. Mounting the MCP Streamable HTTP app inside FastAPI (Medium)

- **Task attempted:** Serve the MCP server at `/mcp` from the same FastAPI app as the
  agent endpoint and the live-state stream (SSE).
- **Expected:** `app.mount("/", mcp.streamable_http_app())` works as is.
- **Actual:**
  - Mounted Starlette apps don't receive lifespan events, so the MCP session manager
    never started until the outer app ran `mcp.session_manager.run()` itself.
  - Separately, passing `lifespan=` to FastAPI silently disables
    `@app.on_event("startup")` handlers, so our state-change subscription never
    registered. Only the first snapshot reached the 3D house.
- **Workaround:** Do all startup work inside one lifespan that also runs the MCP session
  manager ([server/main.py](../server/main.py)), commit `1a296f4`.
- **Suggestion:** An official "mount in FastAPI" example in the MCP Python SDK docs that
  covers the lifespan.

## 10. No public API to export MCP tool schemas (Low)

- **Task attempted:** Give Nova Lite exactly the tools the MCP server exposes, with no
  duplicate definitions.
- **Actual:** The tool list with JSON schemas was only reachable through the private
  `mcp._tool_manager.list_tools()`.
- **Workaround:** Use the private accessor once at startup and convert the result to
  Converse `toolSpec`s (`refresh_tool_specs` in [server/agent.py](../server/agent.py)).
- **Suggestion:** A public `list_tools()` on the server object, or an AWS helper that
  converts MCP tools into Bedrock `toolSpec`s.

## 11. MCP client in the browser (Low)

- **Actual:**
  - A Streamable HTTP server may answer with plain JSON or with an event stream (SSE).
  - The `mcp-session-id` response header is invisible to browser code unless CORS
    exposes it.
- **Workaround:** The client handles both response shapes
  ([simulator/src/services/mcpClient.js](../simulator/src/services/mcpClient.js)), and
  the server sets `expose_headers=["mcp-session-id"]`.
- **Suggestion:** A short "browser clients" section in the MCP transport docs.

## 12. Web Speech API (Low)

- **Actual:**
  - `SpeechRecognition` exists only in Chromium browsers.
  - Recognition ends by itself after silence, which breaks an always-on wake word.
- **Workaround:**
  - A restart loop for the wake word.
  - Typing always works as a fallback.
  - See [simulator/src/services/speech.js](../simulator/src/services/speech.js).
- **Suggestion:** n/a (browser platform limitation). Documented in the README: use
  Chrome or Edge.
