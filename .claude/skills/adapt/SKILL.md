---
name: adapt
description: Day one. Learn this project from its code and history, check a summary with the owner until the owner says you understood, then write the project's rules. Use right after install, or again to re-adapt.
---

Before anything else, run `node .xworkflows/mark.mjs adapt` in the shell.

`<base>` is this skill's base directory, shown when the skill loads. Run its scripts with `node` from the repository root; quote the path if it holds a space.

Talk to the owner in the owner's language. Headings in files, config keys and file contents stay in English. Ask the fixed questions below with exactly their meaning; in English, use the exact words.

All questions go through `AskUserQuestion`; the `header` is the item id. You do not know this project yet: research's options are guesses, never a forced choice. The owner can always type a free answer in the line Claude Code shows below the options (in English it reads "Type something"); name it as Claude Code shows it to the owner. `Type something` below means that line. Four styles:

- `open`: options `I don't know` and `Skip: not relevant here`. The question says: `Type your answer in Type something.`
- `confirm`: One item per question: Yes, No, I don't know. Options `Yes`, `No`, `I don't know`; up to 4 questions per call. Never a multi-select list. Text typed in `Type something` corrects what the question shows.
- `choice`: the item's `options` when it has them (a drafted option is `{label, description}`: send both), otherwise 2 to 4 options drafted from research or earlier answers.
- Playback (`Right`, `Wrong`, `Missing something`) is asked where a step says so.

- Every question that is not `confirm` ends with one short note, in the owner's language: `If none fits, or it is something else, type it in Type something.` This includes `choice`, except `H6-r<n>`, whose text already says it: one free-text note per question.
- Drafted options are suggestions from research, not answers: present them as suggestions, translated into the owner's language, label and description. `(Recommended)` only on an option backed by a verified `file:line` citation in `research.md`, on any style. A guess is never recommended.
- What the owner types in `Type something` wins over research and over every drafted option. `I don't know` settles the item; so does `Skip: not relevant here`.
- The fixed labels are `Yes`, `No`, `I don't know`, `Skip: not relevant here`, `Right`, `Real, but a bad rule`, `Not how it works`, `Wrong`, `Missing something`, `Keep it, because ...`, `Yes, show them`, `No, skip them`, and the `H6-r<n>` labels `Money`, `Data`, `Access`, `No risk`. Only these stay in English: send them verbatim, with the translation in the option `description`.

## Step 1: Resume

- `.xworkflows/summary.md` has `status: draft`: run `node <base>/research.mjs start` first (it keeps the run), then `node <base>/research.mjs check`. Resume from the draft: skip research, read `.xworkflows/research.md` and `.xworkflows/interview.json`, ask only the ids `check` lists, then heading 8 (`H8-*`) again, then go to step 3's playback.
- `.xworkflows/summary.md` has `status: approved`: re-adapt. Run step 2 in full (`research.prev.json` holds the research of the last approved summary; `research.mjs done` saved it when that summary was written); run `research.mjs queue`: a screen 1 sentence is not asked again when the owner answered it in the earlier adaptation (any answer but `I don't know`), its wording and its `(file:line)` are the same, every line it cites still verifies, and no spec or plan under `paths.specs` or `paths.plans` added or changed since the commit of `summary.md` names a file it cites; everything else is asked again, and only config keys that already have a value are skipped. Ask them as in step 3, then ask heading 8 (`H8-*`) again, as on a first adapt, and write a draft from the approved summary with all eight headings, each changed line marked `(changed)`; play it back as in step 3. In step 4, rewrite only the files whose content changes.
- No `summary.md`, but `.xworkflows/research.md` has `commit:` equal to `HEAD` (as after `/adapt research-only`): reuse it. With `research-only`, give its path and stop; otherwise run `node <base>/research.mjs start` (it keeps the run of an interrupted first adapt, so its answers count), then `node <base>/research.mjs queue`, then `node <base>/research.mjs check`, and go to step 3: ask only the ids `check` lists.
- Otherwise: start at step 2.

## Step 2: Research

