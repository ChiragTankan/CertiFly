import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Handle and suppress benign dev environment HMR WebSocket connection warnings
window.addEventListener("unhandledrejection", (event) => {
  if (
    event.reason &&
    (typeof event.reason.message === "string" &&
      (event.reason.message.includes("WebSocket") ||
        event.reason.message.includes("failed to connect to websocket")))
  ) {
    event.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
