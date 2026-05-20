// Workaround for a long-standing issue where pnpm's content-addressable store
// strips the internal symlinks of macOS .framework bundles. When that happens,
// Electron's framework binary can't be found by dyld and the app crashes on
// launch with "Library not loaded: @rpath/Electron Framework.framework/...".
//
// This script checks for the canonical symlink and, if missing, re-runs
// Electron's own install.js (which downloads and re-extracts the zip with
// symlinks intact).

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

if (process.platform !== "darwin") process.exit(0);

const electronDir = path.dirname(require.resolve("electron/package.json"));
const expectedSymlink = path.join(
  electronDir,
  "dist",
  "Electron.app",
  "Contents",
  "Frameworks",
  "Electron Framework.framework",
  "Electron Framework"
);

let ok = false;
try {
  const st = fs.lstatSync(expectedSymlink);
  ok = st.isSymbolicLink();
} catch {
  ok = false;
}

if (ok) process.exit(0);

console.log(
  "[fix-electron-framework] Electron framework symlinks missing; re-extracting…"
);

const dist = path.join(electronDir, "dist");
fs.rmSync(dist, { recursive: true, force: true });
execSync("node install.js", { cwd: electronDir, stdio: "inherit" });
console.log("[fix-electron-framework] done.");
