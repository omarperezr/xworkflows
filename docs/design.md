# xworkflows — design

Status: approved by the author on 2026-11-10. Nothing is built yet.
Date: 2026-11-10.
Source of every decision: the author's answers in six question rounds on
2026-11-10. Items marked «default» were not asked and need a yes.
Facts about the four tools were read in their official docs on 2026-11-10 and
are **read, not tested** unless a line says otherwise.

## 1. What it is

A working method for AI coding agents that installs into any repository and
adapts to it. It carries the method proven in one production project
(the reference project) to any other system.

The goal, in the author's words (2026-11-10): make the work with any AI as
efficient as possible in every sense, with the highest quality possible.
Every piece below is judged against both halves: what it saves and what it
guards.

Two things travel:

1. **The flow**: seven mandatory stages, the agents that run them, the hooks
   that enforce them and the scripts that brake a push.
2. **The package**: one manifest that lists every piece with its origin,
   exact version, hash and license, and a small installer that writes the
   layout each tool expects.

Adaptation is part of the product: on first run it researches the repository,
then interviews the owner about code, architecture, business and goals at 3,
12 and 36 months, and writes that project's rules and risk reviewer.

### Who it is for

- First user: a solo technical founder.
- 12-month goal: the author's own tool, published. It serves the author first.
  Publishing carries no support commitment.
- License: MIT, free and open.
- Home: a new repository on the author's personal account, named `xworkflows`.

### Tools supported from the first release

Claude Code, Codex, Cursor, Gemini CLI.

### Out of scope

- Marketing skills and any skill that is not part of the flow.
- Changes to the reference project. It does not migrate; it stays as the model.
- Indexing past chat sessions.
- Reading anything but code and its git history at startup (first version).
- Stack skills (database, framework) in the core. See 7.3.

## 2. Standing requirements

- **Token efficiency.** Every piece is judged by what it costs in context.
  Rules load by path, agents return short reports, hooks deny early, the
  memory index is one line per fact.
- **Hooks are first-class.** They cut token use and hold quality. Logic is
  written once, tested, and wrapped thinly per tool. The git brake is the
  backup, never the replacement.
- **Simple tools.** No dependency in the installer. If a piece grows past its
  section here, work stops and options go to the author.
- **Never blocks client work.** Built in its own repository and session.

## 3. The flow: seven stages, all mandatory

| # | Stage | What it produces | Enforced by |
|---|---|---|---|
| 1 | Deepen | The request rewritten: what a top professional would add, raw material, methods, outside proof | skill `deepen` |
| 2 | Design questions | Decisions in rounds, recommended option first; facts are looked up, never asked | skill `grill` + hook `design-first` |
| 3 | Plan | Written plan; each plan cites the goal it serves | skill `plan` + brake `goal-cited` |
| 4 | Implement | Small batches run by agents with exclusive file ownership, one branch per batch | skill `orchestrate` + hooks `orchestrator`, `handback` |
| 5 | Review by risk | One reviewer per batch, chosen by what the change touches | agents `review`, `risk-review` + brake `review-seal` |
| 6 | Brakes | One script that fails the push | `xworkflows check` from git `pre-push` |
| 7 | Pending list | One living list; an item is deleted in the commit that closes it | brake `pending` |

Evidence for this core, from the reference project (6 saved sessions since
2026-10-18, counted with `grep` over the session files): question dialog 739
uses, workflow runs 210, implementer agents 589, read-only lookups 265,
reviewer 230, risk reviewer 108. Ask, plan, implement with agents, review by
risk is what is really used. Tokens per stage are in section 13.

Inside stage 5: a finding enters the plan only after `verify-finding`
reproduces it with a failing test. There is one review per batch, before the
batch merges. A fix is confirmed by a fresh reviewer of the same role, never
the one that asked for it; it reads only the diff of the fix (owner,
2026-11-11). Two rounds at most; if findings that
block still remain, the owner decides: fix, accept, or revert.

## 4. Source layout (the `xworkflows` repository)

```
manifest.json          every piece: origin, version, hash, license
bin/xworkflows.mjs     the installer, Node, no dependencies
skills/<name>/SKILL.md the flow skills
agents/<role>.md       role definitions, model given as a tier
rules/<zone>.md        default rules with a `paths:` header
hooks/core/*.mjs       hook logic, one file per hook, each with *.test.mjs
hooks/adapters/        one thin wrapper per tool
checks/*.mjs           the brakes run by `xworkflows check`
tiers.json             tier -> model, one table per tool
templates/             files written into a project (BUSINESS.md, PENDING.md, AGENTS.md)
docs/                  this design, the per-tool gaps, the install guide
```

Modified third-party pieces live in `skills/<name>/` (or `agents/`) with
`LICENSE` and `SOURCE.md`, as `grill` does. There is no `vendor/` folder
(owner, 2026-11-11).

One source, four outputs. Nothing tool-specific is written by hand.

## 5. The manifest

`manifest.json` is the «requirements file». JSON, so the installer needs no
parser. One entry per piece:

```json
{
  "id": "grill",
  "kind": "skill",
  "origin": "vendored",
  "source": "https://github.com/mattpocock/skills",
  "version": "<commit sha>",
  "sha256": "<hash of the installed files>",
  "license": "MIT",
  "modified": true,
  "scope": "project",
  "tools": ["claude", "codex", "cursor", "gemini"]
}
```

- `kind`: `skill`, `agent`, `hook`, `rule`, `check`, `plugin`, `cli`.
- `origin`: `own` (written here), `vendored` (third-party, modified, copied
  into `skills/<name>/` or `agents/` with its license), `fetched` (third-party, untouched, pulled
  from its source at the pinned version).
- `scope`: `project` (travels with git) or `user` (personal preferences).
- A piece with no pinned version or no license does not ship. `grill` and
  the React skill still need their origin commit recorded.
- The two `thermo-nuclear-*` skills come from `cursor/plugins`, folder
  `thermos/` (MIT, Copyright (c) 2026 Cursor). Compared on 2026-11-10 with
  commit `dc415439eebed0cd8fddb11e896dee43bce9d8b0`: the license file is
  identical and the skill text differs only by the reference project's
  adaptations. They ship as `vendored` once that project-specific section
  is replaced by a generic one.

A second file, `.xworkflows/installed.json`, is written inside each project:
what was installed, at which version, with which hash. It is what `update`
and `doctor` compare against.

## 6. The installer

One file, Node standard library only. Run with `npx github:<account>/xworkflows <command>`.

