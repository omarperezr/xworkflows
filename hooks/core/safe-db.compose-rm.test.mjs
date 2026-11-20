import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decide } from "./safe-db.mjs";

const root = mkdtempSync(join(tmpdir(), "safe-db-"));
const ev = (command) => ({ event: "preTool", tool: "Bash", kind: "shell", session: "s", root, isSubagent: false, writes: [], command });
const ctx = { readFile: (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } } };
const verdict = (c) => decide(ev(c), ctx).decision;

test("compose run --rm is not a volume removal: allowed", () => {
  for (const c of ["docker compose run --rm app pytest -v", "docker-compose run --rm web pytest -v"]) assert.equal(verdict(c), "allow", c);
});

test("compose rm -vf removes volumes: asks", () => {
  for (const c of ["docker compose rm -vf", "docker-compose rm -vf db"]) assert.equal(verdict(c), "ask", c);
});
