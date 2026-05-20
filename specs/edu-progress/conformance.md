# EduProgress v1 — Conformance Checklist

Consolidated from `reporter.md` §8 and `collector.md` §9.

## Reporter

- [ ] Every event conforms to `event.schema.json`.
- [ ] Every event's `data` conforms to the schema for its `type`.
- [ ] `event_id` is unique per emitted event (ULID or UUIDv7).
- [ ] `occurred_at` reflects event time, not batch time.
- [ ] `child_ref` populated with at least one of `iss+sub`, `email`, `child_id`.
- [ ] Sessions bracketed by `session.started` and `session.ended` with the same `session_id`.
- [ ] Batches ≤ 500 events and ≤ 1 MB.
- [ ] Transient failures retried with exponential backoff; `4xx` (non-`429`) not retried.
- [ ] `Retry-After` honored on `429`.
- [ ] Same `event_id` reused on retry.
- [ ] Local durability across crashes.
- [ ] No user-generated content in `data`.
- [ ] No event payloads logged above debug level.

## Collector

- [ ] HTTPS-only ingest endpoint at `POST /v1/events`.
- [ ] Bearer authentication required.
- [ ] Tokens scoped to a single reporter / `app_id`.
- [ ] Envelope validated against `event.schema.json`.
- [ ] `data` validated against the schema for `type`.
- [ ] Per-event rejection (not whole-batch) when only some events are invalid.
- [ ] Deduplication by `event_id` for at least 30 days.
- [ ] `received_at` recorded if storing.
- [ ] `data` not mutated by the collector.
- [ ] `Retry-After` set on `429`.
- [ ] Standard rejection reason codes used; custom reasons documented.
- [ ] Structured logs segmented by `app_id`.
- [ ] Privacy and retention policies published.
- [ ] Deletion mechanism exists (out-of-band acceptable in v1).
