# The model of the risk reviewer

Goal: G1

## 1. The request, deepened

Request: the risk reviewer of each project runs by default on the strongest model, one level above the plain reviewer. The user chooses it when `/adapt` reaches that point, and can change it afterwards. Done when: a test holds the new level in `tiers.json`; the text of `/adapt` says to ask and to write the model the answer gives; the interview's own test holds the new question.

Adds:
- A fourth level in `tiers.json`, the one file that holds model names. Today it has `cheap`, `medium` and `top`.
- An account that cannot use that model: Claude Code runs the agent on another one by itself and warns; nothing breaks.
- A project already adapted does not change by itself.
- The step up on a failure ends at `top` today; the design says whether it reaches the new level.

Material:
- `skills/adapt/SKILL.md:135`: `/adapt` writes `model:` with the `top` entry; step 4 asks nothing. The owner's approval is step 3 (`:108`; `P-H6` covers the risk paths) | read not tested
- `bin/xworkflows.mjs:444` (`tierToModel`) and `:472` (`published`) read `tiers.json` | read not tested
- `tiers.json`: `cheap` haiku, `medium` sonnet, `top` opus | tested (`cat tiers.json`)
- Tests on the tiers: `bin/xworkflows.test.mjs:670` and `:3097`; neither names the three keys | read not tested
- `proof/answers.mjs:36-47`: the proof harness answers a question of `/adapt` by its id, and an id it has no answer for gets `I don't know` | read not tested
- `docs/design.md:233-245`: the three tiers and the table of agents; `risk-review` = `top` | read not tested

Methods:
- The chosen model lives in the `model:` line of the reviewer's file; to change it is to edit that line. The least that works.
- Or a key of `.xworkflows/config.json` that `/adapt` applies: more pieces.

Proof:
- `model` takes `sonnet`, `opus`, `haiku`, `fable`, a full model id or `inherit`; with no line the agent runs on the model of the conversation | https://code.claude.com/docs/en/sub-agents | read not tested
- The alias `best` "Uses the same model as `opus`": no alias means "the strongest", so the package names `fable` | https://code.claude.com/docs/en/model-config | read not tested
- A model the account may not use: the agent runs on another of the family, or on the model of the conversation, with a warning | https://code.claude.com/docs/en/sub-agents | read not tested
- An alias Claude Code does not know: not confirmed

## 2. The owner's answers, 2026-11-14

- "Mantengamos el revisor de riesgo como Fable".
- "el hecho de que corra 1 sola vez por lote es a lo que me refiero, corre menos que todos los demás agentes y corre solo para revisar": how often the risk reviewer runs does not change.
- "el revisor de riesgo debe ser con el modelo más fuerte, al menos en la mayoría de los casos, debe ser configurable, hay proyectos donde no es necesario el modelo más avanzado de todos, eso debe ser dicho por el usuario en el momento en el que llegue la desición".
- What `/adapt` offers: "Dos opciones (Recommended)": the strongest model, which is the recommended one and the one that stays with no answer, and the model of the plain reviewer. The user can always type another model.
- How it is changed afterwards: "Editando una línea (Recommended)": the `model:` line of `.claude/agents/risk-review.md`. No new piece.
- Whether the step up on a failure reaches the new level: "No, tope en Opus (Recommended)".

## 3. The design

1. `tiers.json` gets a fourth entry for `claude`: `strongest`, `fable`. No agent of the package asks for it: `review` and `zone-review` stay `top`. The step up on a failure still ends at `top`.
2. The interview of `/adapt` gets one item, `H6-model`, under heading 6, asked after the `H6-r<n>` items: which model runs the risk reviewer of this project. Two options, in this order: the model of the `strongest` entry, and the model of the `top` entry, which is the plain reviewer's. The question names both models, read from `.xworkflows/tiers.json`. The first option carries `(Recommended)`: it is the product's default, not a guess of research, and the rule on `(Recommended)` says so for this one item. A model typed in `Type something` is taken as typed.
3. With no answer, `I don't know` or a skip, the model is the one of `strongest`.
4. The summary says under heading 6, in one line, which model the risk reviewer runs on, so `P-H6` covers it and a `Wrong` there corrects it.
5. Step 4 writes the `model:` line of `.claude/agents/risk-review.md` from that answer: the `strongest` entry, the `top` entry, or the model typed.
6. A project whose `.xworkflows/tiers.json` has no `strongest` entry is not asked, and its risk reviewer gets the `top` entry as today.
7. To change it afterwards the user edits the `model:` line. `docs/design.md` says so.
8. A project already adapted keeps its file. A re-adapt does not ask the item, as it does not ask the `H6-r<n>` items: heading 6 names the model the file's `model:` line holds, and step 4 keeps it unless the owner corrects it at `P-H6`.
9. Step 4 takes the model from heading 6 as approved, never straight from the answer. Where heading 6 names none, the model is the one of `strongest`, or of `top` where the project's tiers file has no `strongest`.

## 4. Not in this change

- No key in `.xworkflows/config.json` and no line of doctor about the model.
- No entry for the tools other than Claude Code: `tiers.json` holds `claude` only.
- The installer's code does not change: it reads the entries of `tiers.json` whatever their names.
- The proof harness does not change: an id it has no answer for gets `I don't know`, which gives the default.
