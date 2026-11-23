---
name: qmd-local-index
description: "How xworkflows memory search uses qmd: the per-checkout local index that install writes, what qmd does with it, and what was tested with qmd 2.8.3"
metadata:
  node_type: memory
  type: reference
  modified: 2026-11-23T00:00:00.000Z
---

# qmd local index for the memory folder

Tested on 2026-11-15 with qmd 2.8.3:

- `qmd init` creates a local index folder (`.qmd/`, with `index.yml` and a database) inside the project. qmd finds it by walking up from the working directory; without it, qmd uses the global index.
- A relative collection path resolves against the working directory, so `qmd update` from a subfolder emptied the index. The path written must be absolute.
- qmd rewrites the yml on first use, so install writes one per checkout and git ignores `.qmd/`.
- qmd reads `index.yaml` before `index.yml`; install checks both names.
- A collection outside the project is skipped as untrusted until `qmd trust`.

What install does: creates `memory.dir` (default `docs/memory`) inside the repository; writes the yml with the absolute memory path only when no yml or yaml exists (an owner-written one is never edited); writes a marker so uninstall deletes only its own files; adds `.qmd/` to `.gitignore`; makes no qmd call. `doctor` compares the path qmd prints.

Lesson: the first design called the real qmd from install and its tests wrote about 110 config files on the owner's machine ([[test-isolation-and-cleanup]]).

Related: [[memory-hook]].
