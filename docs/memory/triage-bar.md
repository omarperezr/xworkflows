---
name: triage-bar
description: "The xworkflows triage bar (card P-239, batch triage-bar-1, 2026-11-23): the rows blocking, pending and drop that every review finding gets, the owner's test against old cards, and the open gaps (P-240 to P-244)"
metadata:
  node_type: memory
  type: project
  originSessionId: 2f9368e9-0b02-41af-b968-49b14383520d
  modified: 2026-11-23T00:00:00.000Z
---

# Triage bar (card P-239)

Built 2026-11-23 in batch `triage-bar-1` and merged into `main` (c47b796). The owner's problem: the pending list fills with junk, and the reviews over-build for cases that are impossible, practically impossible or inconsequential. Related: [[workflow-upgrade-2026-11]], [[safe-db-hook]], [[owner-judges-short-plain-lists]], [[merge-sealed-batches-without-asking]].

## The rule as built

- Each reviewer writes one row on every finding in its report:
  - `blocking`: a real error, on a path that really happens, that breaks the app or touches money, permissions or data. The batch does not merge until it is fixed.
  - `pending`: a real, reachable error worth fixing, but not in this batch. It becomes a card in `docs/PENDING.md`.
  - `drop`: impossible, practically impossible or inconsequential. That means a very unlikely scenario AND a minimal consequence (obvious, or easy to avoid). Nothing is written.
- Before this batch there were only two kinds, `blocking` and `pending`; everything else became a card. `drop` is new.
- End of each batch: the owner gets one numbered list of the `pending` and `drop` findings, each with its row already set. He answers "así" or moves items. With no non-blocking findings there is no question. The 2026-11-23 batch answered "así": five cards were written (P-240 to P-244); the sixth finding (the question does not fit a dialog) was not written.
- From the second review round on, only an error the batch itself introduced blocks (lines the branch added or changed). An old error found on the way is triaged as a card or as `drop`.
- Where it lives: the full bar, with seven real examples (2 blocking, 2 pending, 3 drop), once in `skills/pending/SKILL.md`. The same three row lines sit in the reviewers, in `orchestrate` and in `full-review`. `skills/triage-bar.test.mjs` checks that those lines are identical in every file.

## The owner's test (2026-11-23)

- The bar was applied blind to 86 cards: the 43 the owner discarded in two triages (36 in 3f9026c, 7 in 5bf3bfb) and the 43 most recently closed as fixed.
- No percentages. Each card that lands on the other side is shown in plain words: what the card said, the row it got, and why. The owner judges each one. Only the ones he marks wrong change the examples.
- Run: a cheap agent classified 83 cards (3 were used as examples and left out). 44 landed on the other side. The owner's verdict on that list was "todo bien"; no example changed.
- Seven cards in that sample were work the owner asked for, not review findings (P-198, P-204, P-217, P-220, P-222, P-224, P-227). The owner ruled that they do not count. Later tests draw only from cards that came out of a review.
- The owner kept the six discarded `blocking` cards discarded (the first group in the list: P-137, P-138, P-209, P-214, P-215, P-230). No card was reopened.

## Open gaps

- P-242: no rule says which row wins when a finding fits two of them (a data error that fixes itself fits both `blocking` and `drop`). Proposed fix in one line: "if it fits two rows, the higher one wins". Open.
- P-240 to P-244: the five cards from the review of this batch, in `docs/PENDING.md` (not re-checked by the dream run).
- Not written: the end-of-batch question does not fit a 2 to 4 option dialog. The owner prefers plain numbered text in chat.
- P-251 (2026-11-23, unscheduled): a `/pending triage` command to apply this bar to the cards already in `docs/PENDING.md`. Today no command does it; the one-time test above was never a cleanup. The owner chose the permanent command over a one-time run. It is a method change, so it needs `grill`, then a plan and a batch, before anything is built.

## Process lessons (what burned turns)

- Show a list the owner must judge as plain numbered text in chat, with a short reason on each line. He rejected an interactive picker on 2026-11-23.
- When a test disagrees with the owner, say each mismatch in short plain words and let him judge it. He does not want percentages.
- Batches copy only their own files into the installed copy (`.claude/`, `.xworkflows/`), so the copy lagged 15 files. Full refresh of 22 files in commit 24723d1; doctor 0 failures. No brake warns when the copy goes stale (open).
- Auto mode refused `git push origin main` twice on this batch, though the owner's standing push rule covers it. The owner ran the push himself with `!`. The pre-push brakes take about 5 to 10 minutes.
- Some agent reports came back with masked parts. The full suite was reported as 1752 passing with one result unreadable: rerun the suite before quoting the count.
- Per card P-184, each fix commit reruns the whole test file; a push with 14 fix commits took over 40 minutes. Not re-checked in `docs/PENDING.md`.
