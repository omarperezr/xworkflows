---
name: model-and-effort-policy
description: "Which model and effort each xworkflows role runs on, the owner's decisions about them (risk reviewer Fable, confirmations by Opus), and what drives the cost"
metadata:
  node_type: memory
  type: reference
  modified: 2026-11-23T00:00:00.000Z
---

# Model and effort per role

## Owner's decisions (in force 2026-11-23)

- Risk reviewer: Fable at xhigh, once per batch, review only. It stays Fable because it misses fewer faults than Opus ([[risk-reviewer-model-test]]).
- Fix rounds of the risk review are confirmed by a new Opus, never by another Fable.
- Main session on Opus; the top model only for risk review and hard decisions.

## Facts

- `.xworkflows/tiers.json` has four tiers: `cheap` haiku, `medium` sonnet, `top` opus, `strongest` fable.
- `.claude/agents/risk-review.md` has `model: fable`. Claude Code does not read a `tier:` line, so check the `model:` line of each agent file after any install.
- `/adapt` asks which model the risk reviewer uses (default: the strongest).
- Effort per role: searcher, mechanical and `/dream` agents `low`; implementer and verifier `medium`; normal reviewer `high`; first risk review `xhigh`. `proof/flow.mjs` does not pass effort; agents use the one in their own file.

## What drives the cost (measured 2026-11-15)

- The fix-then-review loop: of 19 batches with a risk review, 18 had two or more runs, and confirmations cost nearly as much as first reviews.
- Bigger batches cost less per line to review; the number of rounds was the same.
- Switching the model mid-session pays the whole context again.

Related: [[workflow-upgrade-2026-11]], [[measure-tool]].
