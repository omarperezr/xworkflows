# Install creates the memory folder and a project-local qmd index

Goal: G1

Spec: docs/superpowers/specs/2026-11-13-memory-index-design.md

## Global Constraints

- "install shouold create docs/memory if it does not exist and run the qmd collection add docs/memory afterwards" (owner, 2026-11-13). After the first design: "smells like bad design", then "redesign" (owner, 2026-11-13).
- The five answers under `Owner's answers` in the spec bind every task.
- `install` and `uninstall` start no `qmd`. No test runs the real `qmd`: a test that needs one puts a fake first on a PATH of its own, as `tools()` in `bin/xworkflows.test.mjs` does.
- No agent reads, creates, changes or deletes anything under `~/.cache/qmd` or `~/.config/qmd`.
- One agent at a time works in this checkout. No agent runs `git stash`, switches branch or checks out a file: an old version is read with `git show`.
- The smallest change that does the task: no option, flag, helper or behaviour the spec does not name. What the spec leaves open is reported, not decided.

## Tasks

### Batch 1: `memory-index-1`

About 40 code lines, all in `bin/xworkflows.mjs`.

**T1: `install` creates the memory folder and writes `.qmd/index.yml`; `doctor` and `uninstall` follow** (spec sections "What install does" and "What else changes", items 1 to 3)
- Files: `bin/xworkflows.mjs`, `bin/xworkflows.test.mjs`
- Role: implement
- Where: `install()` near line 436; `IGNORE` and `mergeIgnore` near 227; `mergeLocal` near 209, the pattern of a generated file and its record; `plain` near 281 and `clean` near 283; `real` near 122, which throws on every error except a missing path; the qmd block of `doctor()` near 593 to 610; `uninstall()` near 665. Tests to copy: near 712 (the `.gitignore` lines) and near 1181 (no write through a symlink).
- From the dropped branch, to read and reuse where it fits, never to merge: `git show install-memory-1:bin/xworkflows.test.mjs`, the tests whose names contain "symlink that leaves", "is absolute" and "climbing out".
- Tests, each seen failing first:
  - a first install: the folder; the yml with the path as a JSON string; `.qmd/` in `.gitignore`; a fake `qmd` first on the PATH that logs its calls has logged none;
  - a second install after the yml was changed by hand: the yml is byte-identical and nothing else changes;
  - a yml that existed before the install: byte-identical, and no `.qmd/` line is added;
  - `memory.index` set: the folder, and no `.qmd`;
  - `--dry-run`: nothing written, and the three lines;
  - `docs` a link that leaves the repo, and `.qmd` a link that leaves the repo: nothing is created there; `memory.dir` absolute or climbing out: nothing created, and the line with the true cause;
  - a repo whose own path holds a space, `#` and `:`: the path line is the JSON string of the folder;
  - `doctor`: the two new fail texts; the warn for a memory folder linked outside; no throw for a path that cannot be resolved; with `memory.index` set, today's line;
  - `uninstall`: the yml, `index.sqlite`, the empty `.qmd/` and the `.gitignore` line are gone, a note in the memory folder stays; a yml install did not create stays with its `index.sqlite`.
- Done: `node --test bin/xworkflows.test.mjs` passes and `node bin/xworkflows.mjs pack --check` prints nothing.

**T2: the README and the design say what `install` does with the memory folder** (spec section "What else changes", item 4)
- Files: `README.md`, `docs/design.md`
- Role: main session
- Done: `grep -n qmd README.md` prints a line in Setup that names `.qmd/index.yml` and says each checkout runs `install`.

**T3: this repository gets its own local index** (spec section "What else changes", item 5)
- Files: `.gitignore`
- Role: main session
- After the review is ok, and only on the owner's word: `doctor` runs the real `qmd` here.
- Done: `node bin/xworkflows.mjs doctor` prints `qmd collection covers docs/memory` on a line that starts with `ok`.

## Review Focus

- Nothing is created or written outside the repository or through a symlink: the folder, `.qmd/index.yml`, the `.gitignore` line.
- An existing `.qmd/index.yml` is never changed by `install`. `uninstall` removes a yml and an `index.sqlite` only when the record says install created that yml, and never the memory folder.
- `install` and `uninstall` start no `qmd`, on any path through the code.
- The path written is valid YAML for any folder name and is the value `doctor` compares.
- `--dry-run` writes nothing; a second install changes nothing.
- `doctor` never throws and never stops because a path cannot be resolved.

## Declined findings

## Seals
