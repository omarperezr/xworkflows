# Phase 1.2: Day one: adapt, full review, next step

Status: approved by the owner, 2026-11-11

Sub-project 2 of 4 of phase 1 (design 11, item 1; split by the owner,
2026-11-11). Built after sub-project 1 is merged and before 3 and 4 (owner,
2026-11-11); shared files belong to the earlier sub-project and this one extends
them. Claude Code only.

## 1. Intent

Day one runs right after `install`. In one session the agent learns the
project from code and history, checks it with the owner until nothing is
missing, writes the project's rules and risk reviewer, and starts real work.
The method adapts only if this step is good (design 1, 10.1); a first session
that ends in setup alone teaches the owner the tool costs time.

## 2. Goals, non-goals, anti-goals

Goals: the written rules recover at least 8 of the reference project's 10
invariants (design 10.1); the owner answers only what the code cannot tell
(design 8.1); the interview stops when the owner says the agent understood;
day one ends with a chosen next step handed to the work flow; a full review
runs only on the owner's yes, after seeing its estimate.

Non-goals: the other stages, the four hooks not built, the brakes and
`xworkflows check` (sub-project 3); Codex, Cursor, Gemini CLI; reading
anything outside the repository except open GitHub issues (6.2); chats and
the web (design 1).

Anti-goals: a long questionnaire; writing any file before the owner approves
the summary; applying a review finding without a yes; putting facts about the
owner as a person into the repository (owner, 2026-11-11).

## 3. Constraints

- Node standard library only (design 2); no new script should be needed.
- Git rules of design 7.6: add by explicit path; no push; no AI author line.
- Questions through `AskUserQuestion`: at most 4 per call, recommended first,
  marked `(Recommended)` (as in `skills/grill/SKILL.md`).
- Curated files (`paths.curated`, design 7.5) are written by the main session
  only. Every skill starts with `node .xworkflows/mark.mjs <skill>` (7.2).

## 4. Pieces this sub-project ships

| Piece | Kind | Installed at (Claude Code) | Tier |
|---|---|---|---|
| `adapt` | skill | `.claude/skills/adapt/SKILL.md` | main session |
| `full-review` | skill | `.claude/skills/full-review/SKILL.md` | main session |
| `next-step` | skill | `.claude/skills/next-step/SKILL.md` | main session |
| `zone-review` | agent | `.claude/agents/zone-review.md` | top, read-only |
| `verify-finding` | agent | `.claude/agents/verify-finding.md` | medium (design 7.1) |
| `thermo-nuclear-review`, `thermo-nuclear-code-quality-review` | vendored skills | `.claude/skills/<name>/` | read by `zone-review` |

