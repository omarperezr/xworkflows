# Phase 1.2b: Adapt, reproducible

Status: draft for the owner's review, 2026-11-11. Amends the 1.2 spec
(`2026-11-11-phase1-2-day-one-design.md`) sections 5.1, 5.2, 5.4 and 8.
Sub-project 1.3 waits for this one.

## 1. Intent

Three interview proofs ran on the same copy of the reference project at the
same commit:

| Run | R (research) | I (rules written) | Result |
|---|---|---|---|
| 1 | 3 | 3 | fail |
| 2 | 6 | 8 | pass |
| 3 | 1 firm, 3 borderline | 4 firm, 5 borderline | fail |

Run 3 changed only the question format, yet scored half of run 2. The
transcripts show why:

- The research Workflow script is written by the agent on every run (4144
  and 4500 characters, different prompts). Run 3 added "project checks" to the
  mechanisms prompt; those lines filled the 20-line cap and pushed out
  snapshot, delta, idempotency and source-of-truth mechanisms.
- One agent searched nine kinds of mechanism under one line cap.
- Two of four required mechanism questions were skipped, although the skill
  requires them.
- Proposed zones depend on how deep research looks (5 zones in run 2, 4 in
  run 3, one of them about 11 MB).
- A single yes/no playback hid what was missing: in runs 2 and 3 the key
  facts came only after the owner said No.
- A wrong guess marked `(Recommended)` was offered; the owner's free-text
  answers (4 in run 3) were the most precise.

The goal: the same repository and the same owner answers give the same
evidence and nearly the same rules, and every required step is enforced by
code, not by the skill text. The LLM keeps only the work that needs judgment:
reading the cited code, wording rules, translating questions.

## 2. Goals, non-goals, anti-goals

Goals:
- Research starts from a deterministic scan, runs a fixed Workflow script
  shipped in the package, and every cited mechanism is checked by a script.
- The interview follows a fixed question queue built by a script; coverage is
  checked by code before the summary can be written.
- Every answer is recorded with its question id, so a run can be replayed
  without the owner.
- A harness runs N trials and reports the spread, per-invariant recovery and
  cost.

Non-goals:
- Removing LLM variance; it is measured and reduced by structure.
- Writing rules for Codex, Cursor and Gemini (later phase; rulesync is the
  candidate output layer).
- An LLM that pretends to be the owner; recorded real answers replace it.

Anti-goals:
- A gate that traps the agent: every gate names what is missing and the fix,
  and `XWORKFLOWS_FREE` still lets everything through.
- Scan noise flooding the rules: hits are capped per kind and only feed the
  agents; they never become rules without a verified citation.
- Rules the agent would discover alone. A rule earns its place only if it
  names a mechanism, a decision or a fact the code does not make obvious
  (evidence: generated context files without such facts did not help and cost
  about 20% more; ETH Zurich and Princeton 2026, seen through a summary).

## 3. Constraints

- Node 20+, no new runtime dependency in anything installed into a project.
  The harness is development-only (section 7).
- Every new file is a manifest piece, hashed by `pack`.
- No tracked file names a private project, path or business term.
- Hooks follow the existing runtime: `hooks/run.mjs` plus `hooks/core/<hook>.mjs`
  exporting `decide(ev, ctx)`; the Claude adapter normalizes the event.

## 4. Part A: research

### 4.1 The scan (no LLM)

`skills/adapt/scan.mjs`, installed at `.claude/skills/adapt/scan.mjs`, run as
`node .claude/skills/adapt/scan.mjs`. It writes `.xworkflows/scan.json` and
prints one summary line per kind. Same commit and same `.graphifyignore`, same
bytes out (keys and arrays sorted, no timestamps).

Input: `git ls-files`, minus the `.graphifyignore` patterns and generated or
vendored code (lockfiles, `dist/`, `build/`, `vendor/`, `node_modules/`,
minified files).

Output keys:
- `commit`: `HEAD`.
- `layout`: bytes per folder at depth 1 and 2.
- `zones`: the proposal of 4.4.
- `kinds`: for each of the twelve kinds below, `{ hits: [{ file, line, text }],
  total }`. At most 30 hits per kind, the most-changed files first (by
  `git log --since=12.months --name-only` count), then by path. `text` is the
  matched line, trimmed to 160 characters.
