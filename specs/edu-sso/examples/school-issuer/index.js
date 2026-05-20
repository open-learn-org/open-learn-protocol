// EduSSO v1 reference issuer.
//
// Endpoints:
//   GET  /.well-known/jwks.json     — public verification keys
//   POST /token                     — mint a JWT, audience-bound, 5-min TTL
//
// Authentication on /token: a hardcoded Bearer token represents the launcher's
// install credential. In production this would be per-install and rotated.

import express from "express";
import {
  generateKeyPair,
  exportJWK,
  importJWK,
  SignJWT,
} from "jose";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY_PATH = path.join(__dirname, "keys.json");

const PORT = Number(process.env.PORT ?? 4000);
const ISSUER = process.env.ISSUER_URL ?? `http://localhost:${PORT}`;
const LAUNCHER_TOKEN = process.env.LAUNCHER_TOKEN ?? "dev-launcher-token";

// Hardcoded directory of children. The launcher's bearer authorizes minting
// for children it is bound to; here, one launcher owns one child.
const CHILDREN = {
  "student-1": {
    email: "alice@example.com",
    name: "Alice",
    launcher: "school-host",
  },
};

// Registered tutors (audiences).
const AUDIENCES = new Set(["example-tutor"]);

async function loadOrGenerateKey() {
  try {
    const data = JSON.parse(await fs.readFile(KEY_PATH, "utf8"));
    const privateKey = await importJWK(data.privateJwk, "RS256");
    return { privateKey, publicJwk: data.publicJwk, kid: data.kid };
  } catch {
    const { publicKey, privateKey } = await generateKeyPair("RS256", {
      extractable: true,
    });
    const publicJwk = await exportJWK(publicKey);
    const privateJwk = await exportJWK(privateKey);
    const kid = new Date().toISOString().slice(0, 10); // e.g. "2026-05-20"
    publicJwk.kid = kid;
    publicJwk.use = "sig";
    publicJwk.alg = "RS256";
    await fs.writeFile(
      KEY_PATH,
      JSON.stringify({ kid, publicJwk, privateJwk }, null, 2)
    );
    console.log(`[issuer] generated new RS256 key, kid=${kid}`);
    return { privateKey, publicJwk, kid };
  }
}

const { privateKey, publicJwk, kid } = await loadOrGenerateKey();

const app = express();
app.use(express.json());

app.get("/.well-known/jwks.json", (_req, res) => {
  res.set("Cache-Control", "public, max-age=3600");
  res.json({ keys: [publicJwk] });
});

app.post("/token", async (req, res) => {
  const auth = req.headers.authorization ?? "";
  if (auth !== `Bearer ${LAUNCHER_TOKEN}`) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const { child_id, audience } = req.body ?? {};
  if (typeof child_id !== "string" || typeof audience !== "string") {
    return res.status(400).json({ error: "child_id and audience required" });
  }
  const child = CHILDREN[child_id];
  if (!child) return res.status(403).json({ error: "unknown child" });
  if (!AUDIENCES.has(audience)) {
    return res.status(404).json({ error: "unknown audience" });
  }

  const token = await new SignJWT({
    email: child.email,
    email_verified: true,
    name: child.name,
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid })
    .setIssuer(ISSUER)
    .setAudience(audience)
    .setSubject(`child:${child_id}`)
    .setIssuedAt()
    .setExpirationTime("5m")
    .setJti(randomUUID())
    .sign(privateKey);

  console.log(
    `[issuer] minted token for ${child_id} → ${audience} (jti shortened)`
  );
  res.json({ token, expires_in: 300 });
});

app.listen(PORT, () => {
  console.log(`[issuer] school-issuer listening on ${ISSUER}`);
  console.log(`[issuer] JWKS:  ${ISSUER}/.well-known/jwks.json`);
  console.log(`[issuer] Token: ${ISSUER}/token`);
});
