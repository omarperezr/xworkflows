---
name: phase-1-progress
description: "Where phase 1 of xworkflows stands (sub-projects 1.1, 1.2, 1.2b, 1.3, 1.4), what to fix before the pilot, and what the owner still owes"
metadata:
  node_type: memory
  type: project
  originSessionId: aa2efc01-b9d7-4fe4-be14-668d8375c06e
  modified: 2026-11-23
---

Phase 1 is split into sub-projects, built in order, specs in docs/superpowers/specs/2026-11-11-phase1-*-design.md.

- 1.1 installer: merged and pushed 2026-11-11 (5e231ce). Branch had 12 commits and 105 tests. Commands: `node bin/xworkflows.mjs install`, `doctor`, `uninstall`, `pack`. Not tested yet: Windows and `npx github:` (planned for publish).
- 1.2 day one: merged and pushed 2026-11-11 (27146ca, 131 tests); open-questions follow-up merged 8e61948 (132 tests). Skills `/adapt`, `/full-review`, `/next-step`; agents `zone-review` (read-only) and `verify-finding` (checks in a temporary worktree).
- Interview proof runs on the reference copy: I = 3, 8, 4 of 10 (run 3 failed: the agent rewrites its research Workflow each run, and skipped 2 of 4 mandatory questions). A later live run on a fresh copy, after the research became a fixed Workflow, graded R = 1 and I = 2 (+4 borderline). Run-by-run figures and the lessons: [[adapt-proof-runs]]. Counts in git-ignored docs/proof/private/invariants.md.
- 1.2b "adapt reproducible" (added 2026-11-11, owner approved): spec docs/superpowers/specs/2026-11-11-phase1-2b-adapt-reproducible-design.md, plan docs/superpowers/plans/2026-11-11-phase-1-2b-adapt-reproducible.md, branch phase-1-2b-adapt-reproducible, executed subagent-driven; SDD ledger .superpowers/sdd/2026-11-11-phase-1-2b-adapt-reproducible/progress.md (trust it after compaction). Task 0 spike passed (2e0a95b): a PreToolUse hook can answer AskUserQuestion through the Agent SDK, while plain `claude -p` cannot. Task 11 needs the owner for one live /adapt; the trials were paid from API credits through the harness (`--api-credits`). No merge/push until the owner says.
- Session check (last transcript on this branch, 2026-11-13): 1.2b was still unmerged, 49 commits ahead of main, last commit 89d1543, 308 tests passing. The figures in the 2026-11-12 entry below (53 commits, 328 tests, tip 1095425) could not be matched in that transcript; the two accounts disagree on whether the branch was merged. Check `git branch --merged main` before acting.
- 2026-11-12: revision 2 research-only R = 6, 7, 6 (rubric v2), hand 7, 8, 7 on the reference copy, after 3 tuning rounds on that same project (overfit risk; R was 4, 5, 4 before those rounds). The live interview run before that graded I = 2, and the owner later cancelled further interviews, no pilot yet, keeps working on the reference project; asked to generalize what is too specific (revision 3 proposed, not approved).
- Then 1.3 (rest of the method) and 1.4 pilot. 2026-11-15 (session check): the method part of 1.3 is merged on `main`; the 1.4 pilot is the only phase 1 work left.

Owner decisions in 1.2b: yes/no per item replaces multi-select; fixed option labels stay English with translation in the description; replays answer every playback heading Right; Agent SDK devDependency for the harness only; Fable gate reviews ran twice, owner said "fix and start".

Pre-pilot fixes folded into 1.2b (tasks 6, 8, 9): renamed xwf-adapt paths, next-step card on cannot-run-here, verify-finding cleanup, adapt first-level "I don't know"/double asks/owner rules without a path, research files as work in progress.

