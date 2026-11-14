# What the last review of the git hooks left

Goal: G1

Spec: docs/superpowers/specs/2026-11-13-hook-line.md

The eight cards the confirmation of `hook-line-1` at `60366c5` left (P-142 to P-149), and the card its push left (P-153). Each card holds its place, its failing input and the fix named for it. The owner was asked about each one on 2026-11-14.

## Global Constraints

- On a hooks folder outside the repository (P-144): "Arreglarlo de verdad".
- On P-142, P-143, P-145, P-146, P-147, P-148 and P-149, asked one by one: "Arreglar".
- On the 120 s the check `fix-has-test` gives the tests of a fix, a number written in the code (P-153): "Tope configurable".
- The owner's earlier answers stand (docs/superpowers/plans/2026-11-13-hook-line.md): the line is silent only where the method is not installed; a hook that cannot take the line stays chained; one function gives the state of a git hook to install and to doctor.
- Install and uninstall write no file outside the repository. A user's hook is byte for byte what it was after install and uninstall.
- Every sentence of doctor that asks for a step is a row of the table test, which does the step, asks for doctor's ok and for a push refused by a failing check.
- Node standard library only; hook texts are POSIX `sh`.

## Tasks

### Batch 1: `hook-state-1`

About 170 code lines. One file holds every change of T1 and T2, so T2 starts when T1 has reported; T3 runs beside them. T1 and T2 make one commit each: every `fix` commit of the installer costs the push check two runs of the installer's test file.

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
- P-144: install writes its own file under `.xworkflows/git/` also when the hooks folder is outside the repository, and still writes nothing outside it. Doctor's sentence for that state names the marked line, the one a hook inside the repository gets, so the rest of the shared hook receives the pushed refs and its arguments. In another project that uses the same shared hook and has no xworkflows the line stays silent. The state gets its row: the sentence done, doctor's ok, a failing check refuses the push, a passing push is accepted and the rest of the hook got the refs. The documents follow only where they speak of a hooks folder outside the repository, and the table of keys of `docs/design.md` gets the row of T3's key.
- P-147: `plan` looks for the line before it skips a declined hook, so the next install records a line the user added by hand, and uninstall takes it out.
- P-149: end of input at a question of install is taken as an empty answer, the first label. No stack.
- Done: `node --test bin/xworkflows.test.mjs skills/day-one.test.mjs` passes.

**T3: the time the check `fix-has-test` gives the tests of a fix is a value of the config** (P-153)
- Files: `checks/fix-has-test.mjs`, `checks/fix-has-test.test.mjs`, `hooks/core/config.mjs`, `hooks/core/config.test.mjs`
- Role: implement
- The key is `brakes.fixHasTest.seconds`, default 120, in the defaults module. A value that is not a whole number above zero: the check cannot run and says the key by name. The line "its tests did not end within" names the key to raise.
- After T3 the main session sets the key for this repository in `.xworkflows/config.json`, above the time the installer's test file takes.
- Done: `node --test checks/fix-has-test.test.mjs hooks/core/config.test.mjs checks/run.test.mjs` passes.

### Batch 1, fix round after the risk review of `6b8dd85`

Three blocking findings, each reproduced by the review with real pushes. It is the first round of this batch, so none is a repeat.

- `bin/xworkflows.mjs:727` (install, the question loop): Ctrl-C at a question is now taken as Enter, and install goes on and writes. The change for P-149 caused it: the catch that makes end of input an empty answer takes every rejection. On the main branch Ctrl-C stopped install with nothing written.
- `bin/xworkflows.mjs:1144` (uninstall, the loop over the record's lines): uninstall throws and stops half way when the hook that holds a recorded line is read-only. The changes for P-145 and P-147 opened a new way into it: the line added by hand to a hook install could not write is now recorded.
- `bin/xworkflows.mjs:366` (`hookState`, `ran`): doctor says ok while the push check does not run, when `.xworkflows/git/pre-push` differs from the package's text only by carriage returns, because the hash drops them. The state `changed` of P-142 misses that case; the main branch says ok there too.

What the review found sound: no step of the package wrote outside the temp project in 17 kinds of hook; a user's files came back byte for byte except as the findings say; the shared hook gets the refs and its arguments; a project without xworkflows pushes in silence; Ctrl-D equals Enter at each of the six questions; every bad value of the key is exit 2 and never no limit.

The owner, 2026-11-14:
- On the line left in a shared hook after uninstall, which refuses pushes when uninstall kept a changed `.xworkflows/checks/run.mjs`: "Dejarlo como tarjeta" (P-157).
- On the model of this repository's risk reviewer, which ran on the session's model because its file held a tier line: "Opus (Recommended)". The file names `opus` from this batch on.

What did not block, one card each: P-158 (the sentence for the guarded line of the earlier version), P-159 (the key has no upper end), P-160 (a null or missing `fixHasTest` does not name the key), P-161 (a line behind a link stays after uninstall without a word), P-162 (the questions after end of input are not listed), P-163 (three sentences with no row), P-164 (doctor's older line for a file that is a folder), P-165 (a detached child of a test outlives the time limit), P-166 (the line does not refuse the push when the shell cannot read its file). This repository's own installed check still holds the 120 s until the merge updates its own copy, so the 600 s count from the push of the main branch on.

**F1: Ctrl-C at a question stops install with nothing written, uninstall names a hook it cannot write and goes on, and a file of the package changed by a carriage return is told as changed**
- Files: `bin/xworkflows.mjs`, `bin/xworkflows.test.mjs`
- Role: implement
- Ctrl-C at any question: nothing written, no record, an exit code that is not zero, no stack. Ctrl-D stays an empty answer.
- uninstall and a read-only hook that holds a recorded line: one line names the file and says the line stays for the user to take out; uninstall goes on to its end. Two tests with a real uninstall: the line added by hand and recorded, and a line install wrote in a hook made read-only after.
- For `ran`, a text that holds a carriage return is never the package's or the record's text. Two rows of the table test: every line end CRLF, and one carriage return added.
- Done: `node --test bin/xworkflows.test.mjs skills/day-one.test.mjs` passes.

## Review Focus

- A user's hook is the user's: after `install` and `uninstall` it must be byte for byte what it was, and nothing outside the repository is written.
- The push check must not be skipped: doctor never says ok where the check will not run, and never names a step that does not work or that loses the user's hook.
- The user's `pre-push` must still receive the pushed refs on its standard input, also in a hooks folder shared by several projects.
- A project without xworkflows must not be broken by the line in a shared hook.
- The push check must still end: a fix whose test never ends is cut at the configured time, and a config with a bad value is said by name, never taken as no limit.

## Declined findings

## Seals
