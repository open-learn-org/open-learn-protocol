# EduProgress v1 — Reporter Implementation Spec

*Audience: implementers of a learning app that emits progress events.*

This document specifies what a conformant EduProgress reporter must do. The companion document [`collector.md`](./collector.md) specifies what a collector must do. The two are designed to be implemented independently.

If you implement only what's in this document, your learning app will integrate with any EduProgress-conformant collector.

---

## 1. Role

A **reporter** is the producer side of EduProgress. It is typically embedded in a learning app and emits structured events to a collector identified at onboarding.

A reporter holds:

- A collector ingest URL.
- A bearer token issued by the collector.
- A reference to the child's identity (from EduSSO, or however the app authenticates).
- A reference to itself (an `app_id` assigned by the collector, plus optionally a build version).

---

## 2. Event envelope

Every event emitted by the reporter MUST conform to the envelope schema at [`schema/event.schema.json`](./schema/event.schema.json):

```json
{
  "event_id": "<ULID or UUIDv7>",
  "type": "<core event type>",
  "occurred_at": "<RFC 3339 timestamp>",
  "child_ref": { ... },
  "app_ref": { "app_id": "...", "version": "..." },
  "session_id": "<ULID>",
  "data": { /* type-specific */ }
}
```

### 2.1 `event_id`

- MUST be unique across all events ever emitted by this reporter.
- ULID (preferred) or UUIDv7. Both are time-ordered and collision-resistant.
- The collector uses this for idempotency; emitting the same `event_id` twice MUST result in the event being stored at most once.

### 2.2 `type`

- MUST be one of the registered core types (Section 4).
- MUST be exact-cased and dotted (`session.started`, not `Session.Started` or `session_started`).
- v1 does not allow custom top-level types. If you need one, propose an RFC.

### 2.3 `occurred_at`

- RFC 3339 timestamp, UTC, with millisecond precision.
- MUST be the reporter's best estimate of when the event happened, not when it was batched or sent.
- The collector trusts this value; backdating beyond a sensible window (e.g. 7 days) MAY be rejected.

### 2.4 `child_ref`

A reporter MUST populate at least one of:

- `iss` + `sub` — when EduSSO is in play, lifted from the verified SSO token.
- `email` — when only an email is known.
- `child_id` — when the collector assigned its own id at onboarding (preferred when available).

A reporter MAY populate more than one for the collector's convenience. The collector decides which it uses for matching.

A reporter MUST NOT include data in `child_ref` other than these three keys.

### 2.5 `app_ref`

- `app_id` — the identifier the collector assigned this reporter at onboarding. Required.
- `version` — your build/version string. Optional, useful for debugging.

### 2.6 `session_id`

- ULID generated at session start.
- The same `session_id` MUST be reused for every event of that session, ending with `session.ended`.
- If your app has overlapping concurrent sessions (rare), use distinct `session_id`s.

---

## 3. Core event types

The six types defined in v1. Each has a payload schema in [`schema/`](./schema/).

| Type | When to emit |
|---|---|
| `session.started` | Child begins using your app. Once per session. |
| `session.ended` | Session ends, for any reason. Once per session. |
| `activity.started` | Child begins a unit of work (lesson, exercise, level). |
| `activity.completed` | The unit of work ends with a result. |
| `skill.progress` | Mastery of a tracked skill changes meaningfully. |
| `struggle.signal` | You detect stuck, repeated errors, rapid clicks, or abandonment. |

See [`protocol.md`](./protocol.md) §"Core event types" for the data shapes.

A reporter MUST emit `session.started` before any other event for a session, and `session.ended` last. Out-of-order arrival at the collector is acceptable (collectors are spec'd to handle it), but the reporter MUST emit in order.

A reporter MUST emit `session.ended` even when the session ends abnormally (crash, kill). On startup it SHOULD check for unflushed events from a prior session and synthesize a `session.ended` with `reason: "unknown"` if missing.

---

## 4. Transport

### 4.1 Endpoint

```
POST <collector_url>/v1/events
Authorization: Bearer <reporter_token>
Content-Type: application/json
Idempotency-Key: <ulid>             // optional, batch-level
```

Body:

```json
{ "events": [ /* envelope objects */ ] }
```

### 4.2 Batching

- Reporters MUST NOT send batches larger than 500 events or 1 MB, whichever is smaller.
- Reporters SHOULD flush every 10 seconds or every 50 events, whichever comes first.
- Reporters MAY send a batch of one for time-critical events (uncommon).

### 4.3 Retry

- Reporters MUST retry transient failures: `5xx`, `429`, and network errors.
- Backoff: exponential with full jitter, base 1 s, cap 5 min, give-up at 24 h.
- `429` responses MUST honor `Retry-After` if present.
- Reporters MUST NOT retry `4xx` other than `429`. Log and move on.

### 4.4 Idempotency

- The reporter is allowed and expected to resend the same `event_id` after a transient failure.
- The collector deduplicates by `event_id`. The reporter does not need to track this.

### 4.5 Local durability

- A reporter SHOULD persist unflushed events locally (e.g. SQLite, disk file) so a crash does not lose data.
- A reporter SHOULD prune events older than 7 days that failed to flush; the collector likely won't accept them anyway.

---

## 5. Identity coordination with EduSSO

When EduSSO is in play:

- The reporter receives the SSO token at app entry.
- It extracts `iss` and `sub` from the verified payload.
- It populates `child_ref = { iss, sub, email }` on every event.

When EduSSO is not in play:

- The reporter uses whatever identity it has (its own login system, an OAuth provider, etc.) and chooses a stable identifier to put in `child_ref.email` or `child_ref.child_id`.

A reporter MUST NOT emit events for a child it has not currently authenticated. If the user logs out, the reporter MUST flush remaining events and stop emitting until the next login.

---

## 6. Error handling

- `2xx` with `results` containing rejections: log the rejected events with their reason. Do not retry. Investigate; the schema likely changed or the reporter has a bug.
- `4xx` other than `429`: do not retry. Surface to operators. Common causes: expired token (`401`), revoked app (`403`), invalid request body (`400`).
- `5xx`: retry with backoff.
- `429`: retry honoring `Retry-After`.
- Network errors: retry with backoff.
- DNS failures: retry with backoff.

A reporter SHOULD expose a health check ("collector reachable", "events queued", "oldest unflushed event age") for operators.

---

## 7. Privacy and PII

- The envelope contains the child's email or other identifiers. Treat events as sensitive.
- A reporter MUST NOT include open-ended user-generated content (essay answers, chat messages, photo data) in `data`. Use opaque references if you need to point to such content.
- A reporter MUST NOT log full event payloads at info level or above. Debug-level logging of payloads is acceptable but should be off by default in production.
- Local buffer files MUST be readable only by the reporter process user.

---

## 8. Conformance checklist

- [ ] Every event conforms to `event.schema.json`.
- [ ] Every event's `data` conforms to the schema for its `type`.
- [ ] `event_id` is unique per emitted event.
- [ ] `occurred_at` reflects when the event happened, not when it was batched.
- [ ] `child_ref` populated with at least one of `iss+sub`, `email`, `child_id`.
- [ ] Sessions bracketed by `session.started` and `session.ended` with the same `session_id`.
- [ ] Batches ≤ 500 events and ≤ 1 MB.
- [ ] Transient failures retried with backoff, `4xx` (non-`429`) not retried.
- [ ] `Retry-After` honored on `429`.
- [ ] Same `event_id` resent on retry; not re-randomized.
- [ ] Local durability across crashes.
- [ ] No user-generated content in `data`.
- [ ] No event payloads logged at info+ levels.
