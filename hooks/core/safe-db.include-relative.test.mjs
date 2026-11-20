import { test } from "node:test";
import assert from "node:assert/strict";
import { decide } from "./safe-db.mjs";

const root = "/proj";
const files = { "/proj/migrations/main.sql": "\\ir drop_all.sql\n", "/proj/migrations/drop_all.sql": "DROP TABLE users;", "/proj/bad.sql": "DROP TABLE users;", "/proj/top.sql": "\\i 'bad.sql'\n" };
const ctx = { readFile: (p) => files[p] ?? null };
const run = (command) => decide({ event: "preTool", tool: "Bash", kind: "shell", session: "s", root, isSubagent: false, writes: [], command }, ctx).decision;

test("\\ir resolves from the folder of the including file", () => {
  assert.equal(run("psql -f migrations/main.sql"), "ask");
});

test("a quoted include path is unquoted", () => {
  assert.equal(run("psql -f top.sql"), "ask");
});
