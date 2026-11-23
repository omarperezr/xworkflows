---
name: risk-reviewer-model-test
description: "Card P-222 (closed 2026-11-23): Fable xhigh against Opus xhigh as the xworkflows risk reviewer. Result, cost, limits, and why Fable was kept"
metadata:
  node_type: memory
  type: project
  originSessionId: 6c0db597-361b-4d5c-b60b-338bb201c865
---

# Risk reviewer model test (card P-222)

Closed 2026-11-23 in xworkflows (closing commit 15f546d). Source: session 6c0db597-361b-4d5c-b60b-338bb201c865. Related: [[model-and-effort-policy]] (which model each role runs on), [[workflow-upgrade-2026-11]] (the risk-review role), [[measure-tool]] (the tool that read the sessions), [[safe-db-hook]] (two of the findings), [[no-api-spend]] (the spend caps).

## Question

Can a cheaper model (Opus xhigh) replace Fable xhigh as `risk-review` without losing blocking findings? The owner's rule, as the session quotes it (2026-11-14, not re-read here): risk reviewer is Fable at xhigh, once per batch, never a cheaper model.

## Step 1 (free): the saved sessions

- 47 `risk-review` runs cost 226 USD with Fable xhigh. 20 of them were the first review of a batch (127 USD, about 3 to 9 USD each, barely rising with batch size). The rest were confirmations by an older process.
- `verify-finding` (the agent that tries to prove each blocking finding with a red test) ran 20 times; all 20 were red, none was false.
- Small batches had real faults too: a 9-line batch had 1 proven blocker, a 37-line batch had 5. Lowering the review effort by batch size would have missed real faults.
- Data: `docs/measure/private/p222-step1.json` (git-ignored).

## Step 2 (paid, capped): 18 runs on past batches

- 9 batches: 7 with proven faults (15 faults in the plan; the grader later counted 20 because the `measure` batch alone had 6) and 2 clean batches. Each model ran once per batch. Fable was the control, not a second variant.
- Total paid: 87.76 USD. Comparable 8 batches: Fable 46.13 USD and 2 h 01; Opus 20.25 USD (44 percent) and 1 h 21.
- Blind grade (the grader did not know which report was which model), of the 20 proven findings:

| | Fable xhigh | Opus xhigh |
|---|---|---|
| Marked blocking | 16 | 12 |
| Marked pending only | 2 | 3 |
| Not seen | 2 | 5 |
| False alarms on the 2 clean batches | 0 | 0 (Opus ran on one of the two) |

- Four findings only Fable blocked: nested agents in `measure`; uninstall with the memory folder as a symlink; uninstall-record; `safe-db -f` resolved from the root instead of the working folder.
- Two findings neither model saw: a broken test, and an `EACCES` during install.
- The `clean-cc3` Opus run was killed by the harness at 45 minutes after it searched system processes with `ps`; its report was lost, and the spend ledger charged it the full 12 USD per-run cap, so its real cost is unknown.

## Decision and state

- The session kept Fable xhigh for `risk-review`: Opus did not tie.
- Later, batch B (main def665d) added a cheaper risk reviewer per route: install writes two risk agents that differ only in model, and orchestrate chooses by the most expensive route in the batch. Which paths use the cheap one is config; the session did not check that after the merge. This test ran before B.

## Limits (say them with any number)

- One run per model per batch: the variance between runs is unknown.
- The reference findings came from Fable's earlier reviews, so the test favours Fable.
- The grader was an agent working from the reports; the owner's marks were not used.
- The ledger charges a cut run its whole cap, not its real cost.

## Open

- Generic investigation rules for the risk reviewer were proposed in the session and not built: ask relative to which folder a path resolves; test a path with a different working folder, a link, a missing file and no read permission; for every saved file a decision depends on, ask what if it is old or edited; walk every level of what is read (subfolders, nested items, includes); a fault that can delete or change user data or configuration is blocking even when rare; reproduce each suspicion in a scratch folder before classifying it, with a time limit, and do not inspect system processes. Untested. The session did not record a decision on them.

## Process lessons

- Count the cost of a cut run at its real spend, or mark it unknown in the ledger, not at the cap. The session's ledger charged the cap, so the spend total overstated that run.
