import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "../test-tmp.mjs";
import { DEFAULTS } from "./core/config.mjs";
import { plan, tierOf, judge, main } from "./run-agent.mjs";

const made = [];
test.after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const TIERS = { antigravity: { cheap: "flash", medium: "pro", top: "gemini-4-neon-high", strongest: "gemini-4-neon-xhigh" } };

test("run-agent: reviewer on top, risk reviewers on strongest, others refused", () => {
  assert.equal(tierOf("review", DEFAULTS.roles), "top");
  assert.equal(tierOf("risk-review", DEFAULTS.roles), "strongest");
  assert.equal(tierOf("risk-review-lite", DEFAULTS.roles), "strongest");
  assert.equal(tierOf("implement", DEFAULTS.roles), null);
  assert.match(plan({ role: "implement", prompt: "x", config: DEFAULTS, tiers: TIERS }).error, /invoke_subagent/);
});

test("run-agent: the concrete model, the agent and the subagent mark reach agy; a keyword or inherit is refused", () => {
  const p = plan({ role: "risk-review", prompt: "review docs/superpowers/plans/p.md abc1234", config: DEFAULTS, tiers: TIERS, env: { PATH: "/bin" } });
  assert.equal(p.bin, "agy");
  assert.deepEqual(p.args, ["-p", "review docs/superpowers/plans/p.md abc1234", "--model", "gemini-4-neon-xhigh", "--agent", "risk-review", "--dangerously-skip-permissions"]);
  assert.equal(p.env.XWORKFLOWS_AGENT, "risk-review");
  assert.ok(!p.args.includes("--sandbox"));
  assert.equal(plan({ role: "review", prompt: "x", config: DEFAULTS, tiers: TIERS }).model, "gemini-4-neon-high");
  for (const bad of ["inherit", "pro", "flash", undefined]) {
    assert.match(plan({ role: "review", prompt: "x", config: DEFAULTS, tiers: { antigravity: { top: bad } } }).error, /concrete model/, String(bad));
  }
  assert.match(plan({ role: "review", prompt: "  ", config: DEFAULTS, tiers: TIERS }).error, /empty/);
});

test("run-agent: a report without reviewed: and not checked: fails, a full one passes", () => {
  assert.equal(judge("review", "looks fine", DEFAULTS).decision, "deny");
  assert.equal(judge("review", "reviewed: a.mjs\nnot checked: nothing", DEFAULTS).decision, "allow");
});

test("run-agent: main runs agy with the plan and exits 1 on a report missing its keys", () => {
  const root = mkdtempSync(join(tmpdir(), "xwf-runagent-")); made.push(root);
  mkdirSync(join(root, ".xworkflows"));
  writeFileSync(join(root, ".xworkflows/tiers.json"), JSON.stringify(TIERS));
  writeFileSync(join(root, "p.md"), "review docs/superpowers/plans/p.md");
  const seen = [];
  const io = (stdout) => ({ cwd: root, env: { PATH: "/bin" }, out: () => {}, err: () => {}, run: (bin, args, o) => { seen.push({ bin, args, agent: o.env.XWORKFLOWS_AGENT }); return { status: 0, stdout }; } });
  assert.equal(main(["review", "p.md"], io("reviewed: x\nnot checked: nothing\n")), 0);
  assert.deepEqual([seen[0].bin, seen[0].args[3], seen[0].agent], ["agy", "gemini-4-neon-high", "review"]);
  assert.equal(main(["review", "p.md"], io("all good\n")), 1);
  assert.equal(main(["implement", "p.md"], io("")), 2);
  assert.equal(main(["review"], io("")), 2);
});