- `sql`: from migration files, the last definition of each trigger, policy,
  function marked `security definer`, unique constraint and check constraint
  (`{ name, file, line }`). Regex, not a SQL parser.
- `checks`: project check scripts and linter configs (`scripts/check-*`,
  `.semgrep*`, lint configs, CI files). Kept apart from the twelve kinds so they
  never use a kind's line budget.

The twelve kinds, each with its signal catalog (regex over code and SQL; the
catalog is data at the top of the file, one entry per signal, with a test
case each):

| Key | Mechanism | Example signals |
|---|---|---|
| `values` | source of truth, units and precision: money, time and time zones, measures, rounding | money, unit or rounding helpers, `round(`, `toFixed(`, decimal types, currency or unit fields, UTC conversions |
| `snap` | values frozen when a record is written | insert triggers that set columns, `*_at_sale`, copied price or rate columns |
| `srvw` | data written only through server functions | `.rpc(`, server function definitions, direct table writes from client code |
| `delta` | changes as deltas, never absolute values | `set x = x +`, `x = x -`, increment helpers |
| `idem` | retried or offline writes applied once | `on conflict`, idempotency keys, unique constraints on request ids, outbox or queue code |
| `txn` | a multi-row action is one request in one transaction | `begin`, `transaction(`, functions with several writes |
| `access` | access checked by the database or server, not only screens | policies, `enable row level security`, guard triggers that raise, auth checks on the server |
| `batch` | work over many rows done once, not once per item | `await` or a query inside a loop or `.map(` |
| `domain` | legal, tax or domain rules and where they are written | rate or tax constants, docs about law, regulation or tax |
| `compat` | what must not break for those who use it: public API, file formats, schemas, wire protocols | exported API lists, version or deprecation markers, schema or format version fields, changelog policy |
| `conc` | concurrency and order: locks, queues, event order, races | locks and mutexes, `for update`, advisory locks, queue consumers, sequence or version columns |
| `input` | validation of outside input at trust boundaries | schema validators, request parsing, sanitizers, auth checks on handlers |

The kinds are generic on purpose: the first proofs ran on projects that
handle money, and the list must also fit a library, a CLI or a game (section 8
checks one).

shortcut: regex signals miss mechanisms spelled differently; the per-kind agent
of 4.2 still searches beyond the hits, and the catalog grows with each missed
invariant (section 8).

### 4.2 The fixed Workflow

`skills/adapt/research.workflow.js` (a Workflow script, shipped). The skill
runs it with `Workflow({ scriptPath: ".claude/skills/adapt/research.workflow.js" })`
and no inline script. Its prompts are fixed text; the agent passes nothing
but the run's `args` (`{ root, zeroHits }`: `zeroHits` lists the kinds with scan `total` 0; a Workflow script cannot read files, and the gate of 4.5 checks the value against `scan.json`; ruling 2026-11-11).

It runs in two steps:
1. The six topic agents (`explore`), in one `parallel` call: topics 1 to 6 of
   the 1.2 spec (stack, layout, tests, where data and money move, history,
   written-down next steps), prompts unchanged in meaning. Topic 4 also
   returns, through a schema, `areas: { <kind>: "present" | "absent" |
   "unsure" }` for each kind with 0 scan hits.
2. The kind agents, in one `parallel` call. A kind is skipped only when the
   scan has 0 hits for it and topic 4 says `absent`; it is recorded as
   `not-present` with that reason. Every other kind gets one agent.
   Each kind agent: It reads its kind's hits and the `sql` entries
  from `.xworkflows/scan.json`, opens the cited files, searches beyond the
  hits with `graphify query` and `grep`, and returns, through a schema:
  `{ kind, status, rules: [{ rule, file, line, quote }], notChecked: [path] }`,
  where `status` is `found` (at least one rule), `absent` (the kind's area
  exists, no mechanism found) or `not-present` (the project has no such
  area). At most 5 rules. `rule` is worded as how the code must do something.
  `quote` is the exact source line. These kind agents run on the `medium`
  tier (`sonnet` for Claude), not `explore`'s cheap tier: they do the
  judgment work.

