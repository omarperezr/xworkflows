---
name: safe-db-hook
description: "The xworkflows safe-db hook (hooks/core/safe-db.mjs): what it asks about for database clients, the zero and signed-number cases, and the command-word reads rule added in T18 of workflow-upgrade-1"
metadata:
  node_type: memory
  type: reference
  originSessionId: 8846ce53-0520-4b25-8f82-4dbaf420f262
  modified: 2026-11-23T00:00:00.000Z
---

The safe-db hook lives in `hooks/core/safe-db.mjs`, with its tests in `hooks/core/safe-db.test.mjs`. It decides whether a shell command that touches a database client (mysql, psql, dropdb and similar) must ask the owner first. Run the tests with `node --test hooks/`.

Rules as of T18 of plan `docs/superpowers/plans/2026-11-18-workflow-upgrade.md` (branch workflow-upgrade-1), reported by the implement agent on 2026-11-23 (commit 973b1db; not re-checked in git by the dream run):

- Number literal in a `DELETE ... WHERE x = <number>` (the `TERM` and `plainCond` checks, around line 35): digits with an optional decimal part, `\d+(?:\.\d+)?`. A sign (`-5`, `+2`) or a bare point (`.5`, `5.`) asks. A right side equal to zero (`0`, `0.0`, `00`) asks in every client, because a zero match on a delete is a whole-table risk the hook must not wave through.
- Must still pass: `psql -c "UPDATE t SET a = 1 WHERE id = 2.5"`.
- Command-word reads rule (around lines 87-94): when a segment's command word is a text filter (grep, rg, awk, sed, head, tail, wc) or a lookup (which, type, `command -v`, `command -V`), no word in its arguments counts as a tool or a client. So `grep -rn dropdb .` passes, and so do `which dropdb`, `type dropdb` and `command -v dropdb`. Side effect: `which mysqladmin drop` now passes too, because the whole tool loop is skipped for a lookup.
- Still checked before the tool loop, so unchanged: a truncate-style redirect (`grep x > a.db`) and `rm` of a `.db` file (`sed ... ; rm a.db`) still ask.
- Chained commands (`cat x | grep app`, `grep -v x && mysql app`) were in the T18 case list, but the agent's report for them was too garbled to state the outcome. Re-check them against the test file before relying on them.

Process lessons from T18:

- Test first: the new cases were added, seen failing (the signed-number case, the zero case and the command-word case), then the code changed. Keep that order; the red run is the evidence.
- The implement agent cannot update `manifest.json` in that task, so `pack --check` is stale after it. The manifest hash must be refreshed in a later step by someone allowed to touch it; do not report the batch as sealed until then.
- The orchestrating session only runs `mark.mjs orchestrate`, dispatches the implement agent, and relays its report; it does not read or edit code itself.
- The agent's report arrived with garbled passages. Verify the sha, the pass count and the flipped cases in git before quoting them.

Holes named on 2026-11-23 in the card triage ([[triage-bar]]). These are card claims from the session; the dream run did not re-test any of them:

- P-214: a `\i` file run twice on one line, a quoted file path, and `cat bad.sql | psql` pass unseen. The bar's row: `blocking`.
- P-215: a SQL file piped through `grep`, `head`, `sed` or `awk` into `psql` passes unseen. The bar's row: `blocking`. Same family as the chained-commands item above.
- P-216: `git grep dropdb` asks, and inside an agent it is denied. The command-word rule covers a bare `grep` only, not `git grep`. Row: `pending`.
- P-212: read-only commands with "drop" or "update" in a host name ask; inside an agent they are denied. Row: `pending`.
- P-205: a denial inside a subagent is untested, so whether the owner gets a question there is unknown. Row: `pending`.
- P-213: the hook reads a file from another piece; installed without safe-rm it lets every command through. Row: `pending`.
- P-228: an include that cannot be read passes without the warning the owner asked for. Row: `pending`.

Owner status: the owner discarded all of these cards in his triage of 2026-11-23 and kept them discarded. P-214 and P-215 are `blocking` by the bar, so that choice is open for him to revisit. Whether any card is still in `docs/PENDING.md` was not checked.

## Update 2026-11-23: card P-211 closed (group A, main d35b887)

Source: session 6c0db597-361b-4d5c-b60b-338bb201c865. The implement and fix agents reported these rules, and the suite passed (1665 of 1665 at merge). The dream run did not re-read the code for this section; check `hooks/core/safe-db.mjs` and its tests before relying on a line.

- The holes of card P-211 now ask. Covered: a database file written or deleted by any command (`>|`, `cp`, `psql -o`, `unlink`, redirections); `sqlite3 .read`; `psql <file` and `psql 0<file`; `mongosh --file` and `updateMany({})`; `docker system prune --volumes`; `docker compose rm -v`; `CREATE OR REPLACE TABLE`; `psql -f` and `\i`.
- `xargs rm` rule (final after three fix rounds): a step that is not a database client passes its words and its heredoc to `xargs`; `cat` only drops its own files. Reported outcomes: `grep x app.db | xargs rm` asks; `cat <<< app.db | xargs rm` asks; `cat app.db | xargs rm tmp.txt` still passes.
- Paths for `psql -f` and `\i` resolve from the command's own folder, not the project root (`hooks/core/safe-db.mjs:75` uses `ev.cwd`). Before this, `cd supabase && psql -f x.sql` read the wrong file, and an unreadable file let the command pass.
- `\ir` inside a file that enters through `<` resolves from the current folder. `psql 0<` is read the same as `<`.
- `down` matches only as a whole word. `docker compose run --rm ... -v` and `-f docker-compose.yml` no longer ask (false alarms removed).
- Two holes found by the Opus/Fable comparison were closed at HEAD before group A: `psql` with two `-c` (the WHERE of the second lets the first DELETE through) and `kubectl exec ... -- psql -c "DROP ..."` (the ` -- ` read as a comment).
- Subagents: a command that would need the owner is denied inside a subagent (`safe-db.mjs:104-106`, as the session read it).
- Still open, with cards: `while read ... rm` over a heredoc. Include files that cannot be read pass with no warning (a hook can only warn through a context text, `hooks/adapters/claude.mjs:27`); this is the same item as P-228 above, and the session did not show its status. Includes were planned to be followed five levels deep with a cycle guard; the session did not show that code.

Related: [[phase-1-progress]] (the phase 1 history; T18 is not part of it), [[workflow-upgrade-2026-11]] (the open list of the same hook), [[risk-reviewer-model-test]] (the reviewer comparison of 2026-11-23, where the `safe-db -f` path bug was one of the Fable-only findings).
