import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repo, git, cli } from "./shared.test.mjs";

test("uninstall removes an agent file install wrote even when a later tracked file changes today's render", () => {
  const r = repo({ "app.py": "", ".xworkflows/config.json": JSON.stringify({ paths: { code: ["src"] } }) });
  assert.equal(cli(r, ["install", "--yes"]).status, 0);
  const f = ".claude/agents/implement-sql.md";
  assert.ok(existsSync(join(r, f)), "install wrote " + f);
  mkdirSync(join(r, "src"), { recursive: true });
  writeFileSync(join(r, "src/q.sql"), "select 1;\n");
  git(r, "add src/q.sql");
  const out = cli(r, ["uninstall"]);
  assert.doesNotMatch(out.stdout, /kept \(changed locally\): \.claude\/agents\/implement-sql\.md/);
  assert.equal(existsSync(join(r, f)), false);
});
