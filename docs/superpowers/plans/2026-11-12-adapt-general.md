# Adapt, general: the real build

Goal: G1

Spec: `docs/superpowers/specs/2026-11-12-adapt-general-design.md`

## Global Constraints

- "Sí, la nueva": built with three fixes, short sentences on the screen, the detail the shipped version has, and the question "this rule may be wrong".
- "32 are way too many, and the language that you're using is not easy to understand and it's not concise."
- "Aparte, si lo pides": the detail is not on the screen.
- "Nunca ajustes con los proyectos de examen. Cada versión pasa por el examen una vez." Tuning uses the reference copy only, two rounds at most.
- "Dinero: sólo los créditos gratis. Arnés con --api-credits." No agent of this plan runs the `claude` command or calls a model API.
- "Ningún nombre, ruta ni término de negocio de mis proyectos en archivos con seguimiento." No example in a prompt comes from the reference project.

## Tasks

### Batch 1: `adapt-general-1`

About 700 code lines: the Workflow script is rewritten whole and cannot be cut smaller. If `change-size` refuses the push, a commit carries `size-ok: one script rewritten whole`.

**T1: the research Workflow: areas, mechanism kinds for the detail, the doubted rule, the plain pass** (spec "Research", "Data")
- Files: `skills/adapt/research.workflow.js`, `skills/adapt/workflow.test.mjs`
- Role: implement
- Start from `git show phase-1-adapt-general:skills/adapt/research.workflow.js`. Keep the shipped mechanism agents and the `zeroHits` argument that `hooks/core/adapt-gates.mjs` checks. The owner's language arrives in `args.language`.
- Done: `node --test skills/adapt/workflow.test.mjs` passes.

**T2: three screens, the detail file and the queue, from verified citations** (spec "Render", "Interview", "Data")
- Files: `skills/adapt/screens.mjs`, `skills/adapt/screens.test.mjs`, `skills/adapt/research.mjs`, `skills/adapt/research.test.mjs`
- Role: implement
- Start from `git show phase-1-adapt-general:skills/adapt/research2.mjs` and its test. `render` writes `research.md`, `screens.json`, `details.md` and still `kinds.json`; `queue` builds `interview.json` from `screens.json`; `check` does not change. Remove from `research.test.mjs` the tests of the old Workflow script and of the old queue. No output file is written through a symlink.
- Done: `node --test skills/adapt/screens.test.mjs skills/adapt/research.test.mjs` passes.

**T3: the skill's text: the research step, the three screens, what each answer writes** (spec "Interview")
- Files: `skills/adapt/SKILL.md`
- Role: implement
- Steps 2 to 4 only. `research-only` still stops after `render`.
- Done: `grep -c "screens.json" skills/adapt/SKILL.md` prints 1 or more and `grep -ciE "topic [1-6]" skills/adapt/SKILL.md` prints 0.

**T4: the gate knows the new run files** (spec "Interview", last line)
- Files: `hooks/core/adapt-gates.mjs`, `hooks/core/adapt-gates.test.mjs`
- Role: implement
- `screens.json` and `details.md` join the files an agent may not write directly. Nothing else changes unless a test of the new run shows it must.
- Done: `node --test hooks/core/adapt-gates.test.mjs` passes.

**T5: the package and this repository's own copy**
- Files: `manifest.json`, `.claude/skills/adapt/`, `.xworkflows/installed.json`
- Role: main session
- Run `pack`, then `install --yes` here.
- Done: `node --test $(git ls-files '*.test.mjs')` passes, `node bin/xworkflows.mjs pack --check` prints nothing and `node bin/xworkflows.mjs doctor` exits 0.

**T6: the cards of the old research and queue**
- Files: `docs/PENDING.md`
- Role: main session
- Done: each card from P-1 to P-17, P-19, P-29 and P-30 is deleted by a commit that says `closes P-<n>`, or names a file and a line that still exist.

### Batch 2: `adapt-general-2`

About 40 code lines.

**T7: the harness keeps the new files of a run**
- Files: `proof/harness.mjs`, `proof/proof.test.mjs`
- Role: implement
- A research-only trial also copies `screens.json` and `details.md`.
- Done: `node --test proof/proof.test.mjs` passes.

**T8: the measure** (spec "Measure")
- Files: none with tracking; the numbers go in the private ledger.
- Role: main session
- Done: the ledger holds, for 3 runs on the reference copy and 3 on exam project C: the sentences on screen 1, the invariants found with and without the detail, the owner's marks and the cost per run; the spend stays under its cap.

## Review Focus

- A citation that did not verify never reaches a screen, the detail file or a written rule.
- `adapt-gates` still denies a direct write of every run file, and a `research.json` altered after the Workflow is refused.
- No output file is written through a symlink; no path of this machine lands in a file with tracking.
- A model call happens only inside the skill's Workflow or the harness with `--api-credits`.
- A short sentence can say more than its rule. No script can judge that: the prompt of the `plain` agent and the detail file are the guard.

## Declined findings

## Seals
