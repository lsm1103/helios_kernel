# Repository Guidelines

## Project Structure & Module Organization
- The repository is currently documentation-first. Core content lives in `docs/`.
- `docs/Core Domain.md` defines domain concepts and system boundaries.
- `docs/Task & Session 不可变规格.md` defines immutable operating rules.
- Add new specification/design files under `docs/` using topic-based names (for example, `Task Lifecycle.md`).

## Build, Test, and Development Commands
- There is no application build or runtime entrypoint yet.
- Use these commands during contribution:
  - `rg --files docs` lists tracked documentation files quickly.
  - `git diff -- docs` reviews doc-only edits before commit.
  - `npx markdownlint-cli2 "docs/**/*.md"` runs optional Markdown linting (if Node tooling is installed).

## Coding Style & Naming Conventions
- Write in Markdown with clear heading hierarchy (`#`, `##`, `###`) and short sections.
- Prefer explicit normative language for rules: `must`, `must not`, `should`.
- Keep prose concise and scannable; use bullets for constraints and procedures.
- Keep one primary language per file when possible to reduce ambiguity.

## Testing Guidelines
- No automated test suite exists in this repository at present.
- Validate documentation changes by:
  - Checking heading order and internal consistency.
  - Confirming new rules do not conflict with immutable specs in `docs/Task & Session 不可变规格.md`.
  - Running optional Markdown lint before opening a pull request.

## Commit & Pull Request Guidelines
- Current history favors short, descriptive Chinese commit messages (for example, `新增 ... 文档`).
- Keep commits atomic: one logical change per commit.
- Pull requests should include:
  - A brief purpose/scope summary.
  - A list of modified files.
  - Notes on terminology or rule changes that affect future implementation.

## Security & Configuration Tips
- Do not commit secrets, private tokens, or internal endpoints in documentation.
- Use anonymized IDs and placeholder URLs in examples.
