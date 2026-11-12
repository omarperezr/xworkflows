# Phase 1.3: the method, ported (one page)

Goal: G1

Spec: `docs/superpowers/specs/2026-11-11-phase1-3-method-design.md`, approved.
This is a port of the reference project's working pieces, not a new design.
`docs/reference-coupling.md` (private) says which config key each fixed value
becomes.

## Global Constraints

Owner, 2026-11-12:
- Workflow runs of at most 10 agents; one owner per file; test first. Agents
  never commit: they report `red:`, `green:`, `skipped:`. One fresh reviewer
  per batch. The main session commits by explicit path.
- Models: the medium tier implements, the top tier reviews, the session model
  writes skills and does the final review.
- Two fix rounds per piece, then options go to the owner. A piece that grows
  past its spec section stops the same way.
- One branch per batch, merged with `--no-ff`; push and merge only on the
  owner's word; no AI authorship line.
- Before every commit the two privacy commands print nothing. No name, path
  or business term of the owner's projects in a tracked file: «the reference
  project», «exam project A / B».
- Rule 0 of spec section 8 also accepts a hand-written, owner-approved
  project summary.
- The reference project is read-only; the comparison runs on a copy.

## Step 1 (alone): shared ground, spec sections 5 and 10

Branch `phase-1-3-shared`. Three owners:

| Files | Contract |
|---|---|
| `hooks/core/config.mjs` + test | `DEFAULTS`; `PROJECT_KEYS` (no default); `load(root)` deep-merges `.xworkflows/config.json` (objects merge, arrays and scalars replace; broken JSON throws); `get(config, "a.b")`; `missing(config, keys)` (`[]` is present, absent is missing); `inPaths(file, list)` (an entry with `*` is a glob, else a prefix) |
| `hooks/run.mjs`, `hooks/adapters/claude.mjs` + tests | New events `prompt`, `sessionStart` (`source`), `preCompact`, `sessionEnd`; `preTool` kinds `read`, `agent`, `workflow`, `web`, `ask`, `handback`; a decision may carry `context`; `ctx.state` / `ctx.save`; the hook log `xwf-hooks.log`; `ctx` gains the effect functions the four hooks need (`now`, `git`, `exec`, `background`, `exists`, `mtime`, `listDir`, `writeFile`, `home`) so `decide` stays pure |
| `checks/run.mjs` + test | `checks/<brake>.mjs` exports `run(range, ctx) -> { ok, lines }`, optional `needs` (config keys) and `mainOnly`. `range`: `{ base, head, commits, ref, mainPush, manual }`. Exit 0 all passed, 1 a brake failed, 2 could not run (not a repository, broken config, unknown or missing brake, missing key, a brake that throws, `cannotRun`). `--pre-push <remote>` reads git's stdin; `[--only a,b] [<base> [<head>]]` by hand |

## Step 2, lane A (branches `phase-1-3-a<n>-*`, own worktree)

- A1. The 14 brakes, one agent each: `checks/<brake>.mjs` and its test, with a
  passing and a failing case in a throwaway repository. `fix-has-test` has a
  case whose `tests.run` is not Node. Push proof as soon as `run.mjs`,
  `review-seal` and a hand-installed `pre-push` exist.
- A2. Hooks `orchestrator`, `handback`, `memory`, `modes`: the reference's
  tests, translated, are the expected answers. Agents `implement`,
  `mechanical`, `review`.
- A3. Skills `deepen`, `plan`, `orchestrate`, `pending` (150 lines at most
  each); vendored `tdd`, `ponytail`, `ponytail-review` with LICENSE and
  SOURCE.md naming the origin commit; `next-step` hands off to `deepen`.
- A4 (alone: it owns `bin/xworkflows.mjs`). Install `.xworkflows/checks/`, the
  `pre-push` hook and its chain, the graph git hooks, the settings entries;
  `pack` covers `checks/`. Then the three check packs.

## Done when (the owner's list, points 1 to 6)

1. `node --test $(git ls-files '*.test.mjs')` passes; `pack --check` prints
   nothing.
2. Each brake: one passing and one failing case in a throwaway repository.
3. In `sandbox/`: a toy change goes deepen to seal; a push to a local bare
   remote exits non-zero before the seal line and 0 after. Output saved.
4. On a copy of the reference, last 60 merges: each ported brake gives the
   verdict of its `review.sh` mode (design 9.1). Each difference is explained
   by configuration or fixed. A mode that cannot run on the copy is named.
5. The recorded Claude Code fixtures of spec section 13.
6. xworkflows installed in itself: `doctor` exits 0, the next batch carries a
   seal and passes `xworkflows check`, the hook log has 0 false denies.

## Review Focus

A hook that traps an agent on broken input; a brake that passes when it could
not run; a reference name or value in a shipped file; a temporary worktree
left behind by `fix-has-test`; the `pre-push` chain losing git's stdin.

## Seals
