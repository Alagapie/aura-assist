import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Where the AuraAssist MCP server runs (python -m uvicorn server.main:app --port 8000).
const AURA_SERVER = process.env.AURA_SERVER_URL || 'http://localhost:8000'

// Vite configuration for the Smart Room Simulator.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Fail loudly instead of silently moving to 5174: a second dev server on
    // another port leaves you looking at a stale build that never picks up
    // your fixes.
    strictPort: true,
    host: true,
    // The simulator is a browser client of the AuraAssist server: the device
    // bridge (/state/patch), the live state stream (/events/state), the agent
    // (/agent/invoke) and the MCP endpoint (/mcp) all go through this proxy.
    // Same-origin requests keep the browser happy (no CORS, no exposed headers).
    proxy: {
      '/health': { target: AURA_SERVER, changeOrigin: true },
      '/state': { target: AURA_SERVER, changeOrigin: true },
      '/events': { target: AURA_SERVER, changeOrigin: true },
      '/agent': { target: AURA_SERVER, changeOrigin: true },
      '/vision': { target: AURA_SERVER, changeOrigin: true },
      '/mcp': { target: AURA_SERVER, changeOrigin: true },
    },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1400,
  },
})
