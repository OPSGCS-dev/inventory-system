import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import SandboxBanner from './SandboxBanner.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SandboxBanner />
    <App />
  </StrictMode>,
)
