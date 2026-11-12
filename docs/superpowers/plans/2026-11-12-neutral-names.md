# Neutral names in tracked files

Goal: G2

Spec: `docs/superpowers/specs/2026-11-12-neutral-names-design.md`

## Global Constraints

- "neutraliza"
- "Ningún nombre, ruta ni término de negocio de mis proyectos en archivos con seguimiento." Neither this plan nor a commit message spells a name it removes.
- "sólo los bloqueantes"

## Tasks

### Batch 1: `neutral-names-1`

No code lines: docs and JSON fixtures.

**T1: neutral names in the design and in the recorded fixtures; the wording of the finding rule** (spec, whole)
- Files: `docs/design.md`, `hooks/fixtures/claude/ask-post-real.json`, `hooks/fixtures/claude/shell-mark.json`, `hooks/fixtures/claude/workflow-pre-real.json`, `hooks/fixtures/claude/write-spec-after.json`, `hooks/fixtures/claude/write-spec.json`, and a test under `hooks/core/` only where it reads the old folder name
- Role: mechanical
- Done: the search the prompt gives for each removed name prints nothing, and `node --test $(git ls-files '*.test.mjs')` passes.

## Review Focus

- A fixture is a recorded payload: only the folder's name may change in it, nothing else of its shape or values.
- No removed name comes back in another tracked file, a commit message or a card.

## Declined findings

## Seals