Language decided 2026-11-10: Node. The hooks being generalized are already
Node files with tests, there is no build or signing step, and the language
does not change token use. Known ceiling: Node must be on the machine and a
hook call pays about 30 ms of start time (`node -e 0`, 10 runs, 0.304 s on
the author's Mac). If that is ever measured as a problem, the same source
compiles to a single binary with Bun; a Go or Rust rewrite is not planned.

| Command | What it does |
|---|---|
| `install` | Unpack: detect which of the four tools are present, write each one's layout, fetch `fetched` pieces at their pinned version, verify every hash, install the git `pre-push` hook, write `.xworkflows/installed.json` |
| `pack` | Rebuild `manifest.json` from the source tree: recompute hashes, fail on a piece with no version or license |
| `doctor` | Exit 0 unless a piece is missing or unreadable; a file changed locally is a warn. Also checks that every required CLI answers, every hook test passes and every tool's layout is complete (owner, 2026-11-11). Prints the size of the always-loaded instructions |
| `check` | Run the brakes (section 9). Called by `pre-push` |
| `update` | Show the diff between installed and latest. A file untouched since install is replaced; a file the project changed is shown side by side and kept unless accepted |
| `propose` | Take a project's local change to a piece and prepare it as a patch against `xworkflows` |
| `uninstall` | Remove exactly what `.xworkflows/installed.json` lists (section 6.2) |

The interview and the re-adaptation are skills, not installer commands: they
need the agent.

### 6.1 What `install` writes per tool

| Piece | Claude Code | Codex | Cursor | Gemini CLI |
|---|---|---|---|---|
| Skills | `.claude/skills/` | `.agents/skills/` | reads `.agents/skills/` | reads `.agents/skills/` |
| Agents | `.claude/agents/*.md` | `.codex/agents/*.toml` | reads `.claude/agents/` | `.gemini/agents/*.md` |
| Instructions | `CLAUDE.md` importing `AGENTS.md` | `AGENTS.md` | `AGENTS.md` | `AGENTS.md`, named in the setting `context.fileName` (its default is `GEMINI.md`) |
| Path rules | `.claude/rules/*.md` | `AGENTS.md` per directory | `.cursor/rules/*.mdc`, or `AGENTS.md` per directory | context file per directory |
| Hooks | `.claude/settings.json` | `.codex/hooks.json` | `.cursor/hooks.json` | `.gemini/settings.json` |

`AGENTS.md` is the single source of instructions; the other files point to it
or are generated from it. Skills are written twice (`.claude/skills/` and
`.agents/skills/`) because Claude Code's skills page names only
`.claude/skills/`.

### 6.2 Installing over a project that already has configuration

The pilot is such a project. Read on 2026-11-10: it has a `CLAUDE.md` (5,013
bytes, `wc -c`), a `.claude/settings.json` with keys `env` and `hooks` (two
`PreToolUse` entries that call a code-graph guard by absolute path), no
agents, no skills, no rules, no `AGENTS.md`, no git hooks, and 12 uncommitted
entries (`git status --short | wc -l`). It is Python with pytest; the
reference is TypeScript and SQL. The reference project keeps its git hooks
in `.githooks/` through `core.hooksPath`.

The installer owns only what it wrote. `installed.json` is the list.

| Case | What `install` does |
|---|---|
| A file it would write does not exist | Writes it and records its hash |
| A file exists and is in `installed.json` with the same hash | Replaces it (an update) |
| A file exists and is in `installed.json` with another hash | Keeps it, shows the diff, counts it as a local adaptation |
| A file exists and is not in `installed.json` | **Never overwritten** |
| JSON settings (`.claude/settings.json`, `.codex/hooks.json`, `.cursor/hooks.json`, Gemini `settings.json`) | **Merged**: its hook entries are appended to the existing arrays; no existing key or entry is changed or reordered. Its entries are recognized by their command path under `.xworkflows/` |
| `AGENTS.md` exists | **Merged**: one block between `<!-- xworkflows:start -->` and `<!-- xworkflows:end -->`; text outside the block is never touched |
| `CLAUDE.md` or `GEMINI.md` exists | **Asked**: add one line that imports `AGENTS.md`. On no, the file is left alone and `doctor` warns that this tool does not load the rules (owner, 2026-11-11) |
| `core.hooksPath` is set, or a `pre-push` hook exists | **Asked**: chain (the existing hook runs first, then `xworkflows check`). Never replaced |
| An agent, skill or rule with the same name exists | **Asked** per file: keep theirs, or install under a prefixed name |
| The working tree has uncommitted changes | Proceeds, and prints the list of files it wrote so they can be committed apart |

`uninstall` reverses this and nothing else: it deletes each file in
`installed.json` whose hash still matches, lists the ones that changed and
leaves them, removes its entries from the merged JSON files, removes its
block from `AGENTS.md`, removes the import line it added, and restores the
git hook chain. It never deletes what the interview wrote (`docs/BUSINESS.md`,
the pending list, memory, rules): that is project content.

Running `install` twice must change nothing the second time.

What this pilot changes in the design: test files, test command, code
folders and comment marks cannot be fixed values (section 7.7), and the
`lint` pack must name the linter per stack.

## 7. Pieces

### 7.1 Agents and model tiers

A role asks for a tier, never a model. `tiers.json` maps tier to model per
tool and is the only place a model name appears.

| Role | Tier | Job |
|---|---|---|
| `explore` | cheap | Read-only lookup, returns 10 lines at most |
| `mechanical` | cheap | Renames and one-pattern edits, never logic |
| `implement` | medium | Implements a written spec in the files it owns |
| `verify-finding` | medium | Reproduces a review finding with a failing test, or discards it |
| `review` | top | Reviews a diff against the project's rules |
| `risk-review` | top | Written by the interview for this project (section 8.3) |
| `dream-analyzer` | cheap | Reads one session extract and verifies, enriches and organizes memory (section 7.9) |
| `dream-organizer` | cheap | Runs once after the analyzers: merges duplicates, marks conflicts |

Tier tables for Codex, Cursor and Gemini are filled at build time from each
tool's docs. Start at the cheapest tier that holds the rules; escalate one
tier, once, on a defined failure (type check red, test red, agent returns
`blocked`).

### 7.2 Hooks

Each hook is a pure function in `hooks/core/`: a normalized event in
(`event`, `tool`, `input`, `session`, `isSubagent`), a decision out (`allow`
or `deny` plus the reason). Each has a test file run with `node --test`. The
adapter for each tool reads that tool's JSON from stdin, calls the core and
answers in that tool's form (exit code 2 or a `deny` decision).

| Hook | Event | What it stops | Generalized from |
|---|---|---|---|
| `design-first` | before a file write | Creating a spec or adding questions to one before the `grill` skill ran this session | `grilling-antes.mjs` |
| `orchestrator` | before a tool call | The main session doing an agent's work (long reads, lookups), and the first agent launch before `orchestrate` was loaded | `orquestador.mjs` |
| `handback` | when an agent returns | A report without its red/green test line, what it skipped and its commit | `subagente-rojo-verde.mjs` |
| `memory` | session start, before compaction | Nothing: it refreshes the memory index and brings back the notes on the current topic | `memoria.mjs` |
| `modes` | session start | Nothing: it turns on the personal preferences (user scope) | `~/.claude/hooks/modes.js` |

Rules for every hook: a broken input lets the call through with a warning (a
hook never traps an agent); an escape variable exists and is logged; project
names, people and paths come from `.xworkflows/config.json`, never hard-coded.

Known gaps, written in `docs/gaps.md`:

- Codex runs the tool when a hook errors, times out or answers malformed.
  The git brake covers it.
- The agent-return event is tested in Claude Code only. Codex and Cursor
  document one, Gemini CLI's is inferred (section 12). Where it fails,
  `review-seal` is the stop.

What the full read of the reference hooks added (2026-11-10; line by line in
`docs/reference-coupling.md`):

- `orchestrator` holds seven rules, not two: the `orchestrate` skill before
  the first agent; only agents defined in the repository; lookups only after
  a query to the code index in the last 30 minutes; the risk reviewer must
  name a plan or spec and never runs twice on one commit; the third agent
  without an owner decision goes to a scripted run; no web search, image or
  PDF read in the main session; no read over 40 lines of the heavy folders.
- Three of those rules need facts only Claude Code is known to give: a field
  that marks a subagent, an event when a skill runs, and an event when the
  user decides. Each is an adapter function; where a tool cannot answer, the
  rule is off for that tool and `docs/gaps.md` says so.
- «Did the skill run?» is answered two ways today (a mark file, and parsing
  the session transcript), and both lean on Claude Code. The product uses
  one way that needs no skill event: the skill's first step is the shell
  command `node .xworkflows/mark.mjs <skill>`. Every tool's pre-tool hook
  sees shell commands with the session id, so the hook writes the mark. If
  the model skips the step, the write stays denied: it fails closed.
- Main-session-only rules need to know a call comes from a subagent. Claude
  Code says so in the input. Codex and Cursor do not document that field on
  pre-tool hooks but do have subagent start and stop events; there the
  adapter keeps a count of running subagents per session and the rules apply
  only while it is zero.
- Cursor's hook input carries the user's email. Adapters never store or
  print it.
- `memory` does nothing on Windows today (it needs bash and qmd). The product
  version is Node only; qmd is required (section 7.5).
- 22 of the 222 hook lines carry a fixed project name (`grep -cE`); all of
  them map to a config key, a product constant or an adapter.

### 7.3 Skills

Own: `deepen`, `orchestrate`, `plan`, `adapt` (the interview), `pending`,
`dream` (section 7.9), `full-review` and `next-step` (section 8.5).
Vendored (modified, with license): `grill` (mattpocock/skills, MIT), `tdd`,
`ponytail`, `ponytail-review`, `thermo-nuclear-review` and
`thermo-nuclear-code-quality-review` (cursor/plugins, MIT).
Fetched (untouched, pinned): the `superpowers` plugin, and the personal
preference plugins `caveman` and `i-have-adhd`.

Licenses of the fetched plugins are recorded at build time; a fetched piece is
not redistributed, only pointed to.

Stack skills are not core. The interview detects the stack and adds the
matching skills to that project's `installed.json` as `fetched` pieces.

### 7.4 Personal preferences

Terse replies, the ADHD reply shape and least-code mode ship with the product
and are on by default. They install at user level, not in the repository, so
a second person cloning the project does not inherit them. `install
--no-preferences` skips them.

### 7.5 Memory

Files in the repository, readable by all four tools:

- `docs/memory/<fact>.md`: one fact per file (what, why, how to apply, date).
  Each opens with a header of `name` (the file's slug), `description` (one
  line: what it covers and when to read it) and `metadata`, and links to
  related facts as `[[slug]]`. Claude Code's memory and Anthropic's dreaming
  recipe use this same shape.
- `docs/memory/MEMORY.md`: the index, one line per fact, loaded every
  session. It is **generated** by a script from the headers of the memory
  files and never edited by hand, so parallel batches cannot collide on it.
- `docs/PENDING.md`: the living list.
- Decisions are written into the plan or spec they belong to, in the commit
  that makes them.

`qmd` is required (owner, 2026-11-11). The memory folder is an Obsidian-style
vault indexed by `qmd`. Past sessions are not indexed.

Facts of type `user` and `feedback` go to `~/.xworkflows/owner.md`, never into
the repository. Facts of type `project` and `reference` stay in the
repository memory (owner, 2026-11-11).

Three guardrails, added 2026-11-10 after a talk on context engineering by an
Anthropic engineer (transcript read up to minute 20; the rest was missing):

- **Stale memory.** The `stale-memory` brake fails when a memory names, in
  backticks, a file path that no longer exists in the repository. The fix is
  to correct the memory or delete it.
- **Curated files are read-only for subagents.** `AGENTS.md`, the rules and
  `docs/BUSINESS.md` (key `paths.curated`) change only in the main session,
  where the owner decides. An agent that tries is denied by the
  `orchestrator` hook and reports the change it wanted instead.
- **Learning across sessions: the `dream` skill.** One session cannot see a
  mistake repeated in five others. Section 7.9 holds its design.

One memory, not two. Claude Code keeps its own memory in
`~/.claude/projects/<project>/memory/`, in the same shape this design uses
(an index plus one file per fact). Its setting `autoMemoryDirectory`, read
from any settings scope, moves that folder; `install` points it at
`docs/memory/`. Whether the setting takes a path relative to the repository
is not confirmed: phase 0 tests it.

The generated index wins (decided 2026-11-10). Claude Code's own habit is to
edit `MEMORY.md` during a session. The script rebuilds it from each file's
`description` line when a session ends and before a push, so a hand edit is
overwritten, and the `index-current` brake fails a push whose index does not
match its files. Claude Code loads the first 200 lines or 25 KB of the
index; the 24,000-byte budget of section 13 sits under that.

### 7.6 Git rules

Shipped as defaults; the interview confirms each one:

- One branch per batch, merged with `--no-ff`, never rebased after review.
- Push only when the owner says so.
- Files are added by explicit path, never `git add .` or `-A`.
- No commit, PR or comment names an AI as author or co-author.

### 7.7 `.xworkflows/config.json`

Every key below replaces a value that is fixed in the reference code; the
line each came from is in `docs/reference-coupling.md`. The interview fills
it. A project-specific key has no default: a missing one makes the brakes
that need it exit 2 and `doctor` fail, while `[]` written by the interview is
a valid answer. The reference column is not the default (owner, 2026-11-11).

| Key | Meaning | Reference value |
|---|---|---|
| `owner` | Name used in messages and question headings | the author |
| `mainBranch` | Branch the pending list and seals are checked against | `main` |
| `paths.plans`, `paths.specs` | Where plans and specs live | `docs/superpowers/plans`, `docs/superpowers/specs` |
| `paths.pending` | The living list | `docs/PENDIENTES.md` |
| `paths.code` | Folders where a fix needs a test | `src api supabase scripts workers` |
| `paths.nonCode`, `paths.codeAnyway` | What needs no review, and its exceptions | docs and markdown; hooks and settings |
| `paths.risk` | A change here accepts only the risk reviewer and no escape | `supabase tools/db-tests scripts/apply-migrations.sh` |
| `paths.heavyRead` | Folders the main session may not read at length | `src supabase` |
| `paths.curated` | Files only the main session may change | new: instructions, rules, the business file |
| `roles.reviewer`, `roles.riskReviewer`, `roles.implementers`, `roles.lookup` | Agent names per role | `revisar`, `dinero`, two implementers, `Explore` |
| `roles.verifier`, `roles.builtIn` | Agent name of the finding verifier; built-in agent names the project allows | new |
| `zones` | The zones of the code the interview found | new; default `[]` |
| `paths.reviews` | Where review notes live | new; default `docs/superpowers/reviews` |
| `git.rules` | The git rules the owner confirmed (section 7.6) | new |
| `brakes.changeSize.warn`, `brakes.changeSize.max` | Code lines changed on a branch: warn, fail | new; defaults 400, 800 |
| `tokens.sessionStartBytes` | Budget for text the session-start hooks inject (section 13) | new |
| `limits.inlineReadLines` | Longest read in the main session | 40 |
| `limits.agentsBeforeWorkflow` | Agents in a row before a scripted run is required | 2 |
| `limits.commentRatio`, `limits.commentMinLines` | Comment brake | 0.20, 30 |
| `lookup.index` | Command, folder and minutes of the code index rule | `graphify query`, `graphify-out`, 30; also the default (owner, 2026-11-11) |
| `mainSession.denyWeb`, `mainSession.denyExtensions` | What the main session hands to an agent | true; `png jpg pdf` |
| `tests.files` | Patterns that mark a test file | `*.test.ts`, `*.test.tsx`, `*.test.mjs` |
| `tests.run` | Command that runs given test files | `node --test <files>` |
| `tests.notRunnable` | Test folders the fix brake cannot run by itself | database and worker tests |
| `comments.marks` | Comment marks per file extension | `//` family, `--` for SQL, `#` for shell |
| `checks.project` | The project's own commands | type check, unit tests |
| `checks.patterns`, `checks.ratchets` | Forbidden patterns; counters that may only go down | project lists |
| `packs` | Enabled check packs with their options | `semgrep trivy squawk lint bundle` |
| `memory.index`, `memory.collections` | Index name and folders it covers | one index, five folders |
| `tokens.alwaysLoadedBytes` | The budget of section 13 | 24000 |
| `memory.dir` | The one memory folder | `docs/memory` |
| `dream.maxExtractBytes` | Most session text one `dream` run may read | proposal: 4000000 |
| `research.askSourceFor` | Topics where the owner names the source before any search | legal and tax |
| `screens.widths` | Widths every visual change is captured at | 360, 1280 |
| `tests.writeTargets` | Where a test that writes may write | one named test instance |

Not configurable, the same in every project (product vocabulary, in
English): the seal line `<role> ok at <sha>`; the commit-body escapes
`no-test:`, `no-test-for: <sha>`, `no-review:`, `comments:`,
`pending-for: <sha>`, `size-ok: <reason>`; the pending card `P-<n>` closed by `closes P-<n>`; the
report keys `red:`, `green:`, `skipped:`, `sha:`, `reviewed:`,
`not checked:`, `blocked:`, `discarded:`, `no-test:`, `needs judgment:`,
`cannot test:`, `ask-owner:`; the comment mark `shortcut:`.

### 7.8 How the flow looks things up, tests and looks at screens

Added 2026-11-10 at the author's request: the way of searching online,
testing and capturing screens is part of the flow, not a habit outside it.

**Looking things up online**

- Find a page with the tool's own web search. Read it with Crawl4AI
  (`crwl <url> -o markdown-fit > <file>`), which saves the full text to a
  file; then read from the file only the lines needed. Never a summary of a
  page nobody kept. Manifest piece `crawl4ai`, kind `cli`, `fetched`, pinned
  (v0.9.5 on the build machine, `uv tool list`).
- Search what is already on disk before downloading more. On 2026-11-10,
  most of the open items of section 12 were answered from pages downloaded
  earlier; one new page was needed.
- A page that will not load (anti-bot, login) stops there: the owner is
  told. No browser is opened.
- In the main session web calls are denied (`mainSession.denyWeb`). A lookup
  agent does them and returns the answer, not the page.
- For the topics in `research.askSourceFor` the owner names the source first
  and only that source is used, cited.
- Every fact carries one of three labels: tested, read not tested, not
  confirmed.

**Testing**

- A fix starts with a test that fails without it. Enforced twice: the
  `handback` hook asks the agent for its `red:` and `green:` lines, and the
  `fix-has-test` brake reruns the test on the parent commit.
- A review finding enters a plan only after the `verify-finding` agent
  reproduces it with a failing test.
- Tests exercise behavior through real inputs and outputs. A test that
  matches source text is replaced by a `patterns` brake.
- A reviewer does not rerun tests the author reported green; the push runs
  everything.
- A test that writes data writes only to `tests.writeTargets`.
- Every number comes with the command that produced it.

**Looking at screens** (check pack `screens`, for projects with an interface)

- Captures are taken only for visual changes, at every width in
  `screens.widths`.
- The capture runs on Playwright (the reference pins 1.63.0). The pack takes
  a list of addresses and the widths; a project keeps its own script for
  flows that need a login.
- The main session never opens an image (`mainSession.denyExtensions`): an
  agent looks and returns ten lines at most.

### 7.9 The `dream` skill

A pass that runs apart from the work, reads past sessions with hindsight and
improves the memory future sessions read. It copies the method of Anthropic's
Dreams, not the service: Dreams is a research preview of their paid API, it
needs an access request, and it reads cloud sessions, not the sessions of a
coding tool on the owner's machine.

Sources, read 2026-11-10: the official Dreams page, the official Memory
stores page, the Claude Cookbook recipe «Dreaming with a dynamic workflow»
(the four prompts in full), and a talk on context engineering by an Anthropic
engineer (transcript read to minute 20; the rest was missing). All **read,
not tested**.

#### What a run does

1. **Extract** (a script, no model). For each session since the last run it
   keeps the text both sides wrote and drops tool output, strips harness
   noise, and masks secrets. One plain-text file per session, in a private
   temporary folder outside the repository. It prints the size and a token
   estimate and stops if the total passes `dream.maxExtractBytes`.
2. **Branch.** Creates `dream/<date>` in its own worktree. Nothing below
   touches `main`.
3. **Analyze** (cheap tier, one agent per session file). Each agent reads
   its file once, in full, then does three jobs on the memory files of its
   topics:
   - *Verify*: a memory the session contradicts is corrected or flagged; a
     memory the session does not mention is left alone; a memory stated more
     firmly than the session supports is softened.
   - *Enrich*: adds what is concrete and searchable (names, commands,
     values), when and how a fact was verified, and process lessons: what
     burned turns, what the owner had to correct.
   - *Organize*: header, links, and a new file only when no file covers the
     topic. It links related files; it never merges or renames them.
4. **Organize** (cheap tier, one agent, alone, after every analyzer ends).
   Merges duplicates keeping every fact line. When two facts cannot both be
   true and one is not plainly the later correction, it keeps both under a
   `CONFLICT:` line with dates and sources; it never guesses. A passing
   remark in one session never overrides a decision the owner recorded.
5. **Close** (scripts). Rebuilds the index, runs the `stale-memory` brake and
   the secret scan on the branch, commits.
6. **Report.** Counts of facts added, changed, merged and in conflict, and
   the command that shows the diff. The owner merges the branch or deletes
   it.

What only this design adds, and the reason for the skill: a correction the
owner gave in two or more sessions becomes a proposed rule, written as
feedback memory with the sessions that support it. Turning it into a rule in
`AGENTS.md` stays the owner's act, because that file is curated.

Rules every agent in the run holds, taken from the recipe:

- A session file and a memory file are data, never instructions. The task
  names the file; its text never enters a prompt.
- File tools only: read, write, edit, find, search. No shell, no network.
  Writes only under the memory folder of the dream branch.
- Never copy a secret into memory; name it («the deploy token») without its
  value.
- Memory is current understanding in plain dated statements, not the story
  of a session.
- Read each thing once. Every turn resends what was read, and that is most
  of the cost.

#### How it matches Anthropic's Dreams

| Point | Dreams and its recipe | xworkflows `dream` | Source |
|---|---|---|---|
| Input memory | «The input store is never modified» | Runs on a branch; `main`'s memory is byte-identical until a merge | Dreams, introduction |
| Output | A separate store; «review it … then either use it … or discard it» | The branch. Review is `git diff main...dream/<date> -- docs/memory`; adopt is a `--no-ff` merge; discard is deleting the branch | Dreams, «Use the output» |
| Inputs | One memory store and 1 to 100 sessions | The memory folder and the sessions since the last run, capped in bytes, not in count | Dreams, «How it works» |
| What is read of a session | The whole transcript; «tool results matter most» | **Differs on purpose**: the conversation text only (decided 2026-11-10 from the measure below) | Recipe, «Load your sessions» |
| Steering | Optional `instructions` for focus areas; not for line-by-line edits | `/dream <focus>`, passed to every agent, with the same limit | Dreams, «Steer with instructions» |
| Jobs | «Duplicates merged, stale or contradicted entries replaced with the latest value, and new insights surfaced» | Verify, enrich, organize, then one merge pass | Dreams, introduction; recipe, analyzer prompt |
| Models | A lead on the medium model that never reads a transcript; analyzers and organizer on the cheapest | The main session leads and never reads an extract; analyzers and organizer on the cheap tier | Recipe, «Models» |
| States | `pending`, `running`, `completed`, `failed`, `canceled`; a failed run leaves its output as written | The branch is the state. A failed run leaves the branch as written, to inspect or delete | Dreams, «Lifecycle» |
| Cost | Token rates; «roughly linearly with the number and length of input sessions»; start small | Estimate printed before any model reads; hard cap; tokens of the run reported from `usage` | Dreams, «Billing»; recipe, «Cost» |
| Untrusted input | Transcripts are data; file tools only; empty network allowlist; no secrets into memory | The same four rules | Recipe, «Treat transcripts as untrusted input» |
| Writers at once | Analyzers re-read before an edit and read back after a write; the organizer runs alone | The same; the shared index is not a problem because it is generated at the end | Recipe, analyzer and organizer prompts |
| History | Every change is a version; kept 30 days; a version can be redacted | Git history, no expiry. A secret committed there cannot be redacted, only rewritten out, so the mask and the scan run **before** the commit | Memory stores, «Audit memory changes» |
| Who may write memory | The dreaming session only; normal sessions mount it read-only | **Differs**: sessions keep writing memory as they work (the coding tool does this by itself). Curated files are read-only for subagents | Recipe, «Use what it learned» |
| Records | Kept out of the repository, in a private temporary folder | The same for extracts | Recipe, «Records stay out of the repository» |

#### The measure behind «conversation text only»

The reference project's 6 saved main sessions, measured with a Node
one-liner that imports the reference's own extractor
(`scripts/memoria-sesiones.mjs`: functions `conversacion` and `tapar`):

| What is kept | Size |
|---|---|
| Whole session files | 256.8 MB |
| Text both sides wrote (tool output dropped) | 3.6 MB |
| The owner's turns only | 0.6 MB |

The conversation text is 71 times smaller than the whole, so that is what
`dream` reads. What is lost: an exact command that appears only in tool
output and that neither side repeated in words. The secret mask replaced 136
strings in that text; it masks too much rather than too little.

For scale, the recipe reports about 8 US dollars at list price and ten
minutes for 12 MB of transcripts with cheap-tier analyzers. The reference's
whole history is under a third of that. No run has been made; these are not
this product's numbers.

Keys: `dream.maxExtractBytes` (proposal: 4,000,000, above the reference's
whole 3.6 MB), `memory.dir`. Where sessions live is an adapter fact.

Grade: `tested` on Claude Code only, once it runs. Codex and Cursor give a
transcript path whose format is declared unstable or was not found, and
Gemini CLI's was not read (section 12); there `dream` is off.

## 8. Adaptation

### 8.1 Research (no questions yet)

The `adapt` skill reads the code and its git history with cheap read-only
agents and returns: stack, layout, test setup, where data and money move,
what changes most often, what breaks most often (reverts and fix commits).
Facts are never asked of the owner.

### 8.2 Interview

The agent asks until it is confident it understands the project in every
aspect (owner, 2026-11-11). Questions come with the recommended option first,
in the user's language. Then it plays back a plain summary that is concise and
skips no detail, and asks «Did I understand correctly?». On «No» it asks what
was missed, fixes the summary and asks again. It stops on «Yes, you
understood». The interview does not end while a required config key is
missing. The summary headings are these topics, plus «about you», which is kept
in `~/.xworkflows/owner.md`, outside the repository:

1. Business: who pays, what is sold, what is not done.
2. Goals at 3, 12 and 36 months, rough aspirations with no dates.
3. Risk: «which mistake would cost you the most?»
4. Architecture: what must not change, what is free to change.
5. Way of working: git rules, review depth, who may push.
6. Reply preferences and model budget.

What is asked is split in three (owner, 2026-11-12):

1. What the code and the project's files show, and is coherent. Research
   writes it as a rule marked «from the code»; the owner is not asked rule by
   rule. All of it is shown once, on one short screen ordered by risk: one
   general rule per area, about 12 at most. The owner strikes what is habit
   and not rule, and corrects the level («not this function: all money»).
   Nothing from this group reaches `AGENTS.md` without passing that screen.
2. Where the code contradicts itself or leaves a gap. Few questions, about 6
   at most, each with its evidence (file and line): a written rule the code
   contradicts; a pattern with exceptions («done differently in these 2
   places: mistake or exception?»); a risk area with nothing protecting it
   («on purpose?»); a rule the code does follow that research has a reason
   to doubt (owner, 2026-11-12). A project can start from a wrong base, so a
   rule that is real is not always right. Research says which rule, why it
   may be wrong, and where it is applied. The owner answers «you are right»:
   the rule is not written, and changing the code becomes a pending card; or
   «keep it, because …»: the rule is written with that reason beside it.
3. What is in no file. This is the centre of the interview: business rules,
   what the project does not do, the costliest mistake, one real incident,
   what is free to change, the goals at 3, 12 and 36 months, and which part
   of today's code is provisional because of those goals. Each question
   leans on what research found.

When the screen of group 1 would pass about 12 rules, or group 2 about 6
questions, nothing is cut in silence: the owner is told how many were left
out and why. The split is under test (10.1). Until the owner approves the new
version, the shipped `adapt` follows the 1.2b spec.

Claude Code asks through its question dialog and Gemini CLI through
`ask_user` (read, not tested). For Codex and Cursor no dialog with options
was found; the fallback is numbered questions in the chat with the
recommended answer marked.

### 8.3 What the interview writes

| File | Content |
|---|---|
| `docs/BUSINESS.md` | Who pays, what is sold, goals at 3/12/36 months, no dates, as lines `G<n> (about N months): ...`, what is not done. A living file |
| `AGENTS.md` | The project's unbreakable rules, from round 3 and 4 |
| `rules/<zone>.md` | Rules per zone of the code, with their paths |
| the `risk-review` agent | That project's reviewer: what it guards and the checklist it holds |
| `.xworkflows/config.json` | Owner name, zones, which paths count as risk, confirmed git rules |

### 8.4 Re-adaptation

- By command: the `adapt` skill run again asks only what changed.
- By age: when the approved summary is more than 3 months old, the `memory`
  hook says so at session start (owner, 2026-11-11).

### 8.5 After the interview

One question: run a full review first, or start on the next step. Neither is
recommended; the full-review option shows its token estimate. Then a next step
is chosen from: what the owner asked for; next steps already written in the
project; otherwise suggestions (or the findings of the full review). The skills
`full-review` and `next-step` do this (owner, 2026-11-11).

## 9. Brakes (`xworkflows check`)

The same script in all four tools, run by git `pre-push`. It fails the push on:

| Brake | Fails when |
|---|---|
| `review-seal` | The plan lacks «<reviewer> ok at <sha>» covering every code commit in the range; risk paths accept only `risk-review` |
| `goal-cited` | A plan does not cite a goal from `BUSINESS.md` |
| `pending` | `PENDING.md` breaks its own header rules |
| `signature` | A commit in the range carries an AI author or co-author line |
| `fix-has-test` | A `fix` commit that touches code carries no test in the same commit, **or its tests also pass on the parent commit** (they are run there, in a throwaway worktree, and must fail). Escape: a `no-test: <reason>` line in the commit body |
| `comment-ratio` | More than 20 % of the new code lines in the push are comments; `shortcut:` comments do not count |
| `skills-travel` | An agent definition names a skill that is not in git, so it would start without it on another machine |
| `patterns` | A new line in the range matches a pattern the project forbids (list in `config.json`); replaces tests that match source text |
| `ratchet` | A counted debt the project declares (list in `config.json`) went up; it may only go down |
| `stale-memory` | A memory file names a path that no longer exists in the repository |
| `index-current` | The memory index is not what the script generates from the memory files |
| `project` | The project's own checks (tests, type check), listed in `config.json`, fail |
| `change-size` | Code lines changed on the branch against `mainBranch`: warn at 400, fail at 800. Tests, docs, fixtures, JSON, lockfiles and generated files are not counted; SQL migrations count. Escape: a `size-ok: <reason>` line in the commit body |
| `graph-current` | On a push to `mainBranch` in a project with code, `graphify-out/graph.json` is older than the pushed head |

`graphify` is required in every project with code. Git hooks (`post-merge`,
and `post-commit` on `mainBranch`) and the session-start hook keep it current.
`graphify-out/` is git-ignored (owner, 2026-11-11).

Hooks are the early help; this is the stop that does not depend on the tool.

### 9.1 Where these come from

Decided 2026-11-10: every stack-neutral process check of the reference
project's `review.sh` ships in the core; static analysis tools ship as packs;
domain checks stay in the reference project.

| Core brake | Reference mode |
|---|---|
| `review-seal` | `revision-final` |
| `pending` | `pendientes` |
| `fix-has-test` | `prueba-del-fix` |
| `comment-ratio` | `comentarios` |
| `skills-travel` | `skills-agentes` |
| `patterns` | `frenos` (its rules become a per-project list) |
| `ratchet` | `trinquete` (its one counter becomes a per-project list) |
| `goal-cited`, `signature`, `stale-memory`, `index-current`, `change-size`, `graph-current` | new |

### 9.2 Check packs

A pack wraps one static analysis tool as a brake. Packs are off until the
interview turns them on for the detected stack. Each is a `fetched` piece in
the manifest with its pinned version; `doctor` fails if an enabled pack's
tool is missing.

| Pack | Enabled when | Brakes or only reports |
|---|---|---|
| `semgrep` | any repository | brakes on severity `ERROR`; rule sets chosen by stack |
| `trivy` | any repository | brakes on `HIGH` and `CRITICAL` with a fix, vulnerabilities and secrets. Scans what git holds in the commit, never the folder, so local secret files are not read. Binary pinned by version and by one sha256 per platform |
| `lint` | the stack has a linter (ESLint and knip in the reference; to choose for Python) | brakes on rules already at zero, reports the rest |
| `squawk` | Postgres migrations | brakes; only on migrations added in the range |
| `bundle` | a web build | brakes, by the reference's bundle check (its source not read) |
| `lighthouse` | a web app | only reports |

The brakes run in the reference by a `pre-push` hook, and a CI job reruns
them when a push arrives without the seal of a `pre-push` that passed. The
product ships that CI job as an optional piece: `pre-push` alone is skipped
by `git push --no-verify`.

Not shipped (reference-project domain): `dia-caracas`, `reloj-telefono`,
`cte`, `clientes`, `acceso`, `diagrama`, `datos`, `base`, `app`, `avisos`,
`camino`, `tablero`.

## 10. Proof that it works

1. Clean install on macOS, per tool: `xworkflows doctor` exits 0. Windows runs at publish on a Windows CI runner (owner, 2026-11-11).
2. Every installed file's hash equals the manifest's.
3. `node --test hooks/ checks/` passes.
4. Pilot in a second real project (the pilot), measured: minutes from
   `install` to the first reviewed batch, and the count of manual steps.
5. A person other than the author installs it from the written guide. To be
   found.
6. Claude Code denies a forbidden write in a real session: the recorded
   `deny` answer is the evidence. For Codex, Cursor and Gemini CLI the
   evidence is weaker and is called what it is: the adapter tests pass
   against fixtures built from the official docs (grade `documented`,
   section 11).
7. `install` run twice on the pilot: `git status --porcelain` and `git diff`
   are byte-identical before and after the second run. (The pilot's tree is
   not clean today, so «empty» cannot be the test; «unchanged» is.)
8. `doctor` fails when the always-loaded files pass the budget of section 13.
9. The interview test of section 10.1.
10. Every number in this document has the command that produced it beside it.
11. `dream`, tested backwards on the reference. Pick a cut date. N is the
    count of rules the owner wrote into memory after it. Run `dream` on the
    sessions before the cut, with memory as it stood then. M is how many of
    those N it proposes. The pass mark is the author's to set. Limit: saved
    sessions start on 2026-10-18, so the cut falls after that.
12. The tokens of that run, from `usage`, beside the command that summed them.
13. The secret scan finds nothing in the memory `dream` wrote.
14. After a run, `git status` and `git diff` on `main` show no change under
    the memory folder.

### 10.1 Testing the interview against the reference

The interview is the part that makes the product adapt, so it gets its own
proof. The reference project states 10 invariants in its instructions
(`awk` count of the bullets under «Invariants»).

1. Take a copy of the reference at a commit with `git archive` into a
   temporary folder. Remove every instruction file from the copy:
   `CLAUDE.md` files, `.claude/`, `docs/`. The reference itself is not
   touched.
2. Before running anything, write one yes/no line per invariant: what the
   generated rules must say for it to count as recovered.
3. Run the research step alone. Count recovered invariants: **R of 10**.
4. Run the interview with the owner answering. Count again: **I of 10**.
5. Pass mark, set by the author on 2026-11-10: I ≥ 8. Each invariant missed
   adds one question to the interview's bank.

R tells how much the code says by itself; I − R is what the questions add.
An interview that adds nothing is not worth 30 minutes.

Changed by the owner on 2026-11-12. `adapt` had been tuned and scored on the
reference alone, three rounds, so that score no longer says anything:

- The mark I ≥ 8 does not gate phase 1. It is measured afterwards, on several
  projects.
- The reference is used only to tune. The exam is two other projects of the
  owner's, never used to tune: exam project A (Python) and exam project B
  (Go). Each version of `adapt` goes through the exam once.
- The owner writes no answer key. Per exam project, before any run, a clone
  (`git clone --no-hardlinks`) loses its agent instruction files
  (`CLAUDE.md`, `AGENTS.md`, `.claude/`). The README and `docs/` stay: they
  are the project's files and `adapt` must read them. An agent that is not
  part of `adapt` takes from the removed files the rules already written
  there, each with its citation: the written key. A project with none of
  those files has an empty written key, and the report says so. The key is
  never used to tune.
- The owner judges blind, once per project. The rules of every version and
  every run are grouped by meaning and shown mixed, with no version named.
  The owner marks each one correct or invented, then adds, one line each,
  any important rule that is missing.
- For each rule of the key (the written one plus the owner's additions) an
  agent outside `adapt` looks for the proof in the code. «In the code» needs
  a file-and-line citation that a script verifies; without it the rule is
  «only in the owner's head». The reference's 10 invariants get the same
  treatment.
- Reported per project and per version, 3 runs each, with cost: correct;
  invented; escaped, split into «in the code» (research failed) and «only in
  the owner's head» (the interview's job); and, when an interview is
  measured, how many «only in the owner's head» rules reached the final
  rules, and the owner's minutes.

The names of the exam projects never enter a tracked file.

## 11. Build order

Phase 0 was added on 2026-11-10 and the author put it before the order
confirmed earlier that day (Claude Code first).

**Phase 0: a thin slice through all four tools.** One hook (`design-first`),
one skill (`grill`), one agent (`explore`), installed by hand-written files,
no installer yet. `design-first` is the chosen hook because it needs the two
things most in doubt: denying a write, and knowing that a skill ran.

The author has no accounts for Codex, Cursor or Gemini CLI and will not pay
for them (2026-11-10), and none is installed on the build machine
(`command -v codex cursor-agent gemini`: none found). So phase 0 has two
grades of proof:

| Tool | Grade | What phase 0 does |
|---|---|---|
| Claude Code | **tested** | A real session tries to create a spec before the skill ran: denied. Runs the skill, tries again: allowed. The JSON the tool sent to the hook is saved both times as a fixture |
| Codex, Cursor, Gemini CLI | **documented** | The adapter is written against the input and output shapes in the official docs (section 12). Fixtures are built from those documented shapes and are labeled `documented`, never `recorded` |

A `documented` tool ships with that word beside its name in the README and
in `doctor`'s output. It becomes `tested` when someone runs the real-session
check on it and sends the recorded fixture; the `propose` command carries
that. The official Gemini CLI docs name a free tier; whether to use it to
move Gemini to `tested` is the author's call.

Phase 0 ends with a go or a change to this design: if Claude Code cannot
pass the check, or the docs show a tool cannot deny a write, its column in
6.1 and its hooks in 7.2 are rewritten before anything else is built.

Then:

1. Claude Code: manifest, installer, `doctor`, the five hooks, the seven
   stages, pilot in the second project. Phase 1 is split into four
   sub-projects built in order: (1) installer; (2) day one; (3) the rest of
   the method; (4) pilot. Their specs are
   `docs/superpowers/specs/2026-11-11-phase1-{1..4}-*-design.md` (owner,
   2026-11-11).
2. Codex.
3. Cursor.
4. Gemini CLI.
5. Publish when all four pass points 1, 6 and 7 of section 10. Windows proof
   1 moves here and runs on a Windows CI runner (owner, 2026-11-11).

## 12. What the official docs say, tool by tool

Read on 2026-11-10 in each tool's official documentation. Claude Code's
column is tested daily in the reference project; the other three columns are
**read, not tested**. «Not found» means the pages read do not say; it is not
a no.

| Question | Claude Code | Codex | Cursor | Gemini CLI |
|---|---|---|---|---|
| Can a hook deny a write? | yes | yes: `permissionDecision: "deny"` on `PreToolUse`; file edits arrive as `apply_patch`. A hook that errors lets the call through | yes: `permission: "deny"` on `preToolUse` | yes: exit code 2 or `decision: "deny"` on `BeforeTool` |
| Question dialog with options | yes | not found | an «ask questions» tool is named; its shape not found | yes: `ask_user`, with `choice`, `text`, `yesno` and `multiSelect` |
| Event when a skill runs | yes | not found (a skill is named with `$skill` or picked by the model) | not found (`/skill-name` or picked by the model) | yes: the `activate_skill` tool, seen by `BeforeTool` |
| Subagent marked in pre-tool input | yes: `agent_id` | not on `PreToolUse`; `SubagentStart` and `SubagentStop` carry `agent_id` and `agent_type` | not on `preToolUse`; `subagentStart` carries `subagent_type` and `parent_conversation_id` | not found; a subagent is a tool of its own name, so `BeforeTool` sees the launch |
| Event when an agent returns | yes | `SubagentStop` | `subagentStop`, which can send a follow-up message | `AfterTool` on the agent's tool (inferred, not stated) |
| Reads `AGENTS.md` | through an import line in `CLAUDE.md` | yes, per directory | yes, per directory | only when `context.fileName` lists it |
| Reads `.agents/skills/` | not named in its skills page; only `.claude/skills/` | yes | yes | yes |
| Token use per turn on disk | yes: `usage` in the session file | a transcript path is given; its format is declared unstable | a transcript path is given; content not found | yes: telemetry metric `gemini_cli.token.usage`, written to a file when configured |

Consequences already folded into this design: the mark command of 7.2 (no
skill event needed), the running-subagent count of 7.2 (no marker needed),
skills written to two folders (6.1), and the question fallback of 8.2 for
Codex and Cursor.

Still not confirmed:

- Licenses of the fetched plugins.
- The size of the text the session-start hooks inject.
- Whether `SubagentStop` in Codex can send a report back for correction.

## 13. Measured baseline and token budget

From the reference project's saved sessions: 6 main session files and 2,042
agent files, summed with a script over the `usage` field of each assistant
message, one record per message id (`python3 -I docs/measure-tokens.py`,
2026-11-10; a working script that names a private path, not for publication).
«New input» is input plus cache writes; «cached» is cache reads. Millions of
tokens.

| Stage | New input | Cached | Output | Turns |
|---|---|---|---|---|
| Implement (agents) | 175.0 | 6,644.4 | 21.90 | 42,792 |
| Review (agents) | 101.1 | 1,817.4 | 14.46 | 19,583 |
| Main session (ask, plan, orchestrate) | 30.7 | 3,078.4 | 7.51 | 9,725 |
| Other agents | 10.0 | 284.1 | 1.47 | 1,770 |
| Lookup (agents) | 9.8 | 64.4 | 1.48 | 2,259 |

| Model tier in the reference | New input | Cached | Output | Turns |
|---|---|---|---|---|
| medium | 185.1 | 6,769.6 | 23.03 | 44,883 |
| top | 90.7 | 4,479.2 | 16.46 | 25,402 |
| top, second model (risk reviewer and a few main sessions) | 40.0 | 569.3 | 5.75 | 3,486 |
| cheap | 10.6 | 70.7 | 1.59 | 2,349 |

What the numbers say:

- Cached reads are the bulk: every turn rereads the whole context. The main
  session reads 316 thousand cached tokens per turn on average
  (3,078.4 M / 9,725).
- The first turn of a main session loads between 66,567 and 88,811 input
  tokens, median 72,162 (5 sessions with a record). That load is paid again
  on every later turn.
- The instruction files that always load weigh 23,527 bytes (`wc -c`:
  project instructions 8,658, user instructions 742, memory index 14,127),
  about 5.9 thousand tokens at 4 bytes per token (an estimate, not a count).
  That is roughly 8 % of the first turn. The rest is the tool's own text,
  tool definitions, skill listings and what session-start hooks inject.
- Implementation is where tokens go. A rule that shortens an implementer's
  context saves more than one that shortens the main session.

Budget:

1. **Always-loaded files the product writes** (`AGENTS.md` with what it
   imports, and the memory index): 24,000 bytes, the reference's size after
   months of use. `doctor` fails above it. Key `tokens.alwaysLoadedBytes`.
2. **Text injected at session start by the product's hooks**: not measured
   yet. Phase 0 measures it and sets its budget.
3. `doctor` prints the first-turn input tokens of the newest session where
   the tool records them, so the owner sees the whole load and not only the
   product's share.

Bytes are used, not tokens, because the installer has no dependency and so
no tokenizer.
