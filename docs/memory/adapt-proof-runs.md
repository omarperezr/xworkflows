---
name: adapt-proof-runs
description: "How /adapt is measured on the reference project, what the runs showed, and the process lessons; read before measuring /adapt again"
metadata:
  node_type: memory
  type: project
  modified: 2026-11-23T00:00:00.000Z
---

# /adapt proof runs

## The measure

- Key: the 10 invariants the reference project wrote in its own instruction file, kept in a git-ignored file, never committed.
- R: invariants found by research alone. I: invariants that end up in the written rules after the interview. Pass mark: I at least 8 of 10.
- Scoring by a frozen rubric (`proof/grade.mjs`); hand counts kept beside it.

## Results

- Best research-only score: 6, 7, 6 of 10, but after three tuning rounds on the reference project itself, so not evidence of generalization.
- Paid exam on two exam projects (research only, 2026-11-15): A 11 of 20 rules exact, 9 overstated, 0 invented; B 18 of 23 exact, 5 overstated, 0 invented. Open: P-197, rules worded wider than the code.

## Process lessons

1. Change one thing per run, or the cause is unknown.
2. A fixed research Workflow (`skills/adapt/research.workflow.js`) removes most run-to-run variance; it must still tell the agents to read the docs.
3. Keyword tables picked on one project overfit it; exam projects are used once each.
4. Test files are not a source of rules.
5. Hooks check coverage and structure, not that the rule found is right.
6. Dry-run the harness (`proof/harness.mjs`) before paying; it moves the owner's preferences file aside during a trial and restores it.
7. `claude -p` cannot answer AskUserQuestion; the Agent SDK with a PreToolUse hook can.
8. Paid headless runs bill `ANTHROPIC_API_KEY` when it is exported; the harness refuses to start with it unless `--api-credits` is given.
9. The owner rejected a 32-rule list of long compound sentences: the rule screen holds about 12 short plain rules, one idea each.
10. The owner never writes the answer key; it comes from what the project already writes plus his marks on the output.

Related: [[phase-1-progress]].
