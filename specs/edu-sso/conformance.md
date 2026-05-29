# EduSSO v1 — Conformance Checklist

Consolidated from `issuer.md` §11 and `tutor.md` §13. Use this as a single page when verifying an implementation.

## Launcher + Issuer

- [ ] JWKS endpoint served over HTTPS at a stable URL.
- [ ] JWKS includes `kty`, `use: sig`, `alg`, `kid` for each key.
- [ ] Token endpoint requires launcher authentication.
- [ ] Tokens signed with RS256 or EdDSA.
- [ ] Tokens contain `iss`, `aud`, `sub`, `email`, `email_verified`, `iat`, `exp`, `jti`.
- [ ] `exp - iat` ≤ 300 seconds.
- [ ] Distinct mint calls produce distinct `jti`.
- [ ] `kid` in the JWT header matches a key currently in the JWKS.
- [ ] Key rotation completes without JWKS downtime.
- [ ] Launcher passes the token via `?edu_session=` in the URL.
- [ ] Launcher injects `Referrer-Policy: no-referrer` for the tutor origin until the parameter is stripped.
- [ ] Launcher isolates cookie storage per tutor.
- [ ] Launcher does not cache or reuse tokens.

## Tutor

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
- [ ] Falls through silently on verification error (no error surface to the child).
- [ ] Does not log the full request URL when `edu_session` is present.
- [ ] Multi-launcher: dispatches by `iss` to the correct verifier; rejects unknown issuers.

A pair (launcher+issuer, tutor) conforms to EduSSO v1 when every box that applies to its role is checked. There is no automated suite in v1; conformance is by inspection.
