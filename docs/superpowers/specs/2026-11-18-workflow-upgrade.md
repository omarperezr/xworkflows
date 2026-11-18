# Workflow upgrade: lessons of the reference project

Goal: G1

## 1. The request, deepened

Request: compare the method with the one the reference project runs (its prototype), and bring into xworkflows what is cheaper or safer there, plus what the owner decided after the comparison. Done: every item of section 2 is installed by `install`, `doctor` passes, `node --test` passes, and the pilot's batches run on this version.

Adds:
- A plan of one branch pays one review; today dependent tasks go to a later batch, so most plans pay two or more (12 of 16 plans of this repository have two or more batches: `grep -c '^### Batch'` over `docs/superpowers/plans`, 2026-11-18). `tested`
- A confirmation costs almost as much as a first review (median 5.3 against 6.7 USD; spec spend-cut, section 1), and the risk reviewer is 32 % of this repository's spend (`proof/measure.mjs`, 2026-11-18). `tested`
- An agent that deletes a database is a known failure of AI agents; a hook sees only the command text and the files it names.

Material:
- The reference project: one plan is one branch, reviewed once at the end (its plans and `git log --merges`, 2026-11-18). `tested`
- The reference project confirms the fixes of its Fable reviewer with a fresh Opus reviewer, never a second Fable; it has a Sonnet reviewer for diffs under about 50 lines that touch no risk; two implementers by zone (SQL and screens); a hook that refuses `rm -r` on a path with a `$` variable not written `${NAME:?}`. `read not tested`
- `agents/implement.md:7-9` names the skills `tdd` and `ponytail`, copies of which ship in `skills/`. `tested`
- `skills/deepen/SKILL.md:8`: "This stage is never skipped, however small the request." `read not tested`

Proof:
- A PreToolUse hook may answer `permissionDecision: "ask"`, and the user is asked; hooks of the settings file also run for subagent tool calls. Whether that ask reaches the user from a subagent is not documented. https://code.claude.com/docs/en/hooks `read not tested`
- A project's `.claude/settings.json` takes `extraKnownMarketplaces` and `enabledPlugins`, and Claude Code offers to install them in a trusted folder. https://code.claude.com/docs/en/plugins `not confirmed`
- An agent's `skills:` frontmatter naming a plugin skill (`plugin:skill`) is reported not to load it in some cases. https://github.com/anthropics/claude-code/issues (reports 29441, 67251) `not confirmed`
- `impeccable` (github pbakaus/impeccable, Apache 2.0, last commit 2026-10-20), `frontend-design` (marketplace `claude-plugins-official`, Apache 2.0), `supabase` plugin with `supabase-postgres-best-practices` (marketplace `claude-plugins-official`, repo supabase-community/supabase-plugin), `ponytail` (github DietrichGebert/ponytail), `superpowers` with `test-driven-development` (marketplace `claude-plugins-official`): local plugin cache and LICENSE files, 2026-11-18. `tested`

## 2. Design

1. **deepen when it pays.** `deepen` runs only when the request is very big (more than `brakes.changeSize.warn` code lines, or more than one branch) or very risky (money, permissions, deleting data, security). The main session decides and tells the owner in one line whether it runs and why; the owner can always ask for it. `next-step` and every skill that says deepen is never skipped follow this.
2. **One review per plan.** A task that needs another task's result goes on the same branch, after it, in the same batch; a plan is cut into more batches only above `brakes.changeSize.max`. Each batch still gets one review before it merges.
3. **Reviewers by size and risk.** A batch whose code diff is under 50 lines and touches no `paths.risk` goes to a new `review-small` agent (tier medium, effort high). Others as today. The fixes asked by `roles.riskReviewer` are confirmed by a fresh `roles.reviewer` (Opus), never by a second risk reviewer; the seal of a risk batch is then `risk-review ok at <first sha>` followed by `review ok at <fix sha>`, and `review-seal` takes a reviewer seal on a risk path only when a risk-review seal of the same batch precedes it.
4. **Three implementers.** `implement` (any language), `implement-sql` and `implement-front`. Each names its external skills and carries a short guide of its own in its body, used when the skill is not installed:
   - `implement`: `ponytail:ponytail`, `superpowers:test-driven-development`.
   - `implement-sql`: the above plus `supabase:supabase-postgres-best-practices`; its own guide holds the general lessons of the reference project's SQL implementer, with no name of that project.
   - `implement-front`: the generic two plus `impeccable:impeccable` and `frontend-design:frontend-design`; its guide holds the phone, tablet and desktop widths rule.
   `install` adds those marketplaces and plugins to `.claude/settings.json` (`extraKnownMarketplaces`, `enabledPlugins`) as merged keys, so uninstall removes them. The copies `skills/ponytail` and `skills/tdd` stop shipping; `ponytail-review` stays as long as no external one replaces it. `plan` picks the implementer by the task's files.
