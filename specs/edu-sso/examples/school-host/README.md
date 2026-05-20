# school-host

EduSSO v1 reference launcher, built as a minimal Electron app. Displays a hardcoded student and an app catalog of one. Clicking the app mints a JWT against the issuer and loads the tutor inside a `WebContentsView` with `?edu_session=<jwt>` appended.

## Run

Requires the issuer (`../school-issuer`) and the tutor (`../example-tutor`) to be running first.

```bash
npm install
npm start
```

Environment variables:

| Var | Default | Meaning |
|---|---|---|
| `ISSUER_URL` | `http://localhost:4000` | Where to mint tokens |
| `LAUNCHER_TOKEN` | `dev-launcher-token` | Bearer credential sent to the issuer |
| `CHILD_ID` | `student-1` | The child id the issuer should mint for |

## Architecture

- `main.js` — Electron main process. Owns the BrowserWindow, the `WebContentsView` for the open tutor, the IPC handlers, and the token-mint logic.
- `preload.cjs` — context-bridged surface exposed to the renderer.
- `renderer.html` + `renderer.js` — the launcher UI: student info and the app grid.

## What the launcher does per the spec

- Mints a fresh token on every open. No caching.
- Loads the tutor URL with `?edu_session=<jwt>` appended.
- Injects `Referrer-Policy: no-referrer` for the tutor's origin via `webRequest.onHeadersReceived`.
- Each tutor lives in a separate cookie partition (`persist:tutor-<id>`).

## What it skips (because it's an example)

- Persistent storage of student data — everything is in memory.
- Onboarding — student and apps are hardcoded.
- Error UX beyond a red banner.
- Multi-window or multi-child support.
