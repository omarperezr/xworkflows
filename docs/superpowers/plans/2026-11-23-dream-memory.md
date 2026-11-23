# One memory folder, and /dream from zero notes

Goal: G1

Spec: docs/superpowers/specs/2026-11-23-dream-memory.md

## Global Constraints

- "La idea es tener un solo lugar donde tengamos todas las memorias."
- "asegurate de siempre avisarle al owner que carpetas/archivos se borrarian/modificarian/actualizarian"
- "obviamente siempre deberian borrarse a menos que owner diga lo contrario (por eso siempre se le pregunta)"
- "no uses fable para estas tareas, no tenemos cupo usa opus en xhigh, igual no creo que sea super necesario usar fable para esto tan relativamente simple": the risk review of this batch runs on Opus at xhigh.
- Risk review of batch 1, the owner: "A a, B a": the default folder is not read when `memory.autoDirectory` is false (it is the live memory then), and only the organizer sees the brought notes and decides their fate, removal and owner text once.
- The earlier memory folder is an absolute path, so it is kept in the git-ignored `.xworkflows/local.json`, never in the tracked `installed.json`.
- No absolute path and no name of the owner's projects enters a tracked file: a brought note is recorded in `dream.json` by its folder kind (`default` or `earlier`), its file name and its sha256, never by its full path.

## Tasks

### Batch 1: `dream-memory-1`

**T1: install creates `docs/memory/MEMORY.md` when missing and records the earlier `autoMemoryDirectory`** (spec section 2, items 1 and 3)
- Files: `bin/xworkflows.mjs`, `bin/install-memory.test.mjs`
- Role: implement
- Done: `node --test bin/install-memory.test.mjs` passes; the earlier value is stored as `memory.earlierAutoDirectory` in `.xworkflows/local.json` only when it existed and differed, and a later install keeps a value already stored; install adds `.xworkflows/local.json` to `.gitignore` and uninstall removes the file and the line; `MEMORY.md` is created only when `memory.autoDirectory` is not false; uninstall leaves `MEMORY.md` alone.

**T2: extract runs from zero notes and lists the outside folders and their notes** (spec section 2, items 2, 3 and 7)
- Files: `skills/dream/extract.mjs`, `skills/dream/extract.test.mjs`, `skills/dream/shared.mjs`
- Role: implement
- Done: `node --test skills/dream/extract.test.mjs` passes; zero notes no longer gives `no memory notes`; the result has `outside: [{ kind, folder, files }]` for the default folder (`~/.claude/projects/` + the repository path with every character outside `[a-zA-Z0-9]` turned into `-`, then `memory/`) and for `memory.earlierAutoDirectory` of `.xworkflows/local.json`; a folder that is missing or is the repository memory folder itself is left out; `MEMORY.md` of an old folder is not a note; the folder helper lives in `shared.mjs`.

**T3: branch brings, removes and forgets** (spec section 2, items 1, 3, 4 and 6)
- Files: `skills/dream/branch.mjs`, `skills/dream/branch.test.mjs`
- After: T2
- Role: implement
- Done: `node --test skills/dream/branch.test.mjs` passes, with tests for: `open --out <out>` creates the memory folder when main has none, copies in the notes of `outside` in `<out>/extract.json` (a name already taken by a different note gets the suffix `-old`) and prints them as `brought`; `close` commits nothing and fails nothing when the folder is missing or empty; `close --remove <name,name>` runs `git rm` only inside the branch's memory folder and refuses and names any other path; `dream.json` records each brought note as kind, name and sha256; `unseen` lists, numbered, the originals whose record is in main's `dream.json`, each marked `changed` when its sha256 differs; `forget --keep <n,n>` deletes each other original by literal path only when its sha256 still matches, and names a changed one.

**T4: the workflow and its agents return removals, fates and owner text** (spec section 2, items 4, 5 and 7)
- Files: `skills/dream/dream.workflow.js`
- The workflow takes `brought` (the note names `open` printed) in `args` and names them in each prompt., `skills/dream/workflow.test.mjs`, `agents/dream-analyzer.md`, `agents/dream-organizer.md`
- Role: implement
- Done: `node --test skills/dream/workflow.test.mjs` passes; each agent's schema adds `remove: [{ note, reason }]`, `fates: [{ note, fate, into, reason }]` and `owner: [{ text, note }]`; the workflow returns them merged; the agents still never write a `user` or `feedback` note and never remove a file.

**T5: the skill tells the owner and passes the new data** (spec section 2, items 6 and 7)
- Files: `skills/dream/SKILL.md`, `skills/dream/flow.test.mjs`
- After: T2, T3, T4
- Role: implement
- Done: `node --test skills/dream/flow.test.mjs` passes; the opening question names every outside folder and file and lists, numbered, the originals `forget` would delete; step 7 passes `--remove`; the report gives each brought note's fate and the proposed `owner.md` text, written only on the owner's yes.

