---
name: adapt
description: Day one. Learn this project from its code and history, check a summary with the owner until the owner says you understood, then write the project's rules. Use right after install, or again to re-adapt.
---

Before anything else, run `node .xworkflows/mark.mjs adapt` in the shell.

Talk to the owner in the owner's language. Headings, config keys and file contents stay in English. Ask the fixed questions below with exactly their meaning; in English, use the exact words.

Questions go through `AskUserQuestion`, at most 4 per call. You do not know this project yet: research's options are guesses, never a forced choice.

- Set `multiSelect: true` whenever more than one option can be true at once, for example: who pays, what is refused, which parts are live, kinds of costly mistake, risks, what must not change, what is free to change, which zones hold risks, where or how a rule is enforced. Single choice only where the options exclude each other: yes or no, keep or change a default, the zones split, `Did I understand correctly?`, `Run a full review first, or start on the next step?`, review depth, who may push.
- End every other question with one short note, in the owner's language; `Did I understand correctly?` and `Run a full review first, or start on the next step?` get none. With `multiSelect`: `You can pick several. If none fits, or it is something else, write it in Other.` Otherwise: `If none fits, or it is something else, write it in Other.`
- Research's guess goes first, marked `(Recommended)` only when its line in `research.md` ends `(code)` or `(git)`. A guess without that tag is not recommended, and neither is any option where a step says so. `AskUserQuestion` needs 2 to 4 options: with one guess, add the most plausible alternative, not recommended; with more than 4, split the question in two.
- An answer typed in Other wins over research's guess, which is dropped; options the owner picked are kept with it.
- Each picked option of a multi-select answer becomes its own line under its heading, never one merged line.

## Step 1: Resume

- `.xworkflows/summary.md` has `status: draft`: resume the interview from it. Skip research; read `.xworkflows/research.md` and go to step 3.
- `.xworkflows/summary.md` has `status: approved`: re-adapt. Run step 2 only on the commits after its `commit:` line (`git log <commit>..HEAD --stat`). If research changes no line of the approved summary, say so and stop before any playback: no draft, no write, no commit; leave `summary.md` as it is. Otherwise play back the approved summary with each changed line marked `(changed)`. Same stop rule. In step 4, rewrite only the files whose content changes.
- No `summary.md`, but `.xworkflows/research.md` has `commit:` equal to `HEAD` (as after `/adapt research-only`): reuse it. With `research-only`, give its path and stop; otherwise go to step 3.
- Otherwise: start at step 2.

## Step 2: Research

No questions in this step.

1. Write `.graphifyignore` (same syntax as `.gitignore`) with the generated and vendored paths: dependencies, build output, generated code, vendored code. Keep any lines already there.
2. Run `graphify update .`. If `graphify` is missing, stop: tell the owner graphify is required and must be installed first.
3. Read `graphify-out/GRAPH_REPORT.md`. Then run one `graphify query "<what are the main parts of this project?>"` yourself; the lookup rule wants a recent query before any `explore` agent.
4. Launch one `explore` agent per topic below, all seven in one Workflow. Without the Workflow tool, use at most 2 Agent calls: topics 1 to 4, then 5 to 7. Every prompt says:
   - Ask `graphify query` before opening files. Verify each path still exists.
   - Read history as commit messages and file stats only (`git log --oneline`, `--stat`, `--name-only`). Never read past versions of files or content diffs: no `git show <sha>:<path>`, no `git log -p`; `git diff` and `git stash show` only with `--stat` or `--name-only`.
   - Answer in 10 lines or fewer; topic 7 in 20 or fewer.
5. The seven topics:
   1. Stack, build files, linters.
   2. Layout: top folders, size in bytes per folder (`git ls-files` with `wc -c`), what each holds. Propose 3 to 5 zones, each with an everyday name (`the screens`, `the database`), sized in bytes. Leave out generated and vendored code.
   3. Tests: file patterns, run command, folders that need a service such as a database (fills `tests.files`, `tests.run`, `tests.notRunnable`).
   4. Where data and money move: database, payments, auth, outside calls.
   5. History of the last 12 months: files changed most, reverts, fix commits.
   6. Next steps already written down. Paste into this prompt the list under `## Research topic 6` of `.claude/skills/adapt/topics.md`; the agent searches in that order.
   7. Mechanisms: what the code itself enforces. Database triggers, constraints, guards and access policies; data written only through server functions, and by deltas rather than absolute values; idempotency keys on retried or offline writes; snapshot or frozen columns set once when a record is written; transactions around actions that touch several rows; money, unit and rounding helpers, and which value is the source of truth; batched queries instead of one per item; domain, legal or tax rules and where they are written. One line per mechanism: the rule every change must follow, then the path that shows it. Then each area present (money, a database, offline or retried writes, multi-row actions, a regulated domain) where no mechanism was found.
