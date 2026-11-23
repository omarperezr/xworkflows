---
name: triage-bar
description: "The xworkflows triage bar (card P-239, merged 2026-11-23): the rows blocking, pending and drop that every review finding gets, the owner's test, and the open gaps"
metadata:
  node_type: memory
  type: project
  modified: 2026-11-23T00:00:00.000Z
---

# Triage bar (card P-239)

Merged 2026-11-23. The owner's problem: the pending list filled with junk, and reviews over-built for impossible or inconsequential cases.

- Every finding gets one row:
  - `blocking`: a real error on a path that really happens, that breaks the app or touches money, permissions or data. The batch does not merge until it is fixed.
  - `pending`: real and reachable, worth fixing, not in this batch. It becomes a card in `docs/PENDING.md`.
  - `drop`: impossible, practically impossible or inconsequential (very unlikely AND minimal consequence). Nothing is written.
- From the second review round on, only an error the batch itself introduced blocks. An old error found on the way becomes a card or a `drop`; an old money or data fault goes to the owner at once.
- End of each batch: the owner gets one numbered plain-text list of the `pending` and `drop` findings, each with its row set. He answers "así" or moves items. No list when there are no non-blocking findings.
- The full bar with seven examples lives in `skills/pending/SKILL.md`; the same three row lines sit in the reviewers, `orchestrate` and `full-review`, and `skills/triage-bar.test.mjs` checks they are identical.

## The owner's test (2026-11-23)

- Applied blind to 83 old cards; 44 landed on the other side. Each was shown in plain words (what it said, the row, why), no percentages. The owner's verdict: "todo bien".
- Work the owner asked for is not a review finding and does not count as a sample.

## Open

- P-242: no rule says which row wins when a finding fits two. Proposed: the higher row wins.
- P-240 to P-244: the cards from this batch's review.
- P-251: a `/pending triage` command to apply the bar to the existing cards. It needs `grill` first.

Related: [[workflow-upgrade-2026-11]], [[safe-db-hook]].