**T6: manifest hashes and the own copy** (spec section 2, item 8)
- Files: `manifest.json`, `.claude/skills/dream/`, `.claude/agents/dream-analyzer.md`, `.claude/agents/dream-organizer.md`
- After: T1, T3, T4, T5
- Role: mechanical
- Done: `node bin/xworkflows.mjs pack --check` prints nothing; `diff -r skills/dream .claude/skills/dream` and `diff agents/dream-analyzer.md .claude/agents/dream-analyzer.md` print nothing.

**T7: fix, uninstall with a refused `memory.dir`** (risk review, finding 1)
- Files: `bin/xworkflows.mjs`, `bin/uninstall-memory-dir.test.mjs` (test on `verify/uninstall-md-undefined`)
- Role: implement
- Done: `node --test bin/uninstall-memory-dir.test.mjs` passes; `node --test bin/` passes.

**T8: fix, originals with no copy in main, and a remove entry that is not a bare name** (risk review, findings 2 and 3)
- Files: `skills/dream/branch.mjs`, `skills/dream/SKILL.md`, `skills/dream/flow.test.mjs`, `skills/dream/forget-no-copy.test.mjs` (on `verify/forget-no-copy`), `skills/dream/remove-bare-name.test.mjs` (on `verify/remove-bare-name`)
- Role: implement
- Done: both tests pass; `unseen` marks an original main holds no copy of, and the opening question names it so; `close --remove` takes a path inside the branch's memory folder as its bare name, and skips and names any other entry instead of failing the run.

**T9: only the organizer handles the brought notes** (owner's answer B a; finding 3, the agents' side)
- Files: `skills/dream/dream.workflow.js`, `skills/dream/workflow.test.mjs`, `agents/dream-analyzer.md`, `agents/dream-organizer.md`
- Role: implement
- Done: `node --test skills/dream/workflow.test.mjs` passes; the brought names reach only the organizer's prompt; `remove`, `fates` and `owner` come only from the organizer; both agents are told a note is its bare file name, like `a.md`.

**T10: the default folder is skipped when `memory.autoDirectory` is false** (owner's answer A a)
- Files: `skills/dream/shared.mjs`, `skills/dream/extract.test.mjs`
- Role: implement
- Done: `node --test skills/dream/extract.test.mjs` passes, with a test for it.

**T11: manifest hashes and the own copy, again**
- Files: `manifest.json`, `.xworkflows/installed.json`, `.claude/skills/dream/`, `.claude/agents/dream-analyzer.md`, `.claude/agents/dream-organizer.md`
- After: T7, T8, T9, T10
- Role: main session
- Done: `node bin/xworkflows.mjs pack --check` prints nothing.

Possible design error in skills/dream/branch.mjs originals()
Root cause: a copy in main is guessed from file names (the original name, or it with -old stripped), so a different note of the same name counts as the copy and forget deletes the only one. Design: a copy counts only when the sha256 of a file in main whose name strips to the original's name equals the sha256 recorded in dream.json; otherwise noCopy. The owner, 2026-11-23: "1 a, 2 todos".

**T12: fix, a copy counts only when its content matches; and the four smaller findings of the confirmation** (confirmation of round 1)
- Files: `skills/dream/branch.mjs`, `skills/dream/shared.mjs`, `skills/dream/extract.mjs`, `skills/dream/SKILL.md`, `skills/dream/dream.workflow.js`, `skills/dream/nocopy-collide.test.mjs` (on `verify/nocopy-collide`), `skills/dream/branch.test.mjs`, `skills/dream/extract.test.mjs`, `skills/dream/workflow.test.mjs`, `skills/dream/remove-bare-name.test.mjs`
- Role: implement
- Done: `node --test skills/dream/` passes; originals() marks noCopy unless a file in main has the recorded sha256; `forget --keep` exits 2 and deletes nothing on an entry that is not a listed number; outsideFolders takes `memory.autoDirectory` from the loaded config its callers pass; the workflow no longer strips the memory prefix (close does); the remove-bare-name test asserts `skipped` is empty and the note is gone from the branch.

**T13: manifest hashes and the own copy, again**
- After: T12
- Role: main session
- Done: `node bin/xworkflows.mjs pack --check` prints nothing.

## Review Focus

- `forget` deletes files outside the repository: only the literal paths `unseen` listed, only in the default or the recorded earlier folder, only with a matching sha256, never a folder.
- `close --remove` must never reach outside the branch's memory folder, by `..`, an absolute path or a link.
- A tracked file must not gain an absolute path or a private name (`dream.json`, a brought note's text).
- A note of type `user` or `feedback` never enters a commit.

## Declined findings

## Seals
risk-review ok at 82789d9
review ok at 6c84bd5
