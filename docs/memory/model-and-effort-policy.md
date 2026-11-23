---
name: model-and-effort-policy
description: "Which model and effort each xworkflows role runs on (tiers.json, agent files, main session), the spend by role measured on 2026-11-15, and the owner's decisions about them"
metadata:
  node_type: memory
  type: reference
  originSessionId: ae390796-e18d-4363-a406-510d18d6a48a
  modified: 2026-11-23
---

# Model and effort per role

Facts as of 2026-11-15, unless marked otherwise.

## Tiers and the risk reviewer

- `tiers.json` has four tiers: `cheap` = haiku, `medium` = sonnet, `top` = opus, `strongest` = fable. `strongest` was added on 2026-11-15 (card P-170). No package agent asks for it except the risk reviewer.
- This repository's `.claude/agents/risk-review.md` has `model: fable`. Before that, the file said `tier: top`. Claude Code does not read `tier:`, so the risk reviewer silently ran on the conversation's model. After any install, check the `model:` line of each agent file.
- Owner's decisions, 2026-11-15: the risk reviewer runs on the strongest model by default, and the user can change it. The user answers which model at `/adapt` time, and can edit the `model:` line later. The risk reviewer runs once per batch, only to review; it runs less often than the other agents by design, and the owner did not ask for fewer runs.
- `/adapt` asks which model the risk reviewer uses: the strongest (also the answer when none is given), the same as the normal reviewer, or a name the user types. The order of the rule, first match wins: the owner's correction when approving the summary, the answer, the file's current model on a re-adapt, the strongest, the normal reviewer. One function (`research.mjs model`) with a 21-row table test.

## Effort

- Claude Code reads an `effort:` line in an agent file (read in the docs; installed version 2.1.325 supports it). Not seen working in a real run as of 2026-11-15. A 2026-11-23 note says the flow runner does not pass effort and that the SDK's handling is unverified: [[xworkflows-handoff]].
- Per-role table set on 2026-11-15: searcher, mechanical-change and `/dream` agents `low`; implementer and verifier `medium`; normal reviewer `high`; first risk review `xhigh`; fix rounds and confirmations `high`.
- Before that change, effort came only from the user's global settings, per model (Fable at `xhigh`, Opus at `high`). Every project inherited it.
- Main session: the owner set the main session to Opus (in the user's global settings, which affects all projects), with Fable only for risk review and hard decisions. The session had been on Fable for about three days before that.

## Measured spend by role (2026-11-15)

Estimates from the session logs, not invoices:

| Role | Estimated USD | Share |
|---|---|---|
| Main session on Fable, xhigh | 423 | 34 % |
| Risk reviewer on Fable | 381 | 30 % |
| Implementers (Opus 79, Sonnet 39) | 118 | 9 % |
| Main session on Opus | 115 | 9 % |
| Generic agents (no type) | 111 | 9 % |
| Workflow agents without a type | 73 | 6 % |

Total about 1,221 USD. Generic and untyped agents were the paths the hooks later closed: every Workflow agent must carry a type.

## What drives the cost

- The fix-then-review loop. Of 19 batches that had a risk review, 18 had two or more runs. First reviews cost about 139 USD; later reviews about 226 USD. Confirmations cost nearly as much as the first review (5.3 vs 6.7 USD per batch) although they read only the fix. 99 of 120 fix runs were Sonnet at medium.
- Batch size: review cost about 5.7 USD per 100 lines for batches of 100 to 400 lines, and 2.3 USD above 400 lines. The number of runs was the same in both groups (median 3). So bigger batches cost less per line, but the fix loop still decides the total.
- Switching the model in the middle of a session pays the whole context again. The docs put it at about 8 USD at 500k tokens. Compacting more often saved about 5 %.

## Open

- Whether `high` misses findings that `xhigh` catches. There were only 8 runs at `high`; an answer needs a seeded-bug exam, which is paid.
- CONFLICT: 2026-11-15 (this note, owner's decision): the confirmations of risk fixes run on Fable at `high`. 2026-11-18 (owner's design, confirmed "si", kept in `workflow-upgrade-2026-11`): Fable's fix rounds are confirmed by a new Opus, never by another Fable. Both are owner decisions and neither is marked as the correction; check the owner before changing agent files.
- CONFLICT: the owner's rule quoted in `risk-reviewer-model-test` (2026-11-14, not re-read): risk reviewer is Fable at xhigh, never a cheaper model. 2026-11-23 (batch B, main def665d): a cheaper risk reviewer per route, chosen by orchestrate. Which paths use it is config; not checked after the merge.

Related: [[phase-1-progress]], [[test-isolation-and-cleanup]].
