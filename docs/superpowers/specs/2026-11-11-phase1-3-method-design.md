# Phase 1.3: The rest of the method: stages, hooks, brakes

Status: approved by the owner, 2026-11-11

## 1. Intent

Make the method itself work in Claude Code: the stages after design
questions (design 3), the four hooks left (7.2), the agent roles (7.1),
`xworkflows check` with fourteen brakes (design 9's twelve plus `change-size`
and `graph-current`, owner, 2026-11-11) and its `pre-push` hook, and the three phase 0 leftovers.
Then day one hands its next step to these stages, not to superpowers (owner,
2026-11-11), and the pilot can start. Built after sub-project 2 is merged;
this one extends the shared files (owner, 2026-11-11).

## 2. Goals, non-goals, anti-goals

Goals:
- One next step goes deepen, grill, plan, orchestrate, review, seal, push in
  a Claude Code project, each stage enforced as design 3 says.
- `pre-push` refuses a push that lacks a seal, carries an AI signature, or
  fixes code without a test that fails first, whatever tool made it.
- Facts about the owner never land in the repository (pilot measure 11).
- Session-start text has a measured budget `doctor` enforces (measure 8).

Non-goals: Codex, Cursor, Gemini CLI (phases 2 to 4); check packs (9.2) other
than the three below, and the CI job; `dream` and its agents (7.9); `update`,
`propose`.

