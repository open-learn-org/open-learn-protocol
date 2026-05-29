// EduSSO v1 conformance checks runnable from outside the tutor / issuer.
// Spec: https://github.com/open-learn-org/open-learn-protocol/tree/main/specs/edu-sso

export type CheckLevel = "pass" | "fail" | "warn" | "info";

export type CheckResult = {
  id: string;
  title: string;
  level: CheckLevel;
  detail: string;
  ref?: string; // section in spec
};

export type ValidationReport = {
  tutorUrl: string;
  issuerUrl: string;
  startedAt: string;
  finishedAt: string;
  checks: CheckResult[];
};

const ALLOWED_ALGS = new Set(["RS256", "EdDSA"]);
const MAX_MANIFEST_BYTES = 16 * 1024;
const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, init?: RequestInit) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ac.signal, redirect: "manual" });
  } finally {
    clearTimeout(t);
  }
}

function normalizeOrigin(input: string): string {
  const u = new URL(input);
  return `${u.protocol}//${u.host}`;
}

function pushPass(out: CheckResult[], id: string, title: string, detail: string, ref?: string) {
  out.push({ id, title, level: "pass", detail, ref });
}
function pushFail(out: CheckResult[], id: string, title: string, detail: string, ref?: string) {
  out.push({ id, title, level: "fail", detail, ref });
}
function pushWarn(out: CheckResult[], id: string, title: string, detail: string, ref?: string) {
  out.push({ id, title, level: "warn", detail, ref });
}
function pushInfo(out: CheckResult[], id: string, title: string, detail: string, ref?: string) {
  out.push({ id, title, level: "info", detail, ref });
}

// ---- Tutor checks ----

async function checkTutorHttps(out: CheckResult[], tutorUrl: string) {
  if (tutorUrl.startsWith("https://")) {
    pushPass(out, "tutor.https", "Tutor served over HTTPS", tutorUrl, "tutor.md §10");
  } else {
    pushWarn(
      out,
      "tutor.https",
      "Tutor not served over HTTPS",
      "Discovery manifest MUST be HTTPS in production. Local dev origins are acceptable.",
      "discovery.md §6"
    );
  }
}

async function checkTutorReachable(out: CheckResult[], tutorUrl: string): Promise<boolean> {
  try {
    const r = await fetchWithTimeout(tutorUrl, { method: "GET" });
    pushPass(out, "tutor.reachable", "Tutor reachable", `HTTP ${r.status} from ${tutorUrl}`);
    return true;
  } catch (e) {
    pushFail(out, "tutor.reachable", "Tutor not reachable", `${(e as Error).message}`);
    return false;
  }
}

