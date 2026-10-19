# CI test flake investigation

The mobile test lane failed on PRs #24 and #26 and passed on rerun. This
investigation does not establish the failing assertion or the root cause.

## What the evidence rules out

Q9 Chat pins q9gate v0.3.1. In that installed release, both `typecheck` and
`test` have `exclusive: true`. `runPlan` drains earlier work before starting
an exclusive lane. They do not run concurrently in the normal gate.

[Run 39321590524, attempt 1](https://github.com/Q9Labs/q9chat/actions/runs/39321590524/attempts/1)
confirms the ordering: typecheck finished at 20:43:47.259 UTC, lint finished
at 20:43:48.185, then test failed at 20:43:53.057 after 4.872 seconds.
The proposed typecheck/test clean-build race cannot explain that execution.

The command lane's `resultMessage` prefers nonempty stderr over stdout.
Turbo's error summary reaches stderr, while Node's failing assertion reaches
stdout. That explains why the gate report can hide the actual test failure.
No q9stack files were changed.

## Defensive ordering and diagnostics

The exclusive build lane now runs first. That warms dependency build results
before any check consumes them, including if check concurrency changes later.
This is a small ordering change, not a proven fix for the observed flake.

On gate failure, CI prints the original package `.turbo/turbo-test.log` files
before rerunning tests with `--output-logs=errors-only`. Printing the saved
logs first preserves the original failure even when the rerun passes.

## Reproduction

Run on the M4 in an isolated checkout, under the shared M4 job lock, with
Node 24, pnpm 11, `CI=true`, `TZ=UTC`, and remote Turbo caching disabled.
For each attempt, remove only that checkout's `.turbo` cache and
`packages/convex/dist`, then start these two commands together and retain
both exit statuses and complete stdout/stderr:

```sh
pnpm turbo run typecheck --output-logs=full --log-order=stream
pnpm turbo run test --output-logs=full --log-order=stream
```

For the build-first comparison, run `pnpm turbo run build` after clearing the
cache and before launching the same pair. Check dependency builds are cache
hits in both consumer logs; a green test alone does not prove that ordering.

Results are recorded in the pull request. These macOS cold-cache runs do not
prove that the intermittent Linux CI failure is fixed. The next original CI
failure's saved test output is needed to identify its cause.