The Workflow returns `{ topics, kinds, sum }`, where `sum` is a plain-JS hash
of the JSON of `{ topics, kinds }` computed inside the script. The skill writes
the result to `.xworkflows/research.json`; `render` recomputes the hash and
exits 1 on a mismatch, so a copy the model altered is caught.

The Workflow tool is required. Without it, adapt stops and says so (the
1.2 two-Agent fallback is dropped: it cannot be made fixed).

### 4.3 Verify and render

`skills/adapt/research.mjs render` reads `research.json` and `scan.json` and
writes `.xworkflows/research.md`:
- A citation is kept only if `file` exists at `line` (plus or minus 3 lines)
  and contains `quote` after whitespace is collapsed. A dropped citation is
  listed under `## Dropped citations`, so nothing disappears silently.
- Heading 5 gets one block per kind: its verified rules, tagged `(code)` with
  `file:line`, or `no rule found: <kind>` when `absent`, or nothing when the
  kind's area is not in the project.
- `## Existing checks`: the `checks` list.
- It exits 1, printing what is missing, when: a kind's agent returned
  nothing (`null` from `parallel`) or no valid `status`; a `found` kind has no
  verified rule left; or a `notChecked` path is one of the scan's hit files or
  `sql` files (the files that matter for mechanisms).
- Headings 1 to 4 and 6 to 8 are rendered from the topic answers as today.

### 4.4 Zones by rule

`scan.mjs` proposes zones by a fixed rule; the agent only names them in
everyday words:
- Start with the depth-1 code folders, generated and vendored code left out.
- A folder holding more than 40% of the code bytes, or more than 6 MB, is
  replaced by its depth-2 folders (once).
- Folders under 2% of the code bytes join the nearest zone by path, or a
  zone named `other`.
- 3 to 6 zones. Above 6, the smallest merge; below 3, the largest splits.

### 4.5 The research gate (hook)

An adapt run is marked by `.xworkflows/adapt-run.json` (`{ run, commit }`),
created by `research.mjs start` at the top of step 2 and removed by
`research.mjs done` after step 4's commit. A draft resume keeps it. Gates and
recording apply only while it exists, so `/full-review` and `/next-step` in
the same session are not touched (session marks are not used for this).

New core hook `hooks/core/adapt-gates.mjs`, wired on `PreToolUse` for
`Write|Edit|MultiEdit|Workflow`. While the run file exists it denies:
- `Workflow` with an inline `script`: "Run the fixed research script:
  scriptPath .claude/skills/adapt/research.workflow.js."
- A `Write` or `Edit` of `.xworkflows/research.md`: "research.md is written by
  `node .claude/skills/adapt/research.mjs render`."

The Claude adapter gains `kind: "workflow"` with `inline` (whether `script` is
set). Other adapters are untouched.

## 5. Part B: the interview

### 5.1 The question queue

`node .claude/skills/adapt/research.mjs queue` runs once, after research, and
writes `.xworkflows/interview.json`. Every id is fixed text or a kind or zone
key, so the same research gives the same ids, and a replay matches by id.
Options the agent drafts (aspirations, zones) may differ between runs; a
replayed answer is used as a pick when it equals an option label, otherwise
as Other text. The file is
an ordered list of items `{ id, heading, style, text, options? }`. `text` is
canonical English; the agent asks it in the owner's language with the same
meaning. The order is fixed (funnel: open first, specific after, aspirations
last):

1. `H1-what`: confirm what the project is (from research).
2. `H2-pays`, `H2-refused`: open.
3. `H4-incident`: open: "Tell me about one real time something went wrong
   here: what broke, and what did it cost?" (critical incident).
4. `H4-risks`: open: the costliest mistakes, in the owner's words. Research's
   risks are not separate items; they are confirmed in the playback of
   heading 4.
