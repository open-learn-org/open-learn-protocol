# EduProgress

**Status:** v1 draft
**Goal:** the learning app knows what the child did; let it emit that to a collector in a portable shape, so progress survives across apps and shows up in parent dashboards without a custom integration per pair.

## Files in this directory

- [`protocol.md`](./protocol.md) — read this first. Motivation, model, transport, FAQ.
- [`reporter.md`](./reporter.md) — implementer spec for learning apps (event producers).
- [`collector.md`](./collector.md) — implementer spec for launchers, dashboards, or any system that consumes progress events.
- [`conformance.md`](./conformance.md) — consolidated checklist.
- [`schema/`](./schema/) — JSON Schemas for the event envelope and each core event type.
- [`examples/`](./examples/) — reference implementations (Node + ajv; more to come).

## One-paragraph summary

The learning app emits structured events (`session.started`, `activity.completed`, `skill.progress`, `struggle.signal`, etc.) to a collector over HTTPS, in batches. Each event has a small mandatory envelope (`event_id`, `type`, `occurred_at`, `child_ref`, `app_ref`) and a type-specific payload validated against a JSON Schema. The collector is identified statically per learning app at onboarding; auth is a bearer token. No streaming, no analytics, no shared taxonomy — just ingest.

## Relationship to EduSSO

EduProgress and EduSSO compose but don't depend on each other. If both are deployed, the `child_ref` in events references the same identity model as EduSSO (the `(iss, sub)` pair from the SSO token, or the verified email). If only EduProgress is deployed, the learning app uses whatever identity it has.

## What this spec does NOT cover

- A shared taxonomy of skills or topics. `skill_id` and `topic` are opaque strings, defined by the app.
- Streaming or push-to-subscriber transports. Batched HTTPS is the only transport in v1.
- Analytics, queries, or dashboards. The collector is just an ingest endpoint.
- Storage requirements on the collector side. Retention and aggregation are out of scope.
