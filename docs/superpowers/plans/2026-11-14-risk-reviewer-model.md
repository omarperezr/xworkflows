# The model of the risk reviewer

Goal: G1

Spec: docs/superpowers/specs/2026-11-14-risk-reviewer-model.md

## Global Constraints

- "el revisor de riesgo debe ser con el modelo más fuerte, al menos en la mayoría de los casos, debe ser configurable, hay proyectos donde no es necesario el modelo más avanzado de todos, eso debe ser dicho por el usuario en el momento en el que llegue la desición"
- "Dos opciones (Recommended)": the strongest model, recommended and kept with no answer, and the model of the plain reviewer; the user can type another.
- "Editando una línea (Recommended)": afterwards the user changes the `model:` line of the reviewer's file; no key of the config, no new piece.
- "No, tope en Opus (Recommended)": the step up on a failure ends at `top`.
- "el hecho de que corra 1 sola vez por lote es a lo que me refiero": how often the risk reviewer runs does not change.
- `tiers.json` stays the one file that holds a model name; a role of the package asks for a tier, never for a model.
- The fixed labels and ids of the interview are English; Node standard library only.

## Tasks

### Batch 1: `risk-model-1`

About 30 code lines.

**T1: `tiers.json` has the level `strongest`, the interview of `/adapt` asks which model runs the risk reviewer, and step 4 writes it** (spec section 3)
- Files: `tiers.json`, `skills/adapt/research.mjs`, `skills/adapt/research.test.mjs`, `skills/adapt/SKILL.md`, `skills/day-one.test.mjs`, `docs/design.md`
- Role: implement
- The entry: `strongest`, `fable`, for `claude`. No agent of the package asks for it, and a test holds that.
- The item is `H6-model`, heading 6, a choice, after the `H6-r<n>` items. Its question names the two models, read from `.xworkflows/tiers.json`; its options are those two models, the one of `strongest` first. With no `strongest` entry in that file the item is not in the queue.
- `skills/adapt/SKILL.md` says: the first option of `H6-model` carries `(Recommended)`, as the product's default; a typed model is taken as typed; no answer, `I don't know` or a skip give the model of `strongest`; heading 6 of the summary says the model in one line; step 4 writes the `model:` line from the answer, and the `top` entry where the item was not asked. The line is never left out and never holds the name of a tier.
- `docs/design.md`: the four tiers, the row of `risk-review`, that the step up on a failure ends at `top`, and that the user changes the model by editing the `model:` line.
- Done: `node --test skills/adapt/research.test.mjs skills/day-one.test.mjs skills/method.test.mjs bin/xworkflows.test.mjs` passes.

### Batch 1, fix round after the review of `762bcb6`

Two blocking findings, both in the text of step 4 of `skills/adapt/SKILL.md`; the code, the installer and the tests were found sound. It is the first round of this batch, so none is a repeat.

- `skills/adapt/SKILL.md:136` with `:27`: a re-adapt never asks `H6-model`, and step 4 says to write the `top` entry where the item was not asked, so a re-adapt writes over the model the user chose or edited, without a word. The wording came from task T1 of this plan.
- `skills/adapt/SKILL.md:136` with `:106` and `:110`: step 4 takes the model from the answer of `H6-model` and not from heading 6 as approved, so a correction made at `P-H6` is lost.

What did not block, and task F1 settles because it rewrites the same sentences: a draft saved before this change is resumed without `queue`, so the item is never asked and the reviewer got `top` where the default is `strongest`; the mark `(Recommended)` of the chosen label could be copied into the `model:` line; `skills/adapt/SKILL.md:70` still says the mark goes only on an option backed by a citation; a tier's name typed in `Type something` had no rule.

**F1: step 4 writes the model that heading 6 names as approved, a re-adapt keeps the model the file holds, and the rules of `H6-model` agree with each other**
- Files: `skills/adapt/SKILL.md`, `skills/day-one.test.mjs`
- Role: implement
- Heading 6 names the model in one line. On a first adapt it comes from `H6-model`: the option chosen, without its mark; a model typed, as typed; a tier's name typed stands for that tier's model; no answer, `I don't know` or a skip give the model of `strongest`; with the item not in the queue, the model of `top`. On a re-adapt, where the item is not asked, it is the model the `model:` line of `.claude/agents/risk-review.md` holds now.
- Step 4 writes the `model:` line with the model heading 6 names as approved, so a `Wrong` at `P-H6` corrects it. When heading 6 names none (a draft saved before this change, a file with no such line): the model of `strongest`, or of `top` where `.xworkflows/tiers.json` has no `strongest`. The line is never left out, never a tier's name and never holds a mark.
- The two places that say where `(Recommended)` may go agree: the first option of `H6-model` is the one exception.
- Done: `node --test skills/day-one.test.mjs skills/method.test.mjs skills/adapt/research.test.mjs` passes.

