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

## Review Focus

- Every main session follows the `orchestrate` text to the letter: a sentence that reads two ways is followed the wrong way. A repeat must never read as a stop by itself; only the owner's answer holds a fix back.
- The limit of two rounds and what follows it must say what they say today.

## Declined findings

## Seals
