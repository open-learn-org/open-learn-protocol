// EduSSO v1 conformance validator — simplified, opinionated checks.
// Spec: https://github.com/open-learn-org/open-learn-protocol/tree/main/specs/edu-sso

import { mintTestToken, TEST_ISSUER } from "./test-issuer";

export type CheckLevel = "pass" | "fail" | "warn" | "info";

export type CheckResult = {
  id: string;
  title: string;
  level: CheckLevel;
  detail: string;
  ref?: string;
};

export type ValidationReport = {
  tutorUrl: string;
  issuerUrl: string;
  testIssuer: string;
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

function originOf(input: string): string {
  const u = new URL(input);
  return `${u.protocol}//${u.host}`;
}

function tutorPathFor(tutor: string, query: Record<string, string>): string {
  const u = new URL(tutor);
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  return u.toString();
}

function entryUrlFor(tutor: string, entry: string | null, query: Record<string, string>): string {
  if (!entry) return tutorPathFor(tutor, query);
  const u = new URL(entry, tutor); // same-origin resolution
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  return u.toString();
}

type ManifestInfo = { audience: string | null; entry: string | null; sameOrigin: boolean };

async function readManifest(tutorUrl: string): Promise<ManifestInfo> {
  try {
    const r = await fetchWithTimeout(`${originOf(tutorUrl)}/.well-known/edu-sso.json`);
    if (r.status !== 200) return { audience: null, entry: null, sameOrigin: true };
    const body = (await r.json()) as { audience?: unknown; entry?: unknown };
    const audience = typeof body.audience === "string" ? body.audience : null;
    let entry: string | null = null;
    let sameOrigin = true;
    if (typeof body.entry === "string" && body.entry.length > 0) {
      try {
        const resolved = new URL(body.entry, tutorUrl);
        sameOrigin = resolved.origin === new URL(tutorUrl).origin;
        entry = sameOrigin ? body.entry : null;
      } catch {
        entry = null;
        sameOrigin = false;
      }
    }
    return { audience, entry, sameOrigin };
  } catch {
    return { audience: null, entry: null, sameOrigin: true };
  }
}

// ---- 1. Tutor reachable over HTTPS ----

async function checkTutorReachable(tutorUrl: string): Promise<CheckResult> {
  if (!tutorUrl.startsWith("https://")) {
    return {
      id: "tutor.https",
      title: "Tutor reachable over HTTPS",
      level: "fail",
      detail: `Not HTTPS: ${tutorUrl}. Required in production.`,
      ref: "tutor.md §10",
    };
  }
  try {
    const r = await fetchWithTimeout(tutorUrl, { method: "GET" });
    return {
      id: "tutor.https",
      title: "Tutor reachable over HTTPS",
      level: "pass",
      detail: `HTTP ${r.status} from ${tutorUrl}`,
    };
  } catch (e) {
    return {
      id: "tutor.https",
      title: "Tutor reachable over HTTPS",
      level: "fail",
      detail: (e as Error).message,
    };
  }
}

// ---- 2. Discovery manifest ----

async function checkDiscoveryManifest(tutorUrl: string, issuerUrl: string): Promise<CheckResult> {
  const url = `${originOf(tutorUrl)}/.well-known/edu-sso.json`;
  let r: Response;
  try {
    r = await fetchWithTimeout(url);
  } catch (e) {
    return {
      id: "discovery",
      title: "Discovery manifest",
      level: "warn",
      detail: `Not reachable: ${url} — discovery is optional.`,
      ref: "discovery.md §1",
    };
  }
  if (r.status === 404) {
    return {
      id: "discovery",
      title: "Discovery manifest",
      level: "warn",
      detail: "Not published (optional). Operator must configure audience manually.",
      ref: "discovery.md §1",
    };
  }
  if (r.status !== 200) {
    return {
      id: "discovery",
      title: "Discovery manifest",
      level: "fail",
      detail: `HTTP ${r.status} at ${url}`,
      ref: "discovery.md §2",
    };
  }

  const problems: string[] = [];
  const ct = r.headers.get("content-type") ?? "";
  if (!/application\/json/i.test(ct)) problems.push(`Content-Type "${ct}" is not application/json`);

  const text = await r.text();
  if (text.length > MAX_MANIFEST_BYTES) problems.push(`body ${text.length} B exceeds 16 KiB`);

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return {
      id: "discovery",
      title: "Discovery manifest",
      level: "fail",
      detail: "Body is not valid JSON",
      ref: "discovery.md §1",
    };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      id: "discovery",
      title: "Discovery manifest",
      level: "fail",
      detail: "Body is not a JSON object",
      ref: "discovery.md §1",
    };
  }
  const m = body as Record<string, unknown>;
  if (m.version !== 1) problems.push(`version is ${JSON.stringify(m.version)}, expected 1`);
  if (typeof m.audience !== "string" || m.audience.length === 0) problems.push("audience missing/empty");
  if (m.issuers !== undefined) {
    if (!Array.isArray(m.issuers) || !m.issuers.every((v) => typeof v === "string" && v.startsWith("https://"))) {
      problems.push("issuers must be an array of HTTPS URL strings");
    } else {
      const issuerNorm = issuerUrl.replace(/\/$/, "");
      const listed = m.issuers.some((v) => typeof v === "string" && v.replace(/\/$/, "") === issuerNorm);
      if (!listed) problems.push(`configured issuer ${issuerUrl} not listed in ${JSON.stringify(m.issuers)}`);
    }
  }
  if (m.entry !== undefined) {
    if (typeof m.entry !== "string" || m.entry.length === 0) {
      problems.push("entry must be a non-empty string");
    } else {
      try {
        const resolved = new URL(m.entry, tutorUrl);
        if (resolved.origin !== new URL(tutorUrl).origin) {
          problems.push(`entry "${m.entry}" is not same-origin as the tutor`);
        }
      } catch {
        problems.push(`entry "${m.entry}" is not a valid URL`);
      }
    }
  }

  const summary = `audience="${m.audience}" entry=${JSON.stringify(m.entry ?? "/")} issuers=${JSON.stringify(m.issuers ?? "(absent)")}`;
  if (problems.length === 0) {
    return { id: "discovery", title: "Discovery manifest", level: "pass", detail: summary, ref: "discovery.md §1" };
  }
  return {
    id: "discovery",
    title: "Discovery manifest",
    level: "fail",
    detail: `${summary} — issues: ${problems.join("; ")}`,
    ref: "discovery.md §1",
  };
}

