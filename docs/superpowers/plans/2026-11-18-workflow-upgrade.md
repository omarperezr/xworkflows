# Workflow upgrade: lessons of the reference project

Goal: G1

Spec: docs/superpowers/specs/2026-11-18-workflow-upgrade.md

## Global Constraints

- One review per plan: "Anteriormente dije que xworkflows deberia ser un solo revisor al final". This plan is one batch; T6 runs after T1 to T5 on the same branch.
- The risk reviewer's fixes are confirmed by a fresh `review` (Opus), never a second risk reviewer: "Sí, confirma Opus (Recommended)". This batch's own review follows it.
- External guides: "deberiamos usar los externos y elegirlos mejor tal vez para que siempre se actualicen sin tener que estar actualizandolos". Each implementer names the plugin skills and carries a short guide of its own for when they are missing.
- The SQL and front guides draw on the reference project's agents, read only, at the paths the prompt gives. Write nothing there. No name, path, client, table or business term of that project enters a tracked file: general lessons only.
- The database hook asks the owner ("Te pregunta a ti (Recommended)"); in a subagent it denies ("Bloquear en agentes (Recommended)").
- Tests build their repositories in a private `TMPDIR` and delete only inside it.
- Owner, 2026-11-18, after seeing that superpowers adds about 3 KB at every session start and its own method: tdd stays our own guide: "Guia tdd nuestra"; the SQL and front plugins are enabled only where the project uses them: "Solo si el proyecto los usa (Recommended)". superpowers is never enabled.
- Owner's answers on the risk review of e59867d (2026-11-19): the ponytail plugin stays on although it adds about 2.4 KB to every session and agent: "Activar el plugin igual"; SQL and screen files count only under `paths.code`: "Solo carpetas de código (Recommended)"; impeccable and supabase stay enabled where used: "Sí, así (Recommended)"; the inner `try`/`catch` of `safe-db` and `safe-rm` goes: "Sí, quitarlo (Recommended)".

## Tasks

### Batch 1: `workflow-upgrade-1`

**T1: the skills say the new method** (spec section 2, items 1 to 4)
- Files: `skills/deepen/SKILL.md`, `skills/next-step/SKILL.md`, `skills/plan/SKILL.md`, `skills/orchestrate/SKILL.md`, `skills/day-one.test.mjs`, `skills/design-alarm.test.mjs`, `README.md`
- Role: implement
- deepen: the run-or-skip rule of item 1, and the one line to the owner; next-step hands to `deepen` or straight to `grill` by that rule. plan: dependent tasks on the same branch after the task they need; more batches only above `brakes.changeSize.max`; the implementer picked by the task's files (`implement-sql` for SQL and migrations, `implement-front` for screens, `implement` otherwise, `mechanical` for no logic). orchestrate: pick `roles.smallReviewer` for a batch under 50 code lines that touches no `paths.risk`; a risk reviewer's fixes are confirmed by a fresh `roles.reviewer` at effort `high`; the seal lines of item 3.
- Done: `node --test skills/` passes; each SKILL.md stays at 150 lines or fewer.

**T2: the small reviewer and the seal of a confirmed risk batch** (spec section 2, item 3)
- Files: `agents/review-small.md`, `checks/review-seal.mjs`, `checks/review-seal.test.mjs`, `hooks/core/config.mjs`, `hooks/core/config.test.mjs`, `hooks/core/handback.mjs`, `hooks/core/handback.test.mjs`
- Role: implement
- `review-small`: tier medium, effort high, the rules of `agents/review.md`. Config: `roles.smallReviewer` default `review-small`; `roles.implementers` default adds `implement-sql` and `implement-front`. handback asks the small reviewer for the reviewer's keys. review-seal: on a risk commit, a `roles.reviewer` seal counts only when a `roles.riskReviewer` seal precedes it in the same file and the risk-reviewed sha is an ancestor of the reviewer's sha.
- Done: `node --test checks/review-seal.test.mjs hooks/core/` passes, with tests for: a reviewer seal after a risk seal passes; a reviewer seal alone on a risk commit fails.

