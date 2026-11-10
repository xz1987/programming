# Pathways Trace Extension

This unpacked Chrome extension records consent-based manual click metadata and active page dwell time during an active Pathways research session.

## Install on a team computer

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this `trace-extension` folder.
5. Open or refresh the app: `https://xz1987.github.io/<repo-name>/` (online) or `http://127.0.0.1:4318` (local server).

Only the app addresses listed in `controllerOrigins` in `content.js` can control a trace.

The app should display **Trace extension connected**.

The extension is idle outside an active session and limits capture to the task tab plus tabs opened from it. It ignores other pre-existing browser tabs. It does not store typed values, keystrokes, passwords, cookies, clipboard contents, network bodies, audio, or video. Removing or disabling the extension stops all structured trace capture.
