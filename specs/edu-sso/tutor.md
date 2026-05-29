# EduSSO v1 — Tutor / Relying Party Implementation Spec

*Audience: implementers of a learning app (tutor, game, reading coach, anything) that wants to accept identities from one or more EduSSO launchers.*

This document specifies what a conformant EduSSO tutor must do. The companion document `issuer.md` specifies what a launcher and its issuer must do. The two are designed to be implemented independently.

If you implement only what's in this document, your tutor will accept tokens from any EduSSO-conformant launcher you onboard with.

---

## 0. Quickstart for AI coding agents

If you use an AI coding agent (Claude Code, Cursor, Codex, Aider, etc.), the fastest path is to paste the prompt below into it. The prompt is self-contained and points the agent at the canonical spec URLs. It assumes you've already obtained `ISSUER` and `AUDIENCE` from your launcher operator.

````text
Implement EduSSO v1 (relying-party / tutor side) in this codebase.

Spec sources — fetch these before writing code:
- https://raw.githubusercontent.com/open-learn-org/open-learn-protocol/main/specs/edu-sso/protocol.md
- https://raw.githubusercontent.com/open-learn-org/open-learn-protocol/main/specs/edu-sso/tutor.md
- https://raw.githubusercontent.com/open-learn-org/open-learn-protocol/main/specs/edu-sso/conformance.md
- https://raw.githubusercontent.com/open-learn-org/open-learn-protocol/main/specs/edu-sso/discovery.md
Reference implementation (Node + jose):
- https://github.com/open-learn-org/open-learn-protocol/tree/main/specs/edu-sso/examples/example-tutor

Task:
1. Detect this project's web framework (Next.js, Express, FastAPI, etc.) and identify its entry handler / middleware layer.
2. Read EDU_SSO_ISSUER and EDU_SSO_AUDIENCE from env. Fail fast if missing.
3. On every request, if `?edu_session=<jwt>` is present:
   a. Verify the JWT using the issuer's JWKS at `${EDU_SSO_ISSUER}/.well-known/jwks.json`.
      - Allow only RS256 and EdDSA. Reject alg=none and HS*.
      - Check `iss` matches EDU_SSO_ISSUER exactly.
      - Check `aud` matches EDU_SSO_AUDIENCE.
      - Enforce `exp` and `iat` with ≤5s clock tolerance.
      - Require `email_verified === true`.
   b. On success: upsert the user by email, set the app's own session cookie, then redirect to the same path with `edu_session` removed from the query string.
   c. On any verification failure: fall through silently to the normal flow (no error to the user, no logging of the raw token).
4. Cache the JWKS in memory with a 1h TTL. Use the framework's standard library (jose `createRemoteJWKSet`, PyJWT's PyJWKClient, etc.).
5. Never log the full request URL when `edu_session` is present. Redact the parameter before logging.
6. Add config for multi-launcher support: if more than one (issuer, audience) pair is configured, dispatch by the token's `iss` claim. Reject unknown issuers.
7. Publish a discovery manifest so launchers can auto-detect this tutor: serve `/.well-known/edu-sso.json` returning `{ "version": 1, "audience": "<same value as EDU_SSO_AUDIENCE>" }` with `Content-Type: application/json`. Use the framework's static-file convention (Next.js: `public/.well-known/edu-sso.json` or a route handler; Express: `app.get('/.well-known/edu-sso.json', ...)`; FastAPI: `@app.get('/.well-known/edu-sso.json')`). Don't hardcode the audience — read from env so the manifest stays in sync.
8. Run the conformance checklist (link above). Every box must be checkable.

Do NOT implement, even if the framework makes them easy:
- OAuth code exchange, refresh tokens, PKCE, `state`/`nonce`.
- Scopes, dynamic client registration, federated logout.
- jti replay tracking (exp + your session cookie are enough).
- Symmetric JWT verification.

