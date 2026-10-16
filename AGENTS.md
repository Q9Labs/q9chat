# `q9chat` repository guide

Read `theory.md` for intent, `tracker.yaml` for status, `design.md` for visual
direction and `glossary.md` for project vocabulary before changing the project.

## Commands

Use Node 24 and pnpm 11. Run `pnpm dev`, `pnpm dev:status`, `pnpm dev:logs`,
`pnpm dev:stop`, `pnpm gate` and `pnpm tracker:check`. `pnpm gate` runs the
project checks plus tracker and changelog validation. Add release notes with
`pnpm exec q9 changelog add --type added --title "Title" --body "User-facing change."`.

## Code and boundaries

- Convex owns data, authorization and live updates. Every chat query and
  mutation resolves the caller's membership before it reads or writes a group.
- WorkOS AuthKit owns sign-in. Convex trusts only WorkOS access tokens for the
  configured `WORKOS_CLIENT_ID`; the apps never hold the WorkOS API key.
- Apps import the backend only through `@q9chat/convex`.
- Use strict TypeScript and the shared config packages. Do not add `any`, unsafe
  assertions, shapeless records, or unjustified suppressions.
- Use logical layout classes (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`,
  `text-start`) so the interface can flip direction later.
- Keep tests close to behavior. Do not skip or weaken a failing test.
- Keep hooks and gates non-mutating. They must not format, stage, commit, push,
  deploy, or regenerate files.

Keep ADRs and runbooks under `docs/`. Do not access or deploy production without
explicit approval. Never commit `.env` files, credentials, transient build
output, or customer data. Preserve unrelated worktree changes and keep commits
focused.
