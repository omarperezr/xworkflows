# Pending

One living list. The `pending` brake checks these rules:

- One card per finding: `- **P-<n>** — <text>. Origin: <where>. Status: <unscheduled | scheduled | in progress on <branch>>.`
- A card is deleted in the commit whose message says `closes P-<n>`.
- A number is never used twice.
- `in progress on <branch>` does not outlive its branch.

## Adapt: research scripts


## Adapt: render, queue, run


## Adapt: hooks


## Proof harness (development only)


## Installer and docs

- **P-46** — `bin/xworkflows.mjs` hook chaining: the project's old hook is renamed, which changes its `$0`, and no test runs a real hook manager that dispatches on the hook file's name. Found on cleanup-b-1: a hook that finds its work by its own file name stops working when install renames it to chain it, and moving it to a folder of its own breaks every hook that uses a path relative to its place. Ruled by the owner on 2026-11-13: the chaining is designed apart, after the clean-up; the one way that changes neither the name nor the place is to leave the user's hook where it is and have git use a hooks folder of install's own. Since cleanup-b-3 install says, when it chains a hook, that a hook which depends on its own file name will not work chained. Origin: review of batch A4, 2026-11-12. Status: unscheduled.

## Check runner and brakes


## Hooks

- **P-43** — Claude Code: the `SubagentHandback` event was not checked for agents that run inside a `Workflow`; where it does not fire, `review-seal` is the stop (docs/gaps.md). Origin: recorded sessions, 2026-11-12. Status: unscheduled.
- **P-98** — `dream` skill and its agents `dream-analyzer` and `dream-organizer` (`docs/design.md` section 7.9): designed, not built, and no phase schedules them; the phase 1.3 spec lists them as a non-goal. First find a place in the workflow for `dream` (which stage or moment runs it, and who starts it), then build it. Ruled by the owner on 2026-11-13: "inicialmente será a mano, pero también quiero encontrar alguna fase o algún momento en el flujo de trabajo, tal vez luego de días, tal vez luego de cierta cantidad de sesiones diferentes": `dream` is first started by hand; when and how the method suggests it is settled in its own design, after the clean-up. Origin: owner, 2026-11-13. Status: unscheduled.
- **P-117** — Findings of the last confirmation of cleanup-b-3 that do not block: `hooks/core/adapt-gates.mjs:22`, the scan that replaced the pattern does not see a write into the summary when the path has `)` or a backtick glued on, when `tee` follows `sudo`, `env`, `xargs` or stands inside `if`, `for` or a function, or after `>(`: the branch main denied these; `bin/xworkflows.mjs:463`, a retired entry whose whole unit is no longer shipped is still judged on a first install, in a folder nobody asked about (no manifest reaches it today); `bin/xworkflows.mjs:782`, `doctor` says ok for the check line in a hooks folder outside the repository also when the hook is not executable, or the line is commented out or after `exit 0`; `hooks/core/memory.mjs:52`, with a `memory.dir` that is absolute or starts with `../` the session-start text no longer says to ask the owner. Origin: docs/superpowers/plans/2026-11-13-cleanup-b.md. Status: unscheduled.