// ---- 3. Issuer JWKS ----

async function checkIssuerJwks(issuerUrl: string): Promise<CheckResult> {
  const url = `${issuerUrl.replace(/\/$/, "")}/.well-known/jwks.json`;
  let r: Response;
  try {
    r = await fetchWithTimeout(url);
  } catch (e) {
    return { id: "issuer.jwks", title: "Issuer JWKS", level: "fail", detail: `${url} → ${(e as Error).message}`, ref: "tutor.md §6" };
  }
  if (r.status !== 200) {
    return { id: "issuer.jwks", title: "Issuer JWKS", level: "fail", detail: `HTTP ${r.status} at ${url}`, ref: "tutor.md §6" };
  }
  let body: unknown;
  try {
    body = await r.json();
  } catch (e) {
    return { id: "issuer.jwks", title: "Issuer JWKS", level: "fail", detail: `Not valid JSON: ${(e as Error).message}` };
  }
  const set = body as { keys?: unknown };
  if (!set || typeof set !== "object" || !Array.isArray(set.keys) || set.keys.length === 0) {
    return { id: "issuer.jwks", title: "Issuer JWKS", level: "fail", detail: "Missing non-empty keys[] array" };
  }
  const algs = new Set<string>();
  let badAlg = false;
  for (const k of set.keys as Array<Record<string, unknown>>) {
    const alg = typeof k.alg === "string" ? k.alg : undefined;
    if (alg) algs.add(alg);
    if (alg && !ALLOWED_ALGS.has(alg)) badAlg = true;
  }
  if (badAlg) {
    return { id: "issuer.jwks", title: "Issuer JWKS", level: "fail", detail: `Disallowed alg(s) present: ${[...algs].join(", ")}`, ref: "tutor.md §3.1" };
  }
  return {
    id: "issuer.jwks",
    title: "Issuer JWKS",
    level: "pass",
    detail: `${(set.keys as unknown[]).length} key(s), alg=${algs.size ? [...algs].join(",") : "(unspecified)"}`,
  };
}

