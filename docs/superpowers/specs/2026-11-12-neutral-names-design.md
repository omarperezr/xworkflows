# Neutral names in tracked files (design)

Status: decided by the owner on 2026-11-12 ("neutraliza"), card P-28.

## The request, deepened

Request: Remove from the tracked files the names of the reference project's files and modes, and the name of the folder that holds this repository. Done when a search for each of those names in the tracked files finds nothing and the suite passes.
Material: Five recorded fixtures under `hooks/fixtures/claude/` hold the folder's name inside a session path, 2 to 3 times each; `docs/design.md` names the reference project's hook files in the last column of the table of section 7.2 and the modes of its review script in the second column of the table of section 9.1 (`git grep -c` on the main branch). tested
Methods: A mechanical replacement. The folder's name becomes `work`. A hook file's name becomes `the reference project's hook`. A mode's name becomes `ported`. The history already pushed keeps the old text: it is not rewritten.

## Also in this change

The owner's ruling of 2026-11-12 on design section 3 ("sólo los bloqueantes"): only a blocking finding must be reproduced by a failing test before it enters a plan. Every other finding becomes a card.

## Questions for the owner

None open.