When you're done, show me: (a) the diff, (b) which conformance items you verified, (c) any items you couldn't verify and why.
````

### Stack-specific hints to append

Pick one and paste it after the prompt above so the agent doesn't guess:

- **Next.js (App Router):** "Implement this as `middleware.ts` at the project root, matched on `/` (or wherever the entry is). Use `jose` for verification. Set the cookie via `NextResponse.cookies.set` and return a 302 with the stripped URL."
- **Next.js (Pages Router):** "Implement in `pages/_middleware.ts` or in `getServerSideProps` on the entry page."
- **Express:** "Add a middleware mounted before the session middleware. Use `jose` + `createRemoteJWKSet`."
- **FastAPI / Starlette:** "Add an `HTTPMiddleware` that runs before the auth dependency. Use `PyJWT` with `PyJWKClient`. Set the session cookie via `response.set_cookie`."
- **Go (net/http):** "Wrap the mux in a handler that runs first. Use `github.com/golang-jwt/jwt/v5` and `github.com/MicahParks/keyfunc/v3` for JWKS caching."

### What to expect

The reference Node implementation is ~50 lines. Your agent should produce a similar diff: a single new file (middleware / handler), a few lines wiring it into the framework, and the env-var plumbing. If it tries to write more, ask why.

---

## 1. Goal

Your app is opened inside a launcher that already knows the child. EduSSO hands you that identity in a verifiable form so you don't have to run your own onboarding for users that come from a launcher. You receive the child's email; you log them in.

The protocol is intentionally narrow: it tells you who the child is. Nothing else. Anything beyond that — progress, billing, parent dashboards — is yours to design.

---

## 2. The flow as you'll see it

1. A request lands on your app with `?edu_session=<JWT>` in the query string.
2. You verify the JWT against the issuer's public keys.
3. You read `email` (and optionally `name`) from the payload.
4. You upsert the user, drop your own session cookie, and redirect to the same URL with the `edu_session` parameter stripped.
5. The child's browser follows the redirect. From here on, your session cookie is in charge. EduSSO is no longer involved.

That's the entire protocol from your side.

---

## 3. Verification rules

You MUST perform all of these checks. Most JWT libraries do them for you when you pass the right options; the list exists so you know what you're relying on.

### 3.1 Signature

- MUST verify the JWT signature against a public key advertised by the issuer's JWKS.
- MUST resolve the verifying key by `kid` from the JWT header.
- MUST reject tokens with `alg: none`.
- MUST reject tokens with symmetric algorithms (`HS256`, etc.) on this code path.

### 3.2 Claims

- `iss` MUST match the issuer URL you configured for the launcher. Exact string match.
- `aud` MUST match the audience id the launcher assigned you. Exact string match.
- `exp` MUST be in the future. You MAY allow up to 5 seconds of clock skew.
- `iat` MUST be in the past (within the same 5-second tolerance).
- `nbf` if present MUST be in the past.

### 3.3 What you do NOT need to check

- You don't need to track used `jti`s for replay protection. The 5-minute `exp` and your own session cookie make replays uninteresting.
- You don't need to verify the chain to a root CA. The JWKS is the trust anchor.
- You don't need to call back to the issuer. Verification is purely local once you have the JWKS.

---

## 4. The minimum implementation