6. Write `.xworkflows/research.md`:
   - Front matter `commit: <HEAD sha>`.
   - A first draft of the summary under the eight headings of step 3. Each line ends `(code)` or `(git)`. Leave a line empty rather than guess wildly.
   - Under heading 5, each topic 7 mechanism as a candidate rule line, worded as how the code must do something, with its path, tagged `(code)`; then `no rule found: <area>` for each area present without one.
   - `## Config`: a guess for each required key of step 3, marked the same way.
   - `## Written down`: the topic 6 list, one line each: what, source, path.
7. With the argument `research-only`, stop here. Tell the owner the path of `research.md`.

## Step 3: Interview

The summary has these eight headings, verbatim, in this order:

1. What it is
2. Who pays, what is sold, what is not done
3. Aspirations at about 3, 12 and 36 months
4. Risks, the costliest mistake first
5. What must not change; what is free to change
6. Zones and which paths are risk paths
7. How the owner works
8. About you

Rules:

- Start from `research.md`. Ask only what research left empty or unsure. Research's guess is the first option; the question rules above say when it is `(Recommended)`.
- `topics.md` holds the questions research cannot answer, per heading. Ask one only when research did not settle it.
- Heading 3: rough aspirations, no dates. One per period.
- Headings 4 and 5: mechanisms research found go straight under heading 5, tagged `(code)`, and are confirmed in the playback. Only for a risk or "must not change" item where research found no mechanism, ask `How does the code prevent this today, and what rule must every change follow?` Options `Nothing does today` and `I don't know`, neither recommended (research has no guess); the owner may type the mechanism instead.
- On `Nothing does today`, ask in plain text what rule every change must follow; `no rule needed` and `I don't know` are accepted answers. After `no rule needed` or `I don't know`, write `unprotected: <risk>` under heading 5. That line is settled, not a guess; do not ask again.
- Each answer becomes a rule line under heading 5, worded as how the code must do something (`stored values stay exact; round once, only when shown`), not only as the outcome to avoid (`never miscalculate money`).
- Heading 5 groups its rule lines under the risk they prevent, costliest risk first, then `rules tied to no risk`.
- Before the first playback, ask a heading 5 mechanism question of `topics.md` only for an area research found present but found no rule for (a `no rule found:` line). Up to 4 questions per call. The owner will not volunteer these.
- Heading 6: the zones question below.
- Heading 7: confirm each default git rule one by one: one branch per batch, merged with `--no-ff`, never rebased after review; push only when the owner says so; files added by explicit path, never `git add .` or `-A`; no commit, PR or comment names an AI as author or co-author. Also review depth and who may push.
- Heading 8: reply preferences and model budget. It never goes into the repository.
- A heading is done when no line on it is still a guess. The first playback comes only when all eight are done.
- Before any playback, every required key has a value: `paths.code`, `paths.risk`, `paths.heavyRead`, `paths.codeAnyway`, `tests.files`, `tests.run`, `tests.notRunnable`, `checks` (`checks.project`, `checks.patterns`, `checks.ratchets`), `zones`. `[]` written on purpose counts as a value; a key nobody filled does not. Ask for each missing one. The interview does not end while one is missing.

### Zones

```json
"zones": [
  { "key": "app", "paths": ["src/"], "note": "the web app" },
  { "key": "db", "paths": ["db/", "migrations/"] }
]
```

- `key`: lowercase letters, digits and `-`; unique; also the rule file name.
- `paths`: relative to the repository root; a path is in one zone at most.
- `note`: optional, one line.
- Generated and vendored code stays out unless the owner adds it.

The zones question, in plain words:

1. First say what zones are for: each area of the code gets its own rules, and the full review checks each area separately, so a bigger area costs more to review, and so does each extra zone.
2. Name each proposed zone in everyday words (`the screens`, `the database`) with a rounded size (`about 5 MB`). No exact sizes, no paths: paths go in the playback's `## Config` block.
3. Ask `Does this split match how you think about the code?`, your proposal first, `(Recommended)` per the question rules, with the Other note: the owner types merges, splits and renames there.

### Playback

1. Write the whole summary: the eight headings, plain words, one line per item, as short as it can be without dropping a detail. No line cap. Heading 5 lists every rule, one per line, grouped under the risk it prevents, so the owner can confirm or correct each. Each line ends `(code)`, `(git)` or `(you)`. After heading 8, a `## Config` block lists each required key and its value. If `docs/BUSINESS.md`, a `.claude/rules/<key>.md` or a `## Project rules` section already exists, then add `## Changes to existing files`: per file, the lines step 4 adds or changes.
2. Save it to `.xworkflows/summary.md` with front matter `status: draft` and `commit: <sha research read>`. The saved draft leaves heading 8 empty; on resume, ask heading 8 again.
3. Ask one question: `Did I understand correctly?` with two options, `Yes, you understood` and `No`. Neither is marked recommended. No other options, and no Other note.
4. On `No`: ask the open question `What did I miss or get wrong?` and wait for the answer. Then ask questions only about that. Then play back the whole summary again, each changed line marked `(changed)`, save the draft, and ask `Did I understand correctly?` again. No cap on playbacks.
5. On `Yes, you understood`: the interview ends. Go to step 4.

