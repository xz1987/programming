# Pathways Research Trace Kit

Local-first research app for the DEA 6500 Living Program project. Survey and observation are independent modules: run either one alone, link both to the same participant, or assign the two modules to different anonymous participants.

## Participant self-serve link (no researcher present)

`participate.html` — e.g. `https://xz1987.github.io/programming/participate.html` — is a simplified page you can send to participants directly. It opens from **Participant link** in the main app's sidebar (or **Copy participant link** on the overview); it has no way back to the researcher app, no Local data, no export, no extension and no researcher picker.

Flow: welcome + consent → choose Survey (~3 min) / Search task (~10 min) / Both (~13 min) → profile → survey and/or recorded search task → automatic upload → thank-you screen.

Data goes to a Google Apps Script you own (Sheet rows + Drive recordings + an email per participant). One-time setup: [`apps-script/SETUP.md`](apps-script/SETUP.md); then paste the web app URL into `participant-config.js`. Questions are shared with the main app through `questions.js`, so editing a question there changes both pages. Remote participants have no click trace; instead they paste the link of the opportunity they found.

## 1. Run the app — two ways, same code

| | Online (teammates) | Local server (this computer) |
|---|---|---|
| Address | `https://xz1987.github.io/<repo-name>/` | `http://127.0.0.1:4318` |
| Needs | Google Chrome only | Node.js 18+ and this folder |
| Updates | Automatically on every push to `main` | Whatever is in this folder right now |

**Data stays on each computer.** Sessions are saved in the browser for the address you used, so the online copy and the local server keep **separate** session lists, and each teammate only sees their own. Use **Local data → Export all data (ZIP)** to hand data to the team.

### Online (GitHub Pages)

Teammates just open the Pages address in Chrome. To publish:

1. Push this folder to a GitHub repository under `xz1987` (branch `main`).
2. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions** (one time).
3. Every push to `main` runs `.github/workflows/pages.yml`: it runs the tests, builds `dist/` with `npm run build`, and deploys it.

If the site moves to a different GitHub account or a custom domain, add that origin to `controllerOrigins` in `trace-extension/content.js` (and bump the extension version), otherwise the click-trace extension will not connect there. Screen recording works without the extension either way.

### Local server

- **Easiest (macOS):** double-click `Start Pathways.command` in Finder. It starts the server and opens the app in Chrome. Keep that Terminal window open while you work; close it (or press Ctrl+C) to stop.
- **From a terminal:**

```bash
cd research-trace-app
npm run open   # start the server and open Chrome
# or: npm start, then open http://127.0.0.1:4318 in Google Chrome
```

The local server serves the source files directly, so edits show up after a page reload; no build step needed. Always use the same address and Chrome profile.

### Development workflow

- Edit `index.html`, `app.js`, `styles.css`, `trace.css` and test with the local server.
- `npm test` checks the extension's trace logic; `npm run build` regenerates `dist/` (also done automatically on GitHub).
- Commit and push to `main` → the online copy updates in about a minute.

## 2. Install automatic trace capture (optional, once per computer)

Screen recording works without this; the extension adds click and page-dwell data.

1. Get the extension: from this folder (`trace-extension/`), or in the app open **Study guide → Download Chrome extension** and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the `trace-extension` folder.
4. Refresh the Pathways app (online or local). It should show **Trace extension connected**.

After an extension update, click the reload icon on its card in `chrome://extensions` (or load the new folder).

The app intentionally uses a small consent-based Chrome extension instead of Playwright `trace.zip`: Playwright Trace Viewer records actions executed by Playwright automation, not a participant's manual browser clicks.

## Study experience

1. Choose **Survey only**, **Observation only**, or **Survey + observation**.
2. If both modules are selected, choose whether one participant completes both or two different participants complete one module each.
3. The app automatically generates module-scoped anonymous IDs: `S-YYMMDD-XXXX` for survey, `O-YYMMDD-XXXX` for observation, or a shared `P-YYMMDD-XXXX` when one participant completes both. Enter the remaining profile fields.
4. Survey path: complete the short baseline survey adapted from the team’s Google Form, then save.
5. Observation path: choose a scenario, record the task and automatic trace, then complete the post-task scales.
6. Export Survey CSV and Observation CSV independently. Observation sessions can additionally export trace JSON/CSV and raw WebM.

## Captured data

- Click timestamp, safe element label, role, selector, link target, and viewport coordinates
- Page URL, title, tab, navigation sequence, visibility changes, and active dwell time
- Participant-selected screen/window recording as WebM
- Baseline responses and post-task scales

## Intentionally excluded

- Typed field values, keystrokes, passwords, clipboard contents
- Cookies, network payloads, microphone, camera, and system audio
- Any events outside the explicit start/stop interval
- Activity in pre-existing tabs other than the task tab

All data is stored in this Chrome profile's IndexedDB until the research team explicitly exports or deletes it. Use the same team computer and Chrome profile to access earlier sessions.

Survey answers autosave locally after every change. As soon as the required survey items are complete, the survey module is checkpointed as **Survey archived**, even when a linked observation has not started. Closing or refreshing the page does not discard that checkpoint; resume or export it from **Local data**.

For the most reliable raw recording, choose **Entire Screen** in Chrome's share picker. The app creates a clearly named Pathways Task tab before the picker opens, so that tab can also be selected when whole-screen sharing is not appropriate.
