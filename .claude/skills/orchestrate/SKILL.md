---
name: orchestrate
description: Implement a written plan with agents, batch by batch, and review each batch before it merges. Use once per session before the first agent or Workflow, and when a plan is ready to implement.
---

Before anything else, run `node .xworkflows/mark.mjs orchestrate` in the shell.

You are the main session: you decide, dispatch and judge. Agents read, write and test. What you read stays in context for the rest of the session; what an agent reads is gone when it reports.

Read `.xworkflows/config.json`: the names below are its keys. A key it lacks takes its default: `mainBranch` `main`; `paths.plans` `docs/superpowers/plans`; `paths.specs` `docs/superpowers/specs`; `paths.pending` `docs/PENDING.md`; `paths.nonCode` `docs/`, `.claude/`, `.xworkflows/`, `**/*.md`; `paths.curated` `AGENTS.md`, `CLAUDE.md`, `.claude/rules/`, `docs/BUSINESS.md`; `roles.implementers` `implement`, `mechanical`; `roles.lookup` `explore`; `roles.verifier` `verify-finding`; `roles.reviewer` `review`; `roles.riskReviewer` `risk-review`; `limits.inlineReadLines` 40; `limits.agentsBeforeWorkflow` 2; `lookup.index.command` `graphify query`; `lookup.index.minutes` 30. `paths.risk`, `paths.heavyRead` and `paths.codeAnyway` have none.

## The main session

- Never read code at length. Under `paths.heavyRead` the `orchestrator` hook denies a read with no `limit` or with more than `limits.inlineReadLines` lines, and `cat`, `head`, `tail` and `sed -n`. Web pages, images and PDFs go to an agent.
- A lookup goes to the index first: run `<lookup.index.command> "<topic>"` in the shell. Dispatch `roles.lookup` only for what the index did not answer; the hook denies it unless that command ran in the last `lookup.index.minutes` minutes.
- Files under `paths.curated` are yours: the hook denies an agent's write there. A task the plan gives to the main session is one you do yourself.
- What the owner asks during the work goes into the plan (`Global Constraints`, or the task it touches) in the commit that decides it. Agents read the plan, never this conversation.

## Dispatch

- Dispatch only agents defined in `.claude/agents/`. When `renamed` in `.xworkflows/installed.json` has `.claude/agents/xwf-<name>.md`, dispatch `xwf-<name>`.
- Every task has exclusive files: no two running agents own one file. A task that needs a file a running agent owns waits for that agent's report.
- Start at the cheapest tier that holds the rules. The plan names each task's agent; for a task you write, the agents' descriptions say which one fits.
- One or two agents go with `Agent`, in one message when they are independent. Three or more in a stretch, parallel or serial, go in one `Workflow`: one result comes back, not one turn per agent. The hook denies another agent once `limits.agentsBeforeWorkflow` have run without an owner decision in between.

Failure is defined: a test or type check red, or a report that starts with `blocked:`, `needs judgment:` or `cannot test:`. Escalate one tier, once: dispatch the task again with the failure in the prompt, to the implementer one tier up or, when there is none, to the same agent with the next tier's model from `.xworkflows/tiers.json` (`cheap`, `medium`, `top`; an agent's own model is the `model:` line of its file). A second failure, or a failure at `top`, comes back to you: answer it from the plan or ask the owner.

In a `Workflow` the script applies the failure rule itself, so you spend no turn on it: it retries the task once, one tier up (pass the model names in `args`: a script reads no files). It counts a report without its keys as a failure, because the `handback` hook is not tested inside a `Workflow`. It returns each task's report and nothing more.

## The prompt

The prompt is all the agent knows. It holds:

1. The task: its title in the plan, and what the plan does not say.
2. The files the agent owns, as the plan lists them, and the files other running agents own.
3. The path of the plan or spec. The agent reads `Global Constraints` and `Review Focus` there, so do not copy them.
4. What "done" is, as the plan measures it. Example: "`<test command>` on `<test file>` passes", never "when it is ready".
5. What to report: the keys of its role, below, and that measure. No file contents, no diffs.

## Reports

The `handback` hook denies a report that lacks a key of its role. A key counts at the start of a line, in plain text.