### Batch 1, confirmation at `fa3717c`

A blocking finding stands. The second finding of the review is settled (step 4 takes the model from heading 6 as approved), and so are three of the four points that did not block. The first finding is settled only in part: `skills/adapt/SKILL.md:106` (Playback, step 1) says the model of `top` "when the item is not in the queue" and, in the same sentence, the model the file holds on a re-adapt; on a re-adapt and for a draft saved before this change the item is never in the queue, so both clauses match and two sentences of the skill give two results. It is the finding of the first round in another sentence: a repeat.

Possible design error in skills/adapt/SKILL.md (Playback, step 1)

Root cause: the rule that gives the risk reviewer its model is said as prose in three places of the skill (how the item is asked, heading 6 of the playback, step 4), each with its own list of cases, and the only test of that text holds that the sentences are there, so it cannot see two clauses that overlap. Each round moved the overlap to another sentence.

The design that removes it at the root: the rule is one function of `skills/adapt/research.mjs` with a table test of every case, and the skill says no case at all: heading 6 names the model the script prints, and step 4 writes the model heading 6 names.

The owner, 2026-11-14, asked redesign or one more patch: "Rediseñar: regla en código (Recommended)".

What did not block: the spec's point 5 still said step 4 writes the line from the answer; the same commit as this section corrects it.

**F2: one function of `research.mjs` gives the model of the risk reviewer, with a table test of every case, and the skill names no case**
- Files: `skills/adapt/research.mjs`, `skills/adapt/research.test.mjs`, `skills/adapt/SKILL.md`, `skills/day-one.test.mjs`
- Role: implement
- The command is `research.mjs model [<text>]`; it prints one model name and nothing else. The order of the rule: a text given as argument (a correction at `P-H6`); else the answer of `H6-model` of this run when it names a model; else, on a re-adapt, the model the `model:` line of the existing `.claude/agents/risk-review.md` holds; else the model of `strongest`; else the model of `top`. A tier's name stands for that tier's model, the mark `(Recommended)` is never part of a name, and `I don't know`, a skip and no answer name no model. With neither entry in `.xworkflows/tiers.json` the command exits 1 and names that file.
- The skill says: heading 6 names the model that command prints; a correction at `P-H6` goes through the same command with the owner's text; step 4 writes the model heading 6 names as approved, and where it names none, the model the command prints. No other sentence of the skill says which model.
- Done: `node --test skills/adapt/research.test.mjs skills/day-one.test.mjs skills/method.test.mjs` passes.

### Batch 1, confirmation at `bb00ebc`

No blocking finding stands. The rule is the function `riskModel` of `skills/adapt/research.mjs`, in the order of task F2, and the skill names no case: no two of its sentences give two results. The command was run for 46 cases in temp projects: it never printed an empty line, a tier's name, the mark or two lines, and every failure ended in one line and an exit code. The table test holds 21 rows, and seven changes made to the function on purpose each made a test fail. A re-adapt whose file holds `model: sonnet` gives `sonnet`; a draft saved before the item existed gives the model of `strongest`; a correction at `P-H6` reaches the file.

What did not block, one card each: P-171 (the re-adapt line of step 1 does not send the agent to the command), P-172 (no step for the command's exit 1), P-173 (a BOM, quotes or a comment in the file's `model:` line, and no row with Windows line ends), P-174 (a mark translated into another language), P-175 (a correction that names a tier the table lacks is dropped). The spec's point 9 still decided a case; the commit of this section corrects it.

## Review Focus

- An interview begun before this change (a draft with its answers) must still end: the new item must not lose an answer or block the approval for ever.
- The installer reads every entry of `tiers.json`: the new entry must not change what install writes for an agent of the package, nor what an upgrade takes for retired.
- The `model:` line of the risk reviewer is never empty and never a tier's name: with no valid line the agent runs on the model of the conversation without a word.
- With no answer the model is the strongest one; the user is asked once.

## Declined findings

## Seals
review ok at bb00ebc
review ok at fe52539
