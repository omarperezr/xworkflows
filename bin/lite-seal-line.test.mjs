import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { repo, cli, writeJson, ALL_KEYS } from "./shared.test.mjs";

const RISK = "---\nname: risk-review\nmodel: fable\n---\nEnd your reply with: risk-review ok at <sha>\n";

test("the lite reviewer seals with its own name, not the risk reviewer's", () => {
  const r = repo({ ".claude/agents/risk-review.md": RISK });
  mkdirSync(join(r, ".xworkflows"), { recursive: true });
  writeJson(r, ".xworkflows/config.json", { ...ALL_KEYS, paths: { ...ALL_KEYS.paths, risk: ["ui/"], riskLite: ["ui/"] } });
  assert.equal(cli(r, ["install", "--yes"]).status, 0);
  const lite = readFileSync(join(r, ".claude/agents/risk-review-lite.md"), "utf8");
  assert.ok(!/risk-review ok at/.test(lite), lite);
  assert.match(lite, /risk-review-lite ok at/);
});
