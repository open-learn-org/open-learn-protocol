# EduSSO v1 — Issuer / Launcher Implementation Spec

*Audience: implementers of a launcher (the host environment that knows the child) and its identity service (the issuer).*

This document specifies what a conformant EduSSO launcher must do. The companion document `tutor.md` specifies what a learning app (relying party) must do. The two are designed to be implemented independently.

---

## 1. Roles

An EduSSO deployment has three logical roles:

- **Launcher** — the application the child opens. Knows the child's identity. Loads tutors inside it (web view, iframe, or browser tab). MAY be the same process as the issuer.
- **Issuer** — the service that signs identity tokens and publishes the JWKS. MUST hold the signing private key. MAY be operated by the same organization as the launcher or be a separate service.
- **Tutor** — the learning app. The relying party. Specified in `tutor.md`.

The launcher MUST authenticate itself to the issuer (Section 6). Tutors are unauthenticated consumers of public keys.

---

## 2. Trust model

The issuer's public key is the root of trust. A tutor that has the issuer's JWKS URL and the correct audience id can verify any token the launcher hands it. There are no client secrets shared with tutors.

The launcher does *not* hold the signing key. It calls the issuer over an authenticated channel to mint tokens on demand. This separation matters: a compromised launcher (e.g. a child's device is rooted) cannot mint tokens for other children — at worst it can request tokens for the child already configured on it.

---

## 3. Endpoints the issuer MUST expose

### 3.1 JWKS endpoint

```
GET https://issuer.example.com/.well-known/jwks.json
```

- MUST be served over HTTPS.
- MUST return a JSON Web Key Set as defined in RFC 7517.
- MUST be publicly accessible without authentication.
- MUST set `Cache-Control: public, max-age=3600` or similar (1h recommended).
- MUST include all keys currently valid for verification: the active signing key and any keys in their post-rotation grace period (Section 8).
- SHOULD use stable key ids (`kid`) so verifiers can index by `kid`.

Minimal example:

```json
{
  "keys": [
    {
      "kty": "RSA",
      "use": "sig",
      "alg": "RS256",
      "kid": "2026-05-01",
      "n": "…",
      "e": "AQAB"
    }
  ]
}
```

### 3.2 Token endpoint

```
POST https://issuer.example.com/token
Authorization: Bearer <launcher_install_credential>
Content-Type: application/json

{
  "child_id": "abc123",
  "audience": "your-app-id"
}
```

- MUST be served over HTTPS.
- MUST require authentication of the calling launcher (Section 6).
- MUST validate that the requested `audience` is a tutor the launcher is permitted to launch.
- MUST validate that the requested `child_id` is bound to the authenticated launcher.
- MUST return a freshly signed JWT (Section 4) with `exp` no further than 300 seconds in the future.
- MUST NOT return the same JWT twice (the `jti` claim must be unique per call).
- Response shape:

```json
{
  "token": "eyJ…",
  "expires_in": 300
}
```

- Error responses MUST use standard HTTP status codes:
  - `401` unauthenticated launcher
  - `403` launcher not permitted to mint for this child or audience
  - `404` unknown audience
  - `429` rate limited
  - `5xx` issuer fault

### 3.3 Introspection endpoint (OPTIONAL)

For tutors that cannot run server-side verification (Section 9 of `tutor.md`).

```
GET https://issuer.example.com/v1/introspect?token=<jwt>
```

- MUST verify the token as a verifier would.
- MUST return `{ "active": false }` for any invalid token, with no further detail.
- MUST return `{ "active": true, "email": "...", "name": "...", "exp": ..., "aud": "..." }` for a valid one.
- MUST be rate-limited per source IP.
- MAY be omitted entirely; tutors that need it but cannot find it are conformant in failing.

---

## 4. The token

The issuer MUST emit JWTs conforming to RFC 7519, signed with an asymmetric algorithm.

### 4.1 Algorithms

- MUST support RS256.
- SHOULD support EdDSA (Ed25519) for new deployments.
- MUST NOT issue tokens with `alg: none`.
- MUST NOT issue tokens with HS256 or any symmetric algorithm via this endpoint. (Symmetric pre-shared schemes are out of scope for v1 and discussed only in `tutor.md` §10 as an alternative deployment.)

### 4.2 Header

```json
{ "alg": "RS256", "typ": "JWT", "kid": "2026-05-01" }
```

- MUST include `kid` matching the JWKS entry that signed the token.

### 4.3 Claims

Required:

| Claim | Type | Meaning |
|---|---|---|
| `iss` | string | Stable HTTPS URL identifying this issuer. MUST equal the URL prefix tutors use to fetch the JWKS, minus `/.well-known/jwks.json`. |
| `aud` | string | The audience id the launcher requested. MUST match exactly what was registered for the target tutor. |
| `sub` | string | Opaque, stable per-child identifier within this issuer. RECOMMENDED format: `child:<id>`. MUST NOT contain PII. |
| `email` | string | The child's email address. |
| `email_verified` | boolean | MUST be `true` if and only if the launcher has verified the email out of band. |
| `iat` | number | Issued-at, seconds since epoch. |
| `exp` | number | Expiry, seconds since epoch. MUST be `iat + 300` or less. |
| `jti` | string | Unique token id (UUID, ULID, or similar). |

Optional:

| Claim | Type | Meaning |
|---|---|---|
| `name` | string | Display name. |
| `locale` | string | BCP-47 tag (e.g. `en-US`, `es-AR`). |
| `nbf` | number | Not-before. If omitted, assume `iat`. |

The issuer MUST NOT include claims beyond what is necessary to identify the child to the tutor. In particular: no parent email, no payment information, no device identifiers.

### 4.4 Audience model

- An *audience id* is a short opaque string identifying a single tutor product as configured at this issuer.
- Audience ids are scoped to the issuer; two issuers MAY assign different audience ids to the same tutor.
- The issuer MAY allow one tutor to be registered under multiple audience ids (for staging vs. production environments, for example), but each mint call MUST resolve to exactly one.

---

## 5. Key management

### 5.1 Generation

- Use a cryptographically secure generator (HSM, KMS, or `openssl genrsa`/`openssl genpkey` with RSA ≥ 2048 bits or Ed25519).
- The private key MUST NOT be checked into source control or exposed in logs.

### 5.2 Storage

- Private key SHOULD live in an HSM, KMS, or equivalent (AWS KMS, GCP KMS, Azure Key Vault).
- If stored as a file, MUST be readable only by the issuer process user and MUST NOT be backed up to systems with broader access (e.g. unencrypted CI artifacts).

### 5.3 Rotation

- The issuer MUST be able to rotate signing keys without taking the JWKS endpoint offline.
- Rotation procedure:
  1. Generate new key. Add it to the JWKS as `use: sig` with a new `kid`.
  2. Continue signing with the *old* key for a grace period (≥ 1 hour) so JWKS caches in tutors update.
  3. Switch signing to the new key. Both keys remain in the JWKS during a second grace period (≥ 24 hours) so tokens minted just before the switch remain verifiable.
  4. Remove the old key from the JWKS.
- The issuer SHOULD rotate keys at least annually and immediately on suspected compromise.

---

## 6. Launcher authentication

The launcher authenticates to the issuer's `/token` endpoint. The issuer MUST verify that the calling launcher is permitted to mint for the requested `child_id`.

v1 leaves the mechanism unspecified but RECOMMENDS one of:

- **Install credential**: a long-lived Bearer token issued at the time of launcher installation, bound to a single child. The launcher stores it locally (OS keychain). Compromise of the device's keychain leaks the credential for that child only.
- **mTLS**: each launcher install has its own client certificate, bound to a single child.
- **OAuth client credentials**: the launcher is registered as a client of the issuer's authorization server.

What the issuer MUST NOT do:

- MUST NOT accept unauthenticated mint requests.
- MUST NOT allow a launcher install bound to child A to mint tokens for child B.
- MUST NOT log full credentials.

---

## 7. Launching a tutor

This section specifies what the *launcher* (not the issuer) does when the child opens a tutor.

1. The launcher resolves the tutor's base URL and its audience id from its local catalog.
2. The launcher calls `POST /token` with `{ child_id, audience }` and receives a token.
3. The launcher loads the tutor URL with `?edu_session=<token>` appended.
4. The launcher MUST inject `Referrer-Policy: no-referrer` on requests to the tutor's origin until the first redirect that removes `edu_session` from the URL.
5. The launcher MUST isolate cookie storage per-tutor: cookies set by tutor A are unreachable to tutor B. (In Electron, this maps to `session.fromPartition("persist:tutor-<appId>")`.)
6. The launcher SHOULD strip `edu_session` from any URL it displays to the user, even before the tutor's redirect lands.

The launcher MUST NOT:

- Reuse a token across openings of the same tutor.
- Pass the token by any channel other than the query parameter `edu_session`. (Headers, postMessage, and body parameters are out of scope for v1.)
- Cache the token in any persistent storage. The token lives only for the duration of the open call.

When the child closes the tutor from the launcher UI, the launcher MUST clear the tutor's cookie partition (`session.clearStorageData()` equivalent). This is the spec's only logout mechanism.

---

## 8. Operational requirements

- The JWKS endpoint MUST have ≥ 99.9% availability target. JWKS outages break new logins across the whole tutor ecosystem.
- The token endpoint MAY have lower availability; tutors with valid sessions are unaffected.
- The issuer MUST emit structured logs of mint calls including `iss`, `aud`, `sub`, `jti`, and timestamp. These logs are the audit trail for "who saw which child."
- The issuer SHOULD rate-limit per-launcher and per-child mint calls (e.g. 60/min).
- Clock skew: the issuer MUST use NTP. Tutors are spec'd to tolerate 5s of clock skew (`tutor.md` §3.2); the issuer should stay well within that.

---

## 9. Privacy

- The token contains PII (email, name). Treat it as sensitive.
- The mint log contains a record of "child X used tutor Y at time T." This is observational data subject to whatever the operator's privacy policy permits. The spec is silent on retention; operators MUST publish their policy.
- The introspection endpoint, if exposed, MUST NOT return mint logs or aggregate data; only single-token verification.

---

## 10. Multi-tutor and multi-launcher behavior

- A single issuer MAY serve many tutors. Each is identified by its `aud` id.
- A single tutor MAY be onboarded with multiple issuers (multi-launcher tutor). Each issuer gives the tutor its own `iss` URL and (typically) its own `aud` id. From the issuer's perspective this requires no special handling; the tutor's verifier (see `tutor.md` §7) dispatches by `iss`.

---

## 11. Conformance checklist

A launcher + issuer pair conforms to EduSSO v1 if all of the following are true:

- [ ] JWKS endpoint served over HTTPS at a stable URL.
- [ ] JWKS includes `kty`, `use: sig`, `alg`, `kid` for each key.
- [ ] Token endpoint requires launcher authentication.
- [ ] Tokens are signed with RS256 or EdDSA.
- [ ] Tokens contain `iss`, `aud`, `sub`, `email`, `email_verified`, `iat`, `exp`, `jti`.
- [ ] `exp - iat` ≤ 300 seconds.
- [ ] Different mint calls produce different `jti`.
- [ ] `kid` in the header matches a key currently in the JWKS.
- [ ] Key rotation can complete without JWKS downtime.
- [ ] Launcher passes the token via `?edu_session=` in the URL, not via header or message.
- [ ] Launcher injects `Referrer-Policy: no-referrer` for the tutor origin until the parameter is stripped.
- [ ] Launcher uses isolated cookie storage per tutor.
- [ ] Launcher does not cache or reuse tokens.

---

## 12. Versioning

This document specifies v1. Forward-compatible changes (new optional claims, additional algorithms) MAY be released without a new spec version. Breaking changes (removal of required claims, change of signing algorithm requirements) MUST increment the version. Tutors and launchers indicate the version they support out of band; there is no in-protocol version negotiation in v1.