Check packs (owner, 2026-11-11): three packs ship in 1.3, before the pilot:
the project's own linter (the interview picks it from the stack), `semgrep` and
`trivy`, as `fetched` pieces (design 9.2). The complexity pack waits until
after the pilot. The interview turns a pack on only when its tool is installed;
a pack that is on and whose tool is missing exits 2, "could not run"
(Claude's call).

Anti-goals: a hook that traps an agent on broken input; a brake that passes
when it could not run; reference-project names or values in shipped files;
long skills (each loaded line is paid on every later turn, design 13).

## 3. Constraints

- Node standard library only. Hook logic is a pure `decide(ev, ctx)` in
  `hooks/core/<hook>.mjs` with a test beside it (7.2). Git rules of 7.6.
- Every project value comes from `.xworkflows/config.json` through one
  defaults module.
- Sub-project 1 owns the CLI, `install`, `doctor`, manifest, `tiers.json` (copied to `.xworkflows/tiers.json`).
  Sub-project 2 owns `verify-finding`, the `risk-review` file, `BUSINESS.md`,
  the card form, `~/.xworkflows/owner.md`. Section 12 lists what crosses.

## 4. Already decided

Stages and enforcers: design 3. Roles and tiers: 7.1. Hook rules, the
`XWORKFLOWS_FREE` escape, fail-open, skill marks by
`node .xworkflows/mark.mjs <skill>`: 7.2. Memory shape, generated index,
guardrails: 7.5. Config keys and product vocabulary (seal line, escapes,
`P-<n>`, report keys, `shortcut:`): 7.7. Testing rules: 7.8. The
brakes: 9, 9.1. Session-start budget set here: 13. The four sub-projects
and day one's hand-off: owner, 2026-11-11.

## 5. Shared ground

- `hooks/core/config.mjs`: defaults for every key of 7.7 plus the new ones,
  deep-merged with the project file; hooks and checks import it. (Claude's
  call: `run.mjs` merges only `paths` today.)
- New keys (Claude's call): `roles.verifier` (`verify-finding`),
  `roles.builtIn` (`[]`, built-in agent types allowed besides
  `.claude/agents/`), `tokens.sessionStartBytes` (set by leftover 3), `zones`
  (`[]`) and `paths.reviews` (sub-project 2), `git.rules` (design 7.6 as its
  default), `brakes.changeSize.warn` (400) and
  `.max` (800).
- Project-specific keys have no default (owner, 2026-11-11): `paths.code`,
  `paths.risk`, `paths.heavyRead`, `paths.codeAnyway`, `tests.files`,
  `tests.run`, `tests.notRunnable`, `checks.*`. Design 7.7's reference column
  is not the default. "Missing" (the key is absent from `config.json`: nobody
  filled it) is not "empty on purpose" (the interview wrote `[]` because the
  project has none, a valid answer). A brake that needs a missing key exits 2,
  `not configured: <key>, run /adapt`, so the push is refused. `doctor` fails
  and lists each missing key with the brakes that need it. Install never
  writes the file.
- Defaults that differ from 7.7's reference column: roles `review`,
  `risk-review`, implementers `["implement", "mechanical"]`, lookup
  `explore`; `paths.pending` `docs/PENDING.md`; `lookup.index`
  `{ "command": "graphify query", "folder": "graphify-out", "minutes": 30 }`
  (owner, 2026-11-11: graphify is required, section 8a); `paths.curated` `["AGENTS.md",
  "CLAUDE.md", ".claude/rules/", "docs/BUSINESS.md"]`; `comments.marks` adds
  `py: ["#"]`. Path lists are prefixes; `tests.files` entries are globs.
- Claude adapter: events `prompt`, `sessionStart` (with `source`),
  `preCompact`, `sessionEnd`; `preTool` kinds `read` (`path`, `limit`),
  `agent` (`agent`, `prompt`), `workflow`, `web`, `ask`, `handback`
  (`agent`, `message`). A decision may carry `context` (`additionalContext`).
  `ctx.state(key)` / `ctx.save(key, value)` keep `xwf-<key>-<session>` files
  in `XWORKFLOWS_STATE_DIR` or the temp folder.
- Hook log (Claude's call; pilot measure 10): each deny and each
  `XWORKFLOWS_FREE` skip appends `<ISO time> <session> <hook> <deny|free>
  <reason>` to `xwf-hooks.log` there. shortcut: lost on reboot.

## 6. Stage skills

Own skills in `skills/<name>/SKILL.md`, each starting with the mark command,
150 lines at most (Claude's call).

- `deepen` (stage 1): design 3's four parts, outside proof labeled as 7.8
  says, facts from agents. Output in chat, 25 lines at most, three for a
  small request, never zero; then `grill`, whose spec opens with it.
  (No file: `design-first` denies a spec before `grill`.)
- `plan` (stage 3), own, not a superpowers wrapper (Claude's call: one
  format, no hand-off that fights `orchestrate`). Writes
  `<paths.plans>/YYYY-MM-DD-<slug>.md`: a line `Goal: G<n>`; Global
  Constraints (what the owner asked, written in the commit that decides
  it); tasks with files owned, agent role, batch branch, and "done" as a
  measure; Review Focus; Declined findings; Seals. Its commit also updates
  the pending list.
- `orchestrate` (stages 4 and 5), design 3 plus the reference practice made
  generic: dispatch, never read at length; exclusive file ownership; three
  or more agents in a stretch go in one `Workflow`; failure is defined (test
  or type check red, `blocked:`, `needs judgment:`, `cannot test:`),
  escalate one tier once; a branch per batch (7.6). Review: `risk-review` when
  the batch touches `paths.risk`, else `review`, none for docs only; two
  rounds, then the owner decides by question dialog. Review unit
  (owner, 2026-11-11): one review per batch, before the batch merges. A fix
  is confirmed by a fresh reviewer of the same role, never the one that asked
  for it; the confirmer reads the findings and only
  `git diff <reviewed sha>..HEAD`. Only errors of the
  app, money, permissions or data block; the rest go to the pending list. A
  finding enters a plan only after `verify-finding` answers `red:`. After an
  ok, the main session writes `<role> ok at <sha>` under Seals and commits.
- `pending` (stage 7): adds, changes, closes cards, one per finding, in this form
  (the full review uses this skill to write its cards),
  `- **P-<n>** — <text>. Origin: <where>. Status: <unscheduled | scheduled |
  in progress on <branch>>.` The next number is one above every `P-<n>` in
  the file and in every `closes P-<n>` of the git log (Claude's call: a
  reused number trips brake rule 1). Closing deletes the card in the commit
  whose message says `closes P-<n>`. `templates/PENDING.md` states the
  brake's rules as its header; the skill creates `paths.pending` with that
  header when the file is missing.
- `next-step` (sub-project 2): its hand-off section (superpowers:brainstorming)
  becomes `deepen`.

## 7. Agents and tiers

New in `agents/` (with `tier:`): `implement` (medium; skills `tdd`,
`ponytail`), `mechanical` (cheap; answers `no-test:`), `review` (top; skill
`ponytail-review`; checks `AGENTS.md`, then the touched paths' rules). Its
finding rules, generic forms of the reference reviewer's: the exact line,
a concrete scenario, sibling sites in the same finding, 15 at most, a
remedy that extends the change is `ask-owner:` with 2 to 4 options, and a
simplification pass. `tdd`, `ponytail`, `ponytail-review` are vendored in `skills/<name>/` with
LICENSE and SOURCE.md, as grill is; one with no pinned origin or license does
not ship (design 5).

## 8. Hooks

`orchestrator`: `PreToolUse` matcher
`Agent|Workflow|Read|Bash|WebSearch|WebFetch|AskUserQuestion|Write|Edit|MultiEdit`,
plus `UserPromptSubmit`. In the main session it denies:
0. `Agent` or `Workflow` while `.xworkflows/summary.md` is missing or not
   `status: approved`, except under a mark of `adapt`: no planning or
   implementing before the interview (owner, 2026-11-11).
1. `Agent` or `Workflow` before a mark of `orchestrate`, `adapt`,
   `full-review` or `next-step`.
2. An agent type with no `.claude/agents/<type>.md`, not in `roles.builtIn`.
3. `roles.lookup` when the project has code (`paths.code` not empty) and
   `lookup.index`'s command has not run in the last `minutes`. A missing
   `graphify-out/` is no longer a pass: deny with "build the graph first:
   `graphify update .`" (owner, 2026-11-11).
4. `roles.riskReviewer` whose prompt names no `.md` under `paths.plans` or
   `paths.specs`, or a second run on the same `HEAD`.
5. Another agent once the count since the last `prompt` or `ask` reaches
   `limits.agentsBeforeWorkflow`. Resuming an agent (SendMessage) is not a new
   agent; a handback or a seal resets the count (Claude's call). The day-one
   research agents run in one Workflow.
6. `web` when `mainSession.denyWeb`; a `read` of a `denyExtensions` file.
7. A `read` under `paths.heavyRead` (unset: no rule, see 5) without `limit` or above
   `limits.inlineReadLines`; shell `cat`, `head`, `tail`, `sed -n` on them.
In a subagent it denies a write under `paths.curated`: "report the change
you wanted instead" (7.5).

`handback`: `PreToolUse` matcher `SubagentHandback`, fields
`tool_input.message`, `agent_type` (used daily in the reference project;
record a fixture). A key counts at line start after optional `-*>` and
backticks. Implementers: `red:`, `green:`, `skipped:`, `sha:`, with
`no-test:` in place of red and green (Claude's call: one spelling, as in
the commit escape). Reviewers: `reviewed:`, `not checked:`. Verifier:
`red:` or `discarded:`. `blocked:` passes any role; `needs judgment:` and
`cannot test:` pass implementers. Other types: allow. The deny names each
missing key and its one-line shape. Where the event does not fire (agents
inside a `Workflow`: not tested), `review-seal` is the stop.

`memory`: on `preCompact` and `sessionEnd`, rebuild the index. On
`sessionStart`, when the `date:` of the approved `.xworkflows/summary.md` is
more than 3 months old, one line: `Goals written <N> months ago: run /adapt
to refresh them.` (8.4; goals carry no dates, owner 2026-11-11); after a compact,
topic notes from `qmd query` (8a). On a write under `memory.dir`
whose header has `type: user` or `type: feedback` (top level or under
`metadata`): deny, "facts about the owner and the owner's feedback go to
~/.xworkflows/owner.md". Feedback only comes from the owner, so it is about
the owner, not the project (owner, 2026-11-11). Index lines, sorted by file
name: `- [<name>](<file>) — <description>`; also written by
`node .xworkflows/checks/run.mjs index`.

`modes`: project scope in phase 1 (Claude's call), `sessionStart` only;
injects `~/.xworkflows/owner.md` when it exists. The user-scope install waits
with the preference plugins (11).

## 8a. graphify and qmd are required (owner, 2026-11-11)

Both raise quality and cut cost: the agent asks an index instead of pulling
files into context. Neither is bundled (no dependency, no network in
`install`); both are checked.

graphify, in every project with code (`paths.code` not empty):
- `doctor` fails when the `graphify` command is missing or `graphify-out/graph.json`
  is absent, and prints the install command.
- `graphify-out/` is git-ignored: install appends `graphify-out/` to
  `.gitignore` when absent and records it in installed.json `merged` (owner).
  `adapt` writes `.graphifyignore` with the generated and vendored paths.
- Kept current, mandatory (owner), as the reference project does by
  instruction, here enforced by code (Claude's calls):
  1. Day one builds it first (sub-project 2, research).
  2. After work lands: a `post-merge` and a `post-commit` git hook run, only
     when the branch is `mainBranch`, `graphify update . >
     graphify-out/.update.log 2>&1` in the background. Batch branches never
     rebuild, so parallel agents never read a half-built graph. `graphify
     update` re-extracts code only and needs no LLM (its own help).
  3. `sessionStart`: when `graph.json` is older than `HEAD`'s commit time,
     the `memory` hook starts the same update in the background and says so
     in one line.
  4. Brake `graph-current` (new, Claude's call): on a push to `mainBranch`,
     fails when `graph.json` is older than the pushed head's commit time,
     "run `graphify update .`".
  5. Agents verify a file or symbol the graph names still exists before
     acting on it (the graph is stale, not wrong).
- Lookups go to `graphify query` first (`orchestrator` rule 3); reviewers use
  it to find sibling sites of a finding; `GRAPH_REPORT.md` answers "where
  does this live" before any directory listing.

qmd, for memory:
- `docs/memory/` is an Obsidian-style vault: one markdown file per memory,
  linked with `[[name]]`, plus the generated `MEMORY.md` index.
- `doctor` fails when the `qmd` command is missing, or the vault is not a
  qmd collection.
- The `memory` hook updates the qmd index with `MEMORY.md` on `preCompact`
  and `sessionEnd`. After a compact it injects the notes `qmd query` ranks
  highest for the session's topic. Agents search memory with `qmd` before
  opening files.
- `~/.xworkflows/owner.md` is not in the repository vault; it is its own
  user-level qmd collection.

## 9. Phase 0 leftovers (first: they change section 8 and the installer)

1. `autoMemoryDirectory`: in a real `sandbox/` session with
   `"autoMemoryDirectory": "docs/memory"` in `.claude/settings.json`, ask it
   to remember a fact. Lands there: `install` merges that line. Not: it
   writes the absolute path to `.claude/settings.local.json` (Claude's call).
   Scalar settings (this key, attribution off) are set only when absent;
   when the project already sets them, `doctor` warns. Each is recorded in
   installed.json `merged`.
2. Memory kinds: same session, one fact of each of the four kinds; save the
   headers as fixtures; test the `memory` deny on them. Pass: the `user` and
   `feedback` facts are in `~/.xworkflows/owner.md`, neither under
   `docs/memory/`; `project` and `reference` stay there.
3. Session-start text: `wc -c` of each session-start hook's output on a
   recorded event. Budget `tokens.sessionStartBytes` = the product's total
   rounded up to the next 1,000, floor 2,000 (Claude's call). New `doctor`
   line: those bytes now, `fail` above it. Results go in `docs/gaps.md`.

## 10. `xworkflows check` and `pre-push`

`checks/<brake>.mjs` each export `run(range, ctx)` returning
`{ ok, lines }`; `checks/run.mjs` runs them in table order. Installed to
`.xworkflows/checks/` (Claude's call: a push must not need `npx` or the
network); `bin/xworkflows.mjs check` forwards to it.

- `node .xworkflows/checks/run.mjs --pre-push <remote>` reads git's stdin
  lines, skips deletions, base `<remote sha>`; for a new branch the merge
  base with `<remote>/<mainBranch>`, else the commits on no remote ref.
- `node .xworkflows/checks/run.mjs [--only a,b] [<base> [<head>]]`: base
  defaults to the merge base with `mainBranch`, head to `HEAD`.
- Exit 0: all passed. 1: a brake failed. 2: could not run (not a repo,
  broken config, unknown brake). `pre-push` refuses any non-zero.
- Prints only failures, `<brake>: <what>` plus indented fix lines, then
  `xworkflows check: <n> of <m> failed`.
- `review-seal` and `pending` run only for `refs/heads/<mainBranch>` and on
  manual runs; the rest on every push (Claude's call: a batch branch can be
  pushed as a backup before review).

Installed hook (in `git rev-parse --git-path hooks`, or under `core.hooksPath`):
`node "$(git rev-parse --show-toplevel)/.xworkflows/checks/run.mjs" --pre-push "$1"`.
Chaining (6.2, asked): on yes the existing hook is renamed
`pre-push.before-xworkflows`; ours saves stdin to a temp file, runs it
first with the same arguments and input, stops on its failure, then runs
check. `uninstall` renames it back. (Claude's call: appending to the old
script loses stdin and dies at its early `exit 0`.)

| Brake | Fails when |
|---|---|
| `signature` | A commit in range has an author or committer email, or a `Co-Authored-By:`, `Signed-off-by:` or "Generated with" line, naming an AI vendor or tool (constant list). `install` also turns Claude Code's commit and PR attribution off (setting name to confirm in its docs) |
| `review-seal` | Code commits: in range, a changed path outside `paths.nonCode` or inside `paths.codeAnyway`, not comment-only (every changed line blank or a comment per `comments.marks`); a merge only if `git diff-tree --cc` lists files. A `no-review:` body line skips a commit unless it touches `paths.risk`. Pass: a line `<role> ok at <sha7-40>` in a file under `paths.plans` or `paths.specs` at head names a commit that every code commit is an ancestor of. `<role>` must be `roles.riskReviewer` when a code commit touches `paths.risk` (non-`.md`), else either reviewer. The reference's "plain reviewer seals fixes after a risk seal" is dropped; a fix is sealed by its fresh confirmer (owner, 2026-11-11) |
| `goal-cited` | A plan added in range has no line `Goal: G<n>` naming a goal line of `docs/BUSINESS.md` at head. Plans only changed are not checked |
| `pending` | (1) A card whose `P-<n>` appears in a `closes P-<n>` of any commit reachable from head. (2) `in progress on <branch>` where the branch is merged into `mainBranch` or exists neither locally nor at the remote. (3) A non-merge commit changes a plan (not a spec, not a seal commit) but not `paths.pending`, and neither its merge nor a later commit with `pending-for: <sha>` does; "its merge" is the `--no-ff` merge's diff against its first parent (Claude's call). (4) Two cards share a number. The reference's "every push edits the list" is dropped (Claude's call) |
| `fix-has-test` | A commit with subject `fix:` or `fix(` touching `paths.code` (not tests) has no test file (`tests.files`, or under `tests.notRunnable`, which passes with a "not run" line). Its tests run with `tests.run` in a temporary `git worktree` at the parent, with the fix's test files checked out and a root `node_modules` or `.venv` linked; the test files must fail there and pass at the fix commit; an exit code in `tests.notRunnable` means "could not run" (exit 2). The worktree is removed even on error. Escapes: `no-test:` in the body; `no-test-for: <sha7+> <reason>` in a later commit |
| `change-size` | Code lines changed (added plus removed) on the branch against `mainBranch`: warn at `brakes.changeSize.warn` (400), fail at `.max` (800). Not counted: tests, docs, fixtures, JSON, lockfiles, generated files; SQL migrations count as code. Escape: a `size-ok: <reason>` line in a commit message on the branch, which the brake prints (owner, 2026-11-11). Calibrated on the reference project's last 60 merges: median 71, 90% under 780; 800 blocks 5 of 60 |
| `comment-ratio` | Over the range diff, added non-blank lines in files whose extension is in `comments.marks` number at least `limits.commentMinLines` and more than `limits.commentRatio` of them are comments; `shortcut:` lines count in neither. Escape: `comments: <reason>` in a commit body |
| `skills-travel` | A `skills:` entry in `.claude/agents/*.md` has no `.claude/skills/<name>/SKILL.md` in `git ls-files`; a `plugin:name` entry fails too |
| `patterns` | An added line matches `checks.patterns`, `[{ "name", "regex", "paths": [prefix], "why" }]`; prints `file:line` and `why` |
| `ratchet` | A `checks.ratchets` entry, `[{ "name", "count": "<command printing one integer>" }]`, counts above `.xworkflows/ratchets.json` `{ "<name>": n }` (committed, so raising it is a visible diff). Missing entry: fail. Lower: prints "lower the baseline to n" |
| `graph-current` | On a push to `mainBranch` in a project with code: `graphify-out/graph.json` is older than the pushed head's commit time (8a) |
| `stale-memory` | A backticked span in a `memory.dir` file that looks like a relative path (has `/`, no spaces, no `* < > $`, not a URL; `:line` stripped) does not exist at head |
| `index-current` | `<memory.dir>/MEMORY.md` at head differs from the generated index |
| `project` | A `checks.project` entry, `[{ "name", "run" }]`, exits non-zero (last 20 lines printed). If the pushed sha is not `HEAD` or tracked files are modified: fail, "check out <ref> or commit first" (Claude's call: it would test the wrong tree) |

## 11. Internal order, and what can be cut

1. Leftovers (9) and shared ground (5).
2. `check` runner, `pre-push` install and chain; `signature`, `review-seal`,
   `fix-has-test`, `pending`, `goal-cited`, `change-size`, `graph-current`, `project`,
   `skills-travel`; the graph hooks and `.gitignore` line (8a).
3. Agents `implement`, `mechanical`, `review`; the vendored skills.
4. Skills `deepen`, `plan`, `orchestrate`, `pending`; `next-step` hand-off.
5. Hooks `orchestrator`, `handback`.
6. `autoMemoryDirectory` install, index, `memory`, `stale-memory`,
   `index-current`, `modes`, the `doctor` line.
7. `comment-ratio`, `patterns`, `ratchet`.

Deferred to "after the pilot, before phase 2" (Claude's call): step 7 (the
pilot's lists start empty); the user-level install of the preference plugins
(7.4: they are on the owner's machine and announce themselves). Can also
move: `orchestrator` rule 3; topic recall after compact. The `doctor`
first-turn token line (13, item 3) ships here, with the session-start
measure (leftover 3).

## 12. What crosses to other sub-projects

- 1: this sub-project adds to its installer `.xworkflows/checks/`, the
  `pre-push` hook and chain, the `post-merge` and `post-commit` graph hooks
  (chained like `pre-push`), the `graphify-out/` line in `.gitignore`, the new settings entries, `autoMemoryDirectory`
  and attribution off, and to `doctor` the session-start line.
- 2: `G<n>` goal lines and the card form as its doc gives them;
  `verify-finding` answers `red:` or `discarded:`; `risk-review` returns
  `reviewed:` and `not checked:` and seals `risk-review ok at <sha>`. Day
  one's research runs in one `Workflow` (rule 5); rule 1 marks include `next-step`.
- 4: the hook log, `check` output, `tokens.sessionStartBytes`.

## 13. Done when

- `node --test` passes; each brake has a passing and a failing case in a
  throwaway repository; `fix-has-test` has one case whose `tests.run` is not
  Node (the pilot is Python).
- Recorded Claude Code fixtures: `orchestrator` denying `Agent` before the
  mark, `handback` denying a report without `red:`, `memory` denying a
  `type: user` and a `type: feedback` write, the `sessionStart` output.
- In `sandbox/`, a toy change goes deepen to seal; a real push to a local
  bare remote is refused before the seal line and accepted after.

## 14. Amendments to design.md

For the owner to apply after approval:

- Design 4, `vendor/<piece>/`: vendored skills (`tdd`, `ponytail`, `ponytail-review`, and sub-project 2's) live in `skills/<name>/` with LICENSE and SOURCE.md.
- Design 7.7 table: new keys `roles.verifier`, `roles.builtIn`, `tokens.sessionStartBytes`, `zones`, `paths.reviews`, `git.rules`, `brakes.changeSize.warn` (400), `brakes.changeSize.max` (800).
- Design 7.7 intro: "defaults are the reference's values" becomes: project-specific keys (listed in section 5) have no default; a missing one makes the brakes that need it exit 2 and doctor fail, while `[]` written by the interview is a valid answer; the reference column is not the default.
- Design 7.7 report keys: add `discarded:`, `no-test:`, `needs judgment:`, `cannot test:`, `ask-owner:`.
- Design 9: new brake `change-size` (section 10 table).
- Design 9: new brake `graph-current` (8a). Design 7.5 and 7.7: qmd and graphify are required, no longer optional; `lookup.index` defaults to graphify.

## 15. Left to the builder

Wording of the four skills and three agents; `signature`'s vendor list;
glob matching for `tests.files` (`path.matchesGlob` if the minimum Node has
it, else a few lines for `*` and `**`); test-repository helpers; sharing the
comment-only test between two brakes.
