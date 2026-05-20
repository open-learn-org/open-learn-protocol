# Open Learn Protocol

Open standards for interoperability between **launchers** (the apps where a child sits down to learn) and **learning apps** (tutors, games, reading coaches, anything educational).

The goal: make it cheap and obvious for a learning app to be a good citizen inside any launcher, and for any launcher to host any learning app, without proprietary lock-in.

## Specs

| Spec | Status | What it solves |
|---|---|---|
| [EduSSO](./specs/edu-sso/) | v1 draft | The launcher already knows who the child is. EduSSO hands that identity to the learning app in a verifiable form, with about ten lines of code on the app side. |
| [EduProgress](./specs/edu-progress/) | v1 draft | The learning app knows what the child did. EduProgress emits structured progress events to a collector (typically the launcher or a parent dashboard) so that progress is portable across apps. |

Each spec is independently implementable. You can adopt EduSSO without EduProgress, or the other way around. They're designed to compose when you want both.

## Status

This repository is at **draft v1**. Specs are written, examples are partial, conformance suites do not yet exist. Implementations are welcome and feedback drives the next revision.

## Structure

```
specs/<name>/
  README.md          one-page overview + status
  protocol.md        the spec as you'd read it on a blog (motivation, flow, FAQ)
  *.md               implementer specs (one per role)
  conformance.md     consolidated checklist
  schema/            JSON schemas if applicable
  examples/          reference implementations
rfcs/                in-flight proposals not yet folded into specs/
```

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md). Substantive changes go through the [RFC process](./rfcs/README.md). Editorial fixes can be pull requests directly.

## License

Spec text: [CC-BY-4.0](./LICENSE). Example code: MIT (see each example's directory).