## Step 4: Write

Only after `Yes, you understood`. Before that answer, write nothing but `.graphifyignore`, `graphify-out/`, `research.md` and the draft. An existing `docs/BUSINESS.md`, `.claude/rules/<key>.md` or `## Project rules` section is merged, never overwritten: keep its lines, add or change only what the playback showed. The main session writes all of these in one step:

| File | Content |
|---|---|
| `.xworkflows/summary.md` | Headings 1 to 7 as approved. Front matter `status: approved`, `date: YYYY-MM-DD`, `commit: <sha research read>`. |
| `docs/BUSINESS.md` | Headings 1 to 3, then `## Goals` (below). |
| `AGENTS.md` | Headings 4 and 5 as unbreakable rules, one line each, under `## Project rules`, in heading 5's order: each risk, then the rules that prevent it, worded as how the code must do something, then the rules tied to no risk. Put it after the `<!-- xworkflows:end -->` line, outside the `<!-- xworkflows:start -->` block. Never edit inside the block; the installer owns it. If `## Project rules` exists, merge into only that section. |
| `.claude/rules/<zone key>.md` | One file per zone that has a rule. Front matter `paths:` lists the zone's paths as globs (`src/` becomes `src/**`). Then the rules, one line each, including every heading 5 mechanism rule whose path in `research.md` is in the zone's paths. |
| `.claude/agents/risk-review.md` | The risk reviewer (below). |
| `.xworkflows/config.json` | Merged key by key (below). |
| `~/.xworkflows/owner.md` | Heading 8 only. User scope, outside every repository. Create `~/.xworkflows/` if missing. Keep what is already there; update only what the owner changed. |

Goals in `docs/BUSINESS.md`, one line per aspiration, no dates. G1 is the 3-month one, then 12, then 36; the `G<n>` id stays so a plan can name the goal it serves:

```
## Goals
- G<n> (about <N> months): <aspiration>
```

`risk-review` agent:

- Front matter: `name: risk-review`; a one-line `description`; `model:` set to the `top` entry of `claude` in `.xworkflows/tiers.json`; `tools: Read, Grep, Glob, Bash`.
- What it guards: heading 4, the costliest mistake first.
- A checklist: one line per check, each one a reviewer can check against a diff, with one line per heading 5 mechanism rule (for example: `no query or server call inside a loop over rows`).
- The paths it covers: `paths.risk`.
- Read-only: Bash only for `git log`, `diff`, `show`, `ls-files`, `blame`, `status`, `grep`, `wc`, `graphify query`. No redirects. Never writes or edits.
- Report keys: `reviewed:` (what it checked) and `not checked:` (what it could not). When every check passes, the last line is `risk-review ok at <sha>`, with the reviewed `HEAD`.

`.xworkflows/config.json`:

- Read it if it exists. Set only these keys: `owner`, `mainBranch`, `paths.code`, `paths.risk`, `paths.heavyRead`, `paths.codeAnyway`, `paths.pending` (default `docs/PENDING.md`), `paths.reviews` (default `docs/superpowers/reviews`), `tests.files`, `tests.run`, `tests.notRunnable`, `checks.project`, `checks.patterns`, `checks.ratchets`, `zones`, `git.rules` (the confirmed git rules, one string each).
- Merge key by key: never replace the file, never drop or change a key you did not set. Write JSON with two-space indent.
- Check `zones` before writing: keys valid and unique, no path in two zones.

Then commit, without asking (the owner already approved the content):

1. Append `graphify-out/` and `.xworkflows/research.md` to `.gitignore` (create it if missing), only the lines not already there.
2. `git add` each repository file written above by explicit path, plus `.graphifyignore` and `.gitignore`. Never `git add .` or `-A`. Never `~/.xworkflows/owner.md` or `research.md`.
3. `git commit -m "chore: adapt xworkflows to this project" -- <the same paths>`, so files the owner staged before stay out. No AI author or co-author line. No push.
4. Show the owner the commit's short sha and its file list.
5. If an installer file (the `files` keys and `created` list in `.xworkflows/installed.json`) is still uncommitted, tell the owner which ones. Do not commit them.

## Step 5: Next

With `zones` empty, skip the question: say there is nothing to review and run `/next-step`.

Ask one question: `Run a full review first, or start on the next step?` Two options side by side, neither marked recommended:

- Full review: its description is `about X to Y million tokens, from one past run, not measured here`, where zones is the number of zones: X = zones × 2 × 0.17 and Y = zones × 2 × 0.25, rounded to one decimal.
- Next step.

Then run `/full-review` or `/next-step`, as the owner chose.
