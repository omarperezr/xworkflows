---
name: dream-memory
description: "/dream in xworkflows as of 2026-11-23: one memory folder docs/memory, /dream works from zero notes, the first run that failed at close after about 927,000 tokens, the dream-memory-1 batch fixes (earlier folder, forget, copy check by content), and what is still open"
metadata:
  node_type: memory
  type: project
  modified: 2026-11-23T00:00:00.000Z
---

# /dream and the memory folder (xworkflows, state 2026-11-23)

Batch `dream-memory-1` merged to `main` at `80cc7a9` and pushed (`d78359f..80cc7a9`) on 2026-11-23, after the owner's word. Spec: `docs/superpowers/specs/2026-11-23-dream-memory.md`. Related: [[xworkflows-handoff]] (the hand-off is written last, then `/clear`), [[triage-bar]] (the review rows that the proposed rules come from), [[merge-sealed-batches-without-asking]].

## Design as built (2026-11-23)

- One memory folder: `docs/memory/` in the repo. `install` creates an empty `docs/memory/MEMORY.md` when the project has none, so the folder is tracked from day one. `uninstall` deletes `MEMORY.md` only while it is still empty.
- `/dream` works from zero notes. Before the batch, `extract.mjs` refused with `"reason":"no memory notes"` (line 151), so a new project could never start it.
- Earlier folder: `install` records the old auto-memory folder in `.xworkflows/local.json` (git-ignored). It is recorded there, not in `installed.json`, because it is an absolute path and `installed.json` is public. If `memory.autoDirectory` is `false`, the default folder is live memory and is skipped (owner's decision A a). If `autoDirectory` already pointed elsewhere, `install` keeps it and records it. A `~/` path is expanded.
- Brought-in notes: only the organizer decides their fate (owner's decision B a). The 23 analyzers do not. Otherwise one analyzer could delete a note the others kept.
- Deleting originals: `forget` deletes an outside original only after the owner's yes, by literal path. It deletes only when main holds an identical copy. Identity is a sha256 match, stored in `dream.json`. A copy with the same name but other content counts as no copy. `forget --keep` takes only numbers from the list; anything else is rejected and deletes nothing.
- `close --remove`: a bad entry (a full path, or a bare name that matches no note) is skipped and named. Before the fix, one such entry made all of `close` fail, after the run had been paid for.
- Notes of type `user` or `feedback` are never committed. `close` drops them.

## First run (2026-11-23, before the batch)

- 23 sessions, about 927,000 tokens. No analyzer wrote a note: 13 returned nothing and 10 returned only proposed rules. The run produced 84 proposed rules, most from a single session.
- It failed at `close`: `git add -A -- docs/memory` said `pathspec 'docs/memory' did not match`, because `docs/memory` was not on `main`. Nothing was merged. The run's branch and empty worktree were removed by hand.
- Fix that was done first: the 3 existing notes were committed to `main` (`6b82425`), with the names, counts and script names of another project generalised. Then a `stale-memory` brake refused the push because one note named a file that exists only outside this repo. It was reworded and the push passed all 14 brakes.
- The check that `docs/memory` exists on `main` before spending tokens was written as a card. This note does not verify that the batch added it.
- The secret mask in the extract was checked only on a few forms (a private key, `sk-` keys, a URL). Other forms are not proven. Read the diff before adopting.
- The "2 to 3 minutes" run time was an estimate. It was never measured, because the first run failed.

## Review and fixes in batch `dream-memory-1`

- Opus risk review (xhigh) at `82789d9`: 3 blocking findings, each confirmed with a failing test before its fix. (1) `uninstall` threw a `TypeError` on an invalid `memory.dir`. (2) `forget` deleted originals that main had no copy of. (3) One `remove` entry with a full path made `close` fail.
- Round 1 (`8af00d2`) fixed all three. Opus round 2 then found the same copy check in another form: it compared file names only. Round 2 (`6c84bd5`) changed it to a content comparison. The fix addresses the class of error, not one case.
- Final state: full suite 1792 pass, 0 fail, at `6c84bd5`. Sealed as `risk-review ok at 82789d9` and `review ok at 6c84bd5`. A fresh Opus confirmation of the round-2 fixes said ship.
- Lesson: when a check is patched by guessing (a name, a pattern), the same error returns in a new form. Compare the content, or the exact identity, instead.

## Open (as of 2026-11-23)

- Non-blocking, pending: `skills/dream/SKILL.md:15` says an original with no identical copy was "left out or removed" by main. That is false when the run edited the note, so the owner would keep an original that main already holds, updated. One clause fixes it.
- Card P-251 (unscheduled): `/pending triage`, a command that applies the review bar to cards that already exist. Today no command does it. It needs `grill` first.
- `/dream` had not yet been run end to end on the merged code when this note was written. Expect a first run on the new code to show new problems.
- Dropped findings (not written, only in the report): a name ending in `-old.md` is marked "no copy" (a warning only); the `uninstall` message says "left in place" and then "deleted"; a note named literally `*.md` would be read as a pattern by `git rm`.

## Earlier facts from the 2026-11-15 session (still true unless noted)

- The first `/dream` attempt that session stopped at its first step with `"no memory notes"` and spent nothing. The 2026-11-23 change above replaced that stop: `/dream` now works from zero notes.
- Suggestion line: the memory hook (`hooks/core/memory.mjs`) prints one line at session start when 10 or more sessions have passed since the last `/dream`, or 7 days with at least one new session. The 7-day rule does not apply if `/dream` never ran. The line also shows after `/clear` (a new session), not after compaction or resume. The thresholds `dream.suggestAfterSessions` (10) and `dream.suggestAfterDays` (7) are read from `.xworkflows/config.json`; defaults in `hooks/core/config.mjs`.
- Mask limits declared on 2026-11-15 and not patched again (the owner decided the mask gets no more review rounds): a value after a credential word in Spanish (for example "contraseña" or "clave") is not masked, because the mask knows English words only; short keys with a known prefix; URL passwords that contain `/` or `@`; PGP blocks in some layouts. Cards P-137 and P-138 hold the edge cases.
- The memory folder must be inside the repository. The hooks refuse an outside folder even when the owner lists it in `memory.outside` (owner's decision, 2026-11-15).
- Owner's rule (2026-11-15): do not write memory notes only so that `/dream` can run.
- Model and effort for the `/dream` agents: [[model-and-effort-policy]] (`low` effort for the `/dream` agents, set on 2026-11-15).

## Process lessons

- Check the folder on `main` before a paid run. A run that fails at `close` has already spent the tokens.
- Before a push, run the privacy check on the notes too. The `stale-memory` brake and the `privacy` check both read the notes.
- An agent that cannot write outside its worktree cannot reproduce a finding that writes outside it. Plan a verify agent inside the worktree from the start.
- A review round can repeat a finding in the same place. Expect it when the fix patches a guess.
