# EduSSO v1 — Single Sign-On for Learning Apps

*Version 1 · open draft · feedback welcome*

If you're reading this, someone on your team has agreed that your learning app — a tutor, a reading coach, an adaptive math platform, a game — should run inside a *launcher*: a parent- or school-managed environment that already knows which child is sitting in front of the screen.

That means by the time a child opens your app, **the launcher already knows who they are**. The child has an email associated with their account, set up by a parent or admin at onboarding. It makes no sense for the child to log in again, every day, in every app. They're already authenticated where they came from.

We want to hand you that identity. Without making you think about it.

This document specifies how. The protocol is called **EduSSO v1**. It's designed so the integration on your side is, literally, about ten lines of code.

---

## The idea in one paragraph

When a launcher loads your app, it appends a query parameter to your URL: `?edu_session=<JWT>`. That JWT is signed by the launcher's issuer, names the child, and is valid for five minutes. You verify it against the issuer's public JWKS, read the email out of it, set your own session cookie (or `req.session.userId = …`, or whatever shape your auth takes), redirect to the same URL with the parameter stripped, and you're done. The child is logged into your app. Forever — or until your session expires by your own rules.

No client_id. No callback URLs. No refresh tokens. No PKCE. No OIDC discovery dance. Just a signed JWT in a query parameter.

---

## The flow

```
┌──────────┐  1. mint(child, aud)   ┌───────────────┐
│ Launcher │ ─────────────────────► │ Issuer        │
│          │ ◄───────────────────── │ (signs JWT)   │
└────┬─────┘     2. edu_session JWT └───────────────┘
     │
     │ 3. GET https://your-app.com/?edu_session=<jwt>
     ▼
┌────────────┐  4. verify(jwt, JWKS)   ┌──────────────┐
│ Your app   │ ──────────────────────► │ Public JWKS  │
│            │                         └──────────────┘
│            │  5. setSessionCookie(email)
│            │  6. 302 → same path without ?edu_session
└────────────┘
```

1. A parent or admin onboarded the child into the launcher. The launcher knows `(child_id, email, name)`.
2. The child clicks your app from the launcher's home. Before loading your URL, the launcher asks its issuer for a token, audience-bound to you.
3. The launcher loads your URL with `?edu_session=<jwt>` appended.
4. Your backend sees the token on the incoming request. It verifies it.
5. You do what you would normally do when logging a user in: drop a session cookie, upsert the user, whatever.
6. You redirect, stripping the `edu_session` parameter. The child never sees it. It never lands in history, logs, or referrers.

From here on, your app handles its session as it always has. If your cookie expires and the child returns, the launcher will inject a fresh token automatically. You don't have to do anything different.

---

## The token

A standard JWT signed with RS256. Payload looks like this:

```json
{
  "iss": "https://issuer.example-launcher.com",
  "aud": "your-app-id",
  "sub": "child:abc123",
  "email": "student@example.com",
  "email_verified": true,
  "name": "Sam",
  "iat": 1779150000,
  "exp": 1779150300,
  "jti": "01HX5XYV6FPK3R3D6T2H8E2VPR"
}
```

Three things that matter:

- **`email`** is the field you'll use. `email_verified` is always `true` because the launcher is responsible for verifying it at onboarding.
- **`aud`** is the identifier assigned to you when you register with the launcher. If you verify against the wrong audience, the token will be rejected — this is what protects you from someone trying to replay a token minted for a different app.
- **`exp`** is five minutes from issuance. Long enough to complete a login round-trip, short enough that a leaked token is uninteresting almost immediately.

`sub` is there in case you want a stable opaque id; using it is optional.

---

## What you have to write

