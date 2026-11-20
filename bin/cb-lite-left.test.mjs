import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repo, cli, writeJson, ALL_KEYS } from "./shared.test.mjs";
const withKeys = (r, extra) => { mkdirSync(join(r, ".xworkflows"), { recursive: true }); writeJson(r, ".xworkflows/config.json", { ...ALL_KEYS, ...extra }); };
const RISK = "---\nname: risk-review\ndescription: The project's risk reviewer.\nmodel: fable\ntools: Read, Grep, Glob, Bash\neffort: xhigh\n---\n\nCheck the money paths.\n";
test("emptying paths.riskLite and installing again removes the lite file and its ignore line; uninstall leaves nothing", () => {
  const r = repo({ ".claude/agents/risk-review.md": RISK });
  const lite = join(r, ".claude/agents/risk-review-lite.md");
  withKeys(r, { paths: { ...ALL_KEYS.paths, risk: ["src/ui"], riskLite: ["src/ui"] } });
  assert.equal(cli(r, ["install", "--yes"]).status, 0);
  assert.ok(existsSync(lite));
  withKeys(r, { paths: { ...ALL_KEYS.paths, risk: ["src/ui"], riskLite: [] } });
  assert.equal(cli(r, ["install", "--yes"]).status, 0);
  assert.ok(!existsSync(lite), "lite file left after second install");
  cli(r, ["uninstall"]);
  assert.ok(!existsSync(lite), "lite file left after uninstall");
});
