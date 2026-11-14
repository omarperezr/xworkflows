# The early line for a possible design error

Goal: G1

Spec: docs/superpowers/specs/2026-11-13-design-alarm.md

## Global Constraints

- "si un arreglo no paso o genera otro deberiamos decir 'Posible error de diseno en _______' en vez de estar parcheando"
- "Responder y preguntarte si hay un mejor diseno, analizar y dar la mejor alternativa de diseno que resuelva los problemas de raiz si existe y dar la opcion de parchar"
- The line is fixed English, written exactly: `Possible design error in <place>`.
- No new hook, no new check, no new report key. The rule of two rounds at most reads as it does today.

## Tasks

### Batch 1: `design-alarm-1`

Estimated code lines: 0. The batch changes method text and adds one test file.

**T1: the review of a batch names a possible design error at the second finding in one function** (spec sections 2 and 3)
- Files: `skills/orchestrate/SKILL.md`, `agents/review.md`, `skills/adapt/SKILL.md`, `docs/design.md`, `skills/design-alarm.test.mjs`
- Role: implement
- The test pins, in each of the three method files, the sentence that carries the rule: the fixed line in `orchestrate`, and the sentence that makes a finding name its function in the reviewer and in what `/adapt` writes for the risk reviewer.
- Done: `node --test skills/design-alarm.test.mjs` passes, and `node --test "skills/**/*.test.mjs"` passes.

**T2: this repository's own risk reviewer names the function of each finding**
- Files: `.claude/agents/risk-review.md`
- Role: main session
- Done: the file holds the sentence T1 put in `skills/adapt/SKILL.md` for the risk reviewer.

### Batch 1, fix round after the review of `d58b439`

One blocking finding and five that do not block; a first review, so none is a repeat.

- Blocking: the line rule and the hold before the owner's answer stood under step 5, after step 4 dispatches the fix. They move under step 3, where the repeat is found.
- The place of a finding is its file and the function or section it names; the file alone when it names none.
- The confirmation prompt asks the reviewer for the cause and the design; the sentence said it as a fact about the reviewer.
- Step 6: after the second round, a repeat that has a design adds redesign to the owner's options.
- `agents/review.md` says the rule once, in the form of a finding. Decided by the main session.
- The test pins the sentences that make the line act, not only the line.

**G1: the hold stands before the fix, and the rule reads one way**
- Files: `skills/orchestrate/SKILL.md`, `agents/review.md`, `docs/design.md`, `skills/design-alarm.test.mjs`
- Role: implement
- Done: `node --test skills/design-alarm.test.mjs` passes.

## Review Focus

- Every main session follows the `orchestrate` text to the letter: a sentence that reads two ways is followed the wrong way. A repeat must never read as a stop by itself; only the owner's answer holds a fix back.
- The limit of two rounds and what follows it must say what they say today.

## Declined findings

## Seals
