# Phase 1.1: Installer: manifest, install, doctor

Status: approved by the owner, 2026-11-11

Sub-project 1 of 4 of phase 1 (design 11, item 1; owner, 2026-11-11). Sub-projects
2 and 3 add pieces to what this builds; sub-project 4 (pilot) runs it for real.
Built in order 1, 2, 3, 4; each starts after the previous one is merged. Shared
files belong to the earlier sub-project; later ones extend them (owner, 2026-11-11).

## 1. Intent

Phase 0 proved one hook, one skill and one agent in Claude Code, only in a
hand-written `sandbox/`. Nothing can be piloted until a project gets the pieces
with one command, keeps its own configuration, and can tell the install is whole.
This builds that, for Claude Code only: `manifest.json` (design 5) and
`bin/xworkflows.mjs` with `install`, `doctor`, `uninstall`, `pack` (design 6, 6.2).

## 2. Goals, non-goals, anti-goals

Goals:

- One command takes a Claude Code project to a working `design-first` deny, and `doctor` exits 0.
- Installing over existing configuration keeps everything the project had, in its order (design 6.2).
- `install` run twice changes nothing the second time (design 10, proof 7).
- `uninstall` removes exactly what `install` wrote.
- Sub-projects 2 and 3 add a skill, agent or hook by adding a manifest entry, with no installer change.

Non-goals, and where they go:

- Codex, Cursor, Gemini CLI layouts, and `.agents/skills/`: phases 2 to 4.
- `check` and the git `pre-push` hook: sub-project 3, with the brakes (section 6).
- `autoMemoryDirectory`: sub-project 3. User-level preference plugins (design 7.4): after the pilot, before phase 2.
- Windows: out of phase 1. Proof 1 on Windows runs at publish on a Windows CI runner; `docs/gaps.md` records it as deferred (Claude's call).
- `fetched` pieces: none exists yet.
- `config.json` contents, `BUSINESS.md`, the interview: sub-project 2.

Anti-goals: no dependency, no build step, no network call during `install`;
never overwrite a file the installer did not write; never stage, commit or push;
no timestamps or machine paths in what it writes, so reruns stay byte-identical.
One exception: sub-project 3's `.claude/settings.local.json` fallback.

## 3. Constraints

- Node standard library only, one file `bin/xworkflows.mjs` (design 2, 6). Node
  22 or newer (Claude's call: the oldest supported line in 2026-11; phase 0 ran on v26).
- Run as `npx github:<account>/xworkflows <command>` or `node <clone>/bin/xworkflows.mjs <command>`.
  The package root comes from `import.meta.url`; the target is the git top level of the current folder.
  The pilot installs from a local clone, `node <clone>/bin/xworkflows.mjs install`; npx is tested at publish (design 11, item 5) (Claude's call).
- The target must be a git repository, or every command exits 1 (the hook command uses `git rev-parse`, 5.3), except `check`, which passes on run.mjs's exit code (2 when not a repo).
- Git rules of design 7.6 bind the build: one branch per batch, `--no-ff`, add by explicit path, no AI author line.
- `docs/gaps.md`: `claude -p` in an untrusted workspace ignores project `permissions.allow`. Nothing may depend on it.

## 4. The manifest (design 5, made precise)

```json
{ "name": "xworkflows", "version": "0.1.0", "pieces": [
  { "id": "grill", "kind": "skill", "origin": "vendored", "source": "https://github.com/mattpocock/skills",
    "version": "95249b0b49782349740fd9b8c6ce32b4e59e497a", "license": "MIT", "modified": true,
    "scope": "project", "tools": ["claude", "codex", "cursor", "gemini"],
    "files": { "skills/grill/SKILL.md": "<sha256>", "skills/grill/LICENSE": "<sha256>", "skills/grill/SOURCE.md": "<sha256>" },
    "sha256": "<piece digest>" } ] }
```

Additions to design 5, each (Claude's call):

- `files` maps each source path (repository-relative, `/`) to the sha256 of its
  bytes. The piece `sha256` is the sha256 of the lines `<path> <hash>\n`, sorted by path.
- Every hash is taken after replacing `\r\n` with `\n`, so a Windows checkout
  with `core.autocrlf` does not look tampered.
- An `own` piece's `version` is the top-level `version`, equal to `package.json`'s.
- A `hook` piece carries `"claude": [{ "event": "PreToolUse", "matcher": "Write|Edit|MultiEdit|Bash" }]`,
  one settings entry per element, so a hook on several events needs no
  installer change; `matcher` is optional (session-start hooks have none).
- `grill` stays in `skills/grill/` with its `LICENSE` and `SOURCE.md`, not in
  `vendor/` (design 4): moving it buys nothing; the manifest records the origin.

First contents, only what exists today:

| id | kind | origin | files |
|---|---|---|---|
| `hook-runtime` | hook | own | `hooks/run.mjs`, `hooks/mark.mjs`, `hooks/core/marks.mjs`, `hooks/adapters/{claude,codex,cursor,gemini}.mjs`; no `claude` key, so no settings entry |
| `design-first` | hook | own | `hooks/core/design-first.mjs`, with the `claude` key above |
| `grill` | skill | vendored | as in the example |
| `explore` | agent | own | `agents/explore.md` |

Tests, fixtures, `sandbox/` and `docs/` are never pieces. Installer data, not
pieces: `tiers.json` with `{ "claude": { "cheap": "haiku", "medium": "sonnet", "top": "opus" } }`
(Claude's call: the aliases haiku, sonnet, opus, as the sandbox used), and `templates/AGENTS.md`, the
text of the product block (5.4), which sub-projects 2 and 3 extend.

## 5. `install` for Claude Code

### 5.1 Order

1. Verify every source file against the manifest. One mismatch: exit 1, nothing written.
2. Build the whole plan against the target and ask the questions (5.6). A failure here writes nothing.
3. Write files, then merges, then `.xworkflows/installed.json` last.
4. Print each path written or changed, one per line, for `git add` by path
   (design 6.2, last row), or `nothing to do`; then the last line
   `Next: open Claude Code and type /adapt`.

`--yes` answers yes to every question not already stored (5.6). `--dry-run` prints the plan, writes nothing.

### 5.2 Where each piece goes

| Source | Written to |
|---|---|
| `skills/<id>/*` | `.claude/skills/<id>/*` |
| `agents/<id>.md` | `.claude/agents/<id>.md`, line `tier: <t>` replaced by `model: <tiers.claude[t]>` |
| `hooks/mark.mjs` | `.xworkflows/mark.mjs` (the path the skill's mark command names, design 7.2) |
| `tiers.json` | `.xworkflows/tiers.json`, recorded in installed.json |
| other `hooks/` files | `.xworkflows/hooks/<same path>`; of the adapters only `adapters/claude.mjs` |

`agents/explore.md` gains `tools: Read, Grep, Glob, Bash` (Claude Code's names, as
in the sandbox; Codex maps them later). `.xworkflows/` is meant to be committed,
so a clone has working hooks. Skill marks stay in the system temp folder.

### 5.3 How settings reference a hook

Phase 0 called the repository's `hooks/run.mjs`. Installed, each hook piece adds one entry under its event:

```json
{ "matcher": "Write|Edit|MultiEdit|Bash",
  "hooks": [{ "type": "command", "command": "node \"$(git rev-parse --show-toplevel)/.xworkflows/hooks/run.mjs\" claude design-first" }] }
```

Phase 0's tested form, folder changed (Claude's call; `$CLAUDE_PROJECT_DIR` is the
fallback if the pilot shows a problem). `.xworkflows/` in the path marks its entries
(design 6.2). An entry is recognized as ours by its command path under
`.xworkflows/` (Claude's call). An edited entry is "changed locally": kept, never
duplicated, reported by doctor as a warn. Install also adds `"Bash(node .xworkflows/mark.mjs:*)"` to `permissions.allow`.

### 5.4 Merges

- `.claude/settings.json`: append each missing entry to the end of `hooks.<event>`
  or `permissions.allow`, creating keys only if absent. An entry is present when
  one is deep-equal or recognized as ours (5.3). Nothing missing: the file is not rewritten. Otherwise it is
  written as `JSON.stringify(v, null, 2)` plus a newline (spacing may change,
  keys and order may not). A file that does not parse: exit 1, nothing written.
- `AGENTS.md`: one block between `<!-- xworkflows:start -->` and
  `<!-- xworkflows:end -->` holding `templates/AGENTS.md`. Missing file: created
  with only the block. A block whose text differs is replaced. Text outside it is
  never touched. Sub-project 2's interview writes the project's rules **outside**
  the block; install and uninstall never own them.
- `CLAUDE.md`: needs the line `@AGENTS.md`. Missing file: created with that line
  and no question (Claude's call: nothing of the owner's is at stake). Existing
  file without the line: asked (5.6).

### 5.5 Files (design 6.2 table, unchanged)

Absent: write and record. Recorded, same hash: replace. Recorded, other hash:
keep, print `kept (changed locally): <path>  new: <package path>`. Present and
not recorded: never overwritten; a same-name skill or agent is asked (5.6).
Any other file install would write that is present but unrecorded (after a
crash, or a deleted installed.json): adopted and recorded when its bytes match
exactly; otherwise exit 1, nothing written, the path printed (Claude's call).

### 5.6 Questions

Asked with `node:readline` when stdin is a terminal. With no terminal and no
`--yes`, each takes the safe answer and is listed at the end:

| Question | Safe answer | `--yes` |
|---|---|---|
| Add `@AGENTS.md` to the existing `CLAUDE.md`? | no, recorded as declined | yes, appended as the last line |
| A skill or agent `<id>` exists. Keep theirs or install ours as `xwf-<id>`? | keep theirs, recorded | `xwf-<id>` |

A rerun honors the answers stored in installed.json (`declined`, `renamed`,
kept-theirs). `--yes` never flips a stored answer. There is no `--reask` flag
(Claude's call).

A prefixed install changes the folder or file name and the `name:` line only;
the mark command keeps the original id, so `design-first` still sees it.

### 5.7 `.xworkflows/installed.json`

The interface `doctor`, `uninstall` and a later `update` read. Keys in this
order, paths relative to the project root with `/`, no timestamps; rewritten
only when its content changes:

```json
{ "xworkflows": "0.1.0", "tools": ["claude"],
  "pieces": { "grill": { "version": "95249b0...", "sha256": "<piece digest>" } },
  "files": { ".claude/skills/grill/SKILL.md": { "piece": "grill", "sha256": "<hash of the bytes written>" } },
  "merged": [ { "file": ".claude/settings.json", "key": ["hooks", "PreToolUse"], "entry": {} } ],
  "blocks": [ { "file": "AGENTS.md" } ],
  "imports": [ { "file": "CLAUDE.md", "line": "@AGENTS.md" } ],
  "created": ["AGENTS.md", "CLAUDE.md", ".claude/settings.json"],
  "declined": [ { "file": "CLAUDE.md", "what": "import" } ],
  "renamed": { ".claude/skills/xwf-grill": "grill" } }
```

`files` hashes are of the bytes written (after the tier change). `created` lists
shared files that did not exist before. Install never writes `.xworkflows/config.json` (Claude's call): defaults come
from the runner (sub-project 3, `hooks/core/config.mjs`), and adapt creates the
file or merges into it; an install-owned file would read as tampered once the
interview edits it.

## 6. The other commands

| Command | In 1.1? | Why |
|---|---|---|
| `pack` | yes | Hashes cannot be kept by hand. It recomputes `files`, `sha256` and own versions; fails on a piece with no version or license, and on a file under `skills/`, `agents/` or `hooks/` (tests, fixtures aside) that belongs to no piece. `pack --check` exits 1 if the manifest would change; a test runs it |
| `check` | sub-project 3 | It is the brakes. A `pre-push` calling a missing command blocks every push or does nothing, so the `pre-push` install and its chaining (design 6.2) ship with it |
| `update` | after the pilot | Rerunning `install` already replaces untouched files and keeps changed ones (5.5). The side-by-side view and removal of retired pieces matter only once a project holds an older release |
| `propose` | phase 2 or later | Nothing to propose until a project adapts a piece; design 11 ties it to moving a tool to `tested` |

Unknown command or flag: usage on stderr, exit 2. `--tool <x>` other than
`claude`: `not yet: <x> comes in a later phase`, exit 2.

## 7. `doctor`

One line per check (`ok`, `fail` or `warn`), then a summary. Exit 0 with no `fail`, 1 otherwise, 2 on usage.

1. Inside a git repository; `installed.json` parses; `node` meets the minimum; `git` answers.
2. Every recorded file exists and is readable. A file changed locally is `warn`
   "changed locally", exit 0; a missing or unreadable one is `fail` (Claude's
   call; design 6.2 allows local changes). A kept-theirs skill or agent is a `warn`.
3. Every `merged` entry is still in its file, deep-equal; an edited one is
   `warn` "changed locally", a missing one `fail`.
4. The `AGENTS.md` block equals the package template; `CLAUDE.md` has `@AGENTS.md`.
   A declined import is `warn`, with the line to add (Claude's call); the pilot answers yes.
5. Hook probe, in place of "every hook test passes" (Claude's call: tests are not
   installed, and package tests prove the package, not this install). It runs the
   installed `design-first` command with a made-up Claude `Write` of
   `<paths.specs>/xwf-doctor-probe.md`, a fresh session id and
   `XWORKFLOWS_STATE_DIR` set to a new temp folder, and expects `deny`. Nothing is
   written in the project.
6. Always-loaded size (design 13, budget 1; proof 8): bytes of `CLAUDE.md`, each
   file it imports with `@` (recursively, each once), and `<memory.dir>/MEMORY.md`
   if present. Always printed; `fail` above `tokens.alwaysLoadedBytes` (24000
   unless `config.json` sets it).
7. Prints `Claude Code: tested`. First-turn tokens of the newest session (design
   13, item 3) move to sub-project 3, with the session-start measure.

## 8. `uninstall`

As design 6.2: delete each recorded file whose hash matches; list and keep the rest.
Remove `merged` entries that match exactly (edited ones are listed and kept) and any key it created that is now empty; remove its block
and import line. Delete a `created` file left empty (or `{}`) and folders it emptied;
`installed.json` last. Never touch `config.json`, interview output or text outside
its block. Not installed: exit 1.

## 9. Testing

`bin/xworkflows.test.mjs`, run by `node --test`. Each case makes a temp folder,
runs `git init`, sets it up, runs the CLI with `spawnSync`, and checks:

- Fresh project: expected files exist; `doctor` exits 0.
- Pilot-shaped project (design 6.2): a `CLAUDE.md`; a `settings.json` with `env`
  and two `PreToolUse` entries calling an absolute path; uncommitted files.
  Old entries stay first and deep-equal, `env` unchanged; `CLAUDE.md` unchanged
  without `--yes`, plus the line with it.
- Second install: every file byte-identical; `git status --porcelain` and `git diff` identical (proof 7).
- An unrecorded file is not overwritten; a recorded file changed locally is kept; a collision gets `xwf-` with `--yes`.
- Broken `settings.json`, or a tampered package file: exit 1, tree unchanged.
- `doctor` warns on a changed file and exits 0. It fails, one case each: missing file, removed hook entry, missing import, size over budget, probe allows.
- `uninstall`: no installed file left; `settings.json` deep-equal to before;
  `AGENTS.md` and `CLAUDE.md` byte-identical to before, or gone if install created them.
- `pack --check` passes on the repository and fails on a piece without a license.

Then one real-session check, as phase 0's proof 6 on an installed layout:
install into a scratch git project, open Claude Code, ask for a spec, get the
deny, run `/grill`, get the allow. Keep the recorded deny as
`hooks/fixtures/claude/installed-write-spec.json` (label `recorded`, home path
masked as `run.mjs` does).

## 10. Amendments to design.md

For the owner to apply after approval:

- Design 4, `vendor/<piece>/`: modified third-party pieces live in `skills/<name>/` (or `agents/`) with LICENSE and SOURCE.md, as grill does; `vendor/` is not used.
- Design 6 (`doctor`): "exit 0 only if every installed file matches its hash" becomes "exit 0 unless a piece is missing or unreadable; a file changed locally is a warn".
- Design 6.2: a declined `@AGENTS.md` import is a doctor warn.

## 11. Left to the builder

- Message, prompt and usage wording; the inner structure of the one file; test helpers.
- Whether the sandbox's Claude Code files are regenerated by `install` (and the sandbox test adjusted) or stay hand-written until phase 2.
- `package.json` (`"type": "module"`, `"bin": { "xworkflows": "bin/xworkflows.mjs" }`, `"engines"`, no dependencies) and the shebang.
- Replacing README step 3 with the install command; `docs/gaps.md` lines for anything found untested.
