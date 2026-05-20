# Contributing to Open Learn Protocol

## Two kinds of changes

**Editorial.** Typos, broken links, clearer phrasing, example bugs. Open a pull request against `main`. Maintainers merge with one approval.

**Substantive.** New claims, new endpoints, changed semantics, new specs. File an RFC first. See [`rfcs/README.md`](./rfcs/README.md).

If you're unsure which category your change falls into, open an issue and ask. We'd rather discuss for an hour than churn through a 200-comment PR.

## Style

Specs are written to be read by implementers in a single sitting. That means:

- Plain prose, not legalese. Use RFC 2119 keywords (`MUST`, `SHOULD`, `MAY`) only where the requirement is normative; reserve them for rules, not rationale.
- Code samples in the spec text are illustrative, not normative. Real reference implementations go in `examples/`.
- Tables for enumerations, prose for explanations.
- One file per implementer role (issuer, tutor, reporter, collector). Don't make implementers read sections aimed at the other side.

## Versioning

Each spec has its own semantic version line in its `README.md`. Backwards-compatible additions bump minor. Breaking changes bump major and create a new file (`v2.md`); the old version stays available.

## Discussion

Use issues and pull requests. Real-time chat is fine for clarification but decisions are made in writing in the repo.
