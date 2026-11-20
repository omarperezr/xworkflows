import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decide } from "./safe-db.mjs";

const root = mkdtempSync(join(tmpdir(), "safe-db-"));
const ev = (command) => ({ event: "preTool", tool: "Bash", kind: "shell", session: "s", root, isSubagent: false, writes: [], command });
const ctx = { readFile: () => null };

test("a name lister other than find/ls/echo/printf feeding xargs rm asks", () => {
  for (const c of ["grep -l secret *.db | xargs rm", "git ls-files '*.db' | xargs rm", "rg --files -g '*.sqlite' | xargs rm", "fd -g '*.db' | xargs rm", "locate app.db | xargs rm"]) assert.equal(decide(ev(c), ctx).decision, "ask", c);
});
