---
name: memory-hook
description: "The xworkflows memory job (hooks/core/memory.mjs): what runs at compaction and session end, its lock and time-out rules, the qmd model check in doctor, and memory.autoDirectory"
metadata:
  node_type: memory
  type: reference
  modified: 2026-11-23T00:00:00.000Z
---

# Memory job (`hooks/core/memory.mjs`)

State 2026-11-23.

- At compaction and session end one serial job runs, with a lock: the project's own step `memory.before` (a list of arguments, not a shell string), then `qmd update`, `qmd embed`, `qmd cleanup`, then a log line. With nothing new it takes about 0.1 s.
- `memory.before` and `embed` are cut at a time limit (10 minutes in the plan; check the code). A cut kills the whole step with its child processes, not only the parent.
- The lock counts as stale only when the process that took it has died; each job deletes only its own lock. A reused process id can still keep a stale lock alive (known limit).
- On a shared index only `update` runs.
- `doctor` checks the qmd model cache folder directly and tells the owner to run `qmd pull`; the hook never downloads the models (about 2 GB). The embeddings model alone is enough; the job and `doctor` use the same rule.
- `memory.autoDirectory: false`: install and doctor do not write or require `autoMemoryDirectory`, for a project whose notes live outside the repository.
- A memory folder may be a symlink; uninstall does not follow it.

Related: [[qmd-local-index]], [[dream-memory]].
