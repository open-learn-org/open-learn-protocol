# EduProgress v1 — Collector Implementation Spec

*Audience: implementers of a collector — typically a launcher backend, a parent dashboard, a school admin tool, or a learning analytics service.*

This document specifies what a conformant EduProgress collector must do. The companion document [`reporter.md`](./reporter.md) specifies what a reporter must do.

---

## 1. Role

A **collector** is the consumer side of EduProgress. It exposes a single HTTPS endpoint that accepts batches of events from authenticated reporters, validates them, deduplicates them, and stores or forwards them per its own policy.

A collector MUST:

- Validate every incoming event against the envelope and per-type schemas.
- Deduplicate by `event_id` so retries are safe.
- Authenticate each request via a bearer token bound to a single reporter (one app).
- Respond with a per-event acceptance result on `2xx`.

A collector MAY:

- Forward events to downstream systems (analytics, dashboards, notifications).
- Enrich events with `received_at`, derived `child_id`, or other operator-managed fields.
- Reject events older than a sensible window (e.g. 7 days) as stale.

A collector does NOT:

- Push to subscribers, schedule callbacks, or run queries on behalf of reporters.
- Define skill or topic taxonomies.
- Provide a UI; that's the dashboard's job, not the protocol's.

---

## 2. The ingest endpoint

```
POST <base_url>/v1/events
Authorization: Bearer <reporter_token>
Content-Type: application/json
```

Body:

```json
{ "events": [ /* envelope objects */ ] }
```

### 2.1 Authentication

- MUST require a bearer token on every request.
- Tokens MUST be bound to exactly one reporter (`app_ref.app_id`).
- The collector MUST reject events whose `app_ref.app_id` does not match the token's bound app, with `403` per-event reject reason (not a whole-batch failure).
- Tokens MAY be rotated; rotation is an operator concern, not a protocol concern.

### 2.2 Validation

For each event in the batch:

