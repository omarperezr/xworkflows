import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decide } from "./safe-db.mjs";

const root = mkdtempSync(join(tmpdir(), "safe-db-"));
const ev = (command, extra = {}) => ({ event: "preTool", tool: "Bash", kind: "shell", session: "s", root, isSubagent: false, writes: [], command, ...extra });
const ctx = { readFile: (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } } };
const asks = (c, e) => decide(ev(c, e), ctx).decision === "ask";
const allowed = (c, e) => decide(ev(c, e), ctx).decision === "allow";

test("SQL forms given with -c: ask", () => {
  for (const s of ["DROP DATABASE app", "drop schema public cascade", "DROP TABLE users", "TRUNCATE users", "truncate table users",
    "DELETE FROM users", "delete from users where 1=1", "DELETE FROM users WHERE true", "DELETE FROM users WHERE 'a'='a'", "UPDATE users SET a = 1", "update users set a=1 where 1 = 1"]) {
    const d = decide(ev(`psql -c "${s}"`), ctx);
    assert.equal(d.decision, "ask", s);
    assert.ok(d.reason);
  }
});

test("comments are ignored and statements split on ;", () => {
  assert.ok(allowed(`psql -c "SELECT 1 -- DROP TABLE x"`));
  assert.ok(allowed(`psql -c "SELECT /* DROP TABLE x */ 1"`));
  assert.ok(asks(`psql -c "SELECT 1; DELETE FROM users"`));
  assert.ok(allowed(`psql -c "DELETE FROM users WHERE id = 1; UPDATE t SET a=1 WHERE id=2"`));
  assert.ok(asks(`psql --dbname=x -c "DROP TABLE a"`));
});

test("heredoc: ask", () => {
  assert.ok(asks("psql <<EOF\nDELETE FROM users\nEOF"));
  assert.ok(allowed("psql <<EOF\nDELETE FROM users\nWHERE id = 1\nEOF"));
  assert.ok(asks("psql <<EOF\nDELETE FROM users WHERE 1=1\nEOF"));
});

test("allowed SQL", () => {
  for (const s of ["DELETE FROM users WHERE id = 1", "UPDATE users SET a=1 WHERE id=2", "CREATE TABLE t (a int)", "ALTER TABLE t ADD COLUMN b int", "SELECT * FROM users", "DELETE FROM users WHERE 1=1 AND id = 3"])
    assert.ok(allowed(`psql -c "${s}"`), s);
});

test("SQL file the command names is read: -f, --file=, --file, <", () => {
  writeFileSync(join(root, "bad.sql"), "-- reset\nTRUNCATE users;");
  writeFileSync(join(root, "bad2.sql"), "DELETE FROM users;");
  writeFileSync(join(root, "good.sql"), "CREATE TABLE t (a int);\nALTER TABLE t ADD COLUMN b int;\nDELETE FROM t WHERE id = 1;");
  assert.ok(asks("psql -f bad.sql"));
  assert.ok(asks("psql -f bad2.sql"));
  assert.ok(asks("psql --file=bad.sql"));
  assert.ok(asks("psql --file bad.sql"));
  assert.ok(asks("psql mydb < bad.sql"));
  assert.ok(asks(`psql -f ${join(root, "bad.sql")}`));
  assert.ok(allowed("psql -f good.sql"));
  assert.ok(allowed("psql mydb < good.sql"));
});

test("an unreadable SQL file lets the call through", () => {
  assert.ok(allowed("psql -f missing.sql"));
  assert.ok(allowed("psql < missing.sql"));
});

test("CLI resets: ask", () => {
  for (const c of ["dropdb app", "supabase db reset", "prisma migrate reset", "prisma db push --force-reset", "prisma db push --accept-data-loss",
    "rails db:drop", "rails db:reset", "rails db:schema:load", "bin/rake db:drop", "python manage.py flush", "sequelize db:drop", "npx knex migrate:rollback --all",
    "redis-cli FLUSHALL", "redis-cli -n 2 flushdb", `mongosh --eval "db.dropDatabase()"`, `mongosh --eval "db.users.deleteMany({})"`,
    "rm app.db", "rm -f data/app.sqlite", "rm 'x.sqlite3'", "cd x && rm -rf a.db"])
    assert.ok(asks(c), c);
});

test("ordinary commands pass", () => {
  for (const c of ["ls", "prisma migrate dev", "prisma db push", "rails db:migrate", "knex migrate:rollback", "redis-cli GET a", `mongosh --eval "db.users.deleteMany({a:1})"`, "rm app.txt", "rm dbfile", "psql -c 'SELECT 1'", "tail -f log.txt", "rm -f notes.md"])
    assert.ok(allowed(c), c);
});

test("subagent: deny and hand to the main session", () => {
  const d = decide(ev("dropdb app", { isSubagent: true }), ctx);
  assert.equal(d.decision, "deny");
  assert.match(d.reason, /main session/);
});

test("broken input allows", () => {
  assert.equal(decide(undefined, ctx).decision, "allow");
  assert.equal(decide({ kind: "write" }, ctx).decision, "allow");
  assert.equal(decide(ev(null), ctx).decision, "allow");
});

test("SQL piped to a client or run by a client behind a keyword or wrapper: ask", () => {
  assert.ok(asks("cat <<EOF | psql mydb\nDROP TABLE users\nEOF"));
  assert.ok(asks('echo "TRUNCATE users" | psql'));
  assert.ok(asks('if true; then sudo -u pg psql -c "TRUNCATE users"; fi'));
  assert.ok(allowed("cat <<EOF\nDROP TABLE users\nEOF"));
  assert.ok(allowed('echo "TRUNCATE users"'));
});

test("CLI forms count only when the command word is that tool or its runner", () => {
  assert.ok(asks("npm run db:reset"));
  assert.ok(asks("FOO=1 bundle exec rake db:drop"));
  assert.ok(asks("./manage.py flush"));
  assert.ok(allowed('echo "dropdb app"'));
  assert.ok(allowed("cat dropdb.txt && echo rails db:reset"));
});

test("a grant or revoke of truncate is not a truncate", () => {
  assert.ok(allowed('psql -c "REVOKE TRUNCATE ON t FROM anon; GRANT TRUNCATE ON t TO app"'));
  assert.ok(asks('psql -c "GRANT TRUNCATE ON t TO app; TRUNCATE t"'));
});
