---
name: deepen
description: Rewrite a request as a top professional of its field would write it, with facts found by agents, before any design question is asked. Use first on every new request for a change, and on the step /next-step hands over.
---

Before anything else, run `node .xworkflows/mark.mjs deepen` in the shell.

This stage is never skipped, however small the request. Ask the owner nothing here: agents find the facts, and decisions wait for `grill`.

Read `.xworkflows/config.json`: `roles.lookup` (default `explore`), `lookup.index.command` (default `graphify query`), `limits.agentsBeforeWorkflow` (default 2), `paths.code`.

## Step 1: What the request lacks

Name the field of the request (for example payments, accessibility, data migration). Write what a top professional of that field would add that the request does not say: the cases that break it, the limits, the usual practice, how "done" is measured. Then list the facts to find:

- Raw material: what already exists here to build on (code, data, documents, memory notes, pending cards).
- Outside proof: what is true outside this project and supports or excludes a method (for example a standard, the documented behavior of a library, a published measure).

## Step 2: Facts from agents

The main session reads no code and opens no web page for this: the `orchestrator` hook denies long reads of the code and every web call there. The same hook allows an agent only when `.xworkflows/summary.md` has `status: approved` and this session has run `orchestrate`, `adapt`, `full-review` or `next-step`. Without the approved summary, stop and tell the owner to run `/adapt`. Without one of the four, invoke `orchestrate`, then continue here.

1. If `paths.code` is not empty, run `<lookup.index.command> "<topic>"` in the shell. The hook denies the `roles.lookup` agent until this has run.
2. For what the index did not answer, launch the `roles.lookup` agent: one for raw material and one for outside proof, in one message, each with every question of its kind. More agents than `limits.agentsBeforeWorkflow` go in one `Workflow`.
3. Each prompt asks for one line per fact: the fact, its source (`path:line` or URL) and its label. The agent returns the answer, never the page.

Every fact carries one label:

- `tested`: an agent ran it here and saw the result. Keep the command.
- `read not tested`: read in the named source, not run.
- `not confirmed`: no source found. A fact that you or an agent only remember is `not confirmed`.

## Step 3: The deepened request

Write it in the chat, in the owner's language; the line heads and the labels stay in English. 25 lines at most: this text opens the spec and is paid on every later turn. Write no file: the `design-first` hook denies a new spec until `grill` has run.

- `Goal: G<n>`: only when `next-step` handed over a goal.
- `Request:` the request as that professional would write it, with how "done" is measured.
- `Adds:` one line per thing the request did not say and the field requires.
- `Material:` one line per thing that exists, with its `path:line` and label. When `next-step` handed over a red test, the first line is that test, its command and the branch `verify/<id>` that holds it.
- `Methods:` one line per method that fits, with why it fits here. When two fit, write both: the choice is a `grill` question.
- `Proof:` one line per outside fact, with its URL and label.

A small request (one place to change, no decision open) gets three lines: `Request:`, `Material:`, `Methods:`. Its proof, if any, goes on the `Methods:` line.

## Hand-off

Invoke `grill` in the same turn. The spec written after it opens with the deepened request, in English, with facts and labels unchanged.