1. Validate the envelope against `schema/event.schema.json`.
2. Resolve the type-specific schema (e.g. `schema/activity-completed.schema.json`) and validate `data` against it.
3. Verify the event is fresh enough (`occurred_at` within the collector's retention window).
4. Verify `app_ref.app_id` matches the authenticated reporter.

Validation failures MUST be returned per-event, not as a whole-batch failure, when the request body is parseable. A `400` whole-batch response is reserved for malformed JSON or missing top-level `events`.

### 2.3 Deduplication

- The collector MUST treat events with the same `event_id` as duplicates and store at most one.
- Deduplication MUST hold for at least 30 days after first acceptance.
- If a duplicate `event_id` arrives with a different payload, the collector MUST keep the first and MAY log the conflict for operators.

### 2.4 Response

Standard accepted response:

```json
{
  "accepted": 47,
  "rejected": 3,
  "results": [
    { "event_id": "...", "status": "accepted" },
    { "event_id": "...", "status": "rejected", "reason": "schema_invalid", "detail": "data.level out of range" }
  ]
}
```

- Status code: `202 Accepted` when at least one event was accepted.
- Status code: `400 Bad Request` when the batch is malformed JSON or `events` is missing.
- Status code: `401 Unauthorized` when the bearer token is missing or invalid.
- Status code: `403 Forbidden` when the token is valid but lacks permission (rare; usually surfaces as per-event rejection).
- Status code: `413 Payload Too Large` when the batch exceeds size limits.
- Status code: `429 Too Many Requests` with `Retry-After` when rate-limited.
- Status code: `5xx` for collector errors; reporters retry.

The `results` array MAY be omitted when all events were accepted. When any rejections occurred, `results` MUST contain at least the rejection entries.

### 2.5 Rejection reasons

Standard reason codes:

| `reason` | Meaning |
|---|---|
| `schema_invalid` | Envelope or `data` failed schema validation. `detail` includes a human-readable summary. |
| `duplicate` | An event with this `event_id` was already accepted. Not an error; reporters can treat as accepted. |
| `stale` | `occurred_at` is older than the collector's retention window. |
| `app_mismatch` | `app_ref.app_id` does not match the authenticated token. |
| `unknown_child` | `child_ref` did not resolve to a known child and the collector requires resolution. (Most collectors won't use this; they upsert.) |
| `internal` | The collector encountered an error specific to this event. Reporters MAY retry; collectors SHOULD return `5xx` instead when possible. |

Collectors MAY define additional reasons but MUST document them.

---

## 3. Persistence and forwarding

The protocol does not specify how events are stored. Collectors choose between:

- **Store**: durable persistence keyed by `event_id`, with indexes on `(child_ref, occurred_at)`.
- **Forward**: relay to a downstream system (Kafka, BigQuery, an LMS) without persisting locally.
- **Both**: store with a short TTL, forward to permanent storage.

A collector that stores MUST record `received_at` when the event lands.

A collector MUST NOT mutate `data` fields. Enrichment goes alongside, not on top of.

---

## 4. Identity resolution

A collector receives `child_ref` with one or more of `(iss, sub)`, `email`, `child_id`. Resolution policy is the collector's choice; common patterns:

- **Match by `child_id` if present, else by `(iss, sub)`, else by `email`.** Most robust. Use when reporters might send any combination.
- **Match by `email` always.** Simplest. Use when the collector's domain is "this child" and not "this child as seen through this launcher."
- **Reject events without `child_id`.** Strictest. Use when the collector assigns its own ids and reporters are expected to keep them.

A collector MUST document its resolution policy at onboarding so reporters can populate `child_ref` correctly.

A collector MUST NOT create a new child record from event metadata alone; new children are created out of band (by EduSSO onboarding, by an admin, etc.).

---

## 5. Rate limiting

- A collector MAY rate-limit per reporter token.
- `429` responses MUST include `Retry-After` (seconds or HTTP-date).
- Limits SHOULD be generous enough that a well-behaved reporter (10 s flush, ≤ 50 events) never hits them.

---

## 6. Operational requirements

- The ingest endpoint MUST have a documented SLA. The protocol does not mandate a level, but reporters need to know what to expect for retry tuning.
- The collector MUST emit structured logs of ingest decisions including `event_id`, `type`, `app_id`, decision, and reason (on rejection). These are the audit trail.
- The collector SHOULD expose metrics segmented by `app_id` (accepted, rejected by reason, latency).

---

## 7. Privacy

- Events contain PII. The collector's storage, access, and retention policies MUST be published.
- The collector MUST support deletion requests for a child's events (per applicable regulation: GDPR, COPPA, etc.). The mechanism is out of scope for v1.
- The collector SHOULD redact event payloads in logs above debug level.

---

## 8. Versioning

- The endpoint path includes `v1`. Future major versions MUST use a new path (`v2/events`).
- Collectors MAY accept multiple versions concurrently during a transition.
- Within v1, additional event types and `data` fields MAY be added; reporters using older schemas remain conformant.

---

## 9. Conformance checklist

- [ ] HTTPS-only ingest endpoint at `POST /v1/events`.
- [ ] Bearer authentication required.
- [ ] Tokens scoped to a single reporter / `app_id`.
- [ ] Envelope validated against `event.schema.json`.
- [ ] `data` validated against the schema for `type`.
- [ ] Per-event rejection (not whole-batch) when only some events are invalid.
- [ ] Deduplication by `event_id` for at least 30 days.
- [ ] `received_at` recorded if storing.
- [ ] `data` not mutated.
- [ ] `Retry-After` set on `429`.
- [ ] Standard rejection reason codes used; custom reasons documented.
- [ ] Logs structured and segmented by `app_id`.
- [ ] Privacy and retention policies published.
- [ ] Deletion mechanism exists (out-of-band is acceptable in v1).
