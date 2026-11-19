import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decide } from "./safe-db.mjs";

const root = mkdtempSync(join(tmpdir(), "safe-db-any-"));
const ctx = { readFile: (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } } };
const run = (command, isSubagent = false) => decide({ event: "preTool", tool: "Bash", kind: "shell", session: "s", root, isSubagent, writes: [], command }, ctx).decision;

test("commands that only mention SQL or CLI words are allowed", () => {
  for (const c of ['git commit -m "fix: truncate long titles"', 'git commit -m "fix: delete from cache on logout"',
    'grep -rn "truncate" src/', "truncate -s 0 log.txt", 'grep -n "db:reset" package.json', "git rm --cached dev.db"]) {
    assert.equal(run(c), "allow", c);
    assert.equal(run(c, true), "allow", `${c} (subagent)`);
  }
});

test("a migration with grant truncate run by psql -f asks: no grant exception", () => {
  writeFileSync(join(root, "m.sql"), 'grant truncate on table x to "anon";\n');
  assert.equal(run("psql -f m.sql"), "ask");
});