// ---- 4. Bad-token robustness ----

async function checkBadTokenRobustness(tutorUrl: string, entry: string | null): Promise<CheckResult> {
  const probe = `probe-${Math.random().toString(36).slice(2, 10)}`;
  let r: Response;
  try {
    r = await fetchWithTimeout(entryUrlFor(tutorUrl, entry, { edu_session: probe }));
  } catch (e) {
    return { id: "tutor.bad_token", title: "Malformed token handled safely", level: "fail", detail: (e as Error).message, ref: "tutor.md §5,§9" };
  }
  const problems: string[] = [];
  if (r.status >= 500) problems.push(`returned HTTP ${r.status}`);
  const loc = r.headers.get("location");
  if (loc && loc.includes("edu_session")) problems.push(`redirect target still contains edu_session: ${loc}`);
  const body = await r.text().catch(() => "");
  if (body.includes(probe)) problems.push("response body echoes the token (spec §5: token MUST NOT survive)");

  if (problems.length === 0) {
    return {
      id: "tutor.bad_token",
      title: "Malformed token handled safely",
      level: "pass",
      detail: `HTTP ${r.status}, no 5xx, no echo, redirect ${loc ? "clean" : "(none)"}`,
      ref: "tutor.md §5,§9",
    };
  }
  return { id: "tutor.bad_token", title: "Malformed token handled safely", level: "fail", detail: problems.join("; "), ref: "tutor.md §5,§9" };
}

// ---- 5. Unknown issuer dropped silently ----