5. `H5-<kind>`: one mechanism question per kind with status `absent`: "How
   does the code prevent this today, and what rule must every change
   follow?" After `Nothing does today`, `H5-<kind>-r` asks what rule every
   change must follow.
6. `H5-keep`, `H5-free`: open: what must not change, what is free to change.
7. `H6-zones`, `H6-r<n>` (n from 1 in zone order; ids stay within the 12-character header limit, ruling 2026-11-11): the zones proposal; one yes/no item per zone:
   "Does a mistake here risk money, data or access?"
8. `H7-g<n>`, `H7-depth`, `H7-push`: each default git rule, review depth,
   who may push.
9. `H3-3m`, `H3-12m`, `H3-36m`: aspirations, last; options drawn from what
   the owner said before (next steps named, planned moves, risks).
10. `H8-*`: reply preferences and model budget.
11. `C<n>`: each required config key still without a value (n from 1 in the fixed key order).

### 5.2 Question styles

All questions go through `AskUserQuestion` so one hook can record and replay
them. The `header` is the item id, so a recorded answer is matched by id,
never by the translated text.
- `open`: two options, `I don't know` and `Skip: not relevant here`, and the
  question says: "Write your answer in Other."
- `confirm`: one item per question, options `Yes`, `No`, `I don't know`. Up to
  4 items per call. This replaces multi-select lists (Pew: asking yes/no per
  item gets about 8 points more than "select all that apply").
- `mechanism`: options `Nothing does today`, `I don't know`, plus "Write the
  mechanism in Other."
- Every question that is not `confirm` ends with "If none fits, or it is
  something else, write it in Other."
- `(Recommended)` appears only on an option backed by a verified citation.
  Guesses are never recommended.
- An Other answer wins over research. `I don't know` and `Skip` settle the
  item; `I don't know` on a mechanism writes `unprotected: <risk>`.

### 5.3 Recording

New core hook `hooks/core/adapt-record.mjs` on `PostToolUse` for
`AskUserQuestion`: while the run file exists, it appends
`{ run, id, question, answer }` per question to `.xworkflows/interview.log.jsonl`
(git-ignored). `check` reads only the current run's lines; a re-adapt starts a
new run, so old answers never count, and asks only `H5-<kind>` for kinds whose
status changed since the approved summary's research. The Claude adapter gains `event: "postTool"` with the tool's
input and response.

### 5.4 Coverage gate

`research.mjs check` exits 1 and lists the queue ids (plus any `-r` follow-up
asked) with no logged answer in the current run. The
`adapt-gates` hook denies a `Write` of `.xworkflows/summary.md` while `check`
fails: "Ask these first: <ids>." It also denies a draft summary (`status: draft`) that lacks one of
the eight headings, or a heading 5 without a line for every kind that has
`no rule found` (a rule, `unprotected:`, or `not applicable`).

### 5.5 Playback by section

The single `Did I understand correctly?` is replaced. The summary is shown
with a `Hotspots` list first (open doubts and dropped citations), then the
owner answers one question per heading, headings 1 to 7, 4 per call:
"<heading>: right, wrong, or missing something?" with options `Right`,
`Wrong`, `Missing something`. Wrong or missing asks what, in Other, fixes that
heading, and asks again for that heading only. The interview ends when all
seven are `Right` (teach-back: a yes/no "did I understand" is not a check).
Playback ids are `P-H<n>`, and the follow-up after Wrong or Missing is
`P-H<n>-fix`.

### 5.6 What stays from 1.2

Step 4 (what gets written) and step 5 (the question after the interview) are
unchanged, except that `research.json`, `research.prev.json`, `scan.json`,
`interview.json`, `interview.log.jsonl` and `adapt-run.json` join `research.md`
in `.gitignore`, and step 5's question carries the header `S5-next`. Step 1
changes (ruling 2026-11-11): a draft resume runs `research.mjs start` first
(keeping the run, refreshing its clock); a re-adapt reruns the whole fixed
research (a partial scan of new commits cannot be made fixed), keeps the
previous result as `research.prev.json`, and asks only the `H5-<kind>` items
whose kind changed to `absent`, plus missing config keys.

## 6. Acceptance tests (no LLM)