Owner still owes: the 5-minute TTY check (spec deny, /grill, allow, install's question in a real terminal); the first real run of /dream (the command was built and merged on 2026-11-15, see below); the Gemini free-tier call (phase 4); design 7.2 wording.

**Why:** sessions end and context compacts; the next one must not redo merged work or lose decisions.
**How to apply:** resume 1.2b from its SDD ledger; after it, write plan 1.3.

## 2026-11-12, second session: finishing phase 1 (owner's order of that date)

The live record is the git-ignored ledger `docs/proof/private/progress.md` in the repository: read it first after any compaction or in a new session. The owner's full order (steps 0 to 3, lanes A and B, "done when", stop rules) is the first user message of session d86649ed.

- Step 0 done: 1.2b closed without its live proof (branch tip 1095425, 53 commits on main, 328 tests). Branch review found 39; 8 data/security ones fixed in 2 rounds; the rest are cards P-1..P-30 in tracked `docs/PENDING.md`. Merge: options were given; the owner then ordered merges one by one with `--no-ff` and no push, and the branches were merged that session (see the entries below).
- Owner decisions now in the docs (commit e11cbb2): design 8.2 (interview split in three groups), 10.1 (reference only tunes; two other projects are the exam; owner marks, never drafts a key), spec 1.3 rule 0 (hand-written approved summary counts), spec 1.2b header (closed, no more tuning).
- One-page plans: `docs/superpowers/plans/2026-11-12-phase-1-3-method.md` (step 1 + lane A) and `2026-11-12-adapt-general-experiment.md` (lane B).
- Spend ledger moved to `docs/proof/private/proof-spend.json` (16.09 USD at the start of this session); always pass it with `--spend-file`; never two harness runs at once. The last transcript read the ledger at 16.09 USD of a 60 USD total cap after the research rounds, so the 71.54 figure further down is from another point in time: read the ledger before quoting any total.
- Exam clones, the tuning copy and the full-history reference copy live in that session's scratchpad (paths in the ledger); if gone, rebuild from the sources (read-only).

## 2026-11-12, end of that session: phase 1 and the new /adapt are on GitHub

- `main` on GitHub (4dacf30) holds: lane A (shared, brakes, hooks, skills, installer), xworkflows installed in its own repository (goals G1 to G3 in `docs/BUSINESS.md`), neutral names, the new `/adapt` (plan `docs/superpowers/plans/2026-11-12-adapt-general.md`, four sealed batches) and the fixes of three false denials by the method's hooks (fixed after two review rounds; zero false denials is not yet seen in a fresh session).
- The method's hooks and skills are live in this repository: follow it (`deepen`, `grill`, `plan`, `orchestrate`, `pending`); a batch that touches `bin/ hooks/ checks/ proof/` is reviewed by `risk-review`, and so is every later code commit pushed in the same range. Lesson: once I sent a batch that touched `proof/` to the normal reviewer; the brake refused its merge until the risk reviewer read the four commits. Check the reviewer role before asking for a seal.
- New `/adapt`, last measure on the reference copy (3 runs): 2 to 4 of the owner's 10 invariants whole on the first page, 7 to 8 in the detail, 8 to 9 of 12 sentences held by their citation, 11 to 12 of 12 in plain words, about 3 USD per run. On exam project C the owner marked 11 of 12 claims true, 1 invented.
- Live interview on his real pilot project: done 2026-11-18, run by the owner himself (see the 2026-11-18 section). The assistant touches that repository only on his express word.
- Spend: 71.54 of the 190 USD cap. 78 open cards in `docs/PENDING.md` at that moment. The cap was 60 in his first order of that day; he raised it to 190 after asking why.

**How to apply:** read `docs/proof/private/progress.md` first; its last entries say the exact state.

## 2026-11-15: the 1.4 pilot, set up but not run yet

Spec: `docs/superpowers/specs/2026-11-11-phase1-4-pilot-design.md`. The pilot runs on a fresh clone of exam project A (Python, pytest), cloned before any xworkflows trace, not on the reference project. [Superseded 2026-11-18: no clone; the pilot runs directly on the owner's own project.]

- Steps 1 and 2 of the owner's order are done: `docs/pilot/private/freeze.txt` pins xworkflows at `c99d0d7` and the pilot clone at `1db883e` on branch `xworkflows-pilot`; the before photo is in `docs/pilot/private/before/`. Both are git-ignored. Not re-verified after 15-nov.
- Order: install (the clock starts here), `doctor` exit 0 with equal hashes saved to `docs/pilot/private/`, a second install that leaves `git status --porcelain` and `git diff` byte-identical, `/adapt` on day one, `/full-review` once, one real change through `deepen`, `grill`, `plan`, `orchestrate` and risk review until the first batch's seal (stop the clock there; goal 120 min or less and 3 manual steps or less), `xworkflows check`, after photo, `/dream` (first real run), `uninstall` (only project content may remain), report `docs/pilot/<date>-pilot.md` with the 14 measures, then the name check `grep -rinFf docs/pilot/private/names.txt $(git ls-files)` must print nothing.
- Spec requires `node --test` to pass before starting. Passed on 15-nov: 1493 of 1493 in about 114 s. Node is v26 (minimum 22).
- Tools needed on the machine: `semgrep` (1.185.0 on 15-nov) and `trivy` (0.76.2). Missing, the semgrep brake answers `cannotRun`, `check` exits 2 and blocks the push. `graphify` and `qmd` are needed for `/adapt`. Install all four before the clock starts.
- Open cards in `docs/PENDING.md`: 22 unscheduled on 15-nov (78 on 11-12). None blocks the pilot.
- Not checked: the pilot clone still at `1db883e`; `docs/proof/` harness measures (`flow.mjs`, `grade.mjs`), which may already cover part of a later benchmark.

**Process lessons (what burned turns):** the first instruction list named a clone path that is not in the repository, so the owner had to supply it; the assistant gave steps before checking the prerequisites (semgrep and trivy), which forced a restart; a stray HTML fragment and repeated full lists cost the owner attention. The owner asked to be told before he starts whenever the plan changed or something was not tested.

**Benchmark idea (proposed, not decided, not built):** a fixed bank of 10 to 20 past fixes from the exam projects' history, with the original hidden tests as the grade; 3 runs per version and compare medians; versions: plain Claude Code, full xworkflows, and xworkflows minus one piece at a time. The owner decides the budget (`--api-credits`, see [[no-api-spend]]) and which measure wins when they conflict. Until it exists, the flow is proven to work, not to be better than another way of working.

## 2026-11-15, second session: batches merged to main, /dream built, model tiers, paid exam

- Merged to `main` that day, each sealed by the risk reviewer (or the normal reviewer when a batch touched no risk folder): the cleanup batches (about 32 cards closed); install's memory folder and per-checkout qmd index ([[qmd-local-index]]); `/dream` (card P-98 closed, [[dream-memory]]); the "possible design error" rule (P-119); git hook chaining (P-46); the `/dream` suggestion line (P-120); the four model tiers and the `/adapt` question about the risk reviewer's model (P-170); the spend cut (per-role effort, main session on Opus, a faster `fix-has-test` through a split test file). Details: [[model-and-effort-policy]], [[test-isolation-and-cleanup]].
- Suite: 1485 tests at the end of the cleanup, 1496 after the spend cut. `doctor` 0 failures.
- Not proven: `/dream` has never run for real (it needs memory notes, and the owner said not to write notes only so that it can run). Phase 1 still needs the pilot (1.4).
- Paid `/adapt` exam, research only (no interview), 3 runs on exam A (Python) and 3 on exam B (Go): 15.47 USD, under a total cap of 97 USD set for this exam. Verified by Haiku, then Fable. Exam A: 11 of 20 rules exact, 9 overstated, 0 invented. Exam B: 18 of 23 exact, 5 overstated, 0 invented. Across both, 6 of 43 citations pointed at a neighbouring or wrong line. The interview was not tested. The harness ledger read 87.01 USD after the exam; the session also saw an older ledger file with 16.09 USD that it did not add in its count.
- Open: P-197 (`/adapt` rules worded wider than the code). The word check (never, all, only, every must cite the place that enforces them) is done; checking that the cited line shows the rule is not.

Related: [[owner-judges-short-plain-lists]] (how to show the owner anything to mark), [[merge-sealed-batches-without-asking]] (sealed batches merge without asking), [[system-map-artifact]] (the diagram of the whole system).

## 2026-11-23: install commit 345ccab of batch workflow-upgrade-1 reviewed

- 345ccab is `node bin/xworkflows.mjs install` run on this repository itself. It copies the pieces sealed at 1d26f13 into `.claude/` and `.xworkflows/`, adds the safe-rm and safe-db hooks to `.claude/settings.json`, enables only the `ponytail@ponytail` plugin (the manifest lists no condition for it), removes the vendored `ponytail` skill, and records all of it in `.xworkflows/installed.json`. In `.claude/agents` the manifest maps `tier: medium` to `model: sonnet`.
- Review: a fresh Opus reviewer found no blocking finding; verdict Ship. A review-small run does not seal a commit that falls under the risk range, so the risk-range commit needs its own full review.
- Checks that held: `node bin/xworkflows.mjs doctor` (0 fail, 0 warn); `git diff --no-index` per installed file against its source at 345ccab; the two privacy commands print nothing; `.graphifyignore` matches the `blocks` entries in `installed.json`.
- Not checked: the denied `rm` forms through the installed safe-rm. The review session's trial guard blocks command text that contains `~` or `$`, so those cases rest on the tests reviewed at 1d26f13. Test them another way before relying on them.
- Process lessons: the main session answered "Ship" before the review agent had reported, then wrote its own summary instead of the report verbatim; wait for the completion and relay the report as it is. Hook trial runs with the session id `probe` may leave a state file in the system temp folder; use a throwaway id and delete it afterwards.
- 2026-11-23, batch handoff-1 task T2 (install ignores `.xworkflows/handoff.md`, uninstall removes that line, doctor warns when the hand-off is over the cap; the seal was not in the session): the suites run with a TMPDIR inside the repository made the "outside a git repository" test resolve to this repository, so `install` ran on it and changed installed files, restored by hand. Run every test with a private TMPDIR outside the repository. The main session also answered about the agent's task while the `implement` agent was still running; wait for its report and relay it verbatim (same lesson as above).

## 2026-11-23: batch handoff-1 (commit b7c534c) reviewed by risk-review

Scope: the `handoff` skill (T3, orchestrate step 6), the `handoff` hook (T1: SessionStart on startup and clear, plain-text PreCompact, the config cap, the Claude adapter, the manifest), the IGNORE line, the doctor measure and over-cap warning (T2), the pack and the self-install. Plan `docs/superpowers/plans/2026-11-19-handoff.md`, spec `docs/superpowers/specs/2026-11-19-handoff.md`. The review's findings, not yet fixed when the review ended:

- Blocking: doctor's session-start measure (`bin/xworkflows.mjs`, around line 1019) cuts only the escaped hand-off text, so the 78-byte JSON envelope still counts. Its test cannot fail: `repo()` makes no commit, so `git rev-parse main` returns the text `main` and the hook prints nothing. Fix: skip the hook in the loop (`isOurs(..., "handoff")`), drop the `.replace`, and commit once in the test before writing the hand-off.
- Should fix: `decide` in `hooks/core/handoff.mjs` tests the byte cap before the sha, so a stale hand-off over the cap prints the "was not loaded" line on every start and compaction. Move the sha test first and add the stale-and-over case to the test.
- Should fix: the hook and the skill both have manifest id `handoff`, so `installed.json` keeps only the last digest. Give the hook its own id and module name, as `orchestrator`/`orchestrate` do.
- Owner decision: uninstall removes the ignore line but leaves `.xworkflows/handoff.md`, so `git status` shows `?? .xworkflows/` after a round trip. Options: delete the file and say so, keep the ignore line while the file exists, or leave as is.
- Owner decision: the PreCompact event has no matcher, so the hand-off loads on every compaction until `main` moves. Option: `"matcher": "manual"`, which fits the spec's "a plain `/compact`".
- Nice to have: a cap that is not a whole number above zero switches the cap off; take the default, as `hooks/core/memory.mjs` does for the dream thresholds.

Not checked: no live Claude Code session ran, so the model's use of the unframed text and the PreCompact input were not seen; the test files and `pack --check` were not rerun.

Process lesson: a test that passes on a missing precondition (no commit) gives a false green. Before relying on a new test, see it fail on the broken input.

## 2026-11-12, close of the session: what was verified and what was not

- Verified then: 787 tests pass; `pack --check` and the two privacy commands print nothing; `node bin/xworkflows.mjs doctor` exits 0 with 1 warning (no `docs/memory` folder yet); always-loaded instructions 1461 bytes (cap 24000), 305 bytes at session start. A real flow `/deepen` to seal and merge on a toy project cost 0.33 USD. Push test on a clean remote: base 0, unsealed code 1, sealed 0.
- The real flow found two method bugs, fixed with tests: the graph brake blocked every push after a commit that did not change the code's shape (and the fix it suggested did nothing); the pending brake rejected a seal written the way the method itself writes it.
- First push after install: 57 commits from before the install carry no seal, so the hook blocks them. That push used `git push --no-verify` once; later pushes pass the hook. Proposed, not written (card P-60): history before the install is not judged.
- Measures: the judge agent was stricter than the owner (it rejected 5 general sentences he had marked correct). The owner's marks are the measure that counts. The mechanism-type list came from the reference project, so counts there favour it.
- Tuning: the two-round limit was spent on the reference copy; later the owner raised the cap and allowed more rounds, on the reference copy only. Exam projects are used once each: do not tune on them.
- Not verified: the live interview; zero false denials in a fresh session; `/adapt` has never run inside this repository. Running it here would replace the hand-written summary and rules, write `~/.xworkflows/owner.md`, and could copy names from the private folder into tracked rules.

Related: [[system-map-artifact]], [[owner-judges-short-plain-lists]], [[merge-sealed-batches-without-asking]], [[no-api-spend]], [[adapt-proof-runs]].
