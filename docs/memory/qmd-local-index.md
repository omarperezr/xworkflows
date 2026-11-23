---
name: qmd-local-index
description: "How xworkflows memory search uses qmd: the per-checkout .qmd/index.yml that install writes, what qmd does with it, and what was tested with qmd 2.8.3"
metadata:
  node_type: memory
  type: reference
  originSessionId: ae390796-e18d-4363-a406-510d18d6a48a
  modified: 2026-11-23
---

# qmd local index for the memory folder

Facts tested on 2026-11-15 with qmd 2.8.3, in a scratch folder with the home redirected:

- `qmd init` creates `.qmd/index.yml` and `.qmd/index.sqlite` inside the project. Running it again is safe.
- qmd finds a local index by walking up from the real working directory. With no `.qmd` folder it uses the global index `~/.cache/qmd/index.sqlite`. `--index <name>` selects `~/.cache/qmd/<name>.sqlite` and skips the local one.
- A relative collection path in `.qmd/index.yml` (for example `docs/memory`) resolves against the working directory. `qmd update` run from a subfolder emptied the index. So the path written must be absolute.
- qmd rewrites the yml on first use (it adds a `models:` block). A tracked yml would show as modified, so install writes one per checkout and git ignores `.qmd/`.
- `qmd collection add` stores an absolute path and writes a trust record in the user's home. The install design does not use it.
- A collection whose real location is outside the project is skipped as untrusted, exit 0, until `qmd trust`.
- A second `collection add` with a name that exists exits 1: "Collection 'memory' already exists."
- qmd reads `.qmd/index.yaml` before `.qmd/index.yml` (qmd source `dist/collections.js:82-87`). Install must check both names. The first design missed this; review found it.
- Not tested: `qmd query` against a local index, which is the session-start hook's command. Qmd versions before the local index: the docs say 2.6.3, not confirmed.

What install does, as merged to `main` before 2026-11-15:

- Creates `memory.dir` when missing (default `docs/memory`), only inside the repository.
- Writes `.qmd/index.yml` with the absolute memory path, written as a JSON string so any folder name is valid YAML. Only when neither `.qmd/index.yaml` nor `.qmd/index.yml` exists. An owner-written yml is never edited.
- Writes a marker file `.qmd/xworkflows`. Uninstall deletes the yml and the database only when the marker holds the marker's text.
- Adds `.qmd/` to `.gitignore`. Makes no qmd call.
- `doctor` runs `qmd collection list` and `show` in the repository root and compares the printed path.

Process lesson (what burned turns): the first design called qmd from install, and used the global index. The tests ran the real qmd on the owner's machine and wrote about 110 config files there ([[test-isolation-and-cleanup]]). Each review round found edge cases in that design. The design without a qmd call at install removed most of them. Before writing a spec for a tool that stores state outside the repository, test where it stores it, with the home redirected.

Related: [[phase-1-progress]], [[test-isolation-and-cleanup]].