Node + [`jose`](https://github.com/panva/jose) + Express. Other stacks have direct equivalents.

```ts
import { createRemoteJWKSet, jwtVerify } from "jose";

const ISSUER = "https://issuer.example-launcher.com";
const AUDIENCE = "your-app-id";

const jwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));

export async function eduSSO(req, res, next) {
  const token = req.query.edu_session;
  if (!token) return next();

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: ISSUER,
      audience: AUDIENCE,
      clockTolerance: 5,
    });

    await upsertUser({ email: payload.email, name: payload.name });
    await setSessionCookie(res, payload.email);

    const url = new URL(req.url, `https://${req.headers.host}`);
    url.searchParams.delete("edu_session");
    return res.redirect(302, url.pathname + url.search);
  } catch {
    // Invalid or expired token: fall through to your normal flow.
    return next();
  }
}
```

Mount it once at the root of your app. You're done.

Equivalents in other stacks:

- **Python:** `pyjwt` with `PyJWKClient`.
- **Go:** `github.com/lestrrat-go/jwx/v2` (`jwk.Cache` + `jwt.Parse`).
- **Ruby:** `ruby-jwt` with a JWKS client.
- **Java / Kotlin:** `nimbus-jose-jwt` (`JWKSource` + `DefaultJWTProcessor`).
- **.NET:** `Microsoft.IdentityModel.Tokens` with `IConfigurationManager<OpenIdConnectConfiguration>`.

All follow the same shape: load the JWKS once at boot, verify with issuer + audience, read `email`.

### 4.1 Dedicated entry route (optional)

The middleware-at-root pattern above is the simplest implementation, but some tutors prefer to isolate SSO from request middleware — e.g. SSR apps that don't want to inspect every request, or apps where a global middleware adds risk.

You MAY expose a single route — for example `GET /auth/edu-sso` — that runs the same verification logic, and advertise it via the discovery manifest's `entry` field (see [`discovery.md`](./discovery.md) §1):

```json
{ "version": 1, "audience": "tutor.example.com", "entry": "/auth/edu-sso" }
```

When the manifest declares `entry`, the launcher targets that path instead of `/`. The handler still MUST:

- Verify the token with the same rules as §3.
- Set your session cookie on success.
- Redirect (302) to a clean URL with `edu_session` stripped — typically your home or dashboard, NOT the entry route itself.
- Silently redirect home (no error) on failure.

The handler SHOULD NOT render HTML on the entry route, so the token never lands in the rendered DOM even on a verification failure.

```ts
// app/auth/edu-sso/route.ts (Next.js App Router)
import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify, createRemoteJWKSet } from "jose";

const ISSUER = "https://issuer.example-launcher.com";
const AUDIENCE = "tutor.example.com";
const jwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));

export async function GET(req: NextRequest) {
  const home = new URL("/", req.nextUrl);
  const token = req.nextUrl.searchParams.get("edu_session");
  if (!token) return NextResponse.redirect(home, 302);

  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: ISSUER, audience: AUDIENCE, clockTolerance: 5 });
    const res = NextResponse.redirect(new URL("/dashboard", req.nextUrl), 302);
    res.cookies.set("session", String(payload.email), { httpOnly: true, sameSite: "lax", secure: true, path: "/" });
    return res;
  } catch {
    return NextResponse.redirect(home, 302);
  }
}
```

Both styles are conformant — pick whichever fits your stack.

---

## 5. URL hygiene

The token MUST not survive in places where it can be observed later.

- You MUST redirect to a URL that has the `edu_session` parameter removed.
- The redirect SHOULD happen *before* you emit any HTML containing references to the child (so the token doesn't end up in a referrer on the first cross-origin asset load).
- If you use a dedicated entry route (§4.1), the redirect target SHOULD be a different path (your home or dashboard), not the entry route itself.
- You SHOULD NOT log the full request URL on routes that handle `edu_session`. Strip the parameter from log records or omit those request logs entirely.
- You SHOULD NOT include the request URL in error reports, analytics, or APM traces while `edu_session` is present.

---

## 6. JWKS caching

The recommended libraries cache the JWKS for you. If you're rolling your own:

- Fetch the JWKS at boot. Verify it's a syntactically valid JWK Set.
- Cache it in memory for at least 1 hour. Refresh in the background, not on the request path.
- If a token has a `kid` you don't recognize, refresh the JWKS once. This handles the case where the issuer just rotated.
- If the JWKS endpoint is unreachable at boot, you MUST choose a policy and document it:
  - **Fail-open**: skip SSO verification and let your normal login flow run. Children see your login page; they can still log in by other means if you support them. This is the recommended default.
  - **Fail-closed**: return 503 to any request carrying `edu_session`. Use only if your app has no fallback authentication.

You MUST NOT verify tokens against an uncached JWKS fetched mid-request without a circuit breaker. Otherwise an attacker can DoS your verifier by replaying expired tokens.

---

## 7. Multi-launcher support

If your app is onboarded with more than one launcher, your config has multiple entries:

```ts
const LAUNCHERS = [
  {
    issuer: "https://issuer.launcher-a.com",
    audience: "your-app-on-a",
    jwks: createRemoteJWKSet(new URL("https://issuer.launcher-a.com/.well-known/jwks.json")),
  },
  {
    issuer: "https://issuer.launcher-b.com",
    audience: "tutor-xyz",
    jwks: createRemoteJWKSet(new URL("https://issuer.launcher-b.com/.well-known/jwks.json")),
  },
];

