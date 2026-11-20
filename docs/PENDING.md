# Pending

One living list. The `pending` brake checks these rules:

- One card per finding: `- **P-<n>** — <text>. Origin: <where>. Status: <unscheduled | scheduled | in progress on <branch>>.`
- A card is deleted in the commit whose message says `closes P-<n>`.
- A number is never used twice.
- `in progress on <branch>` does not outlive its branch.

## Proof harness (development only)

- **P-201** — `proof/measure.mjs:170` (worseThanBaseline) and `:166` (metrics): when no baseline row has a cost, or a measured row has none, the tool prints nothing, which reads as "nothing is worse". The remedy the review names: exit 2 with one line when no baseline row is usable, and one "not compared" line per measured row with no cost, plan docs/superpowers/plans/2026-11-20-minor-d.md. Origin: docs/superpowers/plans/2026-11-18-measure.md, the confirmation of 9b2aed8. Status: scheduled.

## Installer and docs


## Workflow upgrade

- **P-207** — `checks/skills-travel.mjs:31`: any skill name with `:` passes with no look at the plugin declaration, so an agent naming `foo:bar` passes while no such plugin is enabled. The remedy the review names: accept `<plugin>:<skill>` only when the settings at the pushed commit enable `<plugin>@...`, and no name holds a space, plan docs/superpowers/plans/2026-11-20-minor-d.md. Origin: docs/superpowers/plans/2026-11-18-workflow-upgrade.md, the risk review of e59867d. Status: scheduled.
- **P-208** — `skills/orchestrate/SKILL.md:62` says "Dispatch the batch's tasks together", while `skills/plan/SKILL.md:19` now puts a dependent task in the same batch after the task it needs; also `skills/plan/SKILL.md:16,18`, `skills/tdd/SKILL.md:55` against `:97` (hard-coding), and README counts and settings text at `README.md:149,170,223`. The remedy the review names: an `After: T<n>` line in the plan template, and orchestrate dispatches such a task after that task's commit, plan docs/superpowers/plans/2026-11-20-config-b.md. Origin: docs/superpowers/plans/2026-11-18-workflow-upgrade.md, the risk review of e59867d. Status: scheduled.

## Memory and agents

- **P-225** — A project that needs a package agent with more effort or extra skills (`implement-sql` at high, `review` with the project's own invariants) must keep its own copy ("keep theirs", `record.kept`, `bin/xworkflows.mjs:538`), and that copy silently gets no later upgrade of the package's agent. The remedy: `agents.<id>.{effort, skills, append}` in the config, applied by install on every upgrade. Also the risk reviewer's model by path: today every batch that touches `paths.risk` gets `roles.riskReviewer` at the one model `/adapt` chose (`skills/adapt/research.mjs:125`), so a batch on a low-stakes risk path (this repository's `proof/`) pays the top model; taking the path out of `paths.risk` would also drop the risk checklist and the risk seal `review-seal` asks for. Wanted: a config map from paths to the risk reviewer's model (the batch's costliest path decides), with the checklist and the seal unchanged; check first whether Codex, Cursor and Gemini let a dispatch choose the model. The P-222 replay (2026-11-20): Opus at xhigh blocked 12 of 20 proven findings against Fable's 16, at 44 % of the cost, plan docs/superpowers/plans/2026-11-20-config-b.md. Origin: migration plan of the reference project, 2026-11-19; the model by path, the owner 2026-11-20. Status: scheduled.
- **P-226** — The `pending` rule 3 (a plan or spec commit with no list change) is checked only at push time (`checks/pending.mjs`), so a project that wants the refusal at commit time keeps its own pre-commit: a second code of the same rule, which can disagree with the brake (it refuses a plan commit on a batch branch that the `--no-ff` merge's list change saves, the case of P-221). The remedy: install a `pre-commit` line that runs rule 3 with the brake's own code on the staged files, letting a merge in progress and a batch branch through, plan docs/superpowers/plans/2026-11-20-config-b.md. Origin: migration plan of the reference project, 2026-11-19. Status: scheduled.
- **P-227** — `checks/goal-cited.mjs:7` reads the goals from `docs/BUSINESS.md` by a fixed path, so a project that keeps its goals in another file must keep a second copy that drifts. The remedy: `paths.business`, default `docs/BUSINESS.md`, read through the defaults module by `goal-cited` and by the skills that name the file (`adapt`, `next-step`, `orchestrate`, `plan`), plan docs/superpowers/plans/2026-11-20-config-b.md. Origin: migration plan of the reference project, 2026-11-19. Status: scheduled.
