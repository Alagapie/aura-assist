import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { useRoomStore } from './store/useRoomStore'
import { deviceService } from './services/deviceService'
import './styles/global.css'

// Dev-only handles: let automated checks (and the browser console) drive and
// inspect the exact same store and device backend the UI uses. Not shipped.
if (import.meta.env.DEV) {
  window.__roomStore = useRoomStore
  window.__deviceService = deviceService
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
