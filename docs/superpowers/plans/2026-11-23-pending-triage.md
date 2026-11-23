# /pending triage

Goal: G1

Spec: docs/superpowers/specs/2026-11-23-pending-triage.md

## Global Constraints

- "Principalmente para proyectos diferentes, recuerda que xworkflows se utiliza en otros proyectos": nothing may assume this repository's card wording; read `paths.pending` and the cheap model from `.xworkflows/tiers.json` through the defaults module.
- Only `Status: unscheduled` cards are judged; ordered work is never judged (spec 2, items 3 and 4).
- The three row lines of `## The bar` in `skills/pending/SKILL.md` stay byte-identical: `skills/triage-bar.test.mjs` checks them.
- Node standard library only; every installed file is a manifest piece with its hash.

## Tasks

### Batch 1: `pending-triage-1`

**T1: `triage.mjs list` prints the unscheduled cards and the skipped ones as JSON; `triage.mjs drop --cards P-1,P-2` deletes exactly those cards from the list** (spec 2, items 3 and 6)
- Files: `skills/pending/triage.mjs`, `skills/pending/triage.test.mjs`
- Role: implement
- Done: `node --test skills/pending/triage.test.mjs` passes; it covers a scheduled and an in-progress card left out and named, a malformed card named and kept, and `drop` of an unknown number refused with the list unchanged.

**T2: a fixed Workflow that judges the cards, 20 per agent in parallel, and the read-only agent it runs** (spec 2, item 4)
- Files: `skills/pending/triage.workflow.js`, `agents/pending-triage.md`, `skills/pending/triage-workflow.test.mjs`
- Role: implement
- Done: `node --test skills/pending/triage-workflow.test.mjs` passes; it covers 45 cards cut into 3 agents, a card an agent did not return reported as not judged, and an `ordered` card carrying no row. The agent has only `Read, Grep, Glob`.

**T3: `## Triage` in the pending skill: the one question, the pages of 12, the answer, the one commit** (spec 2, items 1, 2, 5, 6, 7)
- Files: `skills/pending/SKILL.md`
- After: T1, T2
- Role: implement
- Done: `node --test skills/` passes, and `grep -c "## Triage" skills/pending/SKILL.md` prints 1.

**T4: the new files in the manifest, hashes packed, the own copy installed** (spec 2, item 8)
- Files: `manifest.json`, the installed copy under `.claude/` and `.xworkflows/`
- After: T3
- Role: implement
- Done: `node bin/xworkflows.mjs pack --check` prints nothing, `node bin/xworkflows.mjs doctor` exits 0, and the full `node --test` passes.

## Review Focus

- `drop` rewrites the pending list: a parse slip deletes a card the owner kept, or the wrong one. Only the named numbers may go.
- A card's cited path comes from the list's text: the agent only reads it; nothing runs it or writes there.

## Declined findings

## Seals
review ok at 54cb519