**T3: three implementers** (spec section 2, item 4)
- Files: `agents/implement.md`, `agents/implement-sql.md`, `agents/implement-front.md`
- Role: implement
- `skills:` names `ponytail:ponytail` and `superpowers:test-driven-development` in all three; `supabase:supabase-postgres-best-practices` in the SQL one; `impeccable:impeccable` and `frontend-design:frontend-design` in the front one. Each body: invoke those skills when installed; otherwise follow its own short guide (test first and the smallest change for all; the SQL and front lessons of the reference agents; for front, the phone 360 px, tablet 768 px and desktop 1280 px widths and a screenshot at 360 and 1280 before done).
- Done: `no-test:` (no logic); `grep -rinFf docs/pilot/private/names.txt agents/` and `git grep -nE '/Users/[a-z]' agents/` print nothing.

**T4: hook `safe-rm`** (spec section 2, item 5)
- Files: `hooks/core/safe-rm.mjs`, `hooks/core/safe-rm.test.mjs`
- Role: implement
- Modelled on `hooks/core/design-first.mjs` (Bash matcher). Deny `rm` with `-r`/`-R` (also combined flags, `--recursive`) whose path holds a `$` variable not written `${NAME:?...}`, or a `$(...)` or backtick substitution.
- Done: `node --test hooks/core/safe-rm.test.mjs` passes, with a case per form, and a literal path passing.

**T5: hook `safe-db` and the ask answer** (spec section 2, item 6)
- Files: `hooks/core/safe-db.mjs`, `hooks/core/safe-db.test.mjs`, `hooks/adapters/claude.mjs`, `hooks/adapters/adapters.test.mjs`
- Role: implement
- `decide` returns `{decision: "ask", reason}` for each form of item 6, `deny` when `ev.isSubagent`. A SQL file the command names (`-f <file>`, `< <file>`) is read through ctx; an unreadable file lets the call through. The Claude adapter answers `ask` with `permissionDecision: "ask"` and the reason; the other adapters leave `ask` as a deny.
- Done: `node --test hooks/core/safe-db.test.mjs hooks/adapters/` passes, with a case per form, a `DELETE ... WHERE id = 1` passing, and the subagent deny.

**T7: our tdd guide** (spec section 2, item 8)
- Files: `skills/tdd/SKILL.md`, `skills/tdd/writing-good-tests.md`
- Role: implement
- Runs before T6. Keep what holds of today's guide, add the rules of item 8, and cut repetition: both files shorter than today. Keep `skills/tdd/LICENSE` and `SOURCE.md` as they are (the guide stays a modified copy).
- Done: `no-test:`; `wc -l skills/tdd/SKILL.md` below 330; `node --test skills/` passes, except the one `ponytail:ponytail` failure that T6 fixes.

**T6: install ships it** (spec section 2, items 3 to 7)
- Files: `bin/xworkflows.mjs`, `bin/xworkflows.test.mjs`, `bin/doctor.test.mjs`, `bin/upgrade.test.mjs`, `checks/skills-travel.mjs`, `checks/skills-travel.test.mjs`, `skills/method.test.mjs`, `manifest.json`, `skills/ponytail/`, `agents/implement.md`, `agents/implement-sql.md`, `agents/implement-front.md`
- Role: implement
- Runs after T1 to T5 and T7 are committed. Manifest pieces for `review-small`, `implement-sql`, `implement-front`, `safe-rm`, `safe-db`; `ponytail` stops shipping and goes under `retired`; `tdd` keeps shipping, and the three agents name `tdd` again in place of `superpowers:test-driven-development`. The plugins the agents name are declared in the manifest: `ponytail@ponytail` always; `supabase@claude-plugins-official` only when the project tracks SQL files; `impeccable@impeccable` and `frontend-design@claude-plugins-official` only when it tracks screen files (by extension, from `git ls-files`). `install` merges each marketplace and plugin into `.claude/settings.json` (`extraKnownMarketplaces`, `enabledPlugins`) per sub-key, never replacing a key the user set, and records each for `uninstall`, which removes only its own. `skills-travel` accepts a `plugin:skill` name. Tests that used `tdd` as a sample skill use another.
- Done: `node --test` passes; `node bin/xworkflows.mjs pack --check` prints nothing.

