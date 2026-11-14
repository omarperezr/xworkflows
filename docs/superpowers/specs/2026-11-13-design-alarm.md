# The early line for a possible design error

Card P-119.

## 1. The deepened request

- Request: in the review of a batch, the second finding in the same place, blocking or not, produces the line `Possible design error in <place>` and one answer: does a design exist that removes this class of error? The stop after two rounds stays. Done: a batch with a repeated finding leaves the line in its plan; a batch with none leaves nothing.
- Adds: "the same place" needs a definition that does not depend on opinion.
- Adds: the confirming reviewer reads only the last change, so someone must keep the count between rounds.
- Adds: a line that always stops the work is ignored or abused.
- Material: the two-round rule is in `skills/orchestrate/SKILL.md:87` and `docs/design.md:89` (read not tested).
- Material: every finding already carries `path:line` (`agents/review.md:26`), so "same file" is checked by text; "same function" is not (read not tested).
- Material: the report hook cannot tell a first review from a confirmation (`hooks/core/handback.mjs:29`) (read not tested).
- Material: no test pins the text of the review rounds (read not tested).
- Methods: A, a written rule in `orchestrate`, where the main session compares the rounds. B, A plus a new report key that the hook requires.
- Proof: a known rule uses three failed fixes and a full stop (the `systematic-debugging` skill of the superpowers plugin, `SKILL.md:195`); this one warns earlier and does not stop (read not tested).

Seen on cleanup-b-3: three reviews in a row found holes in `writesSummary` of `hooks/core/adapt-gates.mjs`, none blocking, so the two-round rule never fired; the loop of retired files in `bin/xworkflows.mjs` got a blocking finding, its fix, a blocking sibling, its fix, and a third sibling.

## 2. The rule

1. **The place.** Every finding of a reviewer names the function or section it is in, after its `path:line`. The place of a finding is that function; when the reviewer names none, it is the file.
2. **A repeat.** A finding is a repeat when an earlier round of the same batch had a finding in the same place. Blocking and pending findings both count. Two findings of one round are not a repeat. The count covers every round of the batch, the last confirmation included, and stops at the batch.
3. **Who keeps the count.** The main session. When it dispatches a confirmation it names, with the findings, the place of each one. It asks the confirming reviewer one more thing: for a new finding in one of those places, give the root cause, and the best design that removes this class of error at the root if one exists, with what it costs.
4. **The line.** When the main session sorts the findings of a round and one is a repeat, it writes in the plan, in the section of that batch, alone on its line: `Possible design error in <place>`. Under it go the root cause and the alternative design, or the reason none exists.
5. **What follows.**
   - An alternative design exists: the main session asks the owner in the question dialog, with that design: redesign, or patch once more. Redesign replaces the fix by a redesign task in the plan. No fix in that place is dispatched before the answer.
   - None exists: the reason stays under the line and the fix goes on, with no question.
6. **Unchanged.** Two rounds at most; a blocking finding that still stands after the second goes to the owner: fix, accept or revert.

## 3. Where it is written

- `skills/orchestrate/SKILL.md`, section Review: the sorting of findings, the confirmation prompt, the line and what follows.
- `agents/review.md`: every finding names its function or section.
- `skills/adapt/SKILL.md`: the same sentence in what `/adapt` writes for the risk reviewer.
- `docs/design.md`: the rule beside the two-round limit.
- No hook, no check and no report key changes. The line is fixed English, like the seal line.

## Owner's answers

Asked on 2026-11-13.

- The same place: the same function; the file when the reviewer names no function.
- Who writes the line: the main session, by a written rule, with no new hook.
- What happens when the line appears: "Responder y preguntarte si hay un mejor diseno, analizar y dar la mejor alternativa de diseno que resuelva los problemas de raiz si existe y dar la opcion de parchar".
- From where repeats are counted: inside the batch.
- Confirmed with it: repeats count between rounds only; the confirming reviewer does the analysis in its own run; with no better design the reason is noted and the fix goes on; a redesign replaces the fix by a task in the plan.