5. **Hook `safe-rm`.** A Bash `rm` with `-r` or `-R` whose path holds a `$` variable not written `${NAME:?...}`, or a command substitution, is denied, with the reason. Pure `decide(ev, ctx)` with its test.
6. **Hook `safe-db`.** A Bash command that would delete all, much or part of a database asks the owner (`permissionDecision: "ask"`) with the reason: SQL `DROP DATABASE|SCHEMA|TABLE`, `TRUNCATE`, `DELETE` or `UPDATE` with no `WHERE` or with an always-true `WHERE`, given with `-c`, a heredoc, or a SQL file the command names (`-f <file>`, `< <file>`); CLI resets (`dropdb`, `supabase db reset`, `prisma migrate reset`, `prisma db push --force-reset` or `--accept-data-loss`, `rails db:drop|db:reset|db:schema:load`, `manage.py flush`, `sequelize db:drop`, `knex migrate:rollback --all`); `redis-cli FLUSHALL|FLUSHDB`; `dropDatabase` and `deleteMany({})`; `rm` of a `*.db`, `*.sqlite`, `*.sqlite3` file. In a subagent the hook denies and says to hand the command to the main session, until a test shows that an ask from a subagent reaches the owner (card P-205); the owner's answer for that case is to block.
7. Everything installed keeps the rules of this project: Node standard library, manifest pieces with their hash, values from `.xworkflows/config.json`.

## Owner's answers

- deepen: "la etapa deepen no deberia ser obligatoria, deberia ser usada unicamente si el pedido es muy grande o implica mucho riesgo" (2026-11-18); the rule above: "Sí, esa regla (Recommended)".
- Next work: the owner's word comes first, so "clients first" is the owner's to say: "es mejor xworkflows" (2026-11-18).
- Implementers: "un implementador generico de codigo con sus guias y mejores practicas generales sin apegarse a un lenguaje especifico, un implementador de sql con sus guias podemos copiar y mejorar las de [the reference project] y un implementador de front con sus guias como las del comando front" (2026-11-18).
- External guides: "deberiamos usar los externos y elegirlos mejor tal vez para que siempre se actualicen sin tener que estar actualizandolos, asi sera mas facil de mantener este opensource project" (2026-11-18); declared in settings with our short guide as fallback: "Sí, anotar + guía corta (Recommended)"; the guides named above: "Sí, esas (Recommended)"; ponytail and tdd external too: "Sí, externas también (Recommended)".
- One review at the end of the plan: "Anteriormente dije que xworkflows deberia ser un solo revisor al final" (2026-11-18).
- Small reviewer: "deberiamos usar un Revisor Sonnet barato para menos de 50 líneas sin riesgo" (2026-11-18).
- Confirmation of the risk reviewer's fixes by Opus: "Sí, confirma Opus (Recommended)" (2026-11-18).
- No price notice ("es indiferente") and no CI template ("es simplemente parte de [the reference project]") (2026-11-18).
- Hooks: "debemos tener tambien Hook rm-seguro ... y deberiamos tener lo mismo para evitar eliminar de bases de datos" (2026-11-18); the database hook asks the owner: "Te pregunta a ti (Recommended)"; in a subagent, if the ask cannot reach the owner: "Bloquear en agentes (Recommended)".