No questions in this step.

1. Run `node <base>/research.mjs start`. It marks the adapt run: until step 4 ends, hooks record every answer and deny steps out of order; each denial names the fix. Never run `research.mjs done` while the interview is in progress, even when a step is denied: fix what the denial names.
2. Run `node <base>/rules.mjs` first: it writes `.xworkflows/rules.json`, the rules the project wrote down (docs, plans, ADRs, code comments), which research checks against the code. Then run `node <base>/scan.mjs`, which reads it. It writes `.xworkflows/scan.json` (zones, mechanism hits) and adds generated and vendored paths to `.graphifyignore`.
3. Run `graphify update .`. If `graphify` is missing, run `node <base>/research.mjs done` and stop: tell the owner graphify is required and must be installed first.
4. Read `graphify-out/GRAPH_REPORT.md`. Then run one `graphify query "<what are the main parts of this project?>"` yourself; the lookup rule wants a recent query before any `explore` agent.
5. Call the `Workflow` tool with `scriptPath: "<base>/research.workflow.js"` and `args: { root: "<absolute repository root>", zeroHits: [...], language: "<the owner's language>" }`, never an inline script. `zeroHits` is exactly the kind keys whose `kinds.<key>.total` is 0 in `.xworkflows/scan.json` (`[]` if none). `language` is the owner's language in an interview; leave it out with `research-only`, where the sentences come out in English. Without the Workflow tool, stop: run `node <base>/research.mjs done` and tell the owner adapt needs it.
6. The Workflow runs in the background: wait for its result, which arrives in a later turn. Run `rm -f .xworkflows/research.json` (the Write tool refuses to overwrite a file it has not read), then write the result unchanged (no field added, dropped or reordered) to `.xworkflows/research.json` with the Write tool.
7. Run `node <base>/research.mjs render`. It verifies each citation and writes `.xworkflows/research.md`, `screens.json`, `details.md` and `kinds.json`. Never write those, `rules.json` or `scan.json` yourself; only their scripts do. On exit 1, read its message:
   - `research.json was altered`: run `rm -f .xworkflows/research.json`, write the Workflow result already in context to it again, unchanged, with the Write tool, and run `render` again. Rerun the Workflow (5 and 6) only if its result is no longer in context. At a second mismatch it prints `stop and tell the owner`: run `node <base>/research.mjs done`, stop and tell the owner.
   - Anything else (an agent returned nothing, a citation that did not hold): rerun the Workflow once. If `render` fails again, run `node <base>/research.mjs done`, stop and tell the owner what it printed.
8. With the argument `research-only`, run `node <base>/research.mjs done` and stop here: tell the owner the path of `research.md`. No `queue`.
9. Run `node <base>/research.mjs queue`. It writes `.xworkflows/interview.json`, the questions of step 3, built from the three screens of `screens.json`.

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

Questions:

