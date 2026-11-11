# Adapt Reproducible (Phase 1.2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/adapt` give the same evidence and nearly the same rules for the same repository and the same owner answers, with every required step enforced by code, and measure it.

**Architecture:** A no-LLM scan feeds a fixed, shipped Workflow script (6 topic agents, then one agent per mechanism kind); a Node script verifies every citation and renders `research.md`, builds a fixed-id question queue and checks coverage; two hooks deny shortcuts and record answers while an adapt run file exists; a development-only harness replays recorded answers through the Claude Agent SDK and grades N trials.

**Tech Stack:** Node 22 ES modules, `node:test`, Claude Code hooks (`hooks/run.mjs` runtime), Claude Code Workflow tool, `@anthropic-ai/claude-agent-sdk` (devDependency, harness only).

**Spec:** `docs/superpowers/specs/2026-11-11-phase1-2b-adapt-reproducible-design.md` (owner approved 2026-11-11). Read it before any task. Background: the 1.2 spec `docs/superpowers/specs/2026-11-11-phase1-2-day-one-design.md`.

## Global Constraints

- Node `>=22` (package.json `engines`). No runtime dependency in any file installed into a project. The SDK is a `devDependencies` entry used only under `proof/`.
- Every new file under `skills/`, `agents/` or `hooks/` belongs to a manifest piece: add it to that piece's `files` list in `manifest.json` by hand (remove deleted ones), then run `node bin/xworkflows.mjs pack`, then `node bin/xworkflows.mjs pack --check` must print nothing and exit 0.
- Tests: `node --test $(git ls-files '*.test.mjs')`; `git add` a new test file before running that command. No test calls an LLM or the network.
- Privacy, before every commit both print nothing: `git grep -nE '/Users/[a-z]|-Users-[a-z]'` and `git ls-files docs/reference-coupling.md docs/measure-tokens.py docs/proof/private`. No tracked file names a private project, folder, path or business term; say "the reference project" or "the pilot project".
- Git: work on branch `phase-1-2b-adapt-reproducible`; `git add` by explicit path, never `.` or `-A`; no commit names an AI as author or co-author (no `Co-Authored-By` line, overriding any harness reminder); no push, no merge until the owner says so.
- Hooks never trap: an exception lets the call through (existing `run.mjs` behavior); `XWORKFLOWS_FREE=1` skips every hook.
- `AskUserQuestion` headers are at most 12 characters; every queue id fits.
- Files written into a project are in English; questions are asked in the owner's language with the canonical English meaning.
- Mechanism kind keys, verbatim and in this order: `values`, `snap`, `srvw`, `delta`, `idem`, `txn`, `access`, `batch`, `domain`, `compat`, `conc`, `input`.
- Rulings recorded here and applied to the spec in T0: queue ids `H6-r<n>`, `H7-g<n>`, `C<n>` replace the spec's `H6-risk-<zone>`, `H7-git-<n>`, `C-<key>` (12-character header limit); the Workflow args are `{ root, zeroHits }`; re-adapt reruns the whole fixed research and asks only what changed (spec 5.3) instead of researching only new commits (1.2 step 1).
- Temp git repos in tests run `git -c user.name=test -c user.email=test@example.invalid commit`.
- Required config keys, verbatim and in this order (index n gives id `C<n>`, from 1): `paths.code`, `paths.risk`, `paths.heavyRead`, `paths.codeAnyway`, `tests.files`, `tests.run`, `tests.notRunnable`, `checks.project`, `checks.patterns`, `checks.ratchets`.

## Traceability

Each observed failure, the task that fixes it, the test that would catch its return, and the measure that confirms the improvement. A fix that only changes skill text is marked "text only".

