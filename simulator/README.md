# AuraAssist 3D home simulator

The house AuraAssist runs: five rooms, 33 smart devices and the cameras the
vision model looks through. Built with React 18, React Three Fiber and Zustand.

See the [main README](../README.md) for the full project, setup and the demo script.

```bash
npm install
npm run dev      # http://localhost:5173 (proxies /agent, /mcp, /state, /events, /vision to :8000)
npm test         # model and geometry checks
npm run build
```

| Variable | Default | Purpose |
|---|---|---|
| `AURA_SERVER_URL` | `http://localhost:8000` | Where the dev proxy forwards (set when starting Vite) |
| `VITE_AURA_SERVER` | same origin | Talk to a server directly instead of through the proxy |
| `VITE_DEVICE_BACKEND` | `aura` | `aura` (server is the source of truth) or `simulated` (no network) |

The server address can also be changed at runtime from the connection chip in the status bar.
