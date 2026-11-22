# Pending

One living list. The `pending` brake checks these rules:

- One card per finding: `- **P-<n>** — <text>. Origin: <where>. Status: <unscheduled | scheduled | in progress on <branch>>.`
- A card is deleted in the commit whose message says `closes P-<n>`.
- A number is never used twice.
- `in progress on <branch>` does not outlive its branch.

## Proof harness (development only)


## Installer and docs


## Workflow upgrade


## Memory and agents
- **P-235** — The skills still say the business file is guarded through `paths.curated` (`skills/plan/SKILL.md:12,21`, `skills/orchestrate/SKILL.md:10,16`, `docs/design.md:372-373,420`), while `paths.business` is now its only source; a plan that edits a moved business file gives it to an implementer the hook then denies. Wanted: name `paths.curated` and `paths.business` in each place. Origin: docs/superpowers/plans/2026-11-20-config-b.md, confirmation of 42ba2a6. Status: unscheduled.
- **P-236** — Tests that commit after install with graphify on PATH (`bin/git-hooks.test.mjs:809,849,862`, `bin/doctor-handoff-quote.test.mjs:9`) can be deleted by the shared cleanup while the post-commit `graphify update` still writes; and the graphify-free env exists three times (`bin/plugin-off-skills-travel.test.mjs:9`, `bin/precommit-old-branch.test.mjs:14`, `bin/git-hooks.test.mjs:283`). Wanted: one export in `bin/shared.test.mjs`, used by every such commit. Origin: docs/superpowers/plans/2026-11-20-config-b.md, confirmation of 42ba2a6. Status: unscheduled.
- **P-237** — `hooks/core/memory.mjs` (`rebuild`) starts the memory job only when the notes folder exists (`if (!names.length && !ctx.exists(dir)) return;`), so a project that keeps its notes outside the repository but sets `memory.before` or `memory.index` never runs its export or its index update; and install and doctor always push `autoMemoryDirectory` to `memory.dir`, which moves such a project's memory to an empty folder. Wanted: the job starts whenever `memory.before` or `memory.index` is set; a config value that means "memory notes not managed here", which install does not write and doctor does not ask for. Origin: the reference project's migration, confirmation of batch xwf-2, 2026-11-20 (the owner: "Empty folder + xworkflows card", "CLAUDE.md line + same card"); the owner, 2026-11-22: "memory.autoDirectory: false", plan docs/superpowers/plans/2026-11-22-memory-autodir.md. Status: in progress on memory-autodir-1.