Sources live at `skills/<name>/`, `agents/<role>.md`; sub-project 1 installs
them from the manifest. Vendored skills, these two included, live in
`skills/<name>/` with LICENSE and SOURCE.md, as grill does, not in `vendor/`
(Claude's call; amendment to design 4, section 11).

Claude's calls: `next-step` is its own skill, usable in any later session.
`zone-review` is a new 7.1 role, because `review`'s checklist drops the style
and restructuring findings these reviews look for; tools Read, Grep, Glob,
Bash for reads, never writes. `verify-finding` ships here because the full
review is its first user; it reports `red: <test path> <command>` or
`discarded: <reason>`. This sub-project, not sub-project 1, writes the generic
section that replaces the reference adaptations in the two vendored skills
(design 5) (Claude's call). `verify-finding` writes its failing test on a
branch `verify/<finding-id>`. Confirmed: the test is kept and is the fix's
first commit. Not confirmed: the branch is deleted (Claude's call).

## 5. Day one flow

The owner types `/adapt`. `install` ends by printing
`Next: open Claude Code and type /adapt` (Claude's call). Order of steps: owner, 2026-11-11.

### 5.1 Research (design 8.1, made precise)

No questions. First the main session builds the code graph, `graphify
update .`, after writing `.graphifyignore` (1.3 section 8a; graphify is
required, owner 2026-11-11), and reads `graphify-out/GRAPH_REPORT.md`. Then
it launches `explore` agents (phase 0), which ask `graphify query` before
opening files, one per topic, 10 lines each (topic 7 up to 20), all in one Workflow (or at most 2 Agent calls), because
the `orchestrator` hook denies a third Agent otherwise (1.3 rule 5; Claude's call):

1. Stack, build files, linters.
2. Layout: top folders, size in bytes (`git ls-files` with `wc -c`), what
   each holds; proposed zones (5.4).
3. Tests: file patterns, run command, folders that need a service (fills
   `tests.files`, `tests.run`, `tests.notRunnable`).
4. Where data and money move: database, payments, auth, outside calls.
5. History: files changed most in 12 months, reverts, fix commits.
6. Next steps already written down (6.2).
7. Mechanisms: what the code itself enforces (database guards, server-only
   writes, idempotency, frozen values, transactions, money and rounding
   helpers, batched work, domain rules), one candidate rule line each with
   its path, plus areas present with no rule found (owner, 2026-11-11:
   interview proof fix).

Research reads every file git tracks and the history as commit messages and
file stats, never past versions of files (`git show <sha>:<path>`) (Claude's
call: cheaper, and it keeps the 10.1 test honest, section 8).

It writes `.xworkflows/research.md`: a first draft of the summary (5.2 shape),
each line marked `(code)` or `(git)`, plus the list of topic 6.
`/adapt research-only` stops here (needed by section 8).

### 5.2 Interview with the summary stop rule (replaces design 8.2's rounds)

Owner, 2026-11-11: the agent asks until it is confident it understands the
project in every aspect. Then it writes a summary that is easy to understand,
concise, and skips no detail, and asks the owner one question: "Did I
understand correctly?" (does the summary explain everything well). Yes: the
interview ends and day one goes on. No: it asks the owner what it missed,
fixes the summary, and asks again, until the owner says it understood.

The summary's fixed headings: design 8.2's six round topics plus what 8.3's
files need.

1. What it is.
2. Who pays, what is sold, what is not done.
3. Aspirations at about 3, 12 and 36 months: rough, no dates, only to
   understand what the owner hopes for and how far the project should reach
   in each period (owner, 2026-11-11).
4. Risks, the costliest mistake first.
5. What must not change; what is free to change.
6. Zones (5.4) and which paths are risk paths.
7. How the owner works: git rules (confirm design 7.6), review depth, who
   may push.
8. About you, not written to the repository: reply preferences, model budget.

Rules:
- First playback only when the agent is confident about every heading; a
  heading with a line it still guesses at is not done. Questions only for
  what research left empty or unsure, research's guess recommended.
- Plain words, one line per item, as short as it can be without dropping a
  detail; no line cap. Each line ends `(code)`, `(git)` or `(you)` so the
  owner sees what was guessed (Claude's call).
- The question after a playback: "Did I understand correctly?" with two
  options, "Yes, you understood" and "No", neither marked recommended
  (Claude's call: a default would push the owner to stop).
- Before any playback, the agent checks that every required config key
  (1.3 section 5: `paths.code`, `paths.risk`, `paths.heavyRead`,
  `paths.codeAnyway`, `tests.files`, `tests.run`, `tests.notRunnable`,
  `checks.*`, plus `zones`) has a value, `[]` on purpose included; the
  interview does not end while one is missing (owner, 2026-11-11).
- On "No": an open question, "What did I miss or get wrong?"; then questions
  only about that, then the whole summary again with changed lines marked,
  and the same question. No cap on playbacks. Design 8.2's 30 to 45 minutes
  is a target, measured in section 8.
- In the owner's language; fixed headings and keys stay in English (design
  7.7) (Claude's call).
- Each playback saves the draft to `.xworkflows/summary.md` with
  `status: draft`; a new `/adapt` resumes from it (Claude's call).

### 5.3 What gets written (design 8.3), only after "Yes, you understood"

One step, by the main session:

| File | Content |
|---|---|
| `.xworkflows/summary.md` | Headings 1 to 7 as approved; front matter `status: approved`, `date: YYYY-MM-DD`, `commit: <sha research read>` |
| `docs/BUSINESS.md` | Headings 1 to 3; goals in the form below |
| `AGENTS.md` | Unbreakable rules (headings 4, 5) under `## Project rules`, **outside** the installer's `<!-- xworkflows:start -->` block (Claude's call: the installer owns its block; uninstall never touches project content, design 6.2) |
| `.claude/rules/<zone key>.md` | Rules per zone, `paths:` header listing the zone's paths; only zones with a rule |
| `.claude/agents/risk-review.md` | What it guards; a checklist, one diff-checkable line each; the paths (`paths.risk`); report keys `reviewed:`, `not checked:`; seal `risk-review ok at <sha>` (design 7.7). `model:` is the Claude Code `top` entry of `.xworkflows/tiers.json` |
| `.xworkflows/config.json` | Created, or merged and never replaced (install never writes it): `owner`, `mainBranch`, `paths.code`, `paths.risk`, `paths.heavyRead`, `paths.codeAnyway`, `paths.pending`, `paths.reviews`, `tests.*`, `zones`, `git.rules` (confirmed git rules) |
| `~/.xworkflows/owner.md` | Heading 8 only; user scope, outside every repository (Claude's call) |

Goal lines in `docs/BUSINESS.md`, an interface for sub-project 3's
`goal-cited` brake (Claude's call). No dates (owner, 2026-11-11); the id
`G<n>` stays so a plan can name the goal it serves:

```
## Goals
- G1 (about 3 months): <aspiration>
- G2 (about 12 months): <aspiration>
- G3 (about 36 months): <aspiration>
```

Then one commit of exactly those repository files, by explicit path, right
after the owner approves the summary, message
`chore: adapt xworkflows to this project`; no push. Shown, not asked
(Claude's call: the owner already approved the content).

Re-adaptation (design 8.4): with an approved `summary.md`, `/adapt` reruns
research only on commits after `commit:`, plays back with changes marked,
same stop rule.

### 5.4 The `zones` key

New config key, written by the interview, read by `full-review` and by the
rule files (Claude's call on the shape):

```json
"zones": [
  { "key": "app", "paths": ["src/"], "note": "the web app" },
  { "key": "db", "paths": ["db/", "migrations/"] }
]
```

`key`: lowercase letters, digits, `-`; unique; also the rule file name.
`paths`: relative to the repository root; a path is in one zone at most.
`note`: optional, one line. Research proposes 3 to 5 zones, sized in bytes;
the owner is shown zones with everyday names and rounded sizes, and told that
a bigger area and each extra zone cost more to review (owner, 2026-11-11:
interview proof fix); generated and vendored code is left out
unless the owner adds it.

New key `paths.reviews`, default `docs/superpowers/reviews` (Claude's call,
beside the `paths.plans` and `paths.specs` defaults).

### 5.5 The question after the interview

One question (owner, 2026-11-11): run a full review first, or start on the
next step. The full-review option shows the token estimate: agents = 2 × zones;
estimate = agents × 170,000 to agents × 250,000 tokens (the reference run: 6
agents, about 1 to 1.5 million), worded "about X to Y million tokens, from one
past run, not measured here". Neither option is marked recommended; both are
shown side by side (owner, 2026-11-11). The full review runs once in the pilot (owner, 2026-11-11).

## 6. Next step

### 6.1 Sources, in order (owner, 2026-11-11)

1. What the owner asked for in this session, including any "next I want ..."
   said in the interview.
2. Next steps already written down in the project (6.2).
3. Own suggestions: the full review's findings if one ran (section 7);
   otherwise research's breakage hotspots and risk paths without tests. Each
   names the goal `G<n>` it serves.

### 6.2 "Written down": what is searched, in this order (Claude's call)

1. Pending list (`paths.pending`, default `docs/PENDING.md`): cards "in
   progress", then "scheduled".
2. Work in progress in git: uncommitted changes; local branches not merged
   into `mainBranch` with a commit in the last 30 days.
3. Plans in `paths.plans` with unchecked boxes (`- [ ]`), newest first.
4. The other pending cards, in file order.
5. `TODO.md`, `TODO`, `ROADMAP.md`, `NEXT.md` at the root or in `docs/`;
   README sections titled roadmap, todo, next or planned.
6. Open GitHub issues, `gh issue list`, only when `gh` is installed and
   authenticated and the repo has a GitHub remote; otherwise print one line
   and skip this source (Claude's call).
7. `TODO` and `FIXME` comments (`git grep -nE '\b(TODO|FIXME)\b'`): the count
   and at most 5, from the files changed most.

Research collects this list (5.1 topic 6), so nothing is read twice.

### 6.3 Picking and hand-off

One question, at most 3 candidates in source order, the first recommended;
each shows one line, its source, its goal; free text takes anything else.

Hand-off until sub-project 3 ships: `superpowers:brainstorming`, which then
chains to `writing-plans` and `subagent-driven-development` (Claude's call).
If the plugin is missing, say so, write the chosen next step to the pending
list, and stop (Claude's call). It is
one short section of `skills/next-step/SKILL.md`; sub-project 3 replaces only
that section with `deepen`, `grill`, `plan`, `orchestrate`.

## 7. Full review

Adapted from the reference project's full-review skill (its location is in
the local-only note `docs/reference-coupling.md`), same shape: two
reviews × N zones, one read-only `zone-review` agent each, one Workflow, then
the review file and the owner's decisions (owner, 2026-11-11). What changes:
zones come from `zones` in config, not from the skill text.

- Runs only when the owner asks, or on a yes in 5.5. Run alone, it first asks
  yes or no with the 5.5 estimate. No `zones`, or empty: it stops and says to
  run `/adapt`.
- The main session reads `zones` and passes them to the Workflow script (as
  input if the Workflow tool takes one, else written into the script).
- Each agent returns `findings[]`: `severity` (`high`, `medium`, `low`),
  `kind` (`error`, `restructure`), `file`, `line`, `title`, `case`. The script
  marks `both` when both reviews named the same `file:line`; sorts `both`
  first, then severity.
- Review file `<paths.reviews>/YYYY-MM-DD-full-review.md` (`-2` for a second
  run that day). Header: commit sha, zones, the two reviews, what `both`
  means, counts. `## Errors`, numbered, `**[severity, both] title**
  (path:line)` and the case, duplicates merged by the main session;
  `## Restructurings`; `## Owner's decisions (YYYY-MM-DD)`. One commit of
  that file only.
- Each restructuring is its own question: do it, drop it, or pending list. Up
  to 4 such questions per dialog call (Claude's call; each still decided on
  its own). Nothing applied without a yes; each answer goes under the
  decisions heading. "Do it" items go first in 6.1 source 3.
- An error enters a plan only after `verify-finding` confirms it with a
  failing test. The review itself does not verify (cost); verification runs
  when a finding is picked as the next step.
- Unverified errors go to the pending list as one card per finding, in
  sub-project 3's card form (1.3 section 6): `- **P-<n>** — <text>. Origin:
  <review file>. Status: unscheduled.` Each restructuring sent there gets its
  own card. The cards are written through the `pending` skill, which creates
  `paths.pending` with its header if the file is missing (Claude's call).

## 8. Interview proof (design 10.1) with the new stop rule

This proof is the acceptance of this sub-project, run with the owner at its
end (Claude's call). The reference project's location and its invariants list
come from the local-only note `docs/reference-coupling.md` (git-ignored); no
tracked file names them. The builder writes the yes/no lines before the run;
the owner checks them. Steps 1 and 2 stay. Made precise:
- The copy is a clone with history (`git archive` drops the history research
  reads), instruction files removed from the working tree; the 5.1 rule keeps
  research off their old versions (Claude's call).
- Step 3: `/adapt research-only`; R is counted on `.xworkflows/research.md`.
- Step 4: the full interview to "Yes, you understood"; I is counted on
  `AGENTS.md`, `.claude/rules/` and the `risk-review` agent.
- New: each recovered invariant is tagged by origin: research, an interview
  question, or the owner adding it after a "No". The owner knows the
  invariants, so the last kind can inflate I; it is reported apart (Claude's
  call). Playbacks, questions and minutes are recorded as the interview's
  cost.
- Pass mark unchanged: I ≥ 8. Each missed invariant adds one line to the
  question bank `skills/adapt/topics.md`, under its heading.

## 9. Left to the builder

Wording of the skills, agents and question bank; research prompts and whether
two topics share an agent; the `config.json` merge (model edit or a few lines
of Node); a sandbox check that `/adapt` on `sandbox/` writes a valid `zones`
and a second run with nothing changed writes nothing.

## 10. What other sub-projects rely on

Sub-project 1 installs section 4's pieces and `.xworkflows/tiers.json`, never
writes `.xworkflows/config.json` (defaults come from the runner, 1.3
`hooks/core/config.mjs`; adapt creates or merges the file), never overwrites
what `adapt` wrote (design 6.2), and prints the `/adapt` line. Sub-project 3 reads the `G<n>`
lines, the card form, `zones` and `paths.reviews`; replaces `next-step`'s
hand-off; its `modes` hook may read `~/.xworkflows/owner.md`; its memory
split keeps heading 8 out of the repository. Its `orchestrator` rule 1 marks
include `next-step`; rule 5 does not count a resumed agent (SendMessage), and
a handback or seal resets the count.

## 11. Amendments to design.md

For the owner to apply after approval:

- Design 4, `vendor/<piece>/`: vendored skills live in `skills/<name>/` with LICENSE and SOURCE.md.
- Design 8.2: "one session of about six rounds of four questions" becomes the summary stop rule of 5.2 (when confident, play back a plain summary that skips no detail and ask "Did I understand correctly?"; on "No" ask what was missed and repeat; stop on "Yes, you understood"); the six round topics stay as summary headings 1 to 7, plus heading 8 (about you, in `~/.xworkflows/owner.md`).
- Design 8.2 round 2 and 8.3 `BUSINESS.md`: goals at 3, 12 and 36 months carry no dates; they are rough aspirations, lines `G<n> (about N months): ...`. Design 8.4 "by date": the `memory` hook reminds when the approved summary is more than 3 months old.
- Design 7.7 keys: add `zones` (default `[]`) and `paths.reviews` (`docs/superpowers/reviews`).
- Design 7.7 report keys: add `discarded:` (verifier).
