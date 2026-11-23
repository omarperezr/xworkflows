---
name: memory-hook
description: "The xworkflows memory job (hooks/core/memory.mjs): what runs at compaction and session end, in what order, its lock and time-out rules, the qmd model check in doctor, and memory.autoDirectory"
metadata:
  node_type: memory
  type: reference
  originSessionId: 6c0db597-361b-4d5c-b60b-338bb201c865
---

# Memory job (hooks/core/memory.mjs)

Reference for the memory job as the session of 2026-11-23 left it. Source: session 6c0db597-361b-4d5c-b60b-338bb201c865; the batches are group C (memory-c-1, merged to main as c9c3734) and P-237 (main e5fca91). Related: [[workflow-upgrade-2026-11]] (the memory hook in the design), [[qmd-local-index]] (what qmd does with the per-checkout index), [[xworkflows-handoff]] (the hand-off, which is a separate job), [[risk-reviewer-model-test]].

## What it runs

- Before 2026-11-23 the hook ran `qmd update` in the background at compaction and at session end (`hooks/core/memory.mjs:21`, `:104`). It searched notes by words only.
- Group C made one serial job with a lock: the project's own step `memory.before` (a list of arguments, for example `["node","scripts/export.mjs"]`, not a shell string), then `qmd update`, then `qmd embed`, then `qmd cleanup`, then a log line. A run that finds nothing new is fast: about 0.1 s with no change; 300 new notes took about 34 s with the real qmd; a run cut in half keeps its progress and the next run resumes.
- Embedding is also a plan decision for group C: run only when the memory text changed (`memory.mjs:18` compares it). The session did not show this check in code.

## Time-outs and locks

- Plan decision (2026-11-20): `memory.before` and `embed` are cut at 10 minutes. The session also mentions a 30-minute assumption for `memory.before` that the owner was asked about; check the code for the real value.
- A cut kills the whole step with its child processes. Killing only the parent left the work running as an orphan (found in the review of group C).
- The lock counts as stale only when the process that took it has died (owner decision, 2026-11-23). Each job deletes only its own lock.
- Known limit, in the code's comment: a reused process id can keep a stale lock alive. Two jobs that see the same stale lock at once can still race; the session says this was narrowed, not closed.
- On a shared index only `update` runs; `embed` and `cleanup` do not (owner decision, same day).
- `uninstall` removes `.qmd/` after an `embed` that died midway (review finding, fixed in group C).

## Models

- `qmd status` lists the models even when they are not downloaded, so it cannot tell whether they are present.
- `doctor` checks the qmd cache folder directly (`~/.cache/qmd/models`) and warns, telling the owner to run `qmd pull`. The hook never downloads the models itself (the models are about 2 GB).
- One rule for models: the embeddings model alone is enough (owner decision). The job and `doctor` must use the same rule; the review found them using different ones.
- `qmd --help` gives a default time-out of 30 minutes for some commands; the session gave it as a probable reason the original design left `embed` out of the hook (not confirmed in any document).

## Config and install

- `memory.autoDirectory` (P-237, main e5fca91): when it is `false`, `install` and `doctor` do not write or require `autoMemoryDirectory`, and a value set by hand survives `uninstall`. Use it for a project whose notes live outside the repository.
- A project's memory folder may be a symlink; uninstall must not follow it (review finding on the uninstall path, fixed in the session).
- Card P-237 also asked that the memory work start even when the notes folder does not exist yet; the session did not confirm this in code.

## Open or unverified

- `doctor` with `memory.autoDirectory: false` and a qmd collection that does not exist for `docs/memory`: the session did not confirm the warning text. Verify before relying on it.
- Whether the time-out for `memory.before` is 10 or 30 minutes: check the code.