| Agent | Keys |
|---|---|
| `roles.implementers` | `red:`, `green:`, `skipped:`, `sha:`. A change with no logic gives `no-test:` in place of `red:` and `green:` |
| `roles.reviewer`, `roles.riskReviewer` | `reviewed:`, `not checked:` |
| `roles.verifier` | `red:` or `discarded:` |
| An agent that cannot do its task | `blocked:`; an implementer also `needs judgment:` or `cannot test:` |

- `skipped:` and `not checked:` name work not done: make each a task, a card or a question to the owner.
- Tell the owner a task is done only when its report carries the measure.
- A report that asks for no decision gets no reply: read it and go on.

## A batch

Batches run in the plan's order, one at a time.

1. Create the batch branch the plan names, from `mainBranch`. Set the batch's card to `in progress on <branch>` with the `pending` skill.
2. Dispatch the batch's tasks together. Agents commit only when the prompt says so; by default you commit each finished task, from the files its report lists.
3. Review and seal, as below.
4. With the `pending` skill, on the batch branch: close the batch's card, or set it back to `scheduled` when a later batch shares it.
5. Merge the batch branch into `mainBranch` with `--no-ff`, then delete the `verify/<id>` branches its tasks name. Ask the owner whether to push; do not hold a merged batch for an unrelated one.
6. Give the owner the `/compact` command, ready to paste, with what to keep.

`git.rules` holds the git rules the owner confirmed. The defaults:

- One branch per batch, merged with `--no-ff`, never rebased after review: the seal names a sha.
- Files are added by explicit path, never `git add .` or `-A`.
- No commit, PR or comment names an AI as author or co-author.
- Push only when the owner says so.

Change the plan only on the batch branch: the merge then carries the pending list change that the `pending` brake asks of every plan change.

## Review

One review per batch, before the batch merges.

1. Pick the reviewer: `roles.riskReviewer` when the batch touches `paths.risk`; otherwise `roles.reviewer`; none when the batch is docs only (every changed path under `paths.nonCode`, none under `paths.codeAnyway`).
2. Commit every task, note `<reviewed sha>` (the `HEAD` of the batch branch) and dispatch. The prompt names the plan or spec file and the range `<mainBranch>...<reviewed sha>`. The hook denies the risk reviewer when its prompt names no `.md` file under `paths.plans` or `paths.specs`, and when it already ran on this `HEAD`: it never runs twice on one commit.
3. Sort the findings. Only an error of the app, money, permissions or data blocks; the rest become cards.
   - `blocking`: dispatch `roles.verifier` with the finding and a short id of letters, digits and `-`. The finding enters the plan, as a fix task, only after the answer `red: <test path> <command>`; that test is on branch `verify/<id>`. On any `discarded:`, the finding does not enter the plan: write a card with the verifier's reason, and on `cannot run here` also tell the owner in one line.
   - `pending`: one card each, written with the `pending` skill. A card opens no round.
   - `ask-owner:`: put its options to the owner in the question dialog (`AskUserQuestion`), and write the answer in the plan.
4. Fix: dispatch a new implementer, not the one that wrote the code, with the verified findings and the test path and branch of each (`git show verify/<id>:<test path>` gives the test). Commit the fix and its test together, with the subject `fix: <what>`: the `fix-has-test` brake checks the commits whose subject starts with `fix:` or `fix(`, and runs the test on the parent commit, where it must fail. Then delete the `verify/<id>` branches.
5. Confirm: dispatch a fresh reviewer of the same role, never the one that asked for the fix. The prompt names the plan or spec file, the findings and `<reviewed sha>`; the reviewer reads the findings and only `git diff <reviewed sha>..HEAD`. The `HEAD` it read is the next `<reviewed sha>`.
6. Two rounds of steps 3 to 5 at most. If a `blocking` finding still stands after the second, ask the owner in the question dialog: fix, accept or revert. An accepted finding goes under `Declined findings` with the owner's reason, and the accept counts as the ok.

## Seal

An ok is a review or a confirmation that leaves no `blocking` finding open. After it, write under the plan's `Seals`, alone on its line, with no bullet, backticks, indent or final period:

```
<role> ok at <sha>
```

`<role>` is the value of `roles.riskReviewer` or `roles.reviewer`, whichever gave the ok. `<sha>` is the `HEAD` it read, 7 to 40 hex digits. Commit that line and nothing else.

The `review-seal` brake refuses a push to `mainBranch` unless every code commit is that sha or an ancestor of it, and takes only the `roles.riskReviewer` seal when a commit touches `paths.risk`. A code commit after `<sha>` needs its own confirmation and a new seal line.
