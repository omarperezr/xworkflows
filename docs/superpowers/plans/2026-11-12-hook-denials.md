# The orchestrator hook: three false denials

Goal: G1

Spec: `docs/superpowers/specs/2026-11-12-hook-denials-design.md`

## Global Constraints

- "el registro de hooks tiene 0 negaciones falsas"
- "Ningún nombre, ruta ni término de negocio de mis proyectos en archivos con seguimiento."
- No agent of this plan runs the `claude` command or calls a model API.

## Tasks

### Batch 1: `hook-denials-1`

About 30 code lines. The reviewer is `risk-review`: `hooks/` is a risk path.

**T1: the three cases of the spec, each with its test, and the denials that must stay** (spec, whole)
- Files: `hooks/core/orchestrator.mjs`, `hooks/core/orchestrator.test.mjs`
- Role: implement
- Done: `node --test hooks/core/orchestrator.test.mjs` passes.

**T2: the package and this repository's own copy**
- Files: `manifest.json`, `.xworkflows/hooks/core/orchestrator.mjs`, `.xworkflows/installed.json`
- Role: main session
- Done: `node --test $(git ls-files '*.test.mjs')` passes, `node bin/xworkflows.mjs pack --check` prints nothing and `node bin/xworkflows.mjs doctor` exits 0.

## Review Focus

- The hook must never trap an agent: broken or unknown input still lets the call through.
- Each narrowed rule still denies what it exists to stop: a long read of code in the main session, a lookup with no index query, a second paid risk review of the same commit.
- A command is text from the model: no pattern may run it, and no pattern may take a time that grows badly with its length.

## Declined findings

## Seals