One function. Using [`jose`](https://github.com/panva/jose) in Node — the example — but any modern JWT library will do:

```ts
import { createRemoteJWKSet, jwtVerify } from "jose";

const jwks = createRemoteJWKSet(
  new URL("https://issuer.example-launcher.com/.well-known/jwks.json")
);

export async function eduSSO(req, res, next) {
  const token = req.query.edu_session;
  if (!token) return next();

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: "https://issuer.example-launcher.com",
      audience: "your-app-id",
      clockTolerance: 5,
    });

    await upsertUser({ email: payload.email, name: payload.name });
    await setSessionCookie(res, payload.email);

    const clean = new URL(req.url, `https://${req.headers.host}`);
    clean.searchParams.delete("edu_session");
    return res.redirect(302, clean.pathname + clean.search);
  } catch {
    return next();
  }
}
```

Mount it as middleware at your root. **That's it.** There's no second part to this chapter.

For other stacks, see [`tutor.md`](./tutor.md) §4.

---

## Why a query parameter and not something "more serious"

Anything more serious would make you write more code.

| Alternative | Why not |
|---|---|
| Inject `Authorization: Bearer` from the launcher | Lost on cross-subdomain redirects, stripped by some CDNs. Frail in invisible ways. |
| `postMessage` from a preload script | Requires the tutor to be an SPA you control from first paint. The protocol has to work for SSR tutors too. |
| OAuth code flow | Forces callbacks, `state`, back-channel exchanges. Far too much ceremony for "tell me who the child is." |
| OIDC implicit | We're effectively doing this, without the discovery machinery. |

A signed JWT in a query parameter works for SSR and SPA tutors alike, requires no coordination beyond "we'll give you an audience id," and pushes verification into your backend with code you already know how to write.

---

## What the launcher does for you (you don't have to think about this)

- Requests a fresh token every time your app is opened. No caching.
- Injects `Referrer-Policy: no-referrer` for your origin, so if you accidentally make a cross-origin call before the redirect, the token doesn't leak.
- Isolates cookie storage per-tutor: cookies from one app are unreachable from another.
- Wipes the partition when the child closes your app.

---

## Threat model

| Risk | Mitigation |
|---|---|
| Token in a referrer on first cross-origin call | `Referrer-Policy: no-referrer` injected by the launcher |
| Token in browser history / logs / analytics | Your redirect strips the parameter before first paint |
| Replay against a different app | Audience-bound `aud` claim |
| Stolen token, late use | Five-minute `exp` |
| Issuer impersonation | Only the launcher's issuer holds the private key; the JWKS is read-only |
| Compromised device | Out of scope — the operator's problem |

---

## FAQ

**What if the JWKS is down?**
Cache it in memory with a 1h TTL. The recommended libraries do this for you. If it's down at boot, choose fail-open (skip SSO, normal flow runs) or fail-closed (503). Default to fail-open.

**Can I cache or reuse the token?**
No. Single-use conceptually. Your own session cookie is the renewal mechanism.

**What if a parent changes the child's email?**
The next token carries the new email. Your `upsertUser` decides whether that's the same user.

**Is there a logout?**
Not federated. The launcher clears the partition when the child closes your app.

**Five minutes — too short?**
No. The launcher mints a fresh token on every open. Five minutes is enough to load, verify, and set your cookie.

**Multi-launcher support?**
Yes. Configure multiple `(issuer, audience, jwks)` entries; dispatch by `iss`. See [`tutor.md`](./tutor.md) §7.

**No backend at all?**
Two options, both worse than having a backend: a thin serverless verifier (preferred) or the issuer's introspection endpoint (last resort, leaks the email to anyone with DevTools).

**How does the launcher know my audience?**
Static config by default — the operator types it in. Optionally, you can publish a tiny manifest at `/.well-known/edu-sso.json` so launchers can auto-detect it. See [`discovery.md`](./discovery.md). This is purely opt-in; v1 does not require it.

---

## What v1 deliberately does *not* include

- No OAuth code exchange.
- No refresh tokens.
- No full OIDC discovery — just JWKS and a token endpoint.
- No federated logout.
- No scopes or granular claims.
- No multi-tenant inside a single audience.

If you need any of these, talk to the launcher operator before implementing workarounds.

---

## Summary

1. Accept the audience id the launcher assigns you.
2. Load its JWKS at boot.
3. In your entry route: if `?edu_session=` is present, verify it, log the user in, redirect with the parameter stripped.

If it takes you more than a morning, please file an issue — something is wrong and we want to know.
