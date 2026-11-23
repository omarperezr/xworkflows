---
name: adapt-proof-runs
description: "How /adapt is measured on the reference project (R = found by research alone, I = kept after the interview), the result of each run, what the runs cost, and the process mistakes that burned turns; read before measuring /adapt again"
metadata:
  node_type: memory
  type: project
  originSessionId: aa2efc01-b9d7-4fe4-be14-668d8375c06e
  modified: 2026-11-13T02:00:00.000Z
---

Status as of 2026-11-13. Related: [[phase-1-progress]], [[no-api-spend]].

## The measure

- Key: the 10 invariants the reference project wrote in its own instruction file (the "Invariants" section of its CLAUDE.md). They are kept in `docs/proof/private/invariants.md`, which is git-ignored and never committed.
- The copy a run uses has its instruction files removed and has xworkflows installed. The 1.2b proof removed CLAUDE.md, `.claude/` and `docs/`; the later plan keeps README and docs, because /adapt must read them.
- R: invariants found by `/adapt research-only`, before any question.
- I: invariants that end up in the written rules (AGENTS.md "Project rules", `.claude/rules/`, the risk-review agent) after the interview. Pass mark: I of at least 8 of 10, fixed before run 1.
- Scoring: rubric v2 counts key phrases per invariant and is frozen (hash starts e0cadfb6). The first rubric missed invariant 7, because the code says "op_id claimed once" and never the word "idempotent"; v2 loosened those patterns.
- Hand counts were kept next to the rubric. They differed from the automatic count by 1 or 2 points out of 10.

## Results

| Run | Version | R | I | Notes |
|---|---|---|---|---|
| 1 | first interview | 3 | 3 | |
| 2 | first interview | 6 | 8 (pass) | Research cited the owner's written product doc, by luck of the agent's script. Part of the pass came from questions. |
| 3 | interview with changed question shape | 1 | 4 firm + 5 borderline | Research found other mechanisms. 2 of 4 mandatory questions were skipped. |
| 4 | live interview, first code-first version | 1 | 2 firm + 4 borderline | Every mechanism kind returned something, so no mechanism question was asked. Several question screens had only "I don't know / Skip". |
| research-only, rubric v2 | first version | 4, 5, 4 | hand 5, 5, 5 | |
| research-only, rubric v2 | after ranking fix and test-file exclusion | 5, 4, 4 | hand 6, 6, 6 | |
| research-only, rubric v2 | after comment-rule and Tailwind-class fixes | 6, 7, 6 | hand 7, 8, 7 | The three tuning rounds all used the reference project. |

The last row passes the R target (6 or more in all 3) only on the reference project. Hand-firm invariants in that round: 2, 3, 4, 5, 7, 8 and 9. Invariant 6 was firm in one run only. Invariant 1 appeared only by citing the doc that copies the invariants. Invariant 10 came out as "legal rules are fixed" only.

## Costs (API credits through the harness)

- Spike: 0.07 USD. Fixture trial 1 (fake test repo with 12 planted mechanisms): 1.41 USD. Fixture trials 2 to 4 together: 2.16 USD. Public open-source trial with no money rules: 0.85 USD.
- Research-only runs on the reference project: about 1.2 to 1.4 USD each in the later batches (about 4 USD per batch of 3).
- The last transcript read the ledger at 16.09 USD of a 60 USD total cap. Check `docs/proof/private/proof-spend.json` before quoting a total.
- One run was stopped by a network 403 ("request blocked"). It was a network or region block, not a code error; retry later.

## Process lessons (what burned turns)

1. Changing several things in one run made the cause unknown. Run 3 changed the questions, the graph and the research script together. Change one thing per run.
2. The agent rewrote its own research script each run, so runs varied. A fixed Workflow file in the package removed most of the variance, but the fixed script lost the instruction to read the docs, which cut R.
3. Keyword tables and code patterns picked on one project overfit it. An audit found about 43 items too specific to the reference project. That list was not yet saved to a file.
4. Tuning three times on the reference project and then scoring there is overfitting. 6, 7, 6 is not evidence of generalization. Design 10.1 says the reference project only tunes and the exam projects are used once each. Exam projects A and B have not been run.
5. `render` counted an honest "not checked" on a file that only matters to another kind as a failure, so research.md was never written. Now each kind counts only its own files.
6. Test files were a source of rules: the transaction kind latched onto the reference project's database tests. Test files are now excluded from the mechanism search.
7. Hooks check coverage and structure (every item present, no risky file left unchecked). They cannot check that the rule found is the right one.
8. A review before the first paid trial found two critical harness bugs: the instruction-file strip failed on every copy, and the replay file loaded empty, so every replay answered "I don't know". Dry-run the harness before paying.
9. A killed trial could have deleted the owner's `~/.xworkflows/owner.md`. The harness now moves it aside during each trial and restores it even after Ctrl-C.
10. A mechanism agent of type `explore` refused to judge, because its instructions say not to. A dedicated read-only agent type (`mechanism`, medium model) was used instead.
11. Test whether the hook can answer the question before building on it. `claude -p` cannot answer AskUserQuestion; the Agent SDK with a PreToolUse hook (`updatedInput`) can.
12. Paid headless runs bill `ANTHROPIC_API_KEY` when it is exported. The harness refuses to start with the key set unless `--api-credits` is given. See [[no-api-spend]].
13. Mechanism questions were asked only when a kind came back empty. Once every kind returned something, the interview asked none of the questions that had produced the best results.
14. The owner rejected a 32-rule list from `/adapt` on 2026-11-12: its rules were 40 to 60 word compound sentences with technical terms. The rule screen of `/adapt` must hold short plain rules, not research prose (about 12 items at most, one idea each).

## Code and commands (xworkflows)

- `skills/adapt/SKILL.md`: the interview text. Topic bank in `skills/adapt/topics.md`.
- `scan.mjs`: the no-AI scan (signals per kind, SQL inventory, zones). Signals are word and pattern lists; they are narrow and tied to one stack.
- `rules.mjs`: reads the written rules from docs and comments. Recognises English and Spanish rule words only.
- `research.workflow.js`: the fixed Workflow, 18 agents (6 topic agents and 12 kind agents), run by `scriptPath`.
- `research.mjs render`: checks each citation (file exists, cited text within 3 lines) and writes `research.md`.
- `proof/harness.mjs`: the Agent SDK runner. Flags: `--api-credits`, `--spend-file`, `--max-usd-total`. Replays recorded answers by question id.
- `proof/grade.mjs`: rubric v2 scoring.
- `test/fixtures/mechanisms`: fake repo with 12 planted mechanisms. Never installed.

## Still open

- Exam projects A and B: no run yet. The drafted plan (not approved) takes the answer key from each project's written docs, with the owner only marking the output and never writing the key. Each version runs once.
- The length and the cost of an interview on a new project are not measured yet.