**T8: fix round 1, the hooks** (risk review of e59867d, findings 2, 5, 6)
- Files: `hooks/core/safe-db.mjs`, `hooks/core/safe-db.test.mjs`, `hooks/core/safe-rm.mjs`, `hooks/core/safe-rm.test.mjs`, `hooks/adapters/claude.mjs`, `hooks/adapters/adapters.test.mjs`, and the red tests copied in
- Role: implement
- Red tests: `wu-db-anywhere` (`hooks/core/safe-db-anywhere.test.mjs`), `wu-rm-keywords` (`hooks/core/safe-rm-keywords.test.mjs`), `wu-db-cwd` (`hooks/core/safe-db.wu-db-cwd.test.mjs`), each from `git show verify/<id>:<path>`. Also the owner's answer: the inner `try`/`catch` of both hooks goes.
- Done: the three red tests pass; `node --test hooks/` passes.

**T9: fix round 1, the seals** (risk review of e59867d, findings 3, 4)
- Files: `checks/review-seal.mjs`, `checks/review-seal.test.mjs`, `checks/pending.mjs`, `checks/pending.test.mjs`, `hooks/core/orchestrator.mjs`, `hooks/core/orchestrator.test.mjs`, `proof/measure.mjs`, `proof/measure.test.mjs`, `skills/orchestrate/SKILL.md`, `skills/design-alarm.test.mjs`, and the red tests copied in
- Role: implement
- Red tests: `wu-seal-old-risk` (`checks/review-seal-old-risk.test.mjs`), `wu-small-seal` (`checks/review-seal-small.test.mjs`). Every reader of a seal knows `roles.smallReviewer`, never on a risk commit; a risk seal counts for a reviewer seal only when it names a commit of the pushed range.
- Done: the two red tests pass; `node --test checks/ hooks/ proof/ skills/` passes.

**T10: fix round 1, install** (risk review of e59867d, findings 1, 7, 8), after T8 and T9
- Files: `bin/xworkflows.mjs`, `bin/xworkflows.test.mjs`, `bin/upgrade.test.mjs`, `agents/implement-front.md`, `skills/method.test.mjs`, `checks/skills-travel.mjs`, `checks/skills-travel.test.mjs`, `manifest.json`, and the red tests copied in
- Role: implement
- Red tests: `wu-uninstall-record` (`bin/uninstall-record.test.mjs`), `wu-pony-test` (the existing `bin/upgrade.test.mjs`, red at e59867d), `wu-front-skills` (`agents/skills-one-name.test.mjs`). Uninstall takes plugin ids and values from the manifest, never from the record alone. Also the owner's answer: SQL and screen files count only under `paths.code`. Then `pack`.
- Done: the three red tests pass; `node --test` passes; `node bin/xworkflows.mjs pack --check` prints nothing.

After the merge, the main session runs `node bin/xworkflows.mjs install` in this repository and `doctor`, and, on the owner's word, the same in the pilot project before its first batch.

## Review Focus

- `safe-rm` and `safe-db` must not stop ordinary work (a literal `rm -r build`, a `DELETE` with a real `WHERE`, a migration file that only adds) and must not let through a listed form.
- `install` must never replace or drop a `.claude/settings.json` key the user set; `uninstall` removes only what install recorded.
- `review-seal` must still refuse a risk commit with no risk-review seal.
- No tracked file names the reference project or the pilot project.

## Declined findings

## Seals
