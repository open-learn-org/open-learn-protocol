# EduSSO

**Status:** v1 draft
**Goal:** the launcher already knows the child; let it hand that identity to a learning app in one signed JWT.

## Files in this directory

- [`protocol.md`](./protocol.md) — read this first. Motivation, flow, FAQ, written like a blog post for tutor implementers.
- [`issuer.md`](./issuer.md) — implementer spec for launchers and their identity service.
- [`tutor.md`](./tutor.md) — implementer spec for learning apps (relying parties).
- [`conformance.md`](./conformance.md) — consolidated checklist across both sides.
- [`examples/`](./examples/) — reference implementations (Node + jose; more to come).

## One-paragraph summary

The launcher mints a short-lived JWT containing the child's email, signed by an issuer the tutor trusts. It appends the token to the tutor URL as `?edu_session=<jwt>`. The tutor verifies the token against the issuer's public JWKS, drops its own session cookie, and redirects to strip the parameter. There is no OAuth dance, no client registration, no refresh tokens. About ten lines of code on the tutor side.

## What this spec does NOT cover

- Progress reporting — see [`../edu-progress/`](../edu-progress/).
- Class rostering, parent consent records, billing — out of scope for v1.
- Token transport mechanisms other than the URL query parameter.
- Symmetric (HS256) verification — explicitly excluded in v1.
