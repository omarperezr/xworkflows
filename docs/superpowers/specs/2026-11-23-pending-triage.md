# /pending triage: the bar on the cards already in the list

Goal: G1, G3

## 1. The request

Request: a command, `/pending triage`, that applies the bar of `skills/pending/SKILL.md` (`## The bar`) to the cards already in the pending list, so the list can be cleaned from time to time. Mainly for other projects that use xworkflows, and for cards written before the bar existed (P-251). Done: in a project with unscheduled cards, `/pending triage` asks once, judges them on the cheap tier, shows them to the owner in numbered pages of at most 12, and on his answer deletes the `drop` cards in one commit and names the `blocking` ones.

Material:
- The bar has three rows, `blocking`, `pending`, `drop`, with seven examples (`skills/pending/SKILL.md:30-46`). Today it runs only on a finding when it is raised. `read not tested`
- A card is `- **P-<n>** — <text>. Origin: <where>. Status: <unscheduled | scheduled | in progress on <branch>>.` (`skills/pending/SKILL.md:22`). `Origin:` is free text: a review file, a plan, a spec by path, or `review of <branch>, <date>` (`skills/pending/SKILL.md:27`). So the text alone cannot tell a review finding from ordered work in another project. `read not tested`
- Cards alone are committed with `git commit -m "docs: pending, <what changed>" -- <paths.pending>`, no push (`skills/pending/SKILL.md:95-97`). A card is deleted in the commit whose message says `closes P-<n>`. `read not tested`
- The owner's one-time test of 2026-11-23: a cheap agent applied the bar blind to 83 cards; the owner judged the 44 that landed on the other side, shown in plain words, and answered "todo bien". Work the owner ordered was ruled out of the sample.
- In this repository today: 9 open cards, 6 from reviews, 2 from a plan, 1 ordered by the owner.

## 2. Design

1. **Only by hand.** It runs when the owner types `/pending triage`. No session-start suggestion.
2. **One question first.** Before any spend it asks once: how many cards will be judged, how many agents, and on which model. On no, nothing happens.
3. **Which cards.** Only cards with `Status: unscheduled`. Scheduled and in-progress cards are named apart and never touched.
4. **Who judges.** A fixed Workflow script (never an inline script) runs one cheap-tier agent per 20 cards, in parallel. Each agent, per card:
   - says whether it is a review finding or work someone ordered. Ordered work is not judged; it is listed apart with its reason, and the owner may correct it;
   - reads the file and line the card cites. When that code is gone, the card is proposed as `drop` with that reason;
   - sets each finding to one row of the bar, with a short plain reason.
   A card an agent did not judge stays as it is and is named.
5. **The owner judges.** Plain numbered text in chat, in the owner's language, in pages of at most 12, each line: the card, its row, why. The row words stay English. He answers "así" or moves numbers; then the next page.
6. **After the answer.** `drop` cards are deleted in one commit at the end that touches only the pending list and says `closes P-…`. `blocking` cards are named to the owner as the next work. `pending` cards do not change. If the owner stops midway, what he already answered is committed.
7. Claude Code only, like `/dream`.
8. Everything installed keeps the rules of this project: Node standard library, manifest pieces with their hash, values from `.xworkflows/config.json` (the pending path from `paths.pending`, the model from `tiers.json`), nothing private in a tracked file.

## Questions for the owner

- Q1, what for. Q2, which cards. Q3, after the answer. Q4, who judges. Q5, origin. Q6, long lists. Q7, old code. Q8, when. Q9, status. Q10, commit. Q11, confirm. Q12, split.

## Owner's answers

- Q1: "Limpiar de vez en cuando", "Tarjetas antiguas", "Principalmente para proyectos diferentes, recuerda que xworkflows se utiliza en otros proyectos".
- Q2: "Sólo de revisión (Recommended)". Q3: "Así (Recommended)". Q4: "Agente barato (Recommended)".
- Q5: "El agente decide (Recommended)". Q6: "Tandas de 12 (Recommended)". Q7: "Sí, mirar el código (Recommended)". Q8: "Sólo a mano (Recommended)".
- Q9: "Sólo sin planificar (Recommended)". Q10: "Un commit al final (Recommended)". Q11: "Sí, preguntar antes (Recommended)". Q12: "20 por agente, guion fijo (Recommended)".
- The summary of items 1 to 7, with the unasked assumptions (an unjudged card stays and is named; Claude Code only; the list in the owner's language, rows in English): "si" (2026-11-23).
