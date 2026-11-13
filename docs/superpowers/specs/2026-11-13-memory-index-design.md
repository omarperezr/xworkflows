# Install creates the memory folder and a project-local qmd index (design)

Status: decided by the owner on 2026-11-13 (answers below), card P-111. It replaces a first design, built on the branch `install-memory-1` and dropped before any merge (last section).

## The request, deepened

Request: `install` creates `memory.dir` when missing and makes qmd index it for this checkout, with no manual step, no qmd call and nothing written in the user's home, so `doctor` in a fresh repo prints `ok qmd collection covers <memory.dir>`. Done: tests for a first install, a second install, `--dry-run`, an existing `.qmd/index.yml` and a linked memory folder pass; `pack --check` prints nothing; then one real `install` and `doctor` in this repository, on the owner's word.
Adds: qmd resolves a relative path against the working directory, so the path written must be absolute: the file is per checkout and not tracked.
Adds: qmd rewrites `.qmd/index.yml` on use (it adds a `models:` block), so the file cannot be a hashed piece.
Adds: An existing `.qmd/index.yml` is the owner's: with the standard library only there is no YAML parser, so install must not edit it.
Adds: A copied checkout keeps the original's path, and qmd skips it as untrusted.
Adds: qmd before the local index ignores `.qmd`; the version that added it is not confirmed.
Material: `mergeIgnore` adds `.gitignore` lines and uninstall removes them by exact line. `main:bin/xworkflows.mjs:228-240`, `:773-779`, read not tested; its test is at `main:bin/xworkflows.test.mjs:712`
Material: A generated per-machine file already exists, `.claude/settings.local.json`, recorded in `created` and ignored by `pack --check`. `main:bin/xworkflows.mjs:209-225`, read not tested
Material: `doctor` runs `qmd collection list` and `show` in the repo root and compares the `Path:` text with the absolute memory folder. `main:bin/xworkflows.mjs:593-610`, read not tested
Material: The hooks start qmd in the project root and pass `--index` only when `memory.index` is set. `hooks/core/memory.mjs:19`, `:65`, `hooks/core/ctx.mjs:17`, read not tested
Material: The two memory checks require `memory.dir` to be a folder inside the repo. `checks/index-current.mjs:7-9`, `checks/stale-memory.mjs:7-9`, read not tested
Material: `install-memory-1`, 14 commits and not merged, holds the dropped design and card P-98.
Methods: A: install writes `.qmd/index.yml` itself (four lines, absolute path) when none exists, and adds `.qmd/` to `.gitignore`. Fits: no qmd at install, `doctor` and the hooks unchanged.
Methods: B: install runs `qmd init` and `qmd collection add`. Fits: qmd writes its own format. Costs: qmd needed at install, a trust record in the home, `init` follows `PWD`.
Proof: An absolute in-project path in a hand-written yml: indexed and found from any folder; `collection show` prints it byte for byte. qmd 2.8.3 under a redirected home, tested
Proof: A relative path: `update` from a subfolder emptied the index. tested
Proof: A path whose real location is outside the project is skipped as untrusted, exit 0; a path through a linked parent counts as inside. `dist/trust.js:68-90`, tested
Proof: `--index <name>` bypasses `.qmd`; with no `.qmd` up the tree qmd uses the global index. tested
Proof: `query`, the hook's session-start command, follows the same rule and returns keyword results when nothing was embedded. `dist/cli/qmd.js:2682-2690`, read not tested

## What install does

Install makes no qmd call. The two steps below do not depend on each other, and both go through the checks and the record that the other writes of `install` use (`plain`, `clean`, `plan`, `apply`), so `--dry-run`, a second install and `uninstall` follow from the same machinery.

`memory.dir` is read as the memory checks read it (`checks/index-current.mjs:6-8`): trimmed, normalised, without a leading `./` or trailing slashes, so `./docs/memory` and `docs/memory/` name the same folder as `docs/memory`. When it is then not a folder name inside the repository (an absolute path, or one that climbs out with `..`), install does neither step and prints `not written: memory.dir must be a folder inside the repository: <memory.dir>`.

1. **Folder.** When `memory.dir` does not exist, install creates it. It never creates it through a symlink: it then prints `not written (symlink): <memory.dir>`. The record notes that install created the folder.
2. **Index.** When the project has no local qmd config, neither `.qmd/index.yaml` nor `.qmd/index.yml` (qmd reads them in that order, `dist/collections.js:82-87`), and the config holds no `memory.index`, install writes `.qmd/index.yml`:

   ```
   collections:
     memory:
       path: "<absolute memory folder>"
       pattern: "**/*.md"
   ```

   The path is the repo root joined with `memory.dir`, the same value `doctor` compares, written as a JSON string so that any folder name is valid YAML. Install then adds the line `.qmd/` to `.gitignore`, in a run that plans to write the yml; the line stays when that write then fails. Never through a symlink.

Beside the yml, install writes the marker `.qmd/xworkflows`, one line of text. The marker, not the record, says that the install of this checkout created the yml: the record is a tracked file shared by every checkout, and the yml belongs to one. The yml and the marker are not in the record. The marker passes the same test as the yml: it is never written through a symlink and never over something that is already there.

An existing `.qmd/index.yaml` or `.qmd/index.yml` is left byte-identical, whoever wrote it. A config that holds `memory.index` gets the folder and no `.qmd`: that project keeps its named index.

When the folder cannot be created, or the yml or the marker cannot be written, install prints `not written: <path>`, records nothing for it and goes on: the rest of the install, its record included, is completed.

`--dry-run` writes nothing and prints `would create <memory.dir>`, `would write .qmd/index.yml`, `would write .qmd/xworkflows` and the existing `would merge .gitignore`.