- Ask the items of `.xworkflows/interview.json` in file order, in three screens: header = the item's `id`; its `text` in the owner's language with the same meaning; its `options` when it has them. Ask nothing else but the follow-ups named here, and no id twice in a run (playback ids and heading 8 aside).
- Screen 1 (`S1-<n>`): print its numbered sentences once. Then ask each sentence as its own question, 4 per call, with the options `Right`, `Real, but a bad rule`, `Not how it works`, `I don't know`. When the queue holds `S1-more`, ask it in a call of its own. On `Yes, show them`, ask `S1-13` and on, 4 per call, like the first twelve; on `No, skip them`, go on to screen 2. Open `.xworkflows/details.md` only when the owner asks for the detail of a sentence; show just that part.
- Screen 2 (`X<n>`): each question as rendered, up to 4 per call, with its options. A doubted rule has `You are right: a pending card`, `Keep it, because ...`, `I don't know`. When the answer is the bare label `Keep it, because ...`, ask the follow-up `X<n>-why`, `open`: the reason. Research's `(code)` and `(git)` only say where a line came from.
- Screen 3: `B-rules`, `B-refused`, `B-mistake`, `B-incident`, `B-free`, then `G-3m`, `G-12m`, `G-36m`, `G-interim`, as rendered, up to 4 per call, in the item's `style` per the question rules above. The owner's free text is the answer.
- Then the items no screen asks, as the shipped text asked them:
- `H1-what`: show research's heading 1 lines, then ask; the question says that if it is not right, type what it is in `Type something`. On a bare `No`, ask the follow-up `H1-what-fix`, `open`: `What is the project?`, and list heading 1 under `Hotspots` until `P-H1` is `Right`.
- `H2-pays`: send its `options`.
- `(Recommended)`, as in the question rules: only on an option backed by a verified `file:line` citation in `research.md`.
- `H6-zones` is the zones question below, asked once, in a call of its own. Then ask `H6-r<n>` about zone n of `scan.json`, named in the owner's words after any merge, rename or split typed in `Type something`. Its options are `Money`, `Data`, `Access`, `No risk`, with several risks typed in `Type something` when more than one applies. Any answer but `No risk` adds that scan zone's paths to `paths.risk`. If the owner split a zone, ask the follow-up `H6-split` once, `open`: `What does a mistake in each new part risk: money, data or access?`, naming the parts; write its answer under heading 6.
- `H7-*`: the default git rules one by one, then review depth and who may push.
- `H8-*`: reply preferences and model budget (heading 8). It never goes into the repository.
- `C<n>`: a required config key. When research proposed a value, a `confirm` that shows it in plain words (`Your test command looks like npm test. Correct?`); a typed value replaces it; on a bare `No`, ask the follow-up `C<n>-fix`, `open`: `What should it be?`, naming the key in plain words. Its answer is the key's value. With no proposed value, an `open` item with the key's plain gloss. Every required key needs a value: `paths.code`, `paths.risk`, `paths.heavyRead`, `paths.codeAnyway`, `tests.files`, `tests.run`, `tests.notRunnable`, `checks` (`checks.project`, `checks.patterns`, `checks.ratchets`), `zones`. `[]` written on purpose counts as a value; a key nobody filled does not.
- When the queue is done, run `node <base>/research.mjs check`. It exits 1 and lists the ids with no answer in this run: ask those, then run it again. The draft comes only after it exits 0.

Heading 5:

- Mechanism rules are read from `details.md` only when the owner asks for detail: no question and no summary line for the `## Mechanism rules` section. A kind's general rule can be a screen 1 sentence (its item is `kind:<kind>`), asked like any other, and `Right` writes it like any item a sentence names; its other rules stay in the detail with no question.
- Each answer becomes a rule line under heading 5, worded as how the code must do something (`a loan is counted in whole days, in the library's time zone`), not only as the outcome to avoid (`never get a due date wrong`).
- Heading 5 groups its rule lines under the risk they prevent, costliest risk first, then `rules tied to no risk`. A risk may be a `###` sub-heading; no `#` or `##` heading inside heading 5.

### Zones

```json
"zones": [
  { "key": "app", "paths": ["src/"], "note": "the web app" },
  { "key": "db", "paths": ["db/", "migrations/*"] }
]
```

- `key`: lowercase letters, digits and `-`; unique; also the rule file name.
- `paths`: from `zones` in `.xworkflows/scan.json`, relative to the repository root, in three forms: a folder (`src` or `src/`), `dir/*` (the files directly in `dir`), `*` (the files at the root). A path is in one zone at most.
- `note`: optional, one line.
- Generated and vendored code stays out unless the owner adds it.

The zones question, in plain words:

1. First say what zones are for: each area of the code gets its own rules, and the full review checks each area separately, so a bigger area costs more to review, and so does each extra zone.
2. Name each zone of `scan.json` in everyday words (`the screens`, `the database`) with a rounded size (`about 5 MB`). No exact sizes, no paths: paths go in the playback's `## Config` block.
3. Ask `H6-zones` in a call of its own, with that proposal first, never `(Recommended)` (a proposal is not a citation), with the `Type something` note: the owner types merges, splits and renames there.

### Playback

