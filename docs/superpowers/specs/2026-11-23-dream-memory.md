# One memory folder, and /dream from zero notes

Goal: G1, G3

## 1. The request

Request: `/dream` runs in any project, also in xworkflows itself, and keeps one single place for every memory: `docs/memory/`. Today it fails in three ways. Done: in this repository `/dream` runs from main without help, brings the notes of the old memory folder onto its branch, and its `close` commits; the owner adopts or discards the branch.

What happened (2026-11-23):
- The first run here read 23 sessions on the cheap tier and failed at the end: `close` ran `git add -A -- docs/memory` on a branch made from main, main did not track `docs/memory`, git answered `pathspec 'docs/memory' did not match` (P-245).
- With the folder tracked but empty, `extract.mjs` refused with `no memory notes` before any spend (P-247).
- Five notes written before install pointed the memory at `docs/memory` stay in the tool's default per-project folder; no session loads them (P-248).
- The analyzers have no tool that removes a file, so a stale or merged note cannot go away, even on the branch (P-249).

Material:
- `open` runs `git worktree add` from main and writes the mark; it does not create the memory folder (`skills/dream/branch.mjs:80-91`). `read not tested`
- `close` stages with `git add -A -- <dir>` and checks only `dream.json` for existence (`skills/dream/branch.mjs:105-112`). `read not tested`
- `extract.mjs:151`: `if (!notes) return done("no memory notes")`. `read not tested`
- Install only writes `autoMemoryDirectory` (the repository folder) into `.claude/settings.local.json` and reads, copies or moves no note (`bin/xworkflows.mjs:307-320`). It does not keep the earlier value. `read not tested`
- No code names the default memory folder. The session logs' folder is `~/.claude/projects/` plus the repository path with every character outside `[a-zA-Z0-9]` turned into `-` (`bin/xworkflows.mjs:1176`); the default memory folder is its `memory/` child. `read not tested`
- The analyzer and the organizer have the tools `Read, Write, Edit, Glob, Grep` (`agents/dream-analyzer.md:6`, `agents/dream-organizer.md:6`); the workflow returns `{ merged, conflicts, proposals, missing }` (`skills/dream/dream.workflow.js`). `read not tested`

## 2. Design

1. **The folder always exists.** Install creates an empty `docs/memory/MEMORY.md` (the memory folder of `memory.dir`) when it is missing. `open` creates the memory folder in the worktree when main has none; `close` stages nothing and commits nothing when the folder is missing or empty, and still records the sessions read (P-245, P-246).
2. **From zero notes.** `extract` no longer refuses on zero notes: with no note and no orphan, the analyzers write new `project` and `reference` notes and the organizer merges the repeated ones (P-247).
3. **The old folders.** Install records in `.xworkflows/installed.json` the earlier `autoMemoryDirectory` when there was one and it differs. `/dream` reads that folder and the default one. Their notes are copied onto the branch's memory folder before the analyzers run, each marked with the path it came from. In a project installed before this change only the default folder is known (P-248).
4. **Removing a note.** An agent never removes a file. Its result lists the notes to remove, each with its reason; `close` runs `git rm` on each, only inside the branch's memory folder; a path outside it is refused and named. The removal shows in the diff the owner reviews (P-249).
5. **Notes of type `user` or `feedback`.** They never enter the repository. A fact about the project in one goes into a `project` note, without what is personal. A preference of the owner becomes text proposed for `~/.xworkflows/owner.md` in the report; the main session writes it only on the owner's yes.
6. **The originals.** The next `/dream`, before its extract, checks that the copy of each brought note is in main. It lists the originals to delete, numbered, in its opening question; the owner may keep any by number. It deletes each by literal path, only in the folders of item 3, only a file whose content is unchanged since the copy; a changed one stays and is named.
7. **The owner is told three times.** The opening question names every folder and file outside the repository the run reads. The report gives each brought note's fate: merged into which note, moved, or dropped, and why. Item 6 is the third.
8. Everything installed keeps the rules of this project: Node standard library, a pure `decide(ev, ctx)` with its test where a hook changes, manifest pieces with their hash, values from `.xworkflows/config.json`, nothing private in a tracked file.

## Owner's answers

- Request: "hagamos absolutamente todo eso que te estoy diciendo para mejorar cómo funciona Dream actualmente y para poder finalmente ejecutar Dream en este proyecto" (2026-11-23); one place: "La idea es tener un solo lugar donde tengamos todas las memorias".
- Q1, scope: "Vieja + cualquier carpeta anterior, pero asegurate de siempre avisarle al owner que carpetas/archivos se borrarian/modificarian/actualizarian".
- Q2, removing: "Lista + close borra (Recommended)". Q3, originals: "El siguiente /dream (Recommended)".
- Q4, user and feedback notes: "dream las analiza y verifica su relevancia y decide si solo va a borrarlas o si son relevantes y encajan en otra memoria o carpeta se mueven o se usan para complementar pero obviamente siempre deberian borrarse a menos que owner diga lo contrario (por eso siempre se le pregunta)".
- Q5, earlier folder: "Install la guarda (Recommended)". Q6, notices: "Los 3 momentos (Recommended)". Q7, destination: "Nota de proyecto u owner.md (Recommended)". Q8, zero notes: "Sí, corre igual (Recommended)".
- The summary of items 1 to 7: "Sí, es correcto".
