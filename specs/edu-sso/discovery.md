# EduSSO Discovery (optional)

**Status:** v1 draft, optional extension
**Audience:** tutor implementers who want to be auto-registered by launchers; launcher operators who want to onboard tutors without manual config swaps.

The core protocol (see [`protocol.md`](./protocol.md)) assumes the launcher already knows a tutor's `audience` and the tutor already knows the launcher's `issuer`. That's fine for handcrafted integrations, and it's intentionally what v1 ships. This document describes a small, opt-in discovery manifest a tutor MAY publish so launchers can register it programmatically.

It is **not** OIDC discovery. There is no dynamic client registration, no metadata exchange, no negotiation. The manifest is a static JSON file with three fields.

---

## 1. The manifest

A tutor that supports EduSSO MAY serve a JSON document at:

```
GET https://<tutor-origin>/.well-known/edu-sso.json
```

Response:

```json
{
  "version": 1,
  "audience": "tutor.example.com",
  "issuers": ["https://issuer.launcher-a.com", "https://issuer.launcher-b.com"]
}
```

Field semantics:

| Field | Type | Required | Meaning |
|---|---|---|---|
| `version` | number | yes | Protocol version. `1` for this document. |
| `audience` | string | yes | The exact value the tutor expects in the `aud` claim. Usually the tutor's canonical hostname or an opaque id assigned by the operator. |
| `issuers` | string[] | no | Issuer URLs (`iss` values) the tutor will accept. If absent or empty, the tutor accepts any issuer the launcher has previously been configured with — i.e. "trust the launcher's allow-list." Most tutors should omit this. |

The manifest MUST be served with `Content-Type: application/json` and SHOULD be cacheable (`Cache-Control: public, max-age=3600` is reasonable).

---

## 2. What the launcher does with it

When a launcher operator registers a tutor URL, the launcher SHOULD:

1. Resolve the tutor's origin (scheme + host + port).
2. `GET <origin>/.well-known/edu-sso.json` with a short timeout (≤5s) and no credentials.
3. If the response is 200 with valid JSON matching the schema above, mark the tutor as EduSSO-capable and store its `audience`.
4. If the response is 404, non-JSON, malformed, or the `version` is unknown, mark the tutor as EduSSO-unsupported and continue. **Discovery failure is not an error condition for the launcher** — the tutor simply isn't EduSSO-aware.

The launcher MAY re-run discovery on demand (e.g. an "rediscover" button in admin UI) or on a schedule. It MUST NOT block tutor launches on discovery freshness.

---

## 3. What the tutor implements

Just one static file. No code.

```
# Next.js: public/.well-known/edu-sso.json
# Static hosts: drop the file at the appropriate path
# Express: app.get('/.well-known/edu-sso.json', (_, res) => res.json({ ... }))
```

The tutor SHOULD keep this file in source control alongside its issuer/audience configuration so the two cannot drift.

---

## 4. What discovery does NOT do

To keep this extension boring:

- It does **not** convey the tutor's redirect URI — there isn't one (see §1 of `protocol.md`).
- It does **not** publish a JWKS for the tutor — the tutor is the relying party, it does not sign anything.
- It does **not** declare supported algorithms, scopes, claims, or token transports — those are fixed by v1.
- It is **not** a registration protocol. The launcher operator still decides whether to trust the tutor; the manifest only makes the audience value self-serve.

If you find yourself wanting to add fields, prefer publishing a separate document at a different `.well-known/` path. Keep this one minimal.

---

## 5. Threat notes

- **Tampering in transit:** the manifest is served over HTTPS; a MITM that can rewrite TLS responses can already do worse. No additional signature is required.
- **Audience squatting:** a malicious tutor could claim an `audience` already in use by another tutor. Launchers MUST treat the discovered `audience` as a *proposal* — the operator approves the registration. Discovery does not grant trust on its own.
- **SSRF via the discovery fetch:** launchers SHOULD restrict discovery to public HTTPS origins, refuse private IP ranges, and bound the response size (≤16 KiB is plenty).

---

## 6. Conformance

A tutor's discovery manifest conforms to EduSSO Discovery v1 if:

- [ ] Served at `/.well-known/edu-sso.json` over HTTPS.
- [ ] `Content-Type: application/json`.
- [ ] JSON object with `version: 1` and a non-empty string `audience`.
- [ ] If `issuers` is present, it is an array of HTTPS URL strings.
- [ ] Response body ≤16 KiB.

A launcher conforms if it treats missing/malformed manifests as "not EduSSO-capable" rather than as errors, and never blocks a tutor launch on discovery.