| # | Observed failure (source) | Fixed by | Test (no LLM) | Measure (trials) |
|---|---|---|---|---|
| F1 | Research Workflow script rewritten by the agent each run; run 3 prompt drift (spec 1) | T4 fixed script; T7 gate denies inline script | T4 `workflow script is fixed and compiles`; T7 `gates deny inline Workflow during a run` | R spread ≤ 1 over 3 replays |
| F2 | One agent for all mechanism kinds under a 20-line cap; project checks crowded them out (spec 1) | T2 `checks` kept apart; T4 one agent per kind, 5 rules each | T2 `checks never counted as a kind`; T4 `one kind agent per non-skipped kind` | Fixture 12/12 in 3 of 3; R minimum ≥ 6 |
| F3 | Two of four required mechanism questions skipped (spec 1) | T6 queue has `H5-<kind>` per absent kind; T7 gate on draft summary | T6 `one H5 item per absent kind`; T7 `draft summary denied while ids are missing` | Harness misses = 0 on `H5-*`; live log has every `H5-*` |
| F4 | Zones vary by research depth; an 11 MB zone (spec 1) | T3 `proposeZones` rule | T3 `zone rule splits, merges and bounds` | Same zone keys in all 3 replays |
| F5 | One yes/no playback hid gaps; key facts only after "No" (spec 1) | T6 `P-H1`..`P-H7` ids; T7 gate on approved summary; T8 playback by section | T7 `approved summary denied until P-H1..P-H7 are Right` | Live run: fixes per heading reported |
| F6 | Wrong guess marked Recommended; free text most precise (spec 1) | T1 per-item yes/no, no Recommended on guesses; T6 open questions first | T1 `adapt question rules`; T6 `queue order and styles` | Live run: Other answers counted; `grade.mjs --log` lists every `(Recommended)` option logged and whether its item had a verified citation |
| P1 | `topics.md` path ignores a renamed `xwf-adapt` (memory) | T8 skill paths from its base directory, `topics.md` removed; T7 gate uses `ctx.skillName` | T8 `adapt names no installed path`; T7 `deny reason names the installed skill` | n/a |
| P2 | next-step keeps a card that may not exist for a review error (memory) | T9 | T9 `next-step cannot-run-here keeps or creates a card` | n/a (text only) |
| P3 | verify-finding "cannot run here" relies on reading order for cleanup (memory) | T9 | T9 `verify-finding cleans up on every exit` | n/a (text only) |
| P4 | adapt: first-level "I don't know" undefined; a gap asked twice; owner rules without a path skip zone files; zones question repeated (memory) | T6 styles and unique ids; T8 rule placement; zones only in the queue | T6 `ids are unique and at most 12 characters`, `styles define I don't know`; T8 `rule without a path goes to AGENTS.md` | Live log: no id asked twice |
| P5 | research.md and installer files listed as work in progress (memory) | T4 topic 6 skip list; T8 `.gitignore` lines | T4 `topic 6 skips .xworkflows, graphify-out and installer files`; T8 `gitignore lines` | No `.xworkflows/` path in any trial's next steps |
| B1 | Queue ids must be stable across trials (builder Q1) | T6 | T6 `same research gives byte-identical interview.json` | Harness misses = 0 |
| B2 | What replays answer outside the queue (builder Q2) | T10 `answerFor` (P-* Right; `-r` from file; miss = I don't know) | T10 `answerFor rules` | Misses reported per trial |
| B3 | Gate scope vs full-review in the same session (builder Q3) | T5 run file `start`/`done`; T7 gates read it | T7 `no run file, nothing denied or recorded` | n/a |
| B4 | Model copies research.json by hand (builder Q4) | T4 `sum` in script over `{ topics, kinds, skipped }`; T5 hash check and recovery message | T5 `render exits 1 on a hash mismatch`, T5 `script sum equals research.mjs sum` | n/a |
| B5 | Render failure conditions ambiguous (builder Q5) | T4 `status` enum schema; T5 render rules | T5 `render failure conditions` | n/a |
| B6 | Old answers counted on re-adapt (builder Q6) | T5 run id; T6 `missing` reads the current run | T6 `check ignores other runs` | n/a |
| B7 | Kind agents on the cheap tier (builder, lower) | T4 `model: 'sonnet'` | T4 `kind agents use sonnet` | n/a |
| B8 | Headers over 12 characters (builder) | T6 | T6 `ids are unique and at most 12 characters` | n/a |
| B9 | Planted fixtures would be packed and installed (builder) | T2 fixtures under `test/fixtures/` | T2 `fixtures are never packed` | n/a |
| B10 | Summary heading check must allow the approved 7-heading summary (builder) | T7 checks headings on drafts only | T7 `approved summary with 7 headings allowed when P-ids are Right` | n/a |
| R1 | Re-adapt undefined under fixed research (Fable) | T5 `start` and `research.prev.json`; T6 re-adapt queue; T8 step 1 | T6 `re-adapt asks only changed kinds`; T7 `gates active during a re-adapt` | n/a |
| R2 | Replay never ends after adapt's commit (Fable) | T8 id `S5-next`; T10 harness aborts on it | T10 `answerFor rules` (`S5-next` gives stop) | Each trial's `meta.json` has `stoppedAt: S5-next` |
| R3 | Instruction files left in a replay copy (Fable) | T10 `--strip` | T10 `strip removes paths and fails if any remains` | `meta.json` lists stripped paths |
| M1 | Kinds fit only money projects (owner, 2026-11-11) | T2 generic kinds; T4 skip rule; T11 public repo trial | T2 `fixture has one plant per kind in JS, Python and SQL`, `every signal has a matching example` | Public repo: no rule in a `not-present` kind, no money rule, ≥ 1 of compat/conc/input |
| M2 | Multi-select lists (owner accepted per-item yes/no) | T1 | T1 `adapt question rules` | n/a |

## Failure-mode analysis (new pieces)

| Piece | Failure | Effect | Detection | Mitigation |
|---|---|---|---|---|
| `scan.mjs` | A regex misses a mechanism spelled differently | Kind agent starts with fewer hits | R per-invariant rate; fixture | Kind agent searches beyond hits; each missed invariant adds a generic signal (spec 8.5) |
| `scan.mjs` | Too many hits on a big repo | Slow scan, noisy agent input | T2 cap test | 30 hits per kind, 160 characters, most-changed files first |
| `scan.mjs` | No git history (fresh `git init`, shallow clone) | Ordering by change count fails | Review Focus 1 test | Fall back to path order |
| `scan.mjs` | Binary or non-UTF-8 file | Crash or garbage hits | Review Focus 4 test | Skip files with a NUL byte in the first 8000 bytes |
| `research.workflow.js` | Workflow tool missing (old CLI, SDK session) | Adapt cannot research | T0 spike; skill text | Adapt stops and says so; spike stops the plan and asks the owner |
| `research.workflow.js` | A kind agent dies (`null`) | Kind has no decision | T5 render test | Render exits 1 naming the kind; rerun |
| `research.workflow.js` | Topic 4 wrongly says `absent` for a kind with 0 hits | A real mechanism is skipped | Fixture trial (every kind has hits there); public repo trial | Skip needs both 0 hits and `absent`; recorded with its reason in research.md |
| `research.mjs render` | Quote whitespace differs from the file | A true citation dropped | T5 citation tests | Whitespace collapsed; ±3 lines; dropped ones listed, never silent |
| `research.mjs render` | Model alters `research.json` while copying | Unverifiable data | T5 hash test | `sum` mismatch exits 1 |
| `research.mjs queue/check` | An item id collides or exceeds 12 characters | Replay matches the wrong answer | T6 id test | Fixed id scheme, unit tested |
| `adapt-gates` | `check` fails on a bug | Agent cannot write the summary (trap) | T7 tests; deny message | Message lists ids and the bypass `XWORKFLOWS_FREE=1`; exceptions allow |
| `adapt-gates` | Run file left behind after a crash | Gates stay on in later sessions | T7 `stale run file denies nothing` | Run file expires 12 hours after `startedAt`; a resume runs `research.mjs start`, which refreshes `startedAt`; every deny names `research.mjs done` |
| `adapt-gates`, `research.mjs check` | Fixed option labels translated into the owner's language | Approved summary never allowed; `-r` follow-up never required | T1 `fixed labels stay English`; T7 `translated label is not a pick` | Fixed labels sent verbatim in English, translation in the option description (owner, 2026-11-11) |
| `adapt-gates` | The model passes wrong `zeroHits` to the Workflow | A kind with hits is skipped | T7 `Workflow args must match the scan` | Gate compares `args.zeroHits` with `scan.json` and denies a mismatch |
| `adapt-record` | PostToolUse payload shape differs from the fixture | Nothing logged, `check` never passes | T7 on the T0 real payload | Reads `tool_input.answers` first, then parses the response text; T10 spike adds the real payload as a fixture |
| `proof/harness.mjs` | `canUseTool` not called for AskUserQuestion | Trial hangs or skips questions | T0 spike | Spike first; stop and ask the owner |
| `proof/harness.mjs` | Cost per trial too high | Owner's account drained | `meta.json` cost printed after each trial | Owner approved 8 trials; cost shown after the first |
| `proof/grade.mjs` | Rubric patterns too loose or too strict | R or I miscounted | Owner hand count on one trial | Counts must agree; rubric written before trials and frozen |
| `scan.mjs` | xworkflows' own installed files (its signal catalog) are scanned once committed | The catalog cites itself | T2 `installed files excluded` | Drop every path in `.xworkflows/installed.json` `files` keys and `created` |
| `scan.mjs` | A model-written `.graphifyignore` changes scan input | Zones and hits vary | T2 `graphifyignore written by the scan` | The scan writes the generated and vendored lines itself; the model never writes it |
| `research.mjs render` | Hash mismatch keeps recurring | Research cannot finish | T5 test of the message | Message: rerun the Workflow and write its result unchanged; after 2 mismatches adapt stops and tells the owner |
| `adapt-gates` | `scriptPath` relative or behind a symlink (macOS `/var` vs `/private/var`) | The right script denied | T7 `scriptPath compared after realpath` | Resolve against root, then `realpathSync` both sides |
| `adapt-gates` | `research.mjs` missing, `runCheck` cannot spawn | Coverage gate silently off | T7 `spawn error allows and logs` | Allow (no trap) and print `xworkflows: adapt check could not run` to stderr |
| `proof/harness.mjs` | Trial never ends (step 5 question, next-step) | Cost runs on | T10 `answerFor rules` | Abort on `S5-next`; 60-minute abort per trial |

## Pre-mortem

Imagine the proof failed. The likely reasons, the early signal, and what the plan does:

1. **Workflow does not run inside an SDK session.** Signal: T0 spike fails. Action: stop, report, ask the owner (a fallback changes the spec).
2. **The record hook logs nothing in real sessions.** Signal: T0 spike shows an empty log. Action: add the real payload as a fixture, fix the parser before any trial.
3. **R still varies by more than 1.** Signal: per-kind `status` differs across replays in `meta.json`. Action: diff the three `research.json` files kind by kind; a flipping kind gets a scan signal or a sharper prompt; rerun 3 replays (counts as a new version; earlier numbers stay recorded).
4. **I < 8 although R ≥ 6.** Signal: the grader's per-invariant table shows research found it but no rule file has it. Action: check the T8 rule-placement step and the risk-review checklist; this is a writing bug, not a research one.
5. **Overfitting to the reference project.** Signal: public repo trial fails or the fixture passes only with reference-like code. Action: the failure blocks the merge; fix signals generically.
6. **A gate traps the owner in the live run.** Signal: the owner sees a deny twice for the same reason. Action: the message names `XWORKFLOWS_FREE=1`; the live run continues; the bug becomes a test.

## LLM-driven parts and their checks

What stays model work after this plan, and what checks it. "Text only" means no code check.

| Part | Check |
|---|---|
| Research topic lines for headings 1-4 and 6-8 | Text only; each heading confirmed by the owner in the playback by section (`P-H<n>`) |
| Kind agents' rules and quotes | Citation verified by `render` (T5); hash (T5); status enum (T4 schema) |
| `zeroHits` passed to the Workflow | Gate compares with `scan.json` (T7) |
| Copy of the Workflow result to `research.json` | Hash (T5) |
| Asking the queue items in order, with the canonical meaning | Coverage gate (T7); the log records the question text and options, read by `grade.mjs --log` (manual check of meaning: text only) |
| Options drafted for `choice` items (`H3-*`, `H6-zones`, `H7-depth`, `H7-push`, `H8-*`) and the `(Recommended)` mark | `grade.mjs --log` reports every Recommended option without a verified citation |
| Wording the summary and writing `AGENTS.md`, `.claude/rules/`, `risk-review.md` | Gates on draft and approved summary (T7); I measured by the grader (T11); otherwise text only |
| Zone names | Text only; keys and paths come from the scan (T3) |

## Review Focus

1. A repository with no commits or a shallow clone: the scan orders hits by path and never crashes. Test in T2: `scan works without git history`.
2. A project in a language the catalog does not know (Go): every kind has 0 hits, the scan still writes valid JSON. Test in T2: `unknown language gives zero hits, valid output`.
3. More than 30 matching lines for one kind: 30 kept, `total` is the real count. Test in T2: `hits capped at 30 with the true total`.
4. A binary file or invalid UTF-8 in the tree: skipped. Test in T2: `binary files skipped`.
5. An interview stopped midway and resumed: the run file stays, answers already logged count, nothing is asked twice. Test in T6: `check counts answers from the resumed run`.

---

### Task 0: Spike the three unknowns (stop point)

Run by the controller before any other task. Nothing here is shipped except two hook fixtures and the spec id amendment.

**Files:**
- Modify: `package.json` (`devDependencies`), create `package-lock.json`, `.gitignore` (`node_modules/`)
- Create: `hooks/fixtures/claude/ask-post-real.json`, `hooks/fixtures/claude/workflow-pre-real.json` (recorded, home path already replaced by `run.mjs`)
- Modify: the spec's 5.1 ids and 4.2 args to the rulings in Global Constraints

- [ ] **Step 1:** `npm install --save-dev @anthropic-ai/claude-agent-sdk`.
- [ ] **Step 2:** In a scratch git repo with a `.claude/agents/probe.md` read-only agent and `.claude/settings.json` holding a PostToolUse entry (matcher `AskUserQuestion`) that runs `node <repo>/hooks/run.mjs claude marks` with `XWORKFLOWS_RECORD=<scratch>/rec`, run a short SDK script: `query()` with `settingSources: ['project']` and a `canUseTool` that answers AskUserQuestion; a PreToolUse entry (matcher `Workflow`) recording the same way; the prompt asks the agent to run `Workflow` with `scriptPath` pointing at a two-agent script that uses `agentType: 'probe'`, `model: 'sonnet'`, a `schema`, and reads `args.x`, then to ask two AskUserQuestion questions with headers `T0-q` and `T0-r`; `canUseTool` answers `T0-q` with the label `Yes` and `T0-r` with free text `typed answer`, then aborts the query.
- [ ] **Step 3: Pass** when: the Workflow returns both schema objects and echoes `args.x`; both answers arrive (label and free text); recorded files hold the PreToolUse `Workflow` input (with `scriptPath` and `args`) and the PostToolUse AskUserQuestion input; a result message with `total_cost_usd` arrives after the abort (if not, the harness takes cost from the last usage it saw and T10 says so). Copy the two inputs to `hooks/fixtures/claude/ask-post-real.json` and `hooks/fixtures/claude/workflow-pre-real.json`.
- [ ] **Step 4: Fail** on any of the three: stop the plan and ask the owner (each changes the spec).
- [ ] **Step 5:** Apply the id, args and re-adapt rulings to the spec (5.1, 4.2, 5.6) and commit `package.json package-lock.json .gitignore hooks/fixtures/claude/ask-post-real.json hooks/fixtures/claude/workflow-pre-real.json docs/superpowers/specs/2026-11-11-phase1-2b-adapt-reproducible-design.md`: `chore: spike SDK, Workflow scriptPath and AskUserQuestion payload`.

### Task 1: Question rules: yes/no per item replaces multi-select

**Files:**
- Modify: `skills/adapt/SKILL.md:10-16` (the question rules block)
- Test: `skills/day-one.test.mjs` (replace the test `adapt never forces a pick...`)

**Interfaces:**
- Produces: the question-rules block that T8 keeps verbatim at the top of the skill.

- [ ] **Step 1: Replace the failing test.** Rename the test to `adapt question rules`. Assert the text before `## Step 1` contains the four style names `open`, `confirm`, `mechanism`, `choice`, and: `One item per question: Yes, No, I don't know.`, `If none fits, or it is something else, write it in Other.`, `(Recommended)` only on an option backed by a verified citation, `An answer typed in Other wins over research.`, `I don't know` settles the item. Assert it does not match `/multiSelect/`. Add test `fixed labels stay English`: the block lists the eight fixed labels and says they are sent verbatim, translation in the description.
- [ ] **Step 2: Run** `node --test skills/day-one.test.mjs`. Expected: FAIL on the new test.
- [ ] **Step 3: Rewrite lines 10-16** to spec 5.2's styles: all questions through `AskUserQuestion`, header is the item id; `open` (options `I don't know`, `Skip: not relevant here`, "Write your answer in Other."), `confirm` (one item per question, `Yes`, `No`, `I don't know`, up to 4 per call), `mechanism` (`Nothing does today`, `I don't know`, "Write the mechanism in Other."), `choice` (2 to 4 options drafted from research or earlier answers); the Other note on every non-confirm question; `(Recommended)` only on an option backed by a verified citation; Other wins over research; `I don't know` and `Skip` settle the item; `I don't know` on a mechanism writes `unprotected: <risk>`; fixed option labels (`Yes`, `No`, `I don't know`, `Skip: not relevant here`, `Nothing does today`, `Right`, `Wrong`, `Missing something`) are sent verbatim in English, with their translation in the option `description` (owner, 2026-11-11). Delete the multi-select rules.
- [ ] **Step 4: Run** `node bin/xworkflows.mjs pack && node --test $(git ls-files '*.test.mjs')`. Expected: all pass.
- [ ] **Step 5: Commit** `skills/adapt/SKILL.md skills/day-one.test.mjs manifest.json` with `feat(adapt): yes/no per item replaces multi-select`.

### Task 2: The scan: kinds, catalog, layout, determinism

**Files:**
- Create: `skills/adapt/scan.mjs`
- Create: `test/fixtures/mechanisms/` (one planted file per kind, JS, Python and SQL spread across kinds, plus one look-alike per kind, plus `scripts/check-sample.mjs` and `.github/workflows/ci.yml`)
- Create: `skills/adapt/scan.test.mjs`
- Modify: `manifest.json` via pack (add `skills/adapt/scan.mjs` to piece `adapt`)

**Interfaces:**
- Produces: `export const KINDS: { key: string, name: string, signals: { re: RegExp, ext: string[], example: string, counter: string }[] }[]` (keys in the Global Constraints order); `export function scan(root: string): Scan`; CLI `node scan.mjs [root]` writes `<root>/.xworkflows/scan.json` (two-space JSON plus newline) and prints `<key>: <total>` per kind.
- `Scan = { commit: string, layout: { path: string, bytes: number }[], zones: Zone[], kinds: Record<key, { hits: { file, line, text }[], total: number }>, sql: Sql, checks: string[] }` (`zones` and `sql` filled by T3; this task writes `zones: []`, `sql` with empty arrays).

- [ ] **Step 1: Build the fixture.** One planted mechanism per kind, written so the kind's catalog signal matches it; one look-alike per kind that a careless signal would match but must not (for example `// round trip` for `values`, a loop with no query for `batch`). Plants use JavaScript, Python and SQL so each language appears at least twice. Name each look-alike file `lookalike-<key>.*`.
- [ ] **Step 2: Write failing tests** in `skills/adapt/scan.test.mjs`, each copying the fixture to a temp dir and running `git init`, `git add -A`, `git commit` there (except where noted):
  - `finds every kind in the fixture`: every key has `total >= 1`, and no hit's `file` starts with `lookalike-`.
  - `checks never counted as a kind`: `scripts/check-sample.mjs` and the CI file are in `checks`, and in no kind's hits.
  - `scan is byte-identical twice`: two runs, same `scan.json` bytes.
  - `hits capped at 30 with the true total`: a temp file with 40 matching lines for `batch` gives 30 hits and `total` 40.
  - `scan works without git history`: temp dir with no `.git`; hits ordered by path; no throw.
  - `unknown language gives zero hits, valid output`: a dir with one `.go` file; every `total` 0; `JSON.parse` of the output works.
  - `binary files skipped`: a file with a NUL byte yields no hit.
  - `graphifyignore written by the scan`: a `dist/` folder and a file whose first line has `@generated` are excluded, and `.graphifyignore` afterwards holds `dist/` and that file, plus any lines that were already there.
  - `existing graphifyignore lines applied`: an owner line `gen/` already in `.graphifyignore` drops hits under `gen/`.
  - `installed files excluded`: a `.xworkflows/installed.json` listing `.claude/skills/adapt/scan.mjs` drops hits in that file.
  - `fixture has one plant per kind in JS, Python and SQL`: plants cover the three extensions, each at least twice.
  - `every signal has a matching example`: each signal's `example` matches its regex and its `counter` does not.
  - `fixtures are never packed`: no manifest piece lists a path under `test/`.
- [ ] **Step 3: Run** `git add skills/adapt/scan.test.mjs && node --test skills/adapt/scan.test.mjs`. Expected: FAIL (module missing).
- [ ] **Step 4: Implement `scan(root)`.** Files: `git ls-files` when `.git` exists, else a recursive walk; drop `node_modules/`, `dist/`, `build/`, `vendor/`, lockfiles, `*.min.*`, files whose first line contains `@generated` or `DO NOT EDIT`, `graphify-out/`, `.xworkflows/`, the installed xworkflows files (`.xworkflows/installed.json` `files` keys and `created`), and paths matched by lines already in `.graphifyignore` read as path prefixes or `*.<ext>` (comment: `shortcut: .graphifyignore read as prefixes and *.ext only, upgrade to full gitignore syntax if a project needs it`). Write `.graphifyignore`: existing lines kept, then the dropped generated and vendored paths, sorted, without duplicates. Signals per spec 4.1 table, as data at the top of the file. Hit order: change count over `git log -n 500 --name-only --format= HEAD` descending (fixed for a commit), then path, then line. `text` trimmed to 160 characters. `layout`: bytes per folder at depth 1 and 2, sorted by path. Object keys written in a fixed order; arrays sorted; no timestamps.
- [ ] **Step 5: Run** `node --test skills/adapt/scan.test.mjs`. Expected: PASS.
- [ ] **Step 6: Pack and full run.** `node bin/xworkflows.mjs pack && node --test $(git ls-files '*.test.mjs') && node bin/xworkflows.mjs pack --check`. Expected: all pass, `pack --check` silent.
- [ ] **Step 7: Commit** the new files, the fixture files by path, and `manifest.json`: `feat(adapt): deterministic scan with twelve mechanism kinds`.

### Task 3: The scan: zones rule and SQL inventory

**Files:**
- Modify: `skills/adapt/scan.mjs`
- Modify: `skills/adapt/scan.test.mjs`
- Modify: `test/fixtures/mechanisms/` (add `db/migrations/001.sql` and `002.sql` where 002 redefines one trigger)

**Interfaces:**
- Consumes: `scan`, `layout` from T2.
- Produces: `export function proposeZones(layout: { path, bytes }[]): Zone[]` with `Zone = { key: string, paths: string[], bytes: number }`; `export function sqlInventory(files: { path: string, text: string }[]): Sql` with `Sql = { triggers, policies, definers, uniques, checks }`, each an array of `{ name, file, line }` sorted by name.

- [ ] **Step 1: Failing tests.**
  - `zone rule splits, merges and bounds`: synthetic layouts. (a) depth-1 `src/` at 60% with children `src/a/` 35%, `src/b/` 25%, plus `db/` 30%, `tools/` 9%, `x/` 1%: zones have keys for `src-a`, `src-b`, `db`, `tools`; `x/` joins a zone; count between 3 and 6. (b) a folder of 7 MB below 40% splits. (c) 9 equal folders: 6 zones. (d) 2 folders: 3 zones (largest split once).
  - `zone keys are valid`: every key matches `/^[a-z0-9-]+$/`, unique; no path in two zones.
  - `sql inventory keeps the last definition`: the fixture's redefined trigger appears once, with `002.sql` and its line.
  - `sql inventory lists policies, security definer, uniques and checks` from the fixture.
- [ ] **Step 2: Run** `node --test skills/adapt/scan.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `proposeZones` per spec 4.4 (thresholds 40% and 6 MB, 2% merge into the nearest zone by shared path prefix, else a zone `other`; bounds 3 to 6: above 6 merge the two smallest repeatedly, below 3 split the largest by depth 2 once; keys from paths: lowercase, `/` to `-`, trailing `-` dropped). `sqlInventory` with regex over files whose path contains `migration` or ends `.sql`, later files (path order) replacing earlier definitions by name. Wire both into `scan()`.
- [ ] **Step 4: Run** the scan tests, then the full suite and `pack --check`. Expected: PASS, silent.
- [ ] **Step 5: Commit** `feat(adapt): zones by rule and SQL inventory in the scan`.

### Task 4: The fixed research Workflow script

**Files:**
- Create: `skills/adapt/research.workflow.js`
- Create: `agents/mechanism.md` (read-only kind agent: `tier: medium`; tools `Read, Grep, Glob, Bash`; Bash only for `grep`, `git ls-files`, `git log --oneline`, `wc`, `graphify query`; returns rules with exact quotes; judgment allowed) as manifest piece `mechanism` (kind agent)
- Create: `skills/adapt/research.test.mjs` (Workflow tests here; T5 and T6 add to it)
- Modify: `manifest.json` via pack

**Interfaces:**
- Consumes: `.xworkflows/scan.json` (read by the agents, not the script), kind keys. Ruling: spec 4.2 says the skill passes only `{ root }`; this plan adds `zeroHits` (the kinds with scan `total` 0) because a Workflow script cannot read files, and T7's gate checks the value against `scan.json`, so the model cannot alter it.
- Produces: the Workflow result `{ topics: Record<'t1'..'t6', TopicResult>, kinds: Record<key, KindResult | null>, skipped: Record<key, string>, sum: string }`; `TopicResult = { lines: { heading: 1..8 | 'config' | 'written', text: string, tag: 'code' | 'git', key?: string }[], areas?: Record<key, 'present' | 'absent' | 'unsure'> }`; `KindResult = { kind, status: 'found' | 'absent' | 'not-present', rules: { rule, file, line, quote }[], notChecked: string[] }`; `sum(s: string): string` (32-bit djb2, `h = ((h * 33) ^ code) >>> 0`, start 5381, lowercase hex) computed over `JSON.stringify({ topics, kinds, skipped })`.

- [ ] **Step 1: Failing tests** in `skills/adapt/research.test.mjs`, loading the script text, stripping `export const meta = {...}`, compiling with `new AsyncFunction('args', 'agent', 'parallel', 'pipeline', 'log', 'phase', body)` and running it with stub `agent`/`parallel`:
  - `workflow script is fixed and compiles`: `meta.name` is `adapt-research`; body has no `Date.now` or `Math.random`.
  - `topics first, then kinds`: the stub records call order; all 6 topic calls happen before any kind call.
  - `one kind agent per non-skipped kind`: stub topic 4 returns `areas: { conc: 'absent' }` and stub scan totals are passed via `args.zeroHits: ['conc']`; result has `skipped.conc` and 11 kind calls.
  - `a kind with 0 hits but present is not skipped`: `areas.conc: 'present'`; 12 kind calls.
  - `kind agents use sonnet`: every kind call has `opts.agentType === 'mechanism'`, `opts.model === 'sonnet'` and a schema whose `status.enum` is `['found','absent','not-present']` and `rules.maxItems` 5.
  - `topic 6 skips .xworkflows, graphify-out and installer files`: the topic 6 prompt contains `.xworkflows/`, `graphify-out/` and `.xworkflows/installed.json`.
  - `script sum equals research.mjs sum` is added in T5 (it needs `research.mjs`).
- [ ] **Step 2: Run** `git add skills/adapt/research.test.mjs && node --test skills/adapt/research.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Write the script.** `args = { root, zeroHits: string[] }` (the skill passes the kinds whose scan `total` is 0). Step 1: `parallel` of six `agent(..., { agentType: 'explore', schema: TOPIC_SCHEMA })` calls with fixed prompts (topics of 1.2 spec 5.1 1 to 6; topic 6 carries the 1.2 search order and skip list; topic 4 also returns `areas` for `args.zeroHits`; each prompt states the graphify-first and history-only rules of the current skill step 2.4). Step 2: for each kind not skipped (`zeroHits` includes it and `areas[kind] === 'absent'`), `agent(KIND_PROMPT(kind), { agentType: 'mechanism', model: 'sonnet', schema: KIND_SCHEMA })` in one `parallel`. Kind prompt: read the kind's hits and the `sql` block from `.xworkflows/scan.json`, open cited files, search beyond with `graphify query` and `grep`, return at most 5 rules worded as how the code must do something, `quote` the exact source line, `status` per spec 4.2. Return `{ topics, kinds, skipped, sum: sum(JSON.stringify({ topics, kinds, skipped })) }`.
- [ ] **Step 4: Run** the research tests, full suite, pack, `pack --check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(adapt): fixed research Workflow, one agent per mechanism kind`.

### Task 5: Run file, verify and render

**Files:**
- Create: `skills/adapt/research.mjs`
- Modify: `skills/adapt/research.test.mjs`
- Modify: `manifest.json` via pack

**Interfaces:**
- Consumes: `Scan` (T2, T3), Workflow result shape and `sum` (T4).
- Produces: `export function sum(s: string): string`; `export function verifyCitation(root: string, c: { file, line, quote }): boolean`; `export function renderResearch(root: string, research, scan): { md: string, errors: string[], dropped: object[] }`; CLI subcommands `start`, `done`, `render` (T6 adds `queue`, `check`). Run file `.xworkflows/adapt-run.json` = `{ run: string, commit: string, startedAt: number }`, `run` = `<commit first 8>-<Date.now() base 36>`. `start` keeps the existing run only when `.xworkflows/summary.md` has `status: draft` (resume); otherwise it writes a new run, and, when `summary.md` is approved and `research.json` exists, copies it to `.xworkflows/research.prev.json` (re-adapt).

- [ ] **Step 1: Failing tests:**
  - `script sum equals research.mjs sum`: the T4 script's `sum` (evaluated) and `research.mjs` `sum` agree on three sample strings.
  - `start and done manage the run file`: `start` creates it with the HEAD commit; with a draft summary a second `start` keeps the same `run` and refreshes `startedAt`; without one it makes a new `run`; with an approved summary it copies `research.json` to `research.prev.json`; with no summary it deletes any `research.prev.json`; `done` removes the run file.
  - `hash mismatch twice stops`: a second mismatch in the same run makes `render` print `Research could not be copied unchanged twice: stop and tell the owner.` and exit 1 (count kept in the run file as `mismatches`).
  - `citation kept, fake dropped and listed`: a real quote at line ± 2 with extra spaces kept; a quote absent from the file dropped and listed under `## Dropped citations`.
  - `render failure conditions`: exit 1 and an error naming the kind for each of: a kind result `null`; an invalid `status`; `found` with every citation dropped; a `notChecked` path that is in the scan's hit files or `sql` files. Exit 0 when `notChecked` lists an unrelated path.
  - `render exits 1 on a hash mismatch`: change one character of `research.json` after writing; the message says to rerun the Workflow and write its result unchanged.
  - `render layout`: headings 1 to 8 in order, each kind block in Global Constraints order under heading 5 with `(code)` and `file:line`, `no rule found: <kind>` for `absent`, `not-present (skipped: <reason>)` for skipped, `## Existing checks`, `## Config` lines carrying their `key`.
- [ ] **Step 2: Run** the research tests. Expected: FAIL.
- [ ] **Step 3: Implement** `research.mjs` (root from `git rev-parse --show-toplevel`, falling back to the current directory). `render` reads `.xworkflows/research.json` and `.xworkflows/scan.json`, recomputes `sum`, verifies citations (file exists; any of lines `line-3`..`line+3` contains `quote` after collapsing runs of whitespace to one space), writes `.xworkflows/research.md` with front matter `commit:`, prints errors to stderr and exits 1 when any.
- [ ] **Step 4: Run** research tests, full suite, pack, `pack --check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(adapt): verified render of research and the adapt run file`.

### Task 6: Question queue and coverage check

**Files:**
- Modify: `skills/adapt/research.mjs`
- Modify: `skills/adapt/research.test.mjs`
- Delete: `skills/adapt/topics.md` (its questions move into the queue; topic 6's list lives in the T4 script)

**Interfaces:**
- Consumes: `research.json` statuses, topic `config` lines, `scan.zones`.
- Produces: `export function buildQueue(research, scan, prev?): Item[]`, `Item = { id, heading, style: 'open' | 'confirm' | 'mechanism' | 'choice', text, options?: string[] }`; `export function missing(queue: Item[], log: LogLine[], run: string): string[]`; `LogLine = { run, id, question, options: string[], answer }`; CLI `queue` writes `.xworkflows/interview.json`; CLI `check` prints missing ids, exit 1 when any, exit 0 otherwise; `check --approved` also requires `P-H1`..`P-H7` last answer `Right`.

Styles: `confirm` for `H1-what`, `H6-r<n>`, `H7-g<n>`; `open` for `H2-*`, `H4-*`, `H5-keep`, `H5-free`, `C<n>`; `mechanism` for `H5-<kind>`; `choice` for `H6-zones`, `H7-depth`, `H7-push`, `H3-*`, `H8-*`. With `prev` (re-adapt, from `research.prev.json`) the queue is only `H5-<kind>` for kinds whose status changed to `absent`, plus `C<n>` still missing. Fixed ids and order (spec 5.1): `H1-what`, `H2-pays`, `H2-refused`, `H4-incident`, `H4-risks`, `H5-<kind>` (each `absent` kind, kind order), `H5-keep`, `H5-free`, `H6-zones`, `H6-r<n>` (one per zone, n from 1 in zone order), `H7-g1`..`H7-g4`, `H7-depth`, `H7-push`, `H3-3m`, `H3-12m`, `H3-36m`, `H8-reply`, `H8-budget`, `C<n>` (each required config key with no `config` line, n per Global Constraints order). Follow-ups: `H5-<kind>-r` (asked after `Nothing does today`), `P-H1`..`P-H7`, `P-H<n>-fix`. Canonical texts: the `H4-incident` and `H5-<kind>` texts of spec 5.1 verbatim; `H6-r<n>`: "Does a mistake in <zone> risk money, data or access?".

- [ ] **Step 1: Failing tests:**
  - `re-adapt asks only changed kinds`: `prev` with `idem` found and research with `idem` absent gives `H5-idem` and nothing else.
  - `queue order and styles`: ids in the order above, each with the style listed; `H3-*` after `H7-push`; `H2-pays`, `H2-refused`, `H4-incident`, `H4-risks`, `H5-keep`, `H5-free` are `open`; `H6-r<n>` are `confirm`; `H5-<kind>` are `mechanism`.
  - `one H5 item per absent kind`: research with `idem` and `txn` absent gives `H5-idem`, `H5-txn` and no other `H5-<kind>`.
  - `ids are unique and at most 12 characters`: for the fixture research with every kind absent and every config key missing.
  - `same research gives byte-identical interview.json`.
  - `styles define I don't know`: every `open` item's options include `I don't know`; every `mechanism` item's options are `Nothing does today`, `I don't know`.
  - `check ignores other runs`: log lines from another `run` do not count.
  - `check counts answers from the resumed run` (Review Focus 5).
  - `follow-up required`: `H5-idem` answered `Nothing does today` without `H5-idem-r` makes `check` list `H5-idem-r`.
  - `translated label is not a pick`: `P-H3` answered `Bien` (not a fixed label) leaves `check --approved` listing `P-H3`.
  - `approved check needs every heading Right`: `check --approved` lists `P-H3` when its last answer is `Wrong`, and passes after a later `Right`.
- [ ] **Step 2: Run** the research tests. Expected: FAIL.
- [ ] **Step 3: Implement** `buildQueue`, `missing`, and the CLI subcommands; log at `.xworkflows/interview.log.jsonl`, run from the run file.
- [ ] **Step 4: Update day-one tests** that read `skills/adapt/topics.md` (lines 73, 119, 155, 165-192): move each asserted string to the place it now lives (`research.mjs` or the T4 script), or delete the assertion when the spec removed the behavior.
- [ ] **Step 5: Run** full suite, pack, `pack --check`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(adapt): fixed-id question queue and coverage check` (include `git rm skills/adapt/topics.md`).

Note for reviewers of T6 and T7: between T6 and T8 the skill text still names the deleted `topics.md`; T8 rewrites it. Do not flag it in T6 or T7.

### Task 7: Hooks: adapt gates and answer recording

**Files:**
- Modify: `hooks/adapters/claude.mjs`, `hooks/run.mjs` (`ctx.runCheck`)
- Create: `hooks/core/adapt-gates.mjs`, `hooks/core/adapt-record.mjs`
- Create: `hooks/core/adapt-gates.test.mjs`, `hooks/core/adapt-record.test.mjs`
- Use: `hooks/fixtures/claude/ask-post-real.json` (from T0); create `hooks/fixtures/claude/ask-post-response-text.json` only if T0 shows the answers in the response text
- Modify: `manifest.json` (two new pieces, `tools: ["claude"]`), `hooks/adapters/adapters.test.mjs`, `bin/xworkflows.test.mjs` (existing assertions that count hook entries are updated for the two new pieces)

**Interfaces:**
- Consumes: run file (T5); `node .claude/skills/<installed name>/research.mjs check [--approved]` (T6), installed name from `ctx.skillName('adapt')`.
- Produces: adapter events `{ kind: 'workflow', inline: boolean, scriptPath?: string, args?: object }` for `Workflow`; `{ event: 'postTool', tool, input, response }` when `hook_event_name` is `PostToolUse` (answer: empty stdout, exit 0). Pieces: `adapt-gates` with `claude: [{ event: 'PreToolUse', matcher: 'Write|Edit|MultiEdit|Workflow' }]`; `adapt-record` with `claude: [{ event: 'PostToolUse', matcher: 'AskUserQuestion' }]`.

Gate rule: active only while `.xworkflows/adapt-run.json` exists and its `startedAt` is less than 12 hours old (a run file left after a crash expires; re-adapt is gated like a first adapt). Every deny reason also says: `No adapt running? Run node .claude/skills/<name>/research.mjs done.` While active, deny: a Workflow with `inline` true, or whose `scriptPath` is not `<root>/.claude/skills/<skillName('adapt')>/research.workflow.js`, or whose `args.zeroHits` differs (as a set) from the kinds with `total` 0 in `.xworkflows/scan.json`; a write to `.xworkflows/research.md`; a write of `.xworkflows/summary.md` whose new content has `status: draft` while `check` exits 1, or lacks one of the eight headings, or has a heading 5 without a line for each `absent` kind (`<kind>` named with a rule, `unprotected:` or `not applicable`); a write with `status: approved` while `check --approved` exits 1; any `Edit` or `MultiEdit` of `.xworkflows/summary.md` ("Write the whole summary with Write."). The `<kind>` line rule: a heading 5 line starting `<kind>:` for each absent kind. `scriptPath` is resolved against root and both sides compared after `realpathSync`. Deny reasons name the missing ids and end with `To bypass in an emergency: XWORKFLOWS_FREE=1.`

- [ ] **Step 1: Failing tests** (`adapt-gates.test.mjs`, building `ev` and `ctx` like `design-first.test.mjs`; `check` stubbed through `ctx.runCheck(args): { code, out }`):
  - `gates deny inline Workflow during a run`; `research scriptPath Workflow allowed`; `other scriptPath denied during a run`.
  - `Workflow args must match the scan`: `args.zeroHits` missing a zero-hit kind, or naming a kind with hits, is denied.
  - `research.md write denied during a run`.
  - `draft summary denied while ids are missing`; allowed when `check` passes and headings are complete.
  - `draft summary denied without a line for an absent kind`.
  - `approved summary denied until P-H1..P-H7 are Right`; `approved summary with 7 headings allowed when P-ids are Right`.
  - `no run file, nothing denied or recorded` (full-review's inline Workflow in the same session is allowed).
  - `stale run file denies nothing`: `startedAt` 13 hours old.
  - `gates active during a re-adapt`: approved summary, fresh run file, inline Workflow denied.
  - `summary Edit denied during a run`.
  - `scriptPath compared after realpath`: a symlinked root path is allowed.
  - `translated label is not a pick`: with the log's `P-H1`..`P-H7` answered `Bien`, an approved summary is denied and the reason lists them.
  - `Workflow event from the real payload`: `workflow-pre-real.json` normalizes to `kind: 'workflow'` with its `scriptPath` and `args`.
  - `spawn error allows and logs`: `runCheck` failing to spawn allows and writes `xworkflows: adapt check could not run` to stderr.
  - `deny reason names the installed skill`: with `skillName` returning `xwf-adapt`, the inline-Workflow reason names `.claude/skills/xwf-adapt/research.workflow.js`.
  - `adapt-record.test.mjs`: `one log line per question, matched by header` on `ask-post-real.json` (and the response-text fixture if T0 created one), each line carrying the option labels; nothing written without the run file; `run` taken from the run file.
  - adapters test: Workflow normalizes to `kind: 'workflow'`; PostToolUse normalizes to `event: 'postTool'` and answers with empty stdout.
- [ ] **Step 2: Run** the three test files. Expected: FAIL.
- [ ] **Step 3: Implement.** In `run.mjs`'s `ctx`, add `runCheck(args)` (spawn `node <root>/.claude/skills/<skillName('adapt')>/research.mjs check ...args` with a 10 s timeout; on spawn error print `xworkflows: adapt check could not run` to stderr and return `{ code: 0 }`, so a broken check never traps). `adapt-record` appends with `appendFileSync`. The answer shape is the one T0 recorded.
- [ ] **Step 4: Add** to `bin/xworkflows.test.mjs` the test `install wires adapt hooks`: install into a temp git repo, read `.claude/settings.json`, assert one `PreToolUse` entry with matcher `Write|Edit|MultiEdit|Workflow` running `claude adapt-gates` and one `PostToolUse` entry with matcher `AskUserQuestion` running `claude adapt-record`. Run full suite, pack, `pack --check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(hooks): adapt gates and answer recording`.

### Task 8: The adapt skill rewritten around the pieces

**Files:**
- Modify: `skills/adapt/SKILL.md` (steps 1 to 5: step 1's resume and re-adapt lines, step 5's header; steps 2 to 4 rewritten)
- Modify: `skills/day-one.test.mjs`

**Interfaces:**
- Consumes: CLI of T2, T5, T6; Workflow of T4; question rules of T1; gates of T7.

- [ ] **Step 1: Failing tests:**
  - `adapt names no installed path`: SKILL.md does not contain `.claude/skills/adapt/`; it refers to scripts as `<base>/scan.mjs`, `<base>/research.mjs`, `<base>/research.workflow.js`, where `<base>` is defined once as "this skill's base directory, shown when the skill loads".
  - `adapt research steps in order`: step 2 text contains, in this order: `research.mjs start`, `scan.mjs`, `graphify update .`, `Workflow` with `scriptPath`, `zeroHits`, `.xworkflows/research.json`, `research.mjs render`, `research.mjs queue`; and "Without the Workflow tool, stop".
  - `adapt interview follows the queue`: step 3 says to ask the items of `.xworkflows/interview.json` in file order, header = id, styles of the question rules, follow-ups `H5-<kind>-r`, and `research.mjs check` before the draft.
  - `playback by section`: `Hotspots`, `P-H1`, `Right`, `Wrong`, `Missing something`, `P-H<n>-fix`; no `Did I understand correctly?`.
  - `heading 5 names absent kinds`: the draft rules say heading 5 has a line `<kind>: <rule | unprotected: <risk> | not applicable>` for each absent kind.
  - `step 5 question id`: the step 5 question uses header `S5-next`.
  - `resume runs start`: step 1's draft-resume line runs `research.mjs start` first.
  - `research-only stops after render`: with `research-only`, step 2 ends after `render` (no `queue`, no `done`; the run file expires).
  - `re-adapt reruns research`: step 1's re-adapt runs step 2 in full, then `research.mjs queue` asks only what changed.
  - `rule without a path goes to AGENTS.md`: the step 4 table says an owner-added rule with no path goes to `AGENTS.md` `## Project rules` only.
  - `gitignore lines`: step 4 appends `graphify-out/`, `.xworkflows/research.md`, `.xworkflows/research.json`, `.xworkflows/scan.json`, `.xworkflows/interview.json`, `.xworkflows/interview.log.jsonl`, `.xworkflows/adapt-run.json`; then runs `research.mjs done` after the commit.
  - Keep the existing tests for step 1 (resume), the step 4 file table, config merge, risk-review and step 5, updating only strings the spec changed.
- [ ] **Step 2: Run** `node --test skills/day-one.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Rewrite** steps 2 to 4 per spec 4 and 5 and the tests above. Heading 5's rule lines group by risk as before; the zones question appears once (from `H6-zones`), with zones from `scan.json`; the risk reviewer's checklist keeps one line per verified mechanism rule.
- [ ] **Step 4: Run** full suite, pack, `pack --check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(adapt): skill drives scan, fixed research, queue and gates`.

### Task 9: Parked fixes in next-step and verify-finding

**Files:**
- Modify: `skills/next-step/SKILL.md` (step 4, `cannot run here` line)
- Modify: `agents/verify-finding.md` (steps 3 to 5)
- Modify: `skills/day-one.test.mjs`

- [ ] **Step 1: Failing tests:**
  - `next-step cannot-run-here keeps or creates a card`: the line says to keep the candidate's card, or, for a review error with no card, append one (`Origin:` the review file, `Status: scheduled`).
  - `verify-finding cleans up on every exit`: step 3's `cannot run here` path says to run the step 5 cleanup before answering; every exit path names `git worktree remove --force <temp dir>`.
- [ ] **Step 2: Run** the day-one tests. Expected: FAIL.
- [ ] **Step 3: Edit** both files to match.
- [ ] **Step 4: Run** full suite, pack, `pack --check`. Expected: PASS.
- [ ] **Step 5: Commit** `fix: next-step card on cannot-run-here; verify-finding always cleans up`.

### Task 10: The measuring harness

**Files:**
- Create: `proof/harness.mjs` (imports the SDK), `proof/grade.mjs` (exports `grade`, `stats`, `kindsFound`, `noMoneyCheck`, `recommendedReport`), `proof/answers.mjs` (exports `answerFor`, `toAnswers`; no SDK import), `proof/proof.test.mjs` (imports only grade.mjs and answers.mjs)
- Create: `test/fixtures/proof/` (a sample trial folder, a sample log, a sample rubric)

**Interfaces:**
- Produces: `export function answerFor(q: { header, question, options }, answers: Record<id, string>): { answer: string, miss: boolean, stop?: true }`; `export function recommendedReport(logText: string, research): { id, option, cited: boolean }[]` (`cited` is true when the option text contains a `file:line` that appears among `research.json`'s verified kind rules, or the item is `H5-<kind>` with that kind `found`); `export function grade(trialDir: string, rubric: { invariants: { id, patterns: string[] }[] }): { R: string[], I: string[] }`; `export function stats(values: number[]): { min, max, mean, spread }`; `export function kindsFound(trialDir): string[]`; `export function noMoneyCheck(trialDir): { ok: boolean, why: string[] }`; `export function toAnswers(logText: string): Record<id, string>` (last answer per id of the last run). CLI: `node proof/harness.mjs --source <dir> --commit <sha> [--init] [--strip <comma list>] --answers <file|none> --trials <n> --mode full|research-only --out <dir>`; `node proof/grade.mjs --rubric <file> | --kinds | --no-money | --log <trialDir...>`; `node proof/answers.mjs <log>`.

- [ ] **Step 1:** The SDK and the payload fixture come from T0; nothing to spike here.
- [ ] **Step 2: Failing tests** in `proof/proof.test.mjs`:
  - `answerFor rules`: `S5-next` gives `stop: true`; `P-H3` gives `Right`; a recorded id gives its text; a recorded text equal to an option label is returned as that label; an unknown id gives `I don't know` and `miss: true`; `H5-idem-r` is read from the file like any id.
  - `grade counts R on heading 5 and I on the rules`: the sample trial with a rubric of 3 invariants gives the expected R and I lists; a pattern matched only in `research.md` counts for R, not I.
  - `stats`: `[6, 7, 6]` gives min 6, max 7, spread 1, mean 6.33 (two decimals).
  - `kindsFound`: the sample `research.json` with 11 found kinds gives 11.
  - `noMoneyCheck`: fails on a rule inside a `not-present` kind; fails on a `values` rule matching `/money|currency|price/i`; passes with one `input` rule.
  - `toAnswers`: last answer per id, last run only.
  - `recommendedReport`: a logged option `X (Recommended)` with no matching `file:line` is `cited: false`; one naming a verified rule's `file:line` is `cited: true`.
  - `strip removes paths and fails if any remains` (pure helper `stripPlan(list, existing)` in `answers.mjs`).
- [ ] **Step 3: Run** `git add proof/proof.test.mjs && node --test proof/proof.test.mjs`. Expected: FAIL.
- [ ] **Step 4: Implement.** Harness per spec 7: clone `--source` at `--commit` into `mkdtemp` (with `--init`: copy the folder, `git init`, commit), remove `origin`, `node <repo>/bin/xworkflows.mjs install --yes`, `graphify update .`, with `--strip`: `git rm -r` each listed path, commit `proof: remove instruction files`, fail if any path remains; then `query({ prompt: '/adapt' | '/adapt research-only', options: { cwd, model: 'claude-opus-5-5', settingSources: ['project'], canUseTool, abortController } })`; `canUseTool` allows every tool unchanged and fills `AskUserQuestion` answers via `answerFor`; on `stop` it aborts the query and records `stoppedAt: 'S5-next'`; a 60-minute timer also aborts (`stoppedAt: 'timeout'`, the trial counts as failed). Save `.xworkflows/research.md`, `research.json`, `scan.json`, `interview.log.jsonl`, `AGENTS.md`, `.claude/rules/`, `.claude/agents/risk-review.md`, and `meta.json` (`trial`, `model`, `cliVersion` from `claude --version`, `skillHash` = the `adapt` piece `sha256`, `commit`, `costUsd` from the result message, `misses`, `durationMs`, `kinds` statuses). Print the cost after each trial. Grader per the Interfaces; R text is heading 5 of `research.md`; I text is `AGENTS.md` `## Project rules`, `.claude/rules/*.md` and `risk-review.md`; patterns are case-insensitive regex, all must match.
- [ ] **Step 5: Run** full suite and `pack --check`. Expected: PASS (proof tests do not import the SDK).
- [ ] **Step 6: Commit** `proof/*.mjs` and `test/fixtures/proof/...` by path (package files were committed in T0): `test(proof): harness, grader and answer replay`.

### Task 11: Trials and the record (controller and owner)

Run by the controller, not a subagent. Private material stays in `docs/proof/private/` (git-ignored).

- [ ] **Step 1: Freeze the rubric.** Write `docs/proof/private/rubric.json` from `docs/proof/private/invariants.md` (one entry per invariant, patterns for its key claim, strict as in the earlier counts). Commit nothing; record its sha256 in `docs/proof/private/results-1.2b.md` before any trial.
- [ ] **Step 2: Fixture trials.** `node proof/harness.mjs --source test/fixtures/mechanisms --init --commit HEAD --answers none --trials 3 --mode research-only --out <scratch>/fx`; `node proof/grade.mjs --kinds <scratch>/fx/*`. Pass: 12 of 12 in 3 of 3.
- [ ] **Step 3: Public repository trial.** `git clone --branch 8.1.7 https://github.com/pallets/click <scratch>/click`; `node proof/harness.mjs --source <scratch>/click --commit HEAD --answers none --trials 1 --mode research-only --out <scratch>/pub`; `node proof/grade.mjs --no-money <scratch>/pub/*`. Pass: `ok: true`.
- [ ] **Step 4: Owner live run.** Stop and coordinate with the owner: the harness's clone-and-strip steps (source: the reference repository, path from `XWF_PROOF_SOURCE`; commit and strip list as recorded in `docs/proof/private/results-1.2b.md`, the ones runs 2 and 3 used), xworkflows installed; the owner runs `/adapt` to the end of the playback. Then `node proof/answers.mjs <copy>/.xworkflows/interview.log.jsonl > docs/proof/private/answers.json`; grade the live run as a trial.
- [ ] **Step 5: Three replays.** `node proof/harness.mjs --source "$XWF_PROOF_SOURCE" --commit <recorded> --strip <recorded> --answers docs/proof/private/answers.json --trials 3 --mode full --out <scratch>/rep`; `node proof/grade.mjs --rubric docs/proof/private/rubric.json <scratch>/rep/*` and `--log <scratch>/rep/*`. Pass: R min ≥ 6 and spread ≤ 1; I ≥ 8 in every trial. The owner counts I by hand on one replay; both counts must agree.
- [ ] **Step 6: Record.** Private: every number, per-invariant table, costs, versions in `results-1.2b.md`. Public: append a "Run 4 and replays" section to `docs/proof/2026-11-11-interview-proof.md` with counts only. Commit the public file by path: `docs: proof 1.2b results`. Each invariant missed in any trial becomes a generic scan signal or queue question in a follow-up task (spec 8.5), never a reference-specific term.
- [ ] **Step 7: Stop.** Report to the owner; merge and push only on the owner's word.
