# Contributing to tgx

Thanks for your interest. tgx is an opinionated framework, so contributions
that keep the API small and one-way are the most welcome.

## Development

```bash
git clone https://github.com/yerdaulet-damir/tgx.git
cd tgx
npm install
npm run build      # build all packages
npm run typecheck  # type-check without emitting
npm test           # run the engine test suite
```

Requires Node.js 22+ (the test runner uses native `--experimental-strip-types`).

## Guidelines

- **One way to do each thing.** The core value of tgx is that there is a single
  correct pattern for every task. New API that adds a synonym for an existing pattern
  will be declined — extend the existing one instead.
- **Keep the core small.** New capabilities usually belong in `tgx-kit` (copy-in
  components), not in `tgx`.
- **Tests.** Engine changes need a test in `test/`. Run `npm test` before opening a PR.
- **Types.** `npm run typecheck` must pass. The repo is TypeScript strict.
- **Docs.** If you change public API, update `README.md` and `AGENTS.md` so agents stay
  correct.

## Pull requests

Keep PRs focused on one change. Describe the motivation and, for API changes, show the
before/after in bot code. Reference any related issue.

## Reporting bugs

Open an issue with a minimal reproduction (the smallest bot that shows the problem) and
your Node.js version.