async function checkDiscoveryManifest(out: CheckResult[], tutorUrl: string, issuerUrl: string) {
  const origin = normalizeOrigin(tutorUrl);
  const url = `${origin}/.well-known/edu-sso.json`;
  let r: Response;
  try {
    r = await fetchWithTimeout(url);
  } catch (e) {
    pushFail(out, "discovery.fetch", "Discovery manifest not reachable", `${url} → ${(e as Error).message}`, "discovery.md §1");
    return;
  }

  if (r.status === 404) {
    pushWarn(
      out,
      "discovery.fetch",
      "No discovery manifest published",
      "Discovery is OPTIONAL. Without it, the launcher operator must configure audience manually.",
      "discovery.md §1"
    );
    return;
  }
  if (r.status !== 200) {
    pushFail(out, "discovery.fetch", `Discovery manifest returned HTTP ${r.status}`, `Expected 200 or 404 at ${url}`, "discovery.md §2");
    return;
  }

  const ct = r.headers.get("content-type") ?? "";
  if (/application\/json/i.test(ct)) {
    pushPass(out, "discovery.content_type", "Manifest Content-Type is application/json", ct, "discovery.md §1");
  } else {
    pushFail(out, "discovery.content_type", "Manifest Content-Type is not application/json", `Got: ${ct || "(none)"}`, "discovery.md §1");
  }

  const text = await r.text();
  if (text.length > MAX_MANIFEST_BYTES) {
    pushFail(out, "discovery.size", "Manifest body exceeds 16 KiB", `${text.length} bytes`, "discovery.md §5");
  } else {
    pushPass(out, "discovery.size", "Manifest body ≤16 KiB", `${text.length} bytes`, "discovery.md §6");
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (e) {
    pushFail(out, "discovery.json", "Manifest is not valid JSON", (e as Error).message, "discovery.md §1");
    return;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    pushFail(out, "discovery.json", "Manifest is not a JSON object", typeof body, "discovery.md §1");
    return;
  }
  const m = body as Record<string, unknown>;

  if (m.version === 1) {
    pushPass(out, "discovery.version", "version === 1", "1", "discovery.md §1");
  } else {
    pushFail(out, "discovery.version", "version is not 1", `Got: ${JSON.stringify(m.version)}`, "discovery.md §1");
  }

  if (typeof m.audience === "string" && m.audience.length > 0) {
    pushPass(out, "discovery.audience", "audience present", m.audience, "discovery.md §1");
  } else {
    pushFail(out, "discovery.audience", "audience missing or empty", JSON.stringify(m.audience), "discovery.md §1");
  }

  if (m.issuers !== undefined) {
    if (!Array.isArray(m.issuers)) {
      pushFail(out, "discovery.issuers.type", "issuers is not an array", typeof m.issuers, "discovery.md §1");
    } else {
      const allHttps = m.issuers.every((v) => typeof v === "string" && v.startsWith("https://"));
      if (allHttps) {
        pushPass(out, "discovery.issuers.type", "issuers is an array of HTTPS URLs", JSON.stringify(m.issuers), "discovery.md §6");
      } else {
        pushFail(out, "discovery.issuers.type", "issuers contains non-HTTPS or non-string entries", JSON.stringify(m.issuers), "discovery.md §6");
      }
      const issuerNorm = issuerUrl.replace(/\/$/, "");
      const listed = m.issuers.some((v) => typeof v === "string" && v.replace(/\/$/, "") === issuerNorm);
      if (listed) {
        pushPass(out, "discovery.issuers.coherence", "Configured issuer is listed in manifest", issuerUrl);
      } else {
        pushWarn(
          out,
          "discovery.issuers.coherence",
          "Configured issuer is NOT listed in manifest issuers[]",
          `Manifest lists: ${JSON.stringify(m.issuers)}; provided issuer: ${issuerUrl}`
        );
      }
    }
  } else {
    pushInfo(
      out,
      "discovery.issuers.absent",
      "issuers field absent",
      "Spec allows this; tutor accepts whatever launcher allow-list resolves to.",
      "discovery.md §1"
    );
  }

  const cache = r.headers.get("cache-control");
  if (cache && /max-age=\d+/i.test(cache)) {
    pushPass(out, "discovery.cache", "Cache-Control set on manifest", cache, "discovery.md §1");
  } else {
    pushWarn(out, "discovery.cache", "Cache-Control missing on manifest", `Got: ${cache ?? "(none)"}`, "discovery.md §1");
  }
}

async function checkTutorSmokeBadToken(out: CheckResult[], tutorUrl: string) {
  const probe = `probe-${Math.random().toString(36).slice(2, 10)}`;
  const u = new URL(tutorUrl);
  u.searchParams.set("edu_session", probe);
  let r: Response;
  try {
    r = await fetchWithTimeout(u.toString());
  } catch (e) {
    pushFail(out, "tutor.bad_token.reachable", "Tutor errored on malformed token", (e as Error).message, "tutor.md §9");
    return;
  }
  if (r.status >= 500) {
    pushFail(out, "tutor.bad_token.no_5xx", "Tutor returned 5xx for malformed edu_session", `HTTP ${r.status}`, "tutor.md §9");
  } else {
    pushPass(out, "tutor.bad_token.no_5xx", "Tutor handles malformed edu_session without 5xx", `HTTP ${r.status}`, "tutor.md §9");
  }

  // Spec §5: token MUST NOT survive in places where it can be observed later.
  // A 302 to the same path with edu_session removed is the strongest signal.
  const loc = r.headers.get("location");
  if (r.status >= 300 && r.status < 400 && loc) {
    if (loc.includes("edu_session")) {
      pushFail(out, "tutor.bad_token.redirect_strip", "Tutor redirect still contains edu_session", loc, "tutor.md §5");
    } else {
      pushPass(out, "tutor.bad_token.redirect_strip", "Redirect target has edu_session stripped (or no redirect on bad token)", loc, "tutor.md §5");
    }
  } else {
    pushInfo(out, "tutor.bad_token.redirect_strip", "No redirect on malformed token", `HTTP ${r.status}`, "tutor.md §9");
  }

  // The token must not be echoed in the response body.
  const body = await r.text().catch(() => "");
  if (body.includes(probe)) {
    pushFail(out, "tutor.bad_token.no_echo", "Tutor echoes edu_session in response body", "Probe token found in HTML/text", "tutor.md §5");
  } else {
    pushPass(out, "tutor.bad_token.no_echo", "Tutor does not echo edu_session in response body", "Probe token absent", "tutor.md §5");
  }
}

async function checkUnknownIssuerSilent(out: CheckResult[], tutorUrl: string) {
  // Build a syntactically valid JWT signed by an issuer the tutor cannot know.
  // The tutor MUST drop it silently (no error to the child).
  const { generateKeyPair, SignJWT } = await import("jose");
  const { privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519" });
  const jwt = await new SignJWT({
    email: "probe@example.invalid",
    email_verified: true,
    name: "Probe",
  })
    .setProtectedHeader({ alg: "EdDSA", kid: "validator-probe" })
    .setIssuer("https://validator.invalid")
    .setAudience("validator-probe")
    .setSubject("validator")
    .setIssuedAt()
    .setExpirationTime("1m")
    .sign(privateKey);

  const u = new URL(tutorUrl);
  u.searchParams.set("edu_session", jwt);
  let r: Response;
  try {
    r = await fetchWithTimeout(u.toString());
  } catch (e) {
    pushFail(out, "tutor.unknown_iss.fallthrough", "Tutor errored on unknown-issuer token", (e as Error).message, "tutor.md §9");
    return;
  }

  if (r.status >= 500) {
    pushFail(out, "tutor.unknown_iss.fallthrough", "Tutor returned 5xx on unknown-issuer token", `HTTP ${r.status}`, "tutor.md §9");
  } else {
    pushPass(out, "tutor.unknown_iss.fallthrough", "Tutor handles unknown-issuer token without error", `HTTP ${r.status}`, "tutor.md §9");
  }

  const body = await r.text().catch(() => "");
  // Heuristic: a leaked verification error usually shows the token or error class name.
  if (body.toLowerCase().includes("edu_session") || body.includes("JWS") || body.includes("JWT")) {
    pushWarn(
      out,
      "tutor.unknown_iss.no_leak",
      "Response body mentions edu_session / JWT / JWS",
      "Verify the tutor isn't surfacing verification errors to the user.",
      "tutor.md §9"
    );
  } else {
    pushPass(out, "tutor.unknown_iss.no_leak", "No token / JWT error surfaced in response body", "OK", "tutor.md §9");
  }
}

// ---- Issuer checks ----

async function checkIssuerJwks(out: CheckResult[], issuerUrl: string) {
  const url = `${issuerUrl.replace(/\/$/, "")}/.well-known/jwks.json`;
  let r: Response;
  try {
    r = await fetchWithTimeout(url);
  } catch (e) {
    pushFail(out, "issuer.jwks.reachable", "JWKS endpoint not reachable", `${url} → ${(e as Error).message}`, "tutor.md §6");
    return;
  }
  if (r.status !== 200) {
    pushFail(out, "issuer.jwks.status", `JWKS returned HTTP ${r.status}`, url, "tutor.md §6");
    return;
  }
  pushPass(out, "issuer.jwks.reachable", "JWKS endpoint reachable", url, "tutor.md §6");

  const ct = r.headers.get("content-type") ?? "";
  if (/application\/(json|jwk-set\+json)/i.test(ct)) {
    pushPass(out, "issuer.jwks.content_type", "JWKS Content-Type is JSON", ct);
  } else {
    pushWarn(out, "issuer.jwks.content_type", "JWKS Content-Type not application/json", `Got: ${ct || "(none)"}`);
  }

  let body: unknown;
  try {
    body = await r.json();
  } catch (e) {
    pushFail(out, "issuer.jwks.json", "JWKS body is not valid JSON", (e as Error).message);
    return;
  }
  const set = body as { keys?: unknown };
  if (!set || typeof set !== "object" || !Array.isArray(set.keys) || set.keys.length === 0) {
    pushFail(out, "issuer.jwks.shape", "JWKS missing non-empty keys[] array", JSON.stringify(body).slice(0, 200));
    return;
  }
  pushPass(out, "issuer.jwks.shape", `JWKS contains ${set.keys.length} key(s)`, "OK");

  let goodAlg = 0;
  let badAlg = 0;
  const algs: string[] = [];
  for (const k of set.keys as Array<Record<string, unknown>>) {
    const alg = typeof k.alg === "string" ? k.alg : undefined;
    if (alg) algs.push(alg);
    if (alg && ALLOWED_ALGS.has(alg)) goodAlg++;
    else if (alg) badAlg++;
    if (typeof k.kid !== "string" || k.kid.length === 0) {
      pushWarn(out, `issuer.jwks.kid.${k.kid ?? "?"}`, "JWKS key missing kid", JSON.stringify(k).slice(0, 120));
    }
  }
  if (badAlg === 0 && goodAlg > 0) {
    pushPass(out, "issuer.jwks.alg", "All keys use RS256 or EdDSA", algs.join(", "), "tutor.md §3.1");
  } else if (badAlg > 0) {
    pushFail(out, "issuer.jwks.alg", "JWKS contains keys with disallowed algs", `seen: ${algs.join(", ")}`, "tutor.md §3.1");
  } else {
    pushWarn(out, "issuer.jwks.alg", "JWKS keys missing alg hints", "Verifier will rely on configured allow-list.");
  }
}

// ---- Top-level runner ----

export async function runValidation(tutorUrl: string, issuerUrl: string): Promise<ValidationReport> {
  const startedAt = new Date().toISOString();
  const checks: CheckResult[] = [];

  // Input validation.
  let tutor: URL;
  let issuer: URL;
  try {
    tutor = new URL(tutorUrl);
  } catch {
    return {
      tutorUrl,
      issuerUrl,
      startedAt,
      finishedAt: new Date().toISOString(),
      checks: [{ id: "input.tutor", title: "Tutor URL invalid", level: "fail", detail: tutorUrl }],
    };
  }
  try {
    issuer = new URL(issuerUrl);
  } catch {
    return {
      tutorUrl,
      issuerUrl,
      startedAt,
      finishedAt: new Date().toISOString(),
      checks: [{ id: "input.issuer", title: "Issuer URL invalid", level: "fail", detail: issuerUrl }],
    };
  }

  await checkTutorHttps(checks, tutor.toString());
  const reachable = await checkTutorReachable(checks, tutor.toString());
  if (reachable) {
    await checkDiscoveryManifest(checks, tutor.toString(), issuer.toString());
    await checkTutorSmokeBadToken(checks, tutor.toString());
    await checkUnknownIssuerSilent(checks, tutor.toString());
  }
  await checkIssuerJwks(checks, issuer.toString());

  return { tutorUrl, issuerUrl, startedAt, finishedAt: new Date().toISOString(), checks };
}
