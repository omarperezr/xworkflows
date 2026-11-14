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

## Review Focus

- An interview begun before this change (a draft with its answers) must still end: the new item must not lose an answer or block the approval for ever.
- The installer reads every entry of `tiers.json`: the new entry must not change what install writes for an agent of the package, nor what an upgrade takes for retired.
- The `model:` line of the risk reviewer is never empty and never a tier's name: with no valid line the agent runs on the model of the conversation without a word.
- With no answer the model is the strongest one; the user is asked once.

## Declined findings

## Seals
