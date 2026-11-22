# A project whose memory notes live elsewhere keeps them there

Goal: G1

Spec: none; card P-237 of docs/PENDING.md and the owner's answer below are the whole design.

## Global Constraints

- "memory.autoDirectory: false" (the owner, 2026-11-22): a new config key `memory.autoDirectory`, default `true`. When it is `false`, `install` writes no `autoMemoryDirectory` into `.claude/settings.local.json` and `doctor` does not ask for it. Every other memory behaviour stays as it is.
- The memory job starts whenever `memory.before` or `memory.index` is set, even when the notes folder does not exist.

## Tasks

### Batch 1: `memory-autodir-1`

**T1: the key's default, and the memory job's start** (card P-237)
- Files: `hooks/core/config.mjs`, `hooks/core/memory.mjs`, `hooks/core/memory.test.mjs`, `hooks/core/config.test.mjs`
- Role: implement
- `DEFAULTS.memory` gains `autoDirectory: true`, through the one defaults module. `rebuild` (`hooks/core/memory.mjs:16`) returns early only when the folder is missing, it has no notes, and neither `memory.before` nor `memory.index` is set.
- Done: `node --test hooks/core/memory.test.mjs hooks/core/config.test.mjs` passes, with a new case: no notes folder, `memory.before` set, and the job runs.

**T2: install and doctor leave `autoMemoryDirectory` alone when the key is `false`** (card P-237)
- Files: `bin/xworkflows.mjs`, `bin/memory.test.mjs`, `bin/doctor.test.mjs`
- Role: implement
- Install (`bin/xworkflows.mjs:308`) writes and records nothing for `autoMemoryDirectory` when `memory.autoDirectory` is `false`. Doctor (`:1155-1163`) prints no line about it then. An `autoMemoryDirectory` the owner set by hand is left untouched. Uninstall (`:1319`) needs no change: it removes only what install recorded.
- Done: `node --test bin/memory.test.mjs bin/doctor.test.mjs` passes, with new cases: with the key `false`, install leaves `.claude/settings.local.json` without the key and records nothing; doctor prints no `autoMemoryDirectory` line. With the key absent, both behave as today.

**T3: the docs name the key** (card P-237)
- Files: `docs/design.md`
- Role: main session
- Done: the memory rows of `docs/design.md` (`:441-444`) have a `memory.autoDirectory` row.

After T1 to T3 the main session runs `node bin/xworkflows.mjs pack` and commits the manifest; `node bin/xworkflows.mjs pack --check` prints nothing and `node --test` passes.

## Review Focus

- A project with the key absent must behave exactly as today: same `settings.local.json`, same doctor lines, same uninstall.
- The memory job now starts in a project without a notes folder: it must not create the folder or write an index inside the repository there.

## Declined findings

## Seals
