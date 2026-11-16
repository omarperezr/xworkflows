# Spend cut: effort per role, review rounds, pre-push time

Goal: G1

## 1. The request, deepened

Request: cut the token spend of the method without losing the risk review, and make the pre-push faster. Done is measured by the same counts as the read-only diagnosis of 2026-11-15, taken again after five batches: Fable runs per batch, cost per batch, fixes that repair an earlier fix, and the pre-push seconds of a push with about 20 fix commits.

Material (measured 2026-11-15 on this repository's own sessions, usage numbers only, priced with the official table; the recomputed total matched Claude Code's own record within 2 %):
- Main session on Fable at effort `xhigh`: 34 % of spend; risk reviewer on Fable: 30 %; implementers 9 %; untyped workflow agents 6 %. `tested`
- 18 of 19 batches with a risk review ran it two or more times; first reviews cost 139 USD, later ones 226 USD; a confirmation cost almost as much as a first review (median 5.3 against 6.7 USD). `tested`
- Of 44 fixes made after a second or later review, 21 change lines written by an earlier fix of the same batch, 15 lines of the batch's tasks the first review missed, 8 older code (git blame). 99 of 120 fix runs were Sonnet at effort `medium`. `tested`
- Review cost per 100 changed lines: 5.7 USD for batches of 100-400 lines, 2.3 USD above 400; the number of runs per batch is the same (median 3). `tested`
- Pre-push of 57 commits with 23 fixes, brake by brake: `fix-has-test` 753 s, the suite (brake `project`) 294 s, the 12 others 8 s together. `tested`
- No agent file of the method sets an effort, so each agent runs at the user's own setting: `xhigh` for the author, `medium` by default. `tested`

Proof (official docs, `read not tested`):
- A subagent's frontmatter takes `effort` (`low`, `medium`, `high`, `xhigh`, `max`); the Agent call can pass `effort`, which overrides the field; `CLAUDE_CODE_EFFORT_LEVEL` overrides both. https://code.claude.com/docs/en/sub-agents
- Fable 5.2: "Start with `high`... Step up to `xhigh` for your hardest long-running coding and agentic work, where you've measured a gain." https://platform.claude.com/docs/en/build-with-claude/effort
- "Switching models recomputes the entire request even when the content is identical." https://code.claude.com/docs/en/prompt-caching

## 2. Design

1. Each agent file of the method carries its effort: `explore`, `mechanical`, `mechanism`, `dream-analyzer`, `dream-organizer` at `low`; `implement`, `verify-finding` at `medium`; `review`, `zone-review` at `high`; `risk-review` at `xhigh`.
2. `orchestrate`: a fix of a blocking finding is dispatched with effort `high`; a confirmation by the risk reviewer is dispatched with effort `high` (same model). Every `agent()` of a Workflow names its `agentType`, so no agent runs on the main session's model by accident.
3. `plan`: related small work goes in one batch up to `brakes.changeSize.warn`, not one batch per small change.
4. P-194: cut the time of `fix-has-test` without a pool of worktrees (judged unsafe): the full-file rerun at the parent and the per-commit `git log` loop first; measured again on the same push range.
5. P-195, P-196, P-197 as their cards say.

## Owner's answers

- The main session runs on Opus: "1 si" (2026-11-15).
- The risk reviewer's confirmations run at effort `high`: "2 high" (2026-11-15). The first review of a batch stays at `xhigh` on Fable.
- No cards, do the work now: "3 no, empieza a hacerlo todo ya" (2026-11-15).
