import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decide } from "./safe-db.mjs";

const root = mkdtempSync(join(tmpdir(), "safe-db-cwd-"));
mkdirSync(join(root, "db"));
writeFileSync(join(root, "db", "reset.sql"), "TRUNCATE users;\n");
const ev = (command) => ({ event: "preTool", tool: "Bash", kind: "shell", session: "s", root, isSubagent: false, writes: [], command });
const ctx = { readFile: (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } } };

for (const c of [
  "psql -f db/reset.sql",
  "cd db && psql -f reset.sql",
  'cd db && psql "$URL" < reset.sql',
  'ls src/*/x && psql -c "DROP TABLE users" && ls lib/*/y',
  'psql -c "UPDATE t SET a = (SELECT b FROM u WHERE u.id = 1)"',
]) test(`asks: ${c}`, () => assert.equal(decide(ev(c), ctx).decision, "ask"));
