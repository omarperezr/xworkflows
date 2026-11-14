# The method suggests a `dream` run

Goal: G1

Spec: docs/superpowers/specs/2026-11-14-dream-suggest.md

## Global Constraints

- "7 días o 10 sesiones, lo que pase primero"
- "Una línea al empezar la sesión"
- "En cada sesión nueva, hasta que corras /dream"
- "Sí, cuando haya 10 sesiones"
- "Solo si hay sesión nueva" (2026-11-14, after the review): by days the line is due only when at least one session is newer than the last run.
- "No mostrar la línea ahí" (2026-11-14, after the review): no line where the memory folder is a link, because `dream` refuses to run there.
- Nothing starts a run: the line only tells the agent to suggest `/dream` to the owner.
- Hook logic is a pure `decide(ev, ctx)`: every file name, list and time comes through `ctx`, and broken input lets the session start with the lines it had.
- The hook reads no session and starts no process: one list of the sessions folder and the times of its files.
- No test reads the real sessions of the machine: tests give the hook a made-up list and made-up times.
- Node standard library only; every value comes from the defaults module.

## Tasks

### Batch 1: `dream-suggest-1`

About 70 code lines.

**T1: `close` writes the time of the run into the state file, and the extract accepts it** (spec section 3)
- Files: `skills/dream/branch.mjs`, `skills/dream/branch.test.mjs`, `skills/dream/extract.mjs`, `skills/dream/extract.test.mjs`
- Role: implement
- The field is `ran`, beside `sessions`: the time `close` ran, as an ISO string in UTC. The extract takes a state with or without `ran` and refuses every other shape as today.
- Done: `node --test skills/dream/branch.test.mjs skills/dream/extract.test.mjs skills/dream/flow.test.mjs` passes.

**T2: the memory hook gives the line at the start of a new session when a run is due** (spec sections 2 and 3)
- Files: `hooks/core/memory.mjs`, `hooks/core/memory.test.mjs`, `hooks/core/config.mjs`, `hooks/core/config.test.mjs`
- Role: implement
- The defaults: `dream.suggest` true, `dream.suggestAfterDays` 7, `dream.suggestAfterSessions` 10.
- The last adopted run is `ran` of `dream.json` in the memory folder of the working folder (the one rule `memoryFolder`). No file, no `ran` or a file that is not JSON: `dream` never ran here.
- The sessions folder is the folder of the running session's file (`ev.transcript`). The count is its `.jsonl` files whose time is later than `ran`, the running one left out; with no `ran`, all of them. An event with no session file gives no line, so a tool other than Claude Code gets none.
- Due: at least `suggestAfterDays` whole days since `ran`, or at least `suggestAfterSessions` sessions counted. Where `dream` never ran: only the count of sessions.
- The line goes only at a start that is a new session (the event's source `startup` or `clear`), never after a compact or a resume, never in a sub-agent's session, and never in a project with no memory note. It is fixed English, 160 bytes at most, gives the number of sessions and of days, and comes after the lines the hook already gives, inside the same cap of bytes.
- Done: `node --test hooks/core/memory.test.mjs hooks/core/config.test.mjs hooks/run.test.mjs` passes.

**T3: the design says when the method suggests a run**
- Files: `docs/design.md`
- Role: implement
- The table of keys gets the three settings; section 7.9 says the rule in the spec's words: when, where, how often, and when not. No other sentence of the file changes.
- Done: `node --test skills/dream/workflow.test.mjs skills/day-one.test.mjs` passes, and `git grep -c suggestAfterSessions docs/design.md` prints 1 or more.

### Batch 1, fix round after the risk review of `7661504`

No blocking finding. Two choices were the owner's and four findings do not block. What the review found sound: about 150 made-up starts gave the line exactly where the plan says; where the line is not due the hook's text is the main branch's byte for byte; the hook wrote nothing, read no session and added 75 ms with 20000 files in the sessions folder.

The owner, 2026-11-14:
- By days alone the line was due with no new session, and the run it asks for finds nothing to read and cannot end it: "Solo si hay sesión nueva".
- The line was given where the memory folder is a link, and `dream` refuses to run there: "No mostrar la línea ahí".

What did not block:
- A session file path that is not text makes the hook throw, and the lines it gave before are lost. This plan's constraint says broken input keeps them, so task F1 fixes it.
- Three cards: P-150 (a setting of the wrong kind), P-151 (the cap counts only the memory hook's own lines, and doctor's probe does not measure the new line), P-152 (a run in which no note changed leaves a branch that holds only the time).

**F1: by days the line needs a new session, a linked memory folder gets none, and a broken session path loses no line**
- Files: `hooks/core/memory.mjs`, `hooks/core/memory.test.mjs`, `hooks/core/ctx.mjs`, `hooks/core/ctx.test.mjs`, `docs/design.md`
- Role: implement
- Done: `node --test hooks/core/memory.test.mjs hooks/core/ctx.test.mjs hooks/run.test.mjs skills/dream/workflow.test.mjs` passes.

## Review Focus

- The hook runs at the start of every session of every project: it must not throw, must not read a session's text, and must stay fast with thousands of files in the sessions folder.
- The text at the start of a session has a cap of bytes: the new line must not push out a line that was there before it.
- A state file written or broken by hand must not break the hook, the extract or `close`.
- The line is a suggestion: no path may start a run or write a file.

## Declined findings

## Seals
