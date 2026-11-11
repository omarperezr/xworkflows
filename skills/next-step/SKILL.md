---
name: next-step
description: Pick the next step of the project with the owner, then hand it to the design flow. Use when the owner asks what to do next, or after /adapt or /full-review.
---

Before anything else, run `node .xworkflows/mark.mjs next-step` in the shell.

Talk to the owner in the owner's language. Headings, config keys and file contents stay in English. Questions go through `AskUserQuestion`: at most 4 per call, the recommended option first and marked `(Recommended)`.

Read `.xworkflows/config.json`: `paths.pending` (default `docs/PENDING.md`), `paths.plans` (default `docs/superpowers/plans`), `paths.reviews` (default `docs/superpowers/reviews`), `mainBranch` (default `main`).

## Step 1: Gather candidates, in this order

1. What the owner asked for in this session, including any "next I want ..." said in the interview.
2. Next steps written down (below).
3. Your own suggestions, each naming the goal `G<n>` it serves from `docs/BUSINESS.md`:
   - A full review ran: first the items the owner answered `Do it` (the latest file in `paths.reviews`, section `## Owner's decisions`), then its errors.
   - No review: the breakage hotspots and the risk paths without tests, from `.xworkflows/summary.md` and `.xworkflows/research.md`.

## Step 2: Written down, in this order

If `.xworkflows/research.md` has `## Written down` (research topic 6) and `HEAD` is still its `commit:`, reuse that list and search nothing again. Otherwise search:

1. The pending list (`paths.pending`, default `docs/PENDING.md`): cards `Status: in progress`, then `Status: scheduled`.
2. Work in progress in git: uncommitted changes, skipping paths under `.xworkflows/`, `graphify-out/` and the files listed in `.xworkflows/installed.json` (`files` keys, `created`); local branches not merged into `mainBranch` with a commit in the last 30 days.
3. Plans in `paths.plans` with unchecked boxes (`- [ ]`), newest first.
4. The other pending cards, in file order.
5. `TODO.md`, `TODO`, `ROADMAP.md`, `NEXT.md`, at the root or in `docs/`; README sections titled roadmap, todo, next or planned.
6. Open GitHub issues with `gh issue list`, only when `gh auth status` succeeds and the repo has a GitHub remote. Otherwise print `GitHub issues skipped: gh is not set up.` and skip it.
7. `TODO` and `FIXME` comments: `git grep -nE '\b(TODO|FIXME)\b'`. Give the count and at most 5, from the files changed most.

## Step 3: Ask

Ask one question, `What is the next step?`, with at most 3 candidates in source order (step 1 order, then step 2 order). The first is `(Recommended)`. Each option shows one line, its source and its goal `G<n>`. Free text takes anything else.

With fewer than 2 candidates, ask `What is the next step?` in plain text, not `AskUserQuestion`, naming the one candidate if there is one, and take the answer.

## Step 4: Verify a picked error

If the pick is an error from the full review, launch the `verify-finding` agent with it and its finding id before anything else. A picked card whose `Origin:` is a review file counts as a review error. The id is `<review date>-E<n>` for error `<n>` of the review file, or `P-<n>` for a card.

- `red: <test path> <command>`: keep the pick; the test is part of the step, on branch `verify/<id>`.
- `discarded: cannot run here: <why>`: say why in one line, keep the candidate's card in `paths.pending`, and go back to step 3 without it. A review error with no card gets one appended in the Hand-off form (`Origin:` the review file, `Status: scheduled`), numbered one above the highest `P-<n>` found both in that file and in `git log --grep "closes P-"`, and committed like the Hand-off card.
- Any other `discarded: <reason>`: drop the candidate, say why in one line, and go back to step 3 without it.

## Hand-off

Invoke `superpowers:brainstorming` with the chosen step (its text, source and goal). After a `red:`, also pass `verify/<id>` and the red test, so the fix starts on that branch.

If that skill is not available, say so, then append the step to `paths.pending` as a card and stop:

`- **P-<n>** — <text>. Origin: next-step. Status: scheduled.`

`<n>` is one above the highest `P-<n>` found both in that file and in `git log --grep "closes P-"`. If the file is missing, create it with the line `# Pending`. Commit only that file: `git add <file>`, then `git commit -m "docs: schedule next step" -- <file>`. No AI author or co-author line. No push.
