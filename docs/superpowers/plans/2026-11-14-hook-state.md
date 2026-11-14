# What the last review of the git hooks left

Goal: G1

Spec: docs/superpowers/specs/2026-11-13-hook-line.md

The eight cards the confirmation of `hook-line-1` at `60366c5` left (P-142 to P-149). Each card holds its place, its failing input and the fix the review named. The owner was asked about each one on 2026-11-14.

## Global Constraints

- On a hooks folder outside the repository (P-144): "Arreglarlo de verdad".
- On P-142, P-143, P-145, P-146, P-147, P-148 and P-149, asked one by one: "Arreglar".
- The owner's earlier answers stand (docs/superpowers/plans/2026-11-13-hook-line.md): the line is silent only where the method is not installed; a hook that cannot take the line stays chained; one function gives the state of a git hook to install and to doctor.
- Install and uninstall write no file outside the repository. A user's hook is byte for byte what it was after install and uninstall.
- Every sentence of doctor that asks for a step is a row of the table test, which does the step, asks for doctor's ok and for a push refused by a failing check.
- Node standard library only; hook texts are POSIX `sh`.

## Tasks

### Batch 1: `hook-state-1`

About 150 code lines. One file holds every change, so T2 starts when T1 has reported.

**T1: `hookState` tells a changed file of the package and a line behind a link, doctor's sentences name steps that work, and one rule says which text is the package's** (P-142, P-143, P-145, P-146, P-148)
- Files: `bin/xworkflows.mjs`, `bin/xworkflows.test.mjs`
- Role: implement
- P-142: a hook in the state own or line whose file under `.xworkflows/git/` is there with another text is a fail of doctor; the sentence: delete that file, then run install. One row.
- P-143: `hookState` reads a hook, and the file husky's shim runs, through links for the `line` verdict only. Two rows: husky's file is a link; a hook that is a link and holds the line.
- P-145: for a declined hook that can take the line, the sentence also offers to add the line by hand. One row with a hook install cannot write.
- P-146: a hook blocked and declined at once: the blocked sentence also says to take the entry out of `declined`. One row.
- P-148: doctor's loop over the record's files asks `hookState` whether a text is the package's; no third copy of that rule stays.
- Done: `node --test bin/xworkflows.test.mjs` passes.

**T2: a hooks folder outside the repository gets the line that hands the refs on, a line added by hand is recorded, and end of input at a question is an empty answer** (P-144, P-147, P-149)
- Files: `bin/xworkflows.mjs`, `bin/xworkflows.test.mjs`, `README.md`, `docs/design.md`, `docs/gaps.md`
- Role: implement
- P-144: install writes its own file under `.xworkflows/git/` also when the hooks folder is outside the repository, and still writes nothing outside it. Doctor's sentence for that state names the marked line, the one a hook inside the repository gets, so the rest of the shared hook receives the pushed refs and its arguments. In another project that uses the same shared hook and has no xworkflows the line stays silent. The state gets its row: the sentence done, doctor's ok, a failing check refuses the push, a passing push is accepted and the rest of the hook got the refs. The documents follow only where they speak of a hooks folder outside the repository.
- P-147: `plan` looks for the line before it skips a declined hook, so the next install records a line the user added by hand, and uninstall takes it out.
- P-149: end of input at a question of install is taken as an empty answer, the first label. No stack.
- Done: `node --test bin/xworkflows.test.mjs skills/day-one.test.mjs` passes.

## Review Focus

- A user's hook is the user's: after `install` and `uninstall` it must be byte for byte what it was, and nothing outside the repository is written.
- The push check must not be skipped: doctor never says ok where the check will not run, and never names a step that does not work or that loses the user's hook.
- The user's `pre-push` must still receive the pushed refs on its standard input, also in a hooks folder shared by several projects.
- A project without xworkflows must not be broken by the line in a shared hook.

## Declined findings

## Seals
