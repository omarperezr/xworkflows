---
name: xworkflows-handoff
description: "The xworkflows hand-off (skill handoff, hook handoff-load): when it loads, the main-sha and HEAD checks, the line the owner sees, and the lessons from building it (2026-11-23)"
metadata:
  node_type: memory
  type: reference
  modified: 2026-11-23T00:00:00.000Z
---

# The hand-off

A short git-ignored file under `.xworkflows/` that the next session reads instead of the old context. Merged 2026-11-23 (batches handoff-1 and handoff-notice).

## How it works

- The skill `handoff` writes it, capped at 1500 bytes, first line `main: <sha>`. `orchestrate` step 6 writes it at every batch merge. It is the last step of a session, after every commit: a later commit makes it stale.
- The hook `handoff-load` (`hooks/core/handoff-load.mjs`) loads it only while `main` and `HEAD` are both at that sha. It tests the sha before the size: a stale hand-off is silent at any size.
- It loads at SessionStart `startup` and `clear` (JSON) and on PreCompact (plain text, so it becomes the summary instructions).
- The owner sees one line: `Hand-off loaded: main <sha>.` (the hook's `systemMessage`). An over-cap file shows a "was not loaded" line.
- Off main, the skill says `Next: /compact` and that the hand-off will not load, never `Next: /clear`.
- `doctor` runs the hook itself and warns only when the hook's output starts with its "was not loaded" sentence; it keeps no copy of the hook's rules.
- `uninstall` deletes the hand-off file and says so.
- Manual check: `echo '{"hook_event_name":"SessionStart","source":"clear"}' | node .xworkflows/hooks/run.mjs claude handoff-load`.

## Lessons that still hold

- Hook output reaches only the model unless the hook sets `systemMessage`. Check what the owner sees on screen before promising it.
- Hooks written into `.claude/settings.json` during a session may not run in it; start a new `claude`.
- A test that cannot fail is no test: see a new test fail on the old code before trusting it.
- When a loader gains a condition, check the writer too.
- A report starting with `blocked:` can come from a closed tool stream while the edits are on disk: check the files and run the full suite.
- After a dropped connection, check the state (clean tree, commits, seals, cards) before redoing any step.
- Hand-editing `manifest.json` leaves hashes stale; run `pack`, then the full suite.
- A check that searches free text must not match the text it reads.
- Before `/clear`, make sure no background agent is still alive.
- Renamed pieces leave old settings entries and modules behind; install does not remove them (card P-218).

Related: [[workflow-upgrade-2026-11]], [[dream-memory]].
