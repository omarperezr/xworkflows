# Pending

One living list. The `pending` brake checks these rules:

- One card per finding: `- **P-<n>** — <text>. Origin: <where>. Status: <unscheduled | scheduled | in progress on <branch>>.`
- A card is deleted in the commit whose message says `closes P-<n>`.
- A number is never used twice.
- `in progress on <branch>` does not outlive its branch.

## Adapt: research scripts

- **P-91** — test data: two example rules that restate rules of the reference project still stand in `skills/adapt/research.test.mjs` and in the fixtures under `test/fixtures/proof/trial/`. They are not prompts and are not installed. The owner's call: replace them with the lending example, or leave them; plan docs/superpowers/plans/2026-11-13-cleanup-b.md. Origin: risk review of adapt-general-3, 2026-11-12. Status: scheduled.

## Adapt: render, queue, run

- **P-74** — `skills/adapt/screens.mjs`, `skills/adapt/research.mjs`: `kinds.json` is still built and written, and since the gate asks no line per mechanism kind no code reads it. Remove it, or say who reads it; with it go the test parts that only fed the removed check (`hooks/core/adapt-gates.test.mjs`, `skills/adapt/workflow.test.mjs`) and three stale lines: a comment that names `research2.mjs` and the text `general rule missing` in `skills/adapt/research.workflow.js`, and one test title in `skills/day-one.test.mjs`; plan docs/superpowers/plans/2026-11-13-cleanup-b.md. Origin: review of adapt-general-1, 2026-11-12. Status: scheduled.

## Adapt: hooks


## Proof harness (development only)


## Installer and docs

- **P-26** — `bin/xworkflows.mjs` `apply()`: an upgrade leaves behind a file a newer version no longer ships, unrecorded, so `uninstall` never removes it; plan docs/superpowers/plans/2026-11-13-cleanup-b.md. Origin: review of branch 1.2b, 2026-11-12. Status: scheduled.
- **P-46** — `bin/xworkflows.mjs` hook chaining: the project's old hook is renamed, which changes its `$0`, and no test runs a real hook manager that dispatches on the hook file's name; plan docs/superpowers/plans/2026-11-13-cleanup-b.md. Origin: review of batch A4, 2026-11-12. Status: scheduled.
- **P-50** — `bin/xworkflows.mjs`: no review ran the answers typed at a terminal (only `--yes` and the no-terminal path), a linked worktree by hand, or a symlink swapped in between `plan()` and `apply()`; plan docs/superpowers/plans/2026-11-13-cleanup-b.md. Origin: review of batch A4, 2026-11-12. Status: scheduled.
- **P-113** — `bin/xworkflows.mjs` `memName`, `checks/index-current.mjs`, `checks/stale-memory.mjs`: the rule that reads `memory.dir` exists three times, and the two checks already differ (`startsWith("..")` against `=== ".."` or `startsWith("../")`). One exported function in `hooks/core/config.mjs` used by all three; it changes two hashed pieces; plan docs/superpowers/plans/2026-11-13-cleanup-b.md. Origin: risk review of memory-index-1, 2026-11-13. Status: scheduled.

## Check runner and brakes

- **P-37** — Tests: several test files leave their `xwf-*` folders in the system temp folder (thousands after a day of runs); remove them in each test's cleanup; plan docs/superpowers/plans/2026-11-13-cleanup-b.md. Origin: review of the first nine brakes, 2026-11-12. Status: scheduled.
- **P-38** — `checks/ratchet.mjs`, `checks/project.mjs`: a project command that hangs has no time limit, so the push hangs with it. Ruled by the owner on 2026-11-13: "me iría por C. Pero realmente lo más recomendable es dar los comandos al usuario para que él mismo los ejecute y vea qué pasa": a limit each project can set, the push refused when it is passed, and the line gives the command that was cut so the user runs it by hand; plan docs/superpowers/plans/2026-11-13-cleanup-b.md. Origin: review of the last five brakes, 2026-11-12. Status: scheduled.
- **P-58** — `hooks/core/memory.mjs` and the git hook text in `bin/xworkflows.mjs`: `touch -c` follows a linked `graph.json` and sets the time of a file outside the repository, time only. Set the link's own time; plan docs/superpowers/plans/2026-11-13-cleanup-b.md. Origin: review of the late fixes of batch A4, 2026-11-12. Status: scheduled.
- **P-59** — `hooks/core/memory.mjs`, `checks/graph-current.mjs`: an index folder whose name starts with `-` stops `touch`, and the fix the check prints is unquoted, so a folder with a space pastes into a command that sets nothing. Use `--` and quote the path; plan docs/superpowers/plans/2026-11-13-cleanup-b.md. Origin: review of the late fixes of batch A4, 2026-11-12. Status: scheduled.

