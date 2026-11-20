# A test file never counts as a risk path

Goal: G1

Spec: none; the owner's rule below is the whole design.

## Global Constraints

- "ninguna prueba va en riesgo" (the owner, 2026-11-20): a file that `tests.files` matches never counts as a `paths.risk` file, in every project.
- A commit that changes code under `paths.risk` and its test stays a risk commit: only the test files drop out of the risk count.

## Tasks

### Batch 1: `tests-not-risk-1`

**T1: `review-seal` leaves out files `tests.files` matches when it decides risk**
- Files: `checks/review-seal.mjs`, `checks/review-seal.test.mjs`
- Role: implement
- `touchesRisk` and `riskFiles` skip a file that `inPaths(f, tests.files)` matches; add `tests.files` to `needs`. A commit that only changes test files under `paths.risk` is then judged as a non-risk commit (its `no-review:` escape works, any reviewer's seal counts). The `riskLite` check reads `riskFiles`, so it follows.
- Done: `node --test checks/review-seal*.test.mjs` passes, with new cases: a test-only commit under `paths.risk` passes with a `review-small` seal; a commit with a risk code file and its test still needs the `risk-review` seal.

**T2: the docs say the same**
- Files: `skills/orchestrate/SKILL.md`, `docs/design.md`
- Role: mechanical
- `skills/orchestrate/SKILL.md` lines 79, 85 and 111: "touches `paths.risk`" becomes "touches a `paths.risk` file that `tests.files` does not match" (word it once, refer to it after). `docs/design.md:418`: the example drops "its tests"; add that test files never count.
- Done: `git grep -n 'touches `paths.risk`' skills/orchestrate/SKILL.md` prints nothing.

After T1 and T2 the main session runs `node bin/xworkflows.mjs pack` and commits the manifest; `node bin/xworkflows.mjs pack --check` prints nothing and `node --test` passes.

## Review Focus

- A code file under `paths.risk` that `tests.files` matches by mistake (a broad glob) would escape the risk reviewer: the test of T1 shows a non-test risk file still needs `risk-review`.

## Declined findings

## Seals
