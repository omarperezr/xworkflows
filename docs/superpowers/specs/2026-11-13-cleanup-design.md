# Clearing the pending list with the method itself (design)

Status: decided by the owner on 2026-11-13 (answers below). First batch: tier A.

## The request, deepened

Request: Check every card of the pending list against the code, discard what can no longer happen, bundle the rest into batches, and fix them with the method itself: the cheapest agent that can do each task, a failing test first, one review per batch. Done for a batch: each card it covers has a test that failed before its fix and passes after, the suite passes, `pack --check` prints nothing, and the review leaves no blocking finding.
Adds: "Possible" does not sort the list: 77 of the 78 cards are possible. Who meets a card, and how bad it is, sorts it.
Adds: Cards that change the same file run one after another; only areas run side by side.
Adds: `manifest.json` and this repository's own copy of the method are shared by every area: no agent touches them; the main session updates them once, after the tasks.
Adds: A review of a batch raises new findings; if each becomes a card, the list refills while it is cleared.
Adds: Cards that change `bin/xworkflows.mjs` wait until the batch `memory-index-1`, which changes that file, is merged.
Material: The check of 2026-11-13: one read-only agent per section of the list on the cheap tier, and a second check one tier up of every card judged "not possible", "unsure" or "code gone". 78 cards judged, none missed. Result: 77 can still happen, 1 cannot (P-10). tested (the run, 11 agents)
Material: P-10: `verifyCitation` returns before it reads when the cited path is a folder. `skills/adapt/research.mjs:24`, read by both tiers and by the main session. tested (read)
Material: Four of the 78 verdicts were compared with the cited lines by the main session and matched: P-10, P-13, P-4, P-31. The other 74 rest on the cheap tier's reading. tested (read)
Material: The rating "who meets it" and "worst result" is the cheap tier's first cut. Tier A, an ordinary project on an ordinary day: 15 cards. Tier B, an unusual setup with real harm: 28. Tier C, rare wrong output, cosmetic or a weak test only: 34. not confirmed
Material: Areas, by the files a fix would change: `skills/adapt` 20, `bin` 13, `checks` 12, `proof` 9, hooks (memory, orchestrator, runner) 6, hooks (adapt gates and recorder) 5, `skills/next-step` 2, docs 1; 9 cards cross two areas. tested (the run)
Methods: One batch per tier, one task per area, each task one agent that takes its cards in turn in files no other task owns. Fits: one branch, one review, no two writers in one file.

## What a task does with a card

1. It reads the card and the code, writes a test that fails because of what the card describes, then the smallest fix.
2. When the card cannot be shown with a test, or its remedy needs a decision the card does not settle, the task changes nothing for it and says so: the card stays on the list, and a decision goes to the owner.
3. It never changes `manifest.json`, anything under `.xworkflows/` or `.claude/`, or a file of another task.

## Owner's answers

2026-11-13:

1. "if they are [possible] keep them if they arent discard them": P-10 is discarded; the other 77 stay.
2. "Tier A now, then decide": the first batch covers tier A; tiers B and C are decided after it, from what it cost and from what its review raised.
3. "Fix blocking, drop the rest": during this clean-up a review finding that blocks is fixed in the batch; the others are listed once under `Declined findings` in the plan and do not become cards.
4. Cheap tiers first ("an agent just good enough for that task"): docs and skill texts start on the cheap tier, code under the risk paths on the medium tier; a task that fails is run once more one tier up.

## Questions for the owner

None open.
