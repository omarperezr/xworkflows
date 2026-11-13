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
- "Remove if empty, else say so" and "Remove them too" (owner, 2026-11-13): answers 6 and 7 of the spec, task T1b.
- "Accept it and card the gap" (owner, 2026-11-13): the loop of `uninstall` that removes empty parent folders stays as it is in this batch; card P-112.

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

**T1b: `uninstall` takes back an empty memory folder and the database's side files; `memory.dir` is read as the checks read it** (owner's answers 6 and 7; spec section "What install does", first paragraph)
- Files: `bin/xworkflows.mjs`, `bin/xworkflows.test.mjs` (the agent of T1, after T1 is committed)
- Role: implement
- `install` and `doctor` read `memory.dir` by one rule, the one of `checks/index-current.mjs:6-8`.
- Tests, each seen failing first: install then uninstall on a fresh project leaves nothing; with a note in the folder it stays and the line is printed; a folder that existed before the install is neither removed nor named; install, install, uninstall still removes an empty folder; the two side files are removed with `index.sqlite`; `./docs/memory` and `docs/memory/` give the folder `docs/memory`, the yml path without the extra characters, and an `ok` line from `doctor`.
- Done: `node --test bin/xworkflows.test.mjs` passes and `node bin/xworkflows.mjs pack --check` prints nothing.

### Batch 1, fix round after the risk review of `2fe5e16`

The owner's answers, 2026-11-13: "Yes, one fix round", "Marker file per checkout", "Drop them" (spec, answers 9 to 11). The duplicated `memory.dir` rule is card P-113.

**F1: install, `doctor` and `uninstall` know qmd's other config name, `.qmd/index.yaml`** (risk review finding 1, blocking)
- red: from the verifier, branch `verify/qmd-yaml-name`
- Files: `bin/xworkflows.mjs`, `bin/xworkflows.test.mjs`
- Role: implement

**F2: a memory folder or a yml that cannot be written does not leave a half install** (risk review finding 2, blocking)
- red: from the verifier, branch `verify/mkdir-half-install`
- Files: the same two, the same agent
- The yml and the marker are the other new writes of this batch: the same handling covers them (main session, reported to the owner).
- F1 and F2 go in one commit with their tests, subject `fix(install): ...`.

**F3: the marker `.qmd/xworkflows` decides what `uninstall` removes in `.qmd/`** (owner's answer 10; spec sections "What install does" and "What else changes")
- Files: the same two, the same agent, after the commit of F1 and F2
- Tests, each seen failing first: a first install writes the marker beside the yml, and neither is in the record; uninstall with the marker removes the yml, the three database files and the marker; a checkout that has its own yml and database and a record that names `.qmd/index.yml` in `created` keeps all of it at uninstall; a second install changes nothing.
- Its own commit, subject `feat(install): ...`.
- Done for the round: `node --test bin/xworkflows.test.mjs` passes and `node bin/xworkflows.mjs pack --check` prints nothing.

### Batch 1, second fix round after the confirmation at `424286e`

The confirmation closed findings 1 to 3 and left one blocking finding. The owner's answers, 2026-11-13: "Fix it plus the three one-liners", and both `ask-owner` findings accepted as known limits (spec, answers 12 and 13). This is the last fix round the method allows for the batch.

**G1: the marker is not written through a symlink nor over something that is there** (confirmation, blocking, `bin/xworkflows.mjs:410`)
- red: from the verifier, branch `verify/marker-symlink`
- Files: `bin/xworkflows.mjs`, `bin/xworkflows.test.mjs`
- Role: implement

**G2: three small corrections in the same code** (confirmation, the three `pending` findings in `bin/xworkflows.mjs`)
- A test that fails when the guard of the delete in `uninstall` is removed: `.qmd` linked out of the repository, the marker, the yml and the database there, and they stay.
- The record no longer makes `uninstall` delete an empty `.qmd/index.yml` that has no marker: the leftover condition near line 730 goes, and such a record gets `kept (not ours): .qmd/index.yml`.
- `uninstall` does not stop with a raw error when `.qmd` is a plain file.
- Files: the same two, the same agent, one commit with G1, subject `fix(install): ...`.
- Done: `node --test bin/xworkflows.test.mjs` passes and `node bin/xworkflows.mjs pack --check` prints nothing.

### Batch 1, third round, on the owner's word, after the confirmation at `11aca5b`

The second confirmation closed its four findings and left one blocking finding. The method allows two fix rounds; the owner chose this third one: "Fix it, one narrow check after" (2026-11-13; spec, answer 14).

**H1: `uninstall` takes `.qmd/xworkflows` as the marker only when it holds the marker's text** (second confirmation, blocking, `bin/xworkflows.mjs:832`)
- red: from the verifier, branch `verify/marker-text`
- Files: `bin/xworkflows.mjs`, `bin/xworkflows.test.mjs`
- Role: implement

**H2: `uninstall` does not print `kept (not ours): .qmd/index.yml` for a yml it then removes** (second confirmation, `pending`, `bin/xworkflows.mjs:731`)
- State: the record names `.qmd/index.yml` in `created` and the marker is present.
- Files: the same two, the same agent, one commit with H1, subject `fix(install): ...`.
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

- Nothing is created or written outside the repository or through a symlink: the folder, `.qmd/index.yml`, the marker `.qmd/xworkflows`, the `.gitignore` line.
- An existing `.qmd/index.yml` is never changed by `install`. `uninstall` removes a yml and its database files only when the record says install created that yml.
- `uninstall` removes the memory folder only when the record says install created it and it holds nothing at all; a folder with any entry, or one install did not create, stays.
- `install` and `uninstall` start no `qmd`, on any path through the code.
- The path written is valid YAML for any folder name and is the value `doctor` compares.
- `--dry-run` writes nothing; a second install changes nothing.
- `doctor` never throws and never stops because a path cannot be resolved.

## Declined findings

"Drop them" (owner, 2026-11-13): seven findings of the risk review of `2fe5e16`, not fixed and not carded.

- `bin/xworkflows.mjs` `clean`: a plain file where a parent folder is expected (`docs`, `.qmd`) stops install or uninstall with a raw `ENOTDIR` error.
- `bin/xworkflows.mjs` `uninstall`: it prints no `deleted` line for the yml and the database files.
- `bin/xworkflows.mjs` `doctor`: with a `memory.dir` install refuses, it goes on with the raw value and advises to run install again.
- `bin/xworkflows.mjs` `doctor`: the `qmd trust` warn is printed also when `memory.index` is set.
- `bin/xworkflows.test.mjs`: the test that uninstall starts no qmd asserts nothing.
- `bin/xworkflows.mjs`: `memory.dir` is still read raw for `autoMemoryDirectory`, in `uninstall` and for a byte count of `doctor`, so a space at its end gives two folders.
- `bin/xworkflows.mjs` `uninstall`: a `null` entry in `created` of a record broken by hand stops it half way when `memory.dir` is not valid.

From the confirmation at `1399e1e`, of the same kind as the ones above and listed with them by the main session, as told to the owner on 2026-11-13:

- `bin/xworkflows.mjs` `uninstall`: a record edited by hand that names `.qmd/index.yml` in `created`, with the real marker present and a folder at that name, stops it with a raw `EISDIR`.

## Seals

risk-review ok at 1399e1e