1. Write the whole summary: the eight headings as `## <n>. <heading>`, plain words, one line per item, as short as it can be without dropping a detail. No line cap. Heading 5 lists every rule, one per line, grouped under the risk it prevents, so the owner can confirm or correct each. Each line ends `(code)`, `(git)` or `(you)`. Heading 6 says, for each zone, why it is or is not a risk path: the `H6-r<n>` answer (`Money`, `Data`, `Access` or `No risk`). After heading 8, a `## Config` block lists each required key and its value. If `docs/BUSINESS.md`, a `.claude/rules/<key>.md` or a `## Project rules` section already exists, then add `## Changes to existing files`: per file, the lines step 4 adds or changes.
2. Save it to `.xworkflows/summary.md` with front matter `status: draft` and `commit: <sha research read>`. The saved draft leaves heading 8 empty; on resume, ask heading 8 again. A denied write names what is missing: fix that and save again.
3. Show the owner the summary with a `Hotspots` list first: open doubts, research's `## Dropped` lines, the questions of screen 2 left out, the `contradicted` lines of `## Written rules and their verdicts` in `details.md`, and research's `## Not checked` (the first lines).
4. Ask `P-H1` to `P-H7`, one per heading 1 to 7, 4 per call: header = the id, question `<heading>: right, wrong, or missing something?`, options `Right`, `Wrong`, `Missing something`, none recommended. The playback asks each heading in the owner's language; the canonical English heading stays in `summary.md`. No other options, and no `Type something` note. `P-H6` also covers the zones, the risk paths and the `## Config` block.
5. On `Wrong`, `Missing something` or text typed in `Type something`: ask `P-H<n>-fix`, `open`: `What should change under <heading>?`. Fix the heading from that answer, save the draft, show that heading again with each changed line marked `(changed)`, and ask `P-H<n>` again. No cap.
6. When the last answer of each of `P-H1` to `P-H7` is `Right`, run `node <base>/research.mjs check --approved`. If it lists ids, ask them and run it again. When it exits 0, the interview ends. Go to step 4.

## Step 4: Write

Only after `P-H1` to `P-H7` are all `Right`. Before that, write nothing but `.graphifyignore`, `graphify-out/`, the `.xworkflows/` files of steps 2 and 3 and the draft. An existing `docs/BUSINESS.md`, `.claude/rules/<key>.md` or `## Project rules` section is merged, never overwritten: keep its lines, add or change only what the playback showed. The main session writes all of these in one step, `.xworkflows/summary.md` first (a denied write names what to ask; ask it, then write again), then the others:

| File | Content |
|---|---|
| `.xworkflows/summary.md` | Headings 1 to 7 as approved. Front matter `status: approved`, `date: YYYY-MM-DD`, `commit: <sha research read>`. |
| `docs/BUSINESS.md` | Headings 1 to 3, then `## Goals` (below). |
| `AGENTS.md` | Headings 4 and 5 as unbreakable rules, one line each, under `## Project rules`, in heading 5's order: each risk, then the rules that prevent it, worded as how the code must do something, then the rules tied to no risk. An owner-added rule with no path goes to `AGENTS.md` `## Project rules` only, in no rule file. Put it after the `<!-- xworkflows:end -->` line, outside the `<!-- xworkflows:start -->` block. Never edit inside the block; the installer owns it. If `## Project rules` exists, merge into only that section. |
| `.claude/rules/<zone key>.md` | One file per zone that has a rule. Front matter `paths:` lists the zone's paths as globs: a folder `src` or `src/` becomes `src/**`; `dir/*` and `*` stay as written. Then the rules, one line each, one per rule the owner confirmed (a sentence answered `Right`, or a screen 2 rule kept: `Keep it, because ...`, `The written rule`, `The code`, `Mistake: fix it`, `Exception: keep it`), each with its path as in `What each answer writes`, when that path is in the zone's paths, and every owner rule that names a path in them. |
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
- A checklist: one line per check, each one a reviewer can check against a diff, with one line per rule the owner confirmed, each with its path as in `What each answer writes` (for example: `a fee is charged only after the due date has passed`).
- The paths it covers: `paths.risk`.
- Read-only: Bash only for `git log`, `diff`, `show`, `ls-files`, `blame`, `status`, `grep`, `wc`, `graphify query`. No redirects. Never writes or edits.
- Report keys: `reviewed:` (what it checked) and `not checked:` (what it could not). When every check passes, the last line is `risk-review ok at <sha>`, with the reviewed `HEAD`.

