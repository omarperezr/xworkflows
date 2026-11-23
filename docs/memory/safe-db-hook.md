---
name: safe-db-hook
description: "The xworkflows safe-db hook (hooks/core/safe-db.mjs): what passes, what asks the owner, and the holes the owner discarded on 2026-11-23"
metadata:
  node_type: memory
  type: reference
  modified: 2026-11-23T00:00:00.000Z
---

# safe-db hook

`hooks/core/safe-db.mjs`, tests in `hooks/core/safe-db.test.mjs` (`node --test hooks/`). It decides whether a shell command that touches a database client (mysql, psql, dropdb and similar) must ask the owner first. Inside a subagent a command that would ask is denied.

- Allowlist, not blocklist (a blocklist kept leaving gaps): only a simple DELETE or UPDATE with a WHERE that compares to a plain number passes. A signed number, a bare point, a zero, OR or NOT ask. `dropdb` always asks.
- A text filter or lookup (grep, rg, awk, sed, head, tail, wc, which, type, `command -v`) does not count its arguments as clients, so `grep -rn dropdb .` passes. A truncating redirect into a database file and `rm` of a database file still ask.
- Card P-211 (closed 2026-11-23): writing or deleting a database file by any command, `sqlite3 .read`, `psql <file`, `mongosh --file`, `docker system prune --volumes`, `docker compose rm -v` and similar now ask. Paths for `psql -f` and `\i` resolve from the command's own folder.
- Holes the owner discarded in his 2026-11-23 triage (P-205, P-212 to P-216, P-228): for example a SQL file piped through `grep` into `psql`, and `git grep dropdb` asking. P-214 and P-215 are `blocking` by the triage bar, so the owner may revisit them.

Lesson: add the new cases first, see them fail, then change the code; the red run is the evidence.

Related: [[workflow-upgrade-2026-11]], [[triage-bar]].
