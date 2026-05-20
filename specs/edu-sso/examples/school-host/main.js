// EduSSO v1 reference launcher (Electron).
//
// Shows a hardcoded student and an app catalog of one. Clicking an app:
//   1. asks the issuer for a fresh JWT (audience-bound),
//   2. loads the app URL with ?edu_session=<jwt> in a WebContentsView,
//   3. injects Referrer-Policy: no-referrer for the app's origin.

import { app, BrowserWindow, ipcMain, WebContentsView, session } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ISSUER_URL = process.env.ISSUER_URL ?? "http://localhost:4000";
const LAUNCHER_TOKEN = process.env.LAUNCHER_TOKEN ?? "dev-launcher-token";
const CHILD_ID = process.env.CHILD_ID ?? "student-1";

// Local mirror of what the issuer knows about this student. In a real
// launcher this comes from the onboarding flow; here we keep it static.
const STUDENT = { name: "Alice", email: "alice@example.com" };

const APPS = [
  {
    id: "example-tutor",
    name: "Example Tutor",
    url: "http://localhost:5050/",
    audience: "example-tutor",
    icon: "📚",
  },
];

const TOPBAR = 56;

let mainWindow = null;
let currentView = null;
let currentAppId = null;

async function mintToken(audience) {
  const res = await fetch(`${ISSUER_URL}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LAUNCHER_TOKEN}`,
    },
    body: JSON.stringify({ child_id: CHILD_ID, audience }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`issuer ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.token;
}

function viewBounds() {
  if (!mainWindow) return { x: 0, y: TOPBAR, width: 0, height: 0 };
  const { width, height } = mainWindow.getContentBounds();
  return { x: 0, y: TOPBAR, width, height: Math.max(0, height - TOPBAR) };
}

function closeCurrent() {
  if (!currentView || !mainWindow) return;
  mainWindow.contentView.removeChildView(currentView);
  currentView.webContents.close();
  currentView = null;
  currentAppId = null;
  mainWindow.webContents.send("app:closed");
}

async function openApp(id) {
  const def = APPS.find((a) => a.id === id);
  if (!def || !mainWindow) return;

  closeCurrent();

  let token;
  try {
    token = await mintToken(def.audience);
  } catch (err) {
    console.error("[host] mint failed:", err.message);
    mainWindow.webContents.send("app:error", err.message);
    return;
  }

  const url = new URL(def.url);
  url.searchParams.set("edu_session", token);

  const partition = `persist:tutor-${id}`;
  const ses = session.fromPartition(partition);

  // Per-spec: inject Referrer-Policy: no-referrer for the tutor's origin.
  const origin = new URL(def.url).origin;
  ses.webRequest.onHeadersReceived(
    { urls: [`${origin}/*`] },
    (details, cb) => {
      cb({
        responseHeaders: {
          ...details.responseHeaders,
          "Referrer-Policy": ["no-referrer"],
        },
      });
    }
  );

  currentView = new WebContentsView({
    webPreferences: { partition, contextIsolation: true, sandbox: true },
  });
  currentView.setBackgroundColor("#ffffff");
  mainWindow.contentView.addChildView(currentView);
  currentView.setBounds(viewBounds());
  currentView.webContents.loadURL(url.toString());

  currentAppId = id;
  mainWindow.webContents.send("app:opened", id);
}

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    backgroundColor: "#0f1115",
    title: "School Host",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "renderer.html"));

  mainWindow.on("resize", () => currentView?.setBounds(viewBounds()));
  mainWindow.on("closed", () => (mainWindow = null));

  ipcMain.handle("student:get", () => STUDENT);
  ipcMain.handle("apps:list", () =>
    // Don't leak the audience to the renderer; it's an issuer-side detail.
    APPS.map(({ audience, ...rest }) => rest)
  );
  ipcMain.handle("app:open", (_e, id) => openApp(id));
  ipcMain.handle("app:close", () => closeCurrent());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