const byIssuer = new Map(LAUNCHERS.map((l) => [l.issuer, l]));
```

Dispatch by `iss`. Read the issuer from the unverified payload (`decodeJwt` in `jose`, equivalent in other libraries), look up the launcher, then verify with that launcher's JWKS and audience.

```ts
import { decodeJwt, jwtVerify } from "jose";

const { iss } = decodeJwt(token);            // unverified peek — only used for routing
const launcher = byIssuer.get(iss);
if (!launcher) return next();                // unknown issuer → silently drop

const { payload } = await jwtVerify(token, launcher.jwks, {
  issuer: launcher.issuer,
  audience: launcher.audience,
  clockTolerance: 5,
});
```

The unverified peek is safe because the trust check still happens inside `jwtVerify`. A forged `iss` cannot match any known launcher's signing key.

The launcher registry MUST be code, not a runtime configuration loaded from a remote URL. Adding a launcher is a deploy.

You SHOULD drop tokens with unknown issuers silently rather than returning an error. Don't leak which launchers you trust.

---

## 8. Identity decisions

These are not protocol decisions — they're product decisions you have to make. The spec calls them out so they don't surprise you in production.

### 8.1 Matching the same child across launchers

If the same child is enrolled in two launchers, you'll receive tokens with potentially the same `email` but different `sub` values (because each launcher mints its own opaque ids).

Three reasonable strategies:

- **Match by email.** Same email = same user, regardless of launcher. Almost always right for learning apps; progress and history merge naturally. Default unless you have a reason otherwise.
- **Match by (`iss`, `sub`).** Same child looks like two accounts to you. Use only if you're worried about unrelated children sharing an email (rare in practice but possible).
- **Hybrid.** Match by email, record `(iss, sub)` as evidence, flag conflicts. Most enterprise. Overkill for most.

Pick one explicitly. The wrong failure mode is "the same child has different progress at home and at school because the implementer didn't decide."

### 8.2 Email changes

If a parent changes the child's email in the launcher, the next token will carry the new email. Your `upsertUser` decides whether that's the same user or a new one. If you matched by email in §8.1, you'll get a duplicate user; if you matched by `sub`, you'll keep the same user and just update the email.

### 8.3 Trust in `email_verified`

The token claims `email_verified: true`. You MAY treat this as sufficient to skip your own email verification flow for users that come in via EduSSO. You SHOULD NOT treat `email_verified: false` as a valid SSO state; if you see it, drop the token.

---

## 9. Error handling

The recommended posture is: **on any token error, silently fall through to your normal flow**.

- Invalid signature → drop the token, run normal flow.
- Expired token → drop, run normal flow.
- Wrong audience → drop, run normal flow.
- Unknown issuer → drop, run normal flow.
- Malformed JWT → drop, run normal flow.

Reasons:

- You don't want to leak which issuers you trust.
- You don't want a confusing error in the child's face if the launcher misconfigures something. They didn't ask for SSO; it should either work invisibly or be invisible.
- Your normal flow is the safe default. If your app requires login, it'll ask; if it allows guests, it'll allow guests.

You SHOULD emit a structured log line for token failures, classified by error type and (where parseable) `iss`. Don't include the token in logs. Don't surface error details to the client.

---

## 10. Operational considerations

- **Per-launcher metrics.** Tag verification metrics by `iss`. One launcher's outage should not look like a global problem in your dashboards.
- **Per-launcher feature gates.** If commercial deals or feature availability differ by launcher, stash `iss` on the session and gate from there.
- **Per-launcher rate limits.** Same idea; the `iss` claim is your tenant key.
- **Clock skew.** Stay within 5 seconds of NTP. The spec requires 5s tolerance on your side; that's already accounting for normal drift.
- **Cookie scope.** Your session cookie SHOULD be `Secure; HttpOnly; SameSite=Lax`. The launcher isolates cookies per-tutor at its end, but defense in depth.

---

## 11. Alternative: no backend

If your tutor is purely client-side, you have two options, in order of preference:

### 11.1 Thin serverless verifier (preferred)

Stand up a single serverless endpoint you control (Cloudflare Worker, Vercel Edge Function, Lambda). Your frontend POSTs the `edu_session` token to it; the function verifies and returns a signed cookie. Same security properties as a normal backend; the function is ~50 lines.

### 11.2 Issuer-side introspection (last resort)

If the launcher's issuer exposes an introspection endpoint (Section 3.3 of `issuer.md`), your frontend MAY call it directly:

```js
const token = new URLSearchParams(location.search).get("edu_session");
const r = await fetch(`https://issuer.example-launcher.com/v1/introspect?token=${token}`);
const { active, email } = await r.json();
```

This works, but anyone with DevTools can read the email after verification. Use only when the email is not sensitive in your context. Most learning apps should not rely on this.

---

## 12. What you do NOT need to implement

So you don't waste effort:

- No OAuth code exchange.
- No refresh tokens — your own session cookie is the renewal mechanism.
- No federated logout — the launcher clears your cookies when the child closes your app.
- No discovery document parsing — the JWKS URL and audience are configured statically.
- No scopes — the token tells you who the child is, nothing else.
- No `state` or `nonce` parameters — replay is mitigated by `exp` and your session cookie.
- No client registration with the issuer — you're not authenticated to it; you only verify its tokens.
- No `jti` tracking for replay — see §3.3.

If you find yourself implementing any of these, you've drifted from EduSSO into OIDC. Stop.

---

## 13. Conformance checklist

A tutor conforms to EduSSO v1 if all of the following are true:

- [ ] Verifies JWTs using RS256 or EdDSA via the issuer's JWKS.
- [ ] Rejects tokens with `alg: none` or symmetric algorithms.
- [ ] Checks `iss` against configured launcher issuer URLs.
- [ ] Checks `aud` against the audience id assigned by that launcher.
- [ ] Accepts `edu_session` at the path declared by its discovery manifest's `entry` (or at `/` if no manifest / no `entry`).
- [ ] Checks `exp` and `iat` with at most 5s clock tolerance.
- [ ] Reads `email` from the verified payload.
- [ ] Refuses tokens with `email_verified: false`.
- [ ] Redirects after login to strip `edu_session` from the URL.
- [ ] Caches JWKS in memory with a documented refresh policy.
- [ ] Falls through silently on any verification error.
- [ ] Does not log the full request URL when `edu_session` is present.
- [ ] If multi-launcher: dispatches by `iss` to the correct verifier; rejects unknown issuers.

Hitting every box puts you in conformance. There is no test suite in v1; conformance is by inspection.

---

## 14. Versioning

This document specifies v1. Future versions MAY add optional claims and signing algorithms without changing the conformance checklist; breaking changes will increment the major version. There is no in-protocol version negotiation; your launcher operator tells you which version they speak when you onboard.