`.xworkflows/config.json`:

- Read it if it exists. Set only these keys: `owner`, `mainBranch`, `paths.code`, `paths.risk`, `paths.heavyRead`, `paths.codeAnyway`, `paths.pending` (default `docs/PENDING.md`), `paths.reviews` (default `docs/superpowers/reviews`), `tests.files`, `tests.run`, `tests.notRunnable`, `checks.project`, `checks.patterns`, `checks.ratchets`, `zones`, `git.rules` (the confirmed git rules, one string each).
- Merge key by key: never replace the file, never drop or change a key you did not set. Write JSON with two-space indent.
- Check `zones` before writing: keys valid and unique, no path in two zones.

What each answer writes (the playback shows it, step 4 writes it):

- `Right`: only the items the sentence names, each from `details.md`; a rule the owner did not see is never written.
- A rule's path: a screen 1 rule takes it from `details.md`, a screen 2 rule (`Keep it, because ...`, `The written rule`, `The code`, `Mistake: fix it`, `Exception: keep it`) from its question in `interview.json`. For an exception question (`Mistake: fix it`, `Exception: keep it`) take it from the place where the rule itself holds, which the question names (`The rule itself holds at <path:line>`), never from the place that differs; a contradicted written rule's question names no such place, so take the path from the doc line it quotes.
- `Real, but a bad rule` and `You are right` (on a doubted rule): a card through the `pending` skill, and no rule.
- `Keep it, because ...`: the rule, with the reason; with no reason, ask for the reason once.
- `The written rule`: that rule and a card to change the code.
- `The code`: the code's rule and a card to change the doc.
- `Mistake: fix it`: the rule and one card per place.
- `Exception: keep it`: the rule with its exceptions named.
- `Not on purpose: protect it`: a card.
- `Not how it works`, `On purpose` and `I don't know`: nothing; the log keeps them.

Then commit, without asking (the owner already approved the content):

1. Append `graphify-out/`, `.xworkflows/research.md`, `.xworkflows/research.json`, `.xworkflows/research.prev.json`, `.xworkflows/scan.json`, `.xworkflows/interview.json`, `.xworkflows/interview.log.jsonl`, `.xworkflows/adapt-run.json`, `.xworkflows/rules.json`, `.xworkflows/kinds.json`, `.xworkflows/screens.json` and `.xworkflows/details.md` to `.gitignore` (create it if missing), only the lines not already there.
2. `git add` each repository file written above by explicit path, plus `.graphifyignore` and `.gitignore`. Never `git add .` or `-A`. Never `~/.xworkflows/owner.md` or a path just appended to `.gitignore`.
3. `git commit -m "chore: adapt xworkflows to this project" -- <the same paths>`, so files the owner staged before stay out. No AI author or co-author line. No push.
4. Show the owner the commit's short sha and its file list.
5. If an installer file (the `files` keys and `created` list in `.xworkflows/installed.json`) is still uncommitted, tell the owner which ones. Do not commit them.
6. Run `node <base>/research.mjs done`. It ends the adapt run.

## Step 5: Next

With `zones` empty, skip the question: say there is nothing to review and run `/next-step`.

Ask one question, header `S5-next`: `Run a full review first, or start on the next step?` Two options side by side, neither marked recommended:

- Full review: its description is `about X to Y million tokens, from one past run, not measured here`, where zones is the number of zones: X = zones × 2 × 0.17 and Y = zones × 2 × 0.25, rounded to one decimal.
- Next step.

Then run `/full-review` or `/next-step`, as the owner chose.
