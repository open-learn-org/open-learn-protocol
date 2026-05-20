// EduSSO v1 reference tutor (relying party).
//
// The whole integration is the `eduSSO` middleware below. The rest is the
// world's most boring tutor app: it shows the logged-in user's email and a
// logout button. There is no signup, no password form, no profile page.

import express from "express";
import cookieParser from "cookie-parser";
import { createRemoteJWKSet, jwtVerify } from "jose";

const PORT = Number(process.env.PORT ?? 5000);
const ISSUER = process.env.ISSUER_URL ?? "http://localhost:4000";
const AUDIENCE = process.env.AUDIENCE ?? "example-tutor";

const jwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));

const app = express();
app.use(cookieParser());

// --- The EduSSO middleware (the whole protocol on this side). ---
async function eduSSO(req, res, next) {
  const token = req.query.edu_session;
  if (!token) return next();

  try {
    const { payload } = await jwtVerify(String(token), jwks, {
      issuer: ISSUER,
      audience: AUDIENCE,
      clockTolerance: 5,
    });

    if (payload.email_verified !== true) {
      console.warn("[tutor] refusing token with email_verified !== true");
      return next();
    }

    // Drop our own session cookie.
    res.cookie(
      "tutor_session",
      JSON.stringify({ email: payload.email, name: payload.name ?? null }),
      { httpOnly: true, sameSite: "lax", maxAge: 1000 * 60 * 60 * 24 }
    );

    // Strip the token from the URL.
    const clean = new URL(req.originalUrl, `http://${req.headers.host}`);
    clean.searchParams.delete("edu_session");
    return res.redirect(302, clean.pathname + clean.search);
  } catch (err) {
    console.warn("[tutor] token verification failed:", err.code ?? err.message);
    return next();
  }
}

// --- Routes ---
app.get("/", eduSSO, (req, res) => {
  const cookie = req.cookies.tutor_session;
  if (!cookie) {
    return res.send(`<!doctype html><html><head><title>Example Tutor</title>
      ${style()}</head><body><main>
      <h1>Example Tutor</h1>
      <p class="muted">No session. Open this app from the school-host to log in.</p>
    </main></body></html>`);
  }
  const { email, name } = JSON.parse(cookie);
  res.send(`<!doctype html><html><head><title>Example Tutor</title>
    ${style()}</head><body><main>
    <h1>Hello, ${escapeHtml(name ?? email)} 👋</h1>
    <p>You're logged in as <code>${escapeHtml(email)}</code>.</p>
    <p class="muted">This page is the entire tutor. Imagine it has fractions on it.</p>
    <form method="POST" action="/logout">
      <button type="submit">Log out</button>
    </form>
  </main></body></html>`);
});

app.post("/logout", express.urlencoded({ extended: false }), (req, res) => {
  res.clearCookie("tutor_session");
  res.redirect("/");
});

app.listen(PORT, () => {
  console.log(`[tutor] example-tutor listening on http://localhost:${PORT}`);
  console.log(`[tutor] verifying against issuer ${ISSUER} for audience "${AUDIENCE}"`);
});

// --- Cosmetic helpers (not part of the protocol). ---
function style() {
  return `<style>
    body { font-family: system-ui, sans-serif; background: #fafafa; color: #111;
           margin: 0; min-height: 100vh; display: grid; place-items: center; }
    main { background: white; padding: 32px 40px; border-radius: 12px;
           box-shadow: 0 1px 3px rgba(0,0,0,0.08); max-width: 520px; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    p { margin: 8px 0; }
    .muted { color: #6b7280; font-size: 14px; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; }
    button { margin-top: 16px; padding: 8px 16px; border: 1px solid #d1d5db;
             background: white; border-radius: 6px; cursor: pointer; font: inherit; }
    button:hover { background: #f9fafb; }
  </style>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
