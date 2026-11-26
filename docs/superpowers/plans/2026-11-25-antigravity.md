# Native Antigravity support

Goal: G2

Spec: docs/superpowers/specs/2026-11-25-antigravity.md

## Global Constraints

- "quiero todo, quiero poder usar todos los skills y que xworkflows funcione al 100%, el proyecto original de xworkflows esta en ../xworkflows"
- Coexist with Claude Code in the same repository; every existing Claude Code test and behavior must remain green.
- Node standard library only (zero new dependencies); every shipped file is listed in `manifest.json` with its SHA-256 hash; no private user paths in tracked files or fixtures.
- Antigravity tiers in `tiers.json`: `cheap: "flash"`, `medium: "inherit"`, `top: "inherit"`, `strongest: "inherit"`. Never emit concrete model IDs or unmapped tool names into `.agents/agents/*.md`.

## Tasks

### Batch 1: `antigravity-1`

**T1: Antigravity hook adapter (`hooks/adapters/antigravity.mjs`), `tiers.json`, and core hook multi-tool support** (spec 2, items 2, 3, 4)
- Files: `hooks/adapters/antigravity.mjs`, `hooks/adapters/antigravity.test.mjs`, `hooks/adapters/adapters.test.mjs`, `hooks/run.mjs`, `hooks/core/config.mjs`, `hooks/core/ctx.mjs`, `hooks/core/orchestrator.mjs`, `hooks/core/adapt-gates.mjs`, `hooks/core/adapt-record.mjs`, `hooks/core/memory.mjs`, `tiers.json`, `hooks/fixtures/antigravity/*.json`
- Role: implement
- Done: `node --test hooks/` passes, including Antigravity recorded fixtures (`design-first` deny/mark/allow, subagent tracking + `handback` deny/allow, `ask_question` `adapt-record`, `PreInvocation` counter reset, `Stop` memory rebuild).

### Batch 2: `antigravity-2`

**T2: Python workflows for `run_workflow` and multi-tool script support (`adapt`, `dream`, `pending`, `full-review`)** (spec 2, item 5)
- Files: `skills/adapt/research.workflow.py`, `skills/adapt/research.mjs`, `skills/dream/dream.workflow.py`, `skills/dream/extract.mjs`, `skills/pending/triage.workflow.py`, `skills/full-review/full-review.workflow.py`, `skills/antigravity-workflows.test.mjs`
- Role: implement
- Done: `node --test skills/` passes, verifying Python workflow parity (checksum match with `research.mjs`, `dream` analyzer/organizer flow, `pending` chunking, `full-review` merge) and Antigravity transcript extraction.

### Batch 3: `antigravity-3`

**T3: Installer, `doctor`, `uninstall`, `pack`, `skills-travel`, manifest, docs, and live `agy -p` proofs** (spec 2, items 1, 4, 6)
- Files: `bin/xworkflows.mjs`, `bin/antigravity.test.mjs`, `checks/skills-travel.mjs`, `checks/skills-travel.test.mjs`, `manifest.json`, `docs/gaps.md`, `README.md`, installed copies in this repo
- Role: implement
- Done: `node bin/xworkflows.mjs pack --check` prints nothing, `node --test $(git ls-files '*.test.mjs')` passes, `node bin/xworkflows.mjs doctor` exits 0, privacy check passes, and live `agy -p` proves `design-first` deny/allow + `handback` deny/allow + custom agent invocation + Python `run_workflow`.

## Review Focus

- Hook adapter security: symlink checks, subagent isolation (`dream-analyzer`/`dream-organizer` memory-folder boundary, `paths.curated` protection), fail-open on malformed JSON, no `/Users/<name>` leakage in `XWORKFLOWS_RECORD` or fixtures.
- Installer safety: `--tool antigravity` must never overwrite user files or corrupt `.claude/` when coexisting; `uninstall` must remove only `xworkflows-*` keys from `.agents/hooks.json` and leave user hooks/skills/agents untouched.
- Rendered `.agents/agents/*.md`: only valid Antigravity tool names and tier keywords (`flash`/`inherit`), never unmapped tools that could hang subagents.

## Declined findings

## Seals
