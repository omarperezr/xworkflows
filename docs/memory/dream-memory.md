---
name: dream-memory
description: "/dream in xworkflows as of 2026-11-23: one memory folder docs/memory, works from zero notes, brings and forgets old-folder notes, what the first runs taught, and what is open"
metadata:
  node_type: memory
  type: project
  modified: 2026-11-23T00:00:00.000Z
---

# /dream and the memory folder (state 2026-11-23)

## Design as built (batch dream-memory-1)

- One memory folder: `docs/memory/` in the repository, tracked from day one (install writes an empty `MEMORY.md`; uninstall deletes it only while it is still empty). The hooks refuse a memory folder outside the repository.
- `/dream` works from zero notes. It brings the old auto-memory folder's notes onto its branch; only the organizer decides their fate.
- `forget` deletes an outside original only after the owner's yes, by literal path, and only when main holds an identical copy (sha256 match in `dream.json`).
- `close --remove` skips and names a bad entry instead of failing the whole run.
- Notes of type `user` or `feedback` never enter the branch; owner preferences go to the owner's own preferences file, written only on his yes.
- The memory hook prints one suggestion line at session start after 10 sessions, or 7 days with a new session, since the last `/dream`.

## First real run (2026-11-23)

- 24 sessions, about 422,000 tokens, haiku analyzers, one organizer. 15 notes. The owner judged them too long and full of old history; they were cut to current state, decisions and lessons before adoption.

## Lessons

- Check that the memory folder exists on `main` before a paid run: a run that fails at `close` has already spent its tokens.
- A check patched by guessing (a name, a pattern) fails again in a new form; compare content or exact identity.
- The `stale-memory` brake blocks a push when a note names a path that is not in the repository, including git-ignored files. Describe such files in words.
- The secret mask is proven only on a few forms; read the diff before adopting. A value after a Spanish credential word ("contraseña", "clave") is not masked.
- Do not write memory notes only so that `/dream` can run (owner, 2026-11-15).

## Open

- `skills/dream/SKILL.md` says an original with no identical copy was "left out or removed" by main; false when the run edited the note. One clause fixes it.

Related: [[memory-hook]], [[xworkflows-handoff]], [[triage-bar]].
