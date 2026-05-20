# RFC process

Substantive changes to any spec go through an RFC before being folded into `specs/`.

## When to file an RFC

- New event types or claims.
- New endpoints or transports.
- Changed semantics of an existing field.
- New specs in this repository.

## When NOT to file an RFC

- Typos and clarifications. Open a PR directly.
- Example code changes.
- README/governance edits.

## Process

1. Copy `0000-template.md` to `rfcs/NNNN-short-title.md`. Use the next available number.
2. Fill it in. Be specific about motivation and the change you want; vague RFCs collect vague comments.
3. Open a pull request. The PR is where discussion happens.
4. Comment window is two weeks minimum for changes to existing specs, four weeks for new specs.
5. Editors merge the RFC when there is rough consensus and the spec changes have been folded into `specs/`. The RFC itself stays in `rfcs/` as historical record.

## Status

An RFC is in one of these states, recorded in its frontmatter:

- `draft` — open for comment.
- `accepted` — folded into a spec; the RFC is historical.
- `declined` — explicitly rejected; the RFC is historical, with a reason in the frontmatter.
- `superseded` — replaced by a later RFC.

A declined RFC isn't shameful; it's documentation that we considered the change. Don't delete declined RFCs.
