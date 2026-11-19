import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
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

test("comments stay text, so a form inside one asks; statements split on ;", () => {
  assert.ok(asks(`psql -c "SELECT 1 -- DROP TABLE x"`));
  assert.ok(asks(`psql -c "SELECT /* DROP TABLE x */ 1"`));
  assert.ok(asks(`psql -c "SELECT '/*'; DROP TABLE x; SELECT '*/'"`));
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
  assert.ok(allowed("cat dropdb.txt && ls rails"));
});

test("a grant or revoke of truncate is not a truncate", () => {
  assert.ok(allowed('psql -c "REVOKE TRUNCATE ON t FROM anon; GRANT TRUNCATE ON t TO app"'));
  assert.ok(asks('psql -c "GRANT TRUNCATE ON t TO app; TRUNCATE t"'));
});

test("a SQL file resolves from the event's cwd, then from each cd before the client", () => {
  mkdirSync(join(root, "sub", "deep"), { recursive: true });
  writeFileSync(join(root, "sub", "deep", "bad.sql"), "TRUNCATE users;");
  assert.ok(asks("psql -f deep/bad.sql", { cwd: join(root, "sub") }));
  assert.ok(asks("cd sub && cd deep && psql -f bad.sql"));
  assert.ok(allowed("psql -f deep/bad.sql"));
});

test("any bracket in a DELETE or UPDATE statement asks, a WHERE or not", () => {
  assert.ok(asks('psql -c "DELETE FROM t WHERE id IN (SELECT id FROM u WHERE a = 1) OR 1=1"'));
  assert.ok(asks('psql -c "DELETE FROM t USING (SELECT id FROM u WHERE a = 1) x"'));
  assert.ok(asks('psql -c "DELETE FROM t WHERE (1=2) OR id = 1"'));
  assert.ok(asks('psql -c "DELETE FROM t WHERE id = 1)"'));
  assert.ok(asks('psql -c "UPDATE t SET a = (SELECT b FROM u WHERE u.id = 1)"'));
  assert.ok(allowed('psql -c "DELETE FROM t WHERE id = 1 AND a = 2"'));
});

test("a tool is an unquoted word anywhere, behind any runner: ask", () => {
  for (const c of ["npx supabase db reset", "pnpm supabase db reset", "bunx supabase db reset", 'docker exec -i db psql -U postgres -c "DROP TABLE users"',
    "docker exec redis redis-cli FLUSHALL", "poetry run python manage.py flush", "dotenv -- npx prisma migrate reset", "npx dropdb app",
    "timeout 60 supabase db reset", "mise exec -- rails db:reset", "kubectl exec pod -- redis-cli flushdb", "/usr/bin/env FOO=1 dropdb app"])
    assert.ok(asks(c), c);
});

test("a tool name inside a larger quoted word never counts; rm counts only as the command word", () => {
  for (const c of ['git commit -m "docs: npx supabase db reset"', `git commit -m "run psql -c 'DROP TABLE x'"`, 'echo "docker exec redis redis-cli FLUSHALL"',
    "git rm --cached dev.db", "git rm -f data/app.sqlite"])
    assert.ok(allowed(c), c);
  assert.ok(asks("sudo rm app.db"));
});

test("separate -c values, heredoc body and piped input are separate statements", () => {
  assert.ok(asks('psql -c "TRUNCATE users" -c "GRANT SELECT ON t TO app"'));
  assert.ok(asks('psql -c "DELETE FROM users" -c "SELECT * FROM t WHERE id=1"'));
  assert.ok(asks('psql -c "UPDATE t SET a=1 WHERE id=1" -c "UPDATE u SET b=2"'));
  assert.ok(asks('echo "DELETE FROM users" | psql -c "SELECT * FROM t WHERE id=1"'));
  assert.ok(allowed('psql -c "DELETE FROM users WHERE id=1" -c "UPDATE u SET b=2 WHERE id=3"'));
  assert.ok(allowed("psql -U app mydb -c 'DELETE FROM users WHERE id=1'"));
});

test("any quote mark in a DELETE or UPDATE statement asks, a WHERE or not", () => {
  assert.ok(asks(`psql -c "UPDATE users SET name='x' WHERE id=1"`));
  assert.ok(asks(`psql -c "UPDATE docs SET body = 'Drop us a line where you live'"`));
  assert.ok(asks(`psql -c "UPDATE jobs SET sql = 'DELETE FROM x WHERE id = 1'"`));
  assert.ok(asks(`psql -c "UPDATE t SET note = 'size (L' WHERE id = 1"`));
  assert.ok(asks(`psql -c "UPDATE t SET note = 'a; b' WHERE id = 1"`));
  assert.ok(asks(`psql -c "UPDATE t SET note = 'it''s; (x' WHERE id = 1"`));
  assert.ok(asks(`psql -c "UPDATE t SET note = 'drop table x -- y' WHERE id = 1"`));
  assert.ok(asks(`psql -c "UPDATE t SET note = 'a; b'"`));
  assert.ok(asks(`psql -c "SELECT 'x'; DROP TABLE users"`));
  assert.ok(asks(`psql -c "DELETE FROM t WHERE 'a'='a'"`));
  assert.ok(asks(`psql -c "DELETE FROM t WHERE name = \\"x\\""`));
});

test("a wrong quote pairing asks, never passes", () => {
  const sql = `UPDATE users SET bio='I\\'m back' WHERE id=1; DELETE FROM sessions; UPDATE t SET a='x' WHERE id=2`;
  assert.ok(asks(`mysql app -e "${sql}"`));
  assert.ok(asks(`psql -c "UPDATE t SET a = E'it\\'s' WHERE id=1; DELETE FROM sessions; UPDATE u SET b='x' WHERE id=2"`));
  writeFileSync(join(root, "q.sql"), sql);
  assert.ok(asks("mysql app < q.sql"));
  assert.ok(asks(`psql -v "who=O'Brien" -c "DELETE FROM sessions" -c "UPDATE t SET a='x' WHERE id=2"`));
  assert.ok(asks(`psql -c "UPDATE t SET a = 'it''s' WHERE id = 1; UPDATE u SET b = 'x' WHERE id = 2"`));
});

test("rm counts as a database delete behind any runner, unless git runs it", () => {
  for (const c of ["exec rm prod.db", "timeout 60 rm prod.db", "docker exec db rm /var/lib/app.db", "sudo -u git rm /srv/app.db", "echo git rm; rm prod.db"]) assert.ok(asks(c), c);
  assert.ok(allowed("git rm --cached dev.db"));
  assert.ok(allowed("git rm -f data/app.sqlite"));
});

test("dropdb asks whenever it runs: a name follows it or it is the command word", () => {
  for (const c of ["dropdb app", "npx dropdb app", "dropdb", "echo app | xargs dropdb", "sudo dropdb", "cd x && dropdb"]) assert.ok(asks(c), c);
  assert.ok(allowed("which dropdb"));
  assert.ok(allowed("man dropdb"));
  assert.ok(allowed('echo "dropdb app"'));
});