## Hooks

- **P-42** — `hooks/core/ctx.mjs` `writeFile` and `checks/run.mjs index`: only the last path component is checked for a symlink; a memory folder that is itself a link out of the tree is still written through. Ruled by the owner on 2026-11-13: "se pregunta, se intenta poner dentro del proyecto y si no se puede poner dentro del proyecto, se agrega esa lectura con una excepción, pero siempre pidiéndole al usuario el permiso"; plan docs/superpowers/plans/2026-11-13-cleanup-b.md. Origin: review of the four hooks, 2026-11-12. Status: scheduled.
- **P-43** — Claude Code: the `SubagentHandback` event was not checked for agents that run inside a `Workflow`; where it does not fire, `review-seal` is the stop (docs/gaps.md). Origin: recorded sessions, 2026-11-12. Status: unscheduled.
- **P-96** — `hooks/core/orchestrator.mjs`: a line that repeats `(cat ` or `$(cat x)` many thousands of times costs the square of its length (about 1 s at 70 KB); it ends and allows. Bound the run of a reader's arguments, and add the shape to the speed test. Done on cleanup-b-2: the analysis of a line is bounded and the slow case is fast. Left open by its review: a command line past 4000 characters is not judged by the reader check at all, so a long read of many files passes; asked to the owner on 2026-11-13, with the proposal to judge the first 4000 characters; plan docs/superpowers/plans/2026-11-13-cleanup-b.md. Origin: risk review of hook-denials-1, 2026-11-12. Status: scheduled.
- **P-98** — `dream` skill and its agents `dream-analyzer` and `dream-organizer` (`docs/design.md` section 7.9): designed, not built, and no phase schedules them; the phase 1.3 spec lists them as a non-goal. First find a place in the workflow for `dream` (which stage or moment runs it, and who starts it), then build it. Ruled by the owner on 2026-11-13: "inicialmente será a mano, pero también quiero encontrar alguna fase o algún momento en el flujo de trabajo, tal vez luego de días, tal vez luego de cierta cantidad de sesiones diferentes": `dream` is first started by hand; when and how the method suggests it is settled in its own design, after the clean-up. Origin: owner, 2026-11-13. Status: unscheduled.
- **P-115** — Findings of the risk review of cleanup-b-2 that do not block and that the owner said to fix ("Los 5 detalles que no bloquean, arréglalos todos", 2026-11-13): `hooks/core/adapt-gates.mjs:13`, a redirect glued to the word before it is no longer seen, a read through `tee <` is denied, and many `tee` words cost the square of their number; `checks/review-seal.mjs:13`, a line of inline code that starts with three backticks is taken as a fence, so the seal after it is not found; `hooks/run.mjs:55`, the recorder hides the folders between home and the project only in an absolute path and replaces with no path boundary; `skills/full-review/SKILL.md:94`, the script does not return which zones were not read; `skills/adapt/research.mjs:87`, the count of the `S1-more` question in a re-adaptation differs from the count of `research.md`; plan docs/superpowers/plans/2026-11-13-cleanup-b.md. Origin: docs/superpowers/plans/2026-11-13-cleanup-b.md. Status: scheduled.