## What else changes

- `doctor`: its check stays. With no `memory.index`, a failure reads `no qmd collection covers <memory.dir>: run install again` when `.qmd/index.yml` does not exist, and `no qmd collection covers <memory.dir>: .qmd/index.yml names no collection with the path <absolute folder>; add one, or delete .qmd and run install again` when it does. With `memory.index` set the line stays as it is today.
- `doctor`: when the real location of the memory folder is outside the repository, it prints `warn the memory folder is outside the repository: qmd indexes it only after "qmd trust" is run here`. A path it cannot resolve prints nothing more and never stops `doctor`.
- `uninstall`: only where the marker `.qmd/xworkflows` exists and holds the text install writes in it, it removes `.qmd/index.yml`, `index.sqlite`, `index.sqlite-wal` and `index.sqlite-shm` beside it, and the marker; then `.qmd/` when it is empty. It removes the `.gitignore` line. Without the marker it touches nothing in `.qmd/`, whatever the record says.
- `doctor`: where its text names the local config, it names the file that exists, `.qmd/index.yaml` or `.qmd/index.yml`.
- `uninstall` and the memory folder: when the record says install created it and it holds nothing, the folder is removed, so a fresh project comes back as it was. As for every file `uninstall` removes, the parent folders that are then empty go too, whether or not install made them: that is the loop `uninstall` already has, accepted for this change by the owner, and card P-112 holds the general fix. When install created it and it holds anything, it stays and `uninstall` prints `left in place: <memory.dir>`. A folder install did not create is never touched and never named.
- `README.md`, Setup, and `docs/design.md`: what install does with the memory folder; each checkout runs `install` for its own index.
- This repository runs the real `install` and `doctor` once, on the owner's word, after the review.

## Known limits

- `memory.dir` changed after the install, or a checkout folder copied with its `.qmd`: the yml names the old path, `doctor` explains, and the fix is to delete `.qmd` and run install again. `uninstall` then leaves the folder install made under the old name and prints `kept (not ours): <old folder>`.
- A project that registered its memory folder by hand in the global index and holds no `memory.index`: after its next install the local index is the one qmd uses there, and the old global collection stays until the owner removes it.
- A memory folder linked to a location outside the repository is indexed only after the owner runs `qmd trust`: qmd's own rule.
- Recall at session start is by keyword only unless `qmd embed` is run, as today.
- Collections the owner adds later to a yml that install created are removed with it by `uninstall`.
- A `.qmd/index.yaml` the owner adds after the install is the config qmd then reads, and `index.sqlite` serves it; `uninstall` still removes that database with the yml of the marker. qmd builds it again.
- A folder above the repository that has its own `.qmd` config: inside the repository qmd uses the yml install wrote, not that one, until `uninstall` takes it back.
- The local index needs a qmd that reads `.qmd`; its changelog documents it from 2.6.3 (read not tested). An older qmd falls back to the global index and `doctor` fails the line.
- Not tested: a path written as a JSON string printed back by `collection show` (the probe wrote it unquoted), and `qmd query` against a local index. The real `install` and `doctor` in this repository show the first.

## Questions for the owner

None open.

## Owner's answers

2026-11-13:

1. "Install writes it": install writes `.qmd/index.yml` itself, only when none exists, and `.qmd/` goes in `.gitignore`.
2. "Leave it, doctor explains": install never edits an existing yml.
3. "Remove both, keep notes": `uninstall` removes the yml and `index.sqlite` when install created the yml.
4. "Fresh branch from main": the new work takes over only the folder creation with its guard and tests, and card P-98; the proof-harness change is left behind.
5. "Yes, build it up to the review": the points above and the first three limits, as shown; the main session stops before the real install in this repository, before the merge and before the push.
6. "Remove if empty, else say so": what `uninstall` does with a memory folder install created.
7. "Remove them too": the two side files of `index.sqlite` go with it.
8. "Accept it and card the gap": `uninstall` removes parent folders that are empty after it, also ones that existed before the install, as it already does for every installed file; card P-112.
9. "Yes, one fix round": after the risk review of `2fe5e16`, for its two blocking findings: the config name `.qmd/index.yaml`, and a memory folder that cannot be created.
10. "Marker file per checkout": what tells `uninstall` that this checkout's install created the yml.
11. "Drop them": the seven small findings of that review, listed in the plan under `Declined findings`.
12. "Fix it plus the three one-liners": a second fix round after the confirmation at `424286e`: the marker passes the symlink test; a test holds the guard of the delete; no deletion of an empty yml on the word of the record; no raw error at uninstall when `.qmd` is a plain file.
13. "Accept, write it as a known limit": a `.qmd/index.yaml` added after the install, and a `.qmd` config in a folder above the repository.
14. "Fix it, one narrow check after": a third round, on the owner's word, after the confirmation at `11aca5b`: `uninstall` takes a file named `.qmd/xworkflows` as the marker only when it holds the marker's text, so a file of that name the project already had is never deleted, nor the config and database beside it.

Not tested: qmd with the extra file `.qmd/xworkflows` in its folder. The real `install` and `doctor` in this repository show it.

## The dropped design

The first design registered the folder with `qmd collection add` in a global index named after the project and saved that name as `memory.index` in the tracked config. `install` then had to keep a tracked key, a per-machine index in the user's home and the folder on disk in agreement, by reading the text qmd prints. Three risk reviews raised 20 findings, the last one blocking, and the fixes of each round produced new ones; the owner stopped it ("smells like bad design", 2026-11-13). The branch `install-memory-1` holds it, not merged.