`node --test` with:
- A fixture repository `test/fixtures/mechanisms/` (outside `skills/`, so it
  is never packed or installed) with one planted
  mechanism per kind (JavaScript, Python and SQL), plus one look-alike that
  must not match per kind. `scan.mjs` finds 12 of 12 and no look-alike.
- Running `scan.mjs` twice gives byte-identical `scan.json`.
- `render` keeps a correct citation, drops a fake one and lists it, and exits
  1 on a kind with no decision.
- `queue` order: aspirations after zones and git; one `H5-<kind>` per
  `no rule found`.
- The zone rule on synthetic layouts: a 60% folder splits; tiny folders merge;
  3 to 6 zones.
- `adapt-gates`: denies an inline Workflow, a direct `research.md` write and
  an incomplete draft `summary.md`; allows them without the run file.
- `render` exits 1 on a hash mismatch and on a `null` kind result.
- `adapt-record`: one log line per question, matched by header.

## 7. Part C: the measuring harness (development only)

`proof/harness.mjs`, never packed or installed. It uses the Claude Agent SDK
(`@anthropic-ai/claude-agent-sdk`) as a devDependency, because `claude -p`
with only a hook does not offer `AskUserQuestion` (checked on Claude Code
2.1.322: the tool is absent without a permission host).

Per trial:
1. Clone the source repository (path from an environment variable, never
   tracked) at a given commit into a fresh temp folder; remove the instruction
   files as in the 1.2 proof; install xworkflows; build the graph.
2. Run `/adapt` through the SDK with a pinned model. `canUseTool` answers
   `AskUserQuestion` from an answers file keyed by `header` id. A missing id is
   answered `I don't know` and counted as a miss. Every playback id `P-H<n>` is answered
   `Right` (owner, 2026-11-11).
3. Save `research.md`, `AGENTS.md`, `.claude/rules/`, `risk-review.md`, the
   log, the total cost and the versions (CLI, model, skill hash, commit).

The grader reads a rubric written before any trial: per invariant, the key
claim as one or more patterns that must all match the written rules. It
prints per trial R and I, then min, max and mean, per-invariant recovery
rate, misses and cost. The owner also counts I by hand on one trial; the two
counts must agree.

The rubric, the answers file and the results stay in git-ignored
`docs/proof/private/`.

## 8. Proof and order of work

1. Parts A and B, with section 6's tests.
2. Smoke trial of the harness on the fixture repository: research finds 12
   of 12 kinds in 3 of 3 trials.
2b. `/adapt research-only` on a well-known public open-source repository that
   handles no money (picked in the plan). Pass: no kind marked `not-present`
   carries a rule, `values` has no money rule, and at least one mechanism of
   `compat`, `conc` or `input` is found with a verified citation.
3. One live `/adapt` with the owner on the reference copy, at the commit runs 2 and 3 used. It
   records the answers file and counts as a trial.
4. Three replay trials with those answers. Pass: R minimum at least 6 and
   spread at most 1; I at least 8 in every trial.
5. Each invariant missed in any trial adds a signal to the scan catalog or a
   question to the queue, never a reference-specific term.

## 9. Left to the builder

Exact regex signals per kind; the agent prompts' wording; the rubric's
pattern syntax; whether topics 1 to 6 share agents.

## 10. Owner's answers (2026-11-11)

1. Replays answer every playback heading `Right`, so I measures research and
   the question queue only; the owner's corrections inflate I. The live run is
   reported apart.
2. The harness uses `@anthropic-ai/claude-agent-sdk` as a devDependency, never
   installed into a project.
3. About 8 trials on the owner's Claude account (3 on the fixture, 1 on a
   public repository without money, 1 live, 3 replays); each prints its cost.

## 11. Amendments

- 1.2 spec 5.1: research is the scan, the fixed Workflow and the render of
  this spec.
- 1.2 spec 5.2: the summary stop rule becomes the playback by section (5.5);
  multi-select becomes yes/no per item (5.2).
- 1.2 spec 5.4: zones come from the rule of 4.4.
- 1.2 spec 8: the proof is section 8 of this spec.
