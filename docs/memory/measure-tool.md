---
name: measure-tool
description: "proof/measure.mjs in xworkflows: what it counts per batch, its known bugs, and where its numbers live"
metadata:
  node_type: memory
  type: project
  modified: 2026-11-23T00:00:00.000Z
---

# Measure tool (`proof/measure.mjs`)

Built 2026-11-18.

- Reads the session files of the project; each message counted once, by message id. The batch comes from the git branch recorded on each message, not from the session.
- Groups spend by role from each subagent's `agentType` and `model`. Cost per message uses the official price table, with the table date stored on the row.
- Quality per batch: fix rounds that repair an earlier fix, failures found after the seal (counted against the batch even months later), false blocks from brakes. The bar is "do not get worse than the median of earlier batches".
- Output goes only to a git-ignored folder under `docs/measure/`, numbers only, no session text.

## Known bugs and limits

- The main session's share does not match the earlier split (42 % against 34 %); cause unknown. Open.
- Review rounds are read by role name; a project with other reviewer names shows 0 rounds.
- Agents launched inside a Workflow must be counted (about 31 % of spend); check that a test covers a nested run before trusting a total.
- With no usable baseline it exits 2 with one line that says why.

Lesson: answer the owner's question first, then measure.

Related: [[model-and-effort-policy]], [[risk-reviewer-model-test]].
