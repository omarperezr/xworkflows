# Triage at birth: one bar sorts every review finding

Goal: G1

Spec: none; card P-239 of docs/PENDING.md and the owner's answers below are the whole design (grill, 2026-11-22).

## Global Constraints

- The problem, in the owner's words: "lo que mas me molesta es la lista de pendientes llenandose de basura ... la sobreingeniería que ocurre con casos que son o imposibles o practicamente imposibles o completamente inconsecuentes ... es cierto que es importante mencionarlos y yo decidir por cada uno pero no todos merecen una solucion inmediata y no todos merecen una tarjeta".
- The bar, three rows, these exact lines in every file that carries it (the reviewer sets the row on each report line; the report keys stay `blocking` and `pending`, only `drop` is new):
  - `blocking`: a real error on a path that really happens, that breaks the app or touches money, permissions or data.
  - `pending`: a real error on a reachable path, worth fixing but not in this batch; it becomes a card.
  - `drop`: impossible, practically impossible, or inconsequential (a very unlikely scenario whose consequence is minimal, seen at once, or easily avoided); it is not written, it stays only in the report.
- At the end of each batch the owner gets ONE question listing every `pending` and `drop` finding with its row already set; the owner answers as set or moves any. No non-blocking finding, no question.
- From the second review round of a batch, only an error the batch introduced (in lines the branch added or changed) blocks. An older error found on the way is triaged `pending` or `drop`; when it is about money or data the owner hears at once. Round 1 is unchanged.
- Unchanged: a `blocking` finding still needs `red: <test path> <command>` from the verifier; two fix rounds at most.
- Everything shown to the owner, proof included: "un lenguaje extremadamente facil de entender, conciso y sin obviar detalles".

## Tasks

### Batch 1: `triage-bar-1`

**T1: the full bar, with real examples of this repository per row** (card P-239)
- Files: `skills/pending/SKILL.md`
- Role: implement
- A section `## The bar` with the three lines verbatim, then two or three real examples per row: `drop` from the cards the owner dropped (`git show 3f9026c^:docs/PENDING.md`, `git show 5bf3bfb^:docs/PENDING.md`, the reasons in each commit body), `pending` and `blocking` from cards closed as fixed (`git log --grep 'closes P-'`). Each example names its `P-<n>`, so T3 can leave it out. The Add section says a `drop` finding gets no card.
- Done: `grep -c '^## The bar' skills/pending/SKILL.md` prints 1, and the three lines of Global Constraints appear verbatim.

**T2: every reviewer and orchestrate carry the bar; a test keeps the lines identical** (card P-239)
- Files: `agents/review.md`, `agents/review-small.md`, `agents/zone-review.md`, `.claude/agents/risk-review.md`, `skills/adapt/SKILL.md`, `skills/full-review/SKILL.md`, `skills/orchestrate/SKILL.md`, `docs/design.md`, `skills/triage-bar.test.mjs`
- Role: implement
- Reviewers: the three lines verbatim replace "only an error of the app, money, permissions or data is blocking"; report line `<blocking|pending|drop> path:line ...`; in a fix round, an error outside the lines the branch added or changed is never `blocking`. Risk reviewer (template in `skills/adapt/SKILL.md` under `risk-review` agent, and this repo's own `.claude/agents/risk-review.md`): a failed checklist line is set by the bar, no longer always `blocking`. `zone-review` and full-review: each error carries its row; a `drop` error gets no card. Orchestrate (`skills/orchestrate/SKILL.md:87-99`): the three lines, the one end-of-batch question, the second-round rule, money or data heard at once. `docs/design.md`: wherever it names the report keys.
- Test: reads `skills/pending/SKILL.md` and every file above that carries the bar, and fails when any of the three lines differs or is missing.
- Done: `node --test skills/triage-bar.test.mjs` passes; `node --test $(git ls-files '*.test.mjs') skills/triage-bar.test.mjs` passes.

**T3: proof before use** (card P-239, after T1)
- Files: none in the repository; the agent's input and answers stay in the session scratchpad.
- Role: main session, with one agent of the cheapest tier in `.xworkflows/tiers.json`.
- The agent gets only the bar of `skills/pending/SKILL.md` and, without being told which is which, the 43 dropped cards (36 of 3f9026c, 7 of 5bf3bfb) and the 43 newest cards closed as fixed, minus any card T1 used as an example (replaced by the next one). It returns one row per card.
- No thresholds. Each card on the opposite side (fixed and set `drop`, dropped and set `blocking` or `pending`) goes to the owner in plain words: what the card said, which row it got, why. The owner says for each whether it was right or not. Only the ones the owner calls wrong change the examples of T1, and only those are run again.
- Done: the owner has judged every opposite card, and the examples hold each answer.
- Owner, 2026-11-22: "las 30 a 36 no cuentan" — P-198, P-204, P-217, P-220, P-222, P-224, P-227 were work the owner ordered, not review findings; the bar never judges them. They are out of the proof, and no example of the bar comes from them. A rerun of the proof samples only cards that came from a review.
- Owner, 2026-11-22, on the 37 other opposite cards (proof run: 40 dropped and 36 fixed review cards, haiku): "todo bien". No example of the bar changes. The six dropped cards the bar set `blocking` (P-137, P-138, P-209, P-214, P-215, P-230): "No, siguen tiradas".
- Owner, 2026-11-22: the own copy of the method in this repository is refreshed whole (22 files, 15 of them from earlier batches never copied), "si".

After T1 to T3 the main session refreshes this repo's own copy of the method (as 7394a87 did), runs `node bin/xworkflows.mjs pack` and commits the manifest; `node bin/xworkflows.mjs pack --check` prints nothing and the tests pass.

## Review Focus

- A real error set `drop` is lost for good: it never becomes a card. Check that the bar's lines and examples cannot send a reachable data, money or permission error there.
- Second-round rule: an error in lines the branch did not add or change must not block, and a money or data one must still reach the owner at once.
- Reports and tools that read the keys `blocking` and `pending` keep working with the new `drop`.

## Declined findings

## Seals
review-small ok at 68f00fe
