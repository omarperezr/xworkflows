# /pending triage

Goal: G1

Spec: docs/superpowers/specs/2026-11-23-pending-triage.md

## Global Constraints

- "Principalmente para proyectos diferentes, recuerda que xworkflows se utiliza en otros proyectos": nothing may assume this repository's card wording; read `paths.pending` and the cheap model from `.xworkflows/tiers.json` through the defaults module.
- Only `Status: unscheduled` cards are judged; ordered work is never judged (spec 2, items 3 and 4).
- The three row lines of `## The bar` in `skills/pending/SKILL.md` stay byte-identical: `skills/triage-bar.test.mjs` checks them.
- Node standard library only; every installed file is a manifest piece with its hash.
- Name clashes (owner, 2026-11-23): "asume que la gente sabe lo que hace ... lo maximo que podemos hacer es hacerles saber al instalar que nuestras herramientas tienen los nombres que tienen si hay algun choque con otro nombre se hace saber y que no va a funcionar bien a menos que se especifique bien cuando usar que herramienta, no hagamos demasiados arreglos alrededor de esos casos". So review findings 1 and 2 of round 1 (a kept or renamed `dream` or `pending` skill) are `drop`.

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

**T5: fixes from review round 1, moved into this batch by the owner** (spec 2, items 2, 4, 6)
- Files: `skills/pending/triage.mjs`, `skills/pending/triage.test.mjs`, `skills/pending/triage.workflow.js`, `skills/pending/triage-workflow.test.mjs`, `skills/pending/SKILL.md`, `manifest.json`, the installed copy under `.claude/` and `.xworkflows/`
- After: T4
- Role: implement
- (3a) Remove the chunk retry and `modelUp`: a failed chunk's cards go to `notJudged` only. Owner: "a".
- (4) Triage step 6: the closes commit carries each dropped card's reason in its body, as `## Close` asks.
- (5) Triage step 1: with `cards` empty, still name the `skipped` and `malformed` cards before stopping.
- (6) Remove the unused `line` field from `list`.
- Done: `node --test skills/pending/` passes, `node bin/xworkflows.mjs pack --check` prints nothing, the full `node --test` passes.

## Review Focus

- `drop` rewrites the pending list: a parse slip deletes a card the owner kept, or the wrong one. Only the named numbers may go.
- A card's cited path comes from the list's text: the agent only reads it; nothing runs it or writes there.

## Declined findings

## Seals
review ok at 54cb519
