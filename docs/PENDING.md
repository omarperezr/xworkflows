# Pending

One living list. The `pending` brake checks these rules:

- One card per finding: `- **P-<n>** — <text>. Origin: <where>. Status: <unscheduled | scheduled | in progress on <branch>>.`
- A card is deleted in the commit whose message says `closes P-<n>`.
- A number is never used twice.
- `in progress on <branch>` does not outlive its branch.

## Proof harness (development only)


## Installer and docs


## Workflow upgrade
- **P-240** — `skills/full-review/SKILL.md:43` (schema `row`, `required`) asks a row of every finding, while `agents/zone-review.md:10` says a restructuring has none and the enum has no `none`; a restructuring set `drop` can be read in `## Restructurings` or Step 6 as not written. Wanted: `row` required only for `kind: "error"`, and no `<row>` in the restructuring form (Step 4, `:98-99`). Origin: review of triage-bar-1, 2026-11-22. Status: unscheduled.
- **P-241** — `skills/full-review/SKILL.md:98` (Step 4, merge duplicates): two reviews that name the same `file:line` with different rows get merged with no rule for which row wins; if the merged item takes `drop`, Step 6 writes no card and a real error is lost. Wanted: one line, a merged item takes the higher row. Origin: review of triage-bar-1, 2026-11-22. Status: unscheduled.
- **P-242** — `skills/pending/SKILL.md` (`## The bar`): no tie-break when an error fits two rows (a rare, self-correcting money or data error fits both `blocking` and `drop`), so a reviewer can set it `drop` and it never becomes a card. Wanted: one line under the three lines, in the pending skill only (the test pins the three lines), "when an error fits two rows, the higher row wins". Origin: review of triage-bar-1, 2026-11-22. Status: unscheduled.
- **P-243** — `skills/orchestrate/SKILL.md:91` vs `:93` (step 3): an older money or data error found from round 2 "the owner hears at once", but no channel is named and it is not said whether it also goes into the end-of-batch question; the reviewers (`agents/review.md:26`, `agents/review-small.md:26`) give no money-or-data marker. Wanted: tell the owner in one line at once, and it still goes into the end question. Origin: review of triage-bar-1, 2026-11-22. Status: unscheduled.
- **P-244** — `skills/orchestrate/SKILL.md:98` and `:103` (steps 5 and 6) still say "for a pending one leave it as its card", while a `pending` finding has no card until the end-of-batch question. Wanted: "leave it for the end-of-batch question". Origin: review of triage-bar-1, 2026-11-22. Status: unscheduled.


## Memory and agents
- **P-235** — The skills still say the business file is guarded through `paths.curated` (`skills/plan/SKILL.md:12,21`, `skills/orchestrate/SKILL.md:10,16`, `docs/design.md:372-373,420`), while `paths.business` is now its only source; a plan that edits a moved business file gives it to an implementer the hook then denies. Wanted: name `paths.curated` and `paths.business` in each place. Origin: docs/superpowers/plans/2026-11-20-config-b.md, confirmation of 42ba2a6. Status: unscheduled.
- **P-236** — Tests that commit after install with graphify on PATH (`bin/git-hooks.test.mjs:809,849,862`, `bin/doctor-handoff-quote.test.mjs:9`) can be deleted by the shared cleanup while the post-commit `graphify update` still writes; and the graphify-free env exists three times (`bin/plugin-off-skills-travel.test.mjs:9`, `bin/precommit-old-branch.test.mjs:14`, `bin/git-hooks.test.mjs:283`). Wanted: one export in `bin/shared.test.mjs`, used by every such commit. Origin: docs/superpowers/plans/2026-11-20-config-b.md, confirmation of 42ba2a6. Status: unscheduled.
