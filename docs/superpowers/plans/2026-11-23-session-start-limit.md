# Session-start byte limit 3333

Goal: G1

Spec: docs/PENDING.md (card P-252)

## Global Constraints

- "subir el limite a 3333", and "a": the default in `hooks/core/config.mjs`, for every project, not only this one's config (owner, 2026-11-23).
- Why: the `modes` hook prints the owner's preferences file (about 1800 bytes here) at every session start, so `doctor` fails at 2219 bytes of 2000 in every project of this owner.

## Tasks

### Batch 1: `session-start-limit-1`

**T1: `tokens.sessionStartBytes` defaults to 3333**
- Files: `hooks/core/config.mjs`, `bin/doctor.test.mjs`, `manifest.json`, the installed copy under `.claude/` and `.xworkflows/`
- Role: implement
- Done: `node --test bin/doctor.test.mjs hooks/` passes, `node bin/xworkflows.mjs pack --check` prints nothing, `node bin/xworkflows.mjs doctor` shows `ok` on the session-start line, and the full `node --test` passes.

## Review Focus

- Only the default changes; a project's own `tokens.sessionStartBytes` still wins.

## Declined findings

## Seals
risk-review ok at 563f825
