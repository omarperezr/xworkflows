---
name: plan
description: Turn a settled design into a written plan of tasks, each with its files, agent, batch branch and a "done" someone can run. Use after `grill`, before any implementing.
---

Before anything else, run `node .xworkflows/mark.mjs plan` in the shell.

A plan holds only settled decisions: if one is still open, stop and go back to `grill`. This is the only plan format here: load no other planning skill.

Talk to the owner in the owner's language. The plan is in English, except the owner's words, which are quoted as said.

Read `.xworkflows/config.json`: `paths.plans` (default `docs/superpowers/plans`), `paths.pending` (default `docs/PENDING.md`), `paths.curated` (default `AGENTS.md`, `CLAUDE.md`, `.claude/rules/`, `docs/BUSINESS.md`), `roles.implementers` (default `implement`, `mechanical`), `roles.lookup` (default `explore`), `brakes.changeSize.warn` and `.max` (default 400 and 800), `lookup.index.command` (default `graphify query`), `tests.files`, `tests.run`.

## Step 1: Cut the work

A task is the work of one agent. A batch is the tasks on one branch: they run at the same time, get one review and merge together.

- Files: a task owns every file it creates or changes, its test file included (a path `tests.files` matches). No file is in two tasks of one batch, so two agents never write the same file. Two changes to one file are one task, or go in two batches.
- Order: a task that needs another task's result goes in a later batch. Each batch leaves the project working when it merges.
- Size: estimate the code lines each batch changes, added plus removed. Tests, docs, fixtures, JSON, lockfiles and generated files do not count. Keep a batch under `brakes.changeSize.warn`; at `brakes.changeSize.max` the brake `change-size` refuses the push. A batch that cannot be cut smaller (for example one rename across many files) says so in the plan: a commit on its branch needs a line `size-ok: <reason>`.
- Role: a name from `roles.implementers`, chosen by the agents' descriptions. A change with no logic goes to the agent for mechanical edits. No agent may write a file under `paths.curated` (the hook `orchestrator` denies it): that task has `Role: main session`.
- Branch: `<slug>-<n>` for batch `<n>`. A branch name has only letters, digits, `/`, `_` and `-`: the brake `pending` reads no other character.
- Done: a command and the result it must give. For example: `tests.run` on the task's test file passes, or `git grep -c <old name>` prints nothing.
- A review finding becomes a task only when it comes with its line `red: <test path> <command>`; without that line it stays a card of the pending list. Its task names the test path and the branch `verify/<id>` that holds it: the fix commit copies that test (`orchestrate`, review step 4). The batch keeps its `<slug>-<n>` branch.

Take the files from the spec, then from the code index: run `<lookup.index.command> "<topic>"` in the shell, and check with `ls` that each path it names exists (the index can be stale). What neither answers goes to the `roles.lookup` agent. The hook `orchestrator` allows that agent only after the index command, in a session that has run `orchestrate`, `adapt`, `full-review` or `next-step`; without one of the four, invoke `orchestrate` first. Read no code at length here: the same hook denies it.

## Step 2: Write the plan

Write `<paths.plans>/YYYY-MM-DD-<slug>.md`: today's date, and `<slug>` in lowercase letters, digits and hyphens. The plan is short: it points at the spec for the why and holds only what an agent needs to do its task. Keep the headings as written here: agents find the parts by these words.

```markdown
# <title>

Goal: G<n>

Spec: <path of the spec>

## Global Constraints

- "<what the owner asked, in the owner's words>"

## Tasks

### Batch 1: `<slug>-1`

**T1: <what changes, in one line>** (spec section <n>)
- Files: `<path>`, `<test path>`
- Role: <agent name>
- Done: `<command>` <the result it must give>

## Review Focus

- <where this change can break the app, money, permissions or data>

## Declined findings

## Seals
```

- `Goal: G<n>` names the goal line of `docs/BUSINESS.md` this work serves; the spec has it when `next-step` handed it over. The line starts in the first column and holds nothing else: no bold, no list mark, no goal text. The brake `goal-cited` reads exactly that. If no goal fits, ask the owner which goal the work serves; never pick the nearest.
- Global Constraints: only what binds every task. Quote the owner; do not summarize. When the owner decides something later, add it here in the commit that applies the decision.
- Tasks: under a task's title, add only what its agent needs and the spec does not say. No code, no restated design.
- Every implementer reads Global Constraints and Review Focus whole: keep both to a few lines.
- Declined findings and Seals stay empty now. Later, a finding the owner declines goes under Declined findings, so no reviewer raises it again. After each review ok the main session adds `<role> ok at <sha>` under Seals, alone on its line, with no list mark and no backticks.

## Step 3: Pending list and commit

Update the list as the `pending` skill says for a plan, and commit here, not there. Work the plan leaves for later gets its own card, `Status: unscheduled`.

One commit holds the plan and the list, because the brake `pending` refuses a plan commit that leaves the list untouched: `git add <plan> <paths.pending>`, then `git commit -m "docs: plan <slug>" -- <plan> <paths.pending>`. No AI author or co-author line. No push.

## Hand-off

Tell the owner the plan's path and one line per batch: its branch, its tasks and its estimated code lines. Then invoke `orchestrate` with the plan's path.