async function checkUnknownIssuerDropped(tutorUrl: string, entry: string | null): Promise<CheckResult> {
  const { generateKeyPair, SignJWT } = await import("jose");
  const { privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519" });
  const jwt = await new SignJWT({ email: "x@example.invalid", email_verified: true })
    .setProtectedHeader({ alg: "EdDSA", kid: "validator-probe" })
    .setIssuer("https://validator.invalid")
    .setAudience("validator-probe")
    .setIssuedAt()
    .setExpirationTime("1m")
    .sign(privateKey);

  let r: Response;
  try {
    r = await fetchWithTimeout(entryUrlFor(tutorUrl, entry, { edu_session: jwt }));
  } catch (e) {
    return { id: "tutor.unknown_iss", title: "Unknown issuer dropped silently", level: "fail", detail: (e as Error).message, ref: "tutor.md §7,§9" };
  }
  if (r.status >= 500) {
    return { id: "tutor.unknown_iss", title: "Unknown issuer dropped silently", level: "fail", detail: `HTTP ${r.status}`, ref: "tutor.md §9" };
  }
  // Tutor should not set its session cookie for an unknown issuer.
  const setCookie = r.headers.get("set-cookie") ?? "";
  if (/session|auth|login/i.test(setCookie)) {
    return {
      id: "tutor.unknown_iss",
      title: "Unknown issuer dropped silently",
      level: "fail",
      detail: `Tutor appears to set a session cookie for an unknown issuer: ${setCookie.slice(0, 120)}`,
      ref: "tutor.md §7",
    };
  }
  return { id: "tutor.unknown_iss", title: "Unknown issuer dropped silently", level: "pass", detail: `HTTP ${r.status}, no session cookie set`, ref: "tutor.md §7,§9" };
}

// ---- 6. Full SSO flow with the test issuer ----

async function checkFullFlow(tutorUrl: string, audience: string, entry: string | null): Promise<CheckResult> {
  let token: string;
  try {
    token = await mintTestToken({ audience, email: "validator@test-issuer.openlearnprotocol.org", name: "Validator" });
  } catch (e) {
    return { id: "tutor.full_flow", title: "Full SSO flow", level: "fail", detail: `Could not mint test token: ${(e as Error).message}` };
  }
  let r: Response;
  try {
    r = await fetchWithTimeout(entryUrlFor(tutorUrl, entry, { edu_session: token }));
  } catch (e) {
    return { id: "tutor.full_flow", title: "Full SSO flow", level: "fail", detail: (e as Error).message };
  }

  const problems: string[] = [];
  if (r.status < 300 || r.status >= 400) {
    problems.push(`expected 302/303 redirect, got HTTP ${r.status}`);
  }
  const loc = r.headers.get("location") ?? "";
  if (loc.includes("edu_session")) problems.push("redirect target still contains edu_session");
  const setCookie = r.headers.get("set-cookie") ?? "";
  if (!setCookie) {
    problems.push("no Set-Cookie header on the redirect response — tutor did not establish a session");
  } else {
    // Best-effort check: HttpOnly and SameSite are recommended.
    if (!/HttpOnly/i.test(setCookie)) problems.push("Set-Cookie missing HttpOnly");
    if (!/SameSite/i.test(setCookie)) problems.push("Set-Cookie missing SameSite");
  }

  if (problems.length === 0) {
    return {
      id: "tutor.full_flow",
      title: "Full SSO flow (test issuer)",
      level: "pass",
      detail: `HTTP ${r.status}, Location="${loc}", session cookie set with HttpOnly+SameSite`,
      ref: "tutor.md §4,§5",
    };
  }
  // If the tutor doesn't trust the test issuer, this fails with "no Set-Cookie" — give actionable hint.
  const hint = setCookie === "" ? ` Hint: the tutor must trust ${TEST_ISSUER} for this test (add to EDU_SSO_LAUNCHERS).` : "";
  return {
    id: "tutor.full_flow",
    title: "Full SSO flow (test issuer)",
    level: "fail",
    detail: `${problems.join("; ")}.${hint}`,
    ref: "tutor.md §4,§5",
  };
}

// ---- Runner ----

export async function runValidation(
  tutorUrl: string,
  issuerUrl: string,
  opts: { audience?: string } = {}
): Promise<ValidationReport> {
  const startedAt = new Date().toISOString();
  const checks: CheckResult[] = [];

  try {
    new URL(tutorUrl);
    new URL(issuerUrl);
  } catch {
    return {
      tutorUrl,
      issuerUrl,
      testIssuer: TEST_ISSUER,
      startedAt,
      finishedAt: new Date().toISOString(),
      checks: [{ id: "input", title: "Invalid URL", level: "fail", detail: "tutorUrl or issuerUrl is not a valid URL" }],
    };
  }

  // Read the manifest first; entry & audience drive subsequent tutor probes.
  const manifest = await readManifest(tutorUrl);
  const entry = manifest.entry;

  const [reach, discovery, jwks, bad, unknownIss] = await Promise.all([
    checkTutorReachable(tutorUrl),
    checkDiscoveryManifest(tutorUrl, issuerUrl),
    checkIssuerJwks(issuerUrl),
    checkBadTokenRobustness(tutorUrl, entry),
    checkUnknownIssuerDropped(tutorUrl, entry),
  ]);
  checks.push(reach, discovery, jwks, bad, unknownIss);

  const audience = opts.audience ?? manifest.audience ?? new URL(tutorUrl).host;
  const fullFlow = await checkFullFlow(tutorUrl, audience, entry);
  checks.push(fullFlow);

  return {
    tutorUrl,
    issuerUrl,
    testIssuer: TEST_ISSUER,
    startedAt,
    finishedAt: new Date().toISOString(),
    checks,
  };
}
