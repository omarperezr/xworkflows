---
name: adapt
description: Day one. Learn this project from its code and history, check a summary with the owner until the owner says you understood, then write the project's rules. Use right after install, or again to re-adapt.
---

Before anything else, run `node .xworkflows/mark.mjs adapt` in the shell.

Talk to the owner in the owner's language. Headings, config keys and file contents stay in English. Ask the fixed questions below with exactly their meaning; in English, use the exact words.

Questions go through `AskUserQuestion`: at most 4 per call, research's guess first and marked `(Recommended)`, except where a step says no option is recommended.

## Step 1: Resume

- `.xworkflows/summary.md` has `status: draft`: resume the interview from it. Skip research; read `.xworkflows/research.md` and go to step 3.
- `.xworkflows/summary.md` has `status: approved`: re-adapt. Run step 2 only on the commits after its `commit:` line (`git log <commit>..HEAD --stat`). Play back the approved summary with each changed line marked `(changed)`. Same stop rule. In step 4, rewrite only the files whose content changes. Nothing changed: say so, write nothing, commit nothing.
- No `summary.md`: start at step 2.

## Step 2: Research

No questions in this step.

1. Write `.graphifyignore` (same syntax as `.gitignore`) with the generated and vendored paths: dependencies, build output, generated code, vendored code. Keep any lines already there.
2. Run `graphify update .`. If `graphify` is missing, stop: tell the owner graphify is required and must be installed first.
3. Read `graphify-out/GRAPH_REPORT.md`. Then run one `graphify query "<what are the main parts of this project?>"` yourself; the lookup rule wants a recent query before any `explore` agent.
4. Launch one `explore` agent per topic below, all six in one Workflow. Without the Workflow tool, use at most 2 Agent calls of three topics each. Every prompt says:
   - Ask `graphify query` before opening files. Verify each path still exists.
   - Read history as commit messages and file stats only (`git log --oneline`, `--stat`, `--name-only`). Never read past versions of files: no `git show <sha>:<path>`, no `git log -p`.
   - Answer in 10 lines or fewer.
5. The six topics:
   1. Stack, build files, linters.
   2. Layout: top folders, size in bytes per folder (`git ls-files` with `wc -c`), what each holds. Propose 3 to 5 zones, sized in bytes. Leave out generated and vendored code.
   3. Tests: file patterns, run command, folders that need a service such as a database (fills `tests.files`, `tests.run`, `tests.notRunnable`).
   4. Where data and money move: database, payments, auth, outside calls.
   5. History of the last 12 months: files changed most, reverts, fix commits.
   6. Next steps already written down, searched in the order of "Research topic 6" in `topics.md`.
6. Write `.xworkflows/research.md`:
   - Front matter `commit: <HEAD sha>`.
   - A first draft of the summary under the eight headings of step 3. Each line ends `(code)` or `(git)`. Leave a line empty rather than guess wildly.
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

- Start from `research.md`. Ask only what research left empty or unsure. Research's guess is the first option, marked `(Recommended)`.
- `topics.md` holds the questions research cannot answer, per heading. Ask one only when research did not settle it.
- Heading 3: rough aspirations, no dates. One per period.
- Heading 6: zones as in "Zones" below, each with its size in bytes, so the owner sees the review cost.
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

### Playback

1. Write the whole summary: the eight headings, plain words, one line per item, as short as it can be without dropping a detail. No line cap. Each line ends `(code)`, `(git)` or `(you)`. After heading 8, a `## Config` block lists each required key and its value.
2. Save it to `.xworkflows/summary.md` with front matter `status: draft` and `commit: <sha research read>`. The saved draft leaves heading 8 empty; on resume, ask heading 8 again.
3. Ask one question: `Did I understand correctly?` with two options, `Yes, you understood` and `No`. Neither is marked recommended. No other options.
4. On `No`: ask the open question `What did I miss or get wrong?` and wait for the answer. Then ask questions only about that. Then play back the whole summary again, each changed line marked `(changed)`, save the draft, and ask `Did I understand correctly?` again. No cap on playbacks.
5. On `Yes, you understood`: the interview ends. Go to step 4.

## Step 4: Write

Only after `Yes, you understood`. Before that answer, write nothing but `.graphifyignore`, `research.md` and the draft. The main session writes all of these in one step:

| File | Content |
|---|---|
| `.xworkflows/summary.md` | Headings 1 to 7 as approved. Front matter `status: approved`, `date: YYYY-MM-DD`, `commit: <sha research read>`. |
| `docs/BUSINESS.md` | Headings 1 to 3, then `## Goals` (below). |
| `AGENTS.md` | Headings 4 and 5 as unbreakable rules, one line each, under `## Project rules`. Put it after the `<!-- xworkflows:end -->` line, outside the `<!-- xworkflows:start -->` block. Never edit inside the block; the installer owns it. If `## Project rules` exists, replace only that section. |
| `.claude/rules/<zone key>.md` | One file per zone that has a rule. Front matter `paths:` lists the zone's paths as globs (`src/` becomes `src/**`). Then the rules, one line each. |
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
- A checklist: one line per check, each one a reviewer can check against a diff.
- The paths it covers: `paths.risk`.
- Read-only: Bash only for `git log`, `diff`, `show`, `ls-files`, `blame`, `status`, `grep`, `wc`, `graphify query`. No redirects. Never writes or edits.
- Report keys: `reviewed:` (what it checked) and `not checked:` (what it could not). When every check passes, the last line is `risk-review ok at <sha>`, with the reviewed `HEAD`.

`.xworkflows/config.json`:

- Read it if it exists. Set only these keys: `owner`, `mainBranch`, `paths.code`, `paths.risk`, `paths.heavyRead`, `paths.codeAnyway`, `paths.pending` (default `docs/PENDING.md`), `paths.reviews` (default `docs/superpowers/reviews`), `tests.files`, `tests.run`, `tests.notRunnable`, `checks.project`, `checks.patterns`, `checks.ratchets`, `zones`, `git.rules` (the confirmed git rules, one string each).
- Merge key by key: never replace the file, never drop or change a key you did not set. Write JSON with two-space indent.
- Check `zones` before writing: keys valid and unique, no path in two zones.

Then commit, without asking (the owner already approved the content):

1. `git add` each repository file written above by explicit path, plus `.graphifyignore`. Never `git add .` or `-A`. Never `~/.xworkflows/owner.md` or `research.md`.
2. `git commit -m "chore: adapt xworkflows to this project"`. No AI author or co-author line. No push.
3. Show the owner the commit's short sha and its file list.

## Step 5: Next

With `zones` empty, skip the question: say there is nothing to review and run `/next-step`.

Ask one question: `Run a full review first, or start on the next step?` Two options side by side, neither marked recommended:

- Full review: its description is `about X to Y million tokens, from one past run, not measured here`, where zones is the number of zones: X = zones × 2 × 0.17 and Y = zones × 2 × 0.25, rounded to one decimal.
- Next step.

Then run `/full-review` or `/next-step`, as the owner chose.
