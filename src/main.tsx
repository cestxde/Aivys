import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { invoke } from '@tauri-apps/api/core'
import './index.css'
import App from './App.tsx'
import { trackSafeArea } from './utils/safeArea'

// Before the first paint: on Android the content keeps out of the system bars.
trackSafeArea()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Remove the static boot splash and reveal the window once React has painted
// its first frame. The window starts hidden (tauri.conf.json `visible: false`)
// so the user never sees an empty/white webview on startup.
// Two rAFs ensure the browser has actually painted the React tree.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    document.getElementById('boot-splash')?.remove();
    invoke('show_main_window').catch(console.error);
  });
});

