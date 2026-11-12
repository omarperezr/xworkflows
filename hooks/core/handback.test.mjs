import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decide } from "./handback.mjs";
import { DEFAULTS } from "./config.mjs";

const config = { ...DEFAULTS, owner: "Ana", roles: { ...DEFAULTS.roles, implementers: ["implement", "mechanical"], reviewer: "review", riskReviewer: "risk-review", verifier: "verify-finding" } };
const fake = () => { const m = new Map(); return { config, state: (k) => m.get(k) ?? null, save: (k, v) => m.set(k, String(v)), m }; };
const run = (message, agent = "implement", ctx = fake()) => ({ ...decide({ event: "preTool", kind: "handback", agent, message }, ctx), ctx });
const denied = (r) => r.decision === "deny";
const full = "red: a.test.ts::x - fails\ngreen: a.test.ts::x\nskipped: nothing\nsha: abc1234\napp: ok";

test("a complete report passes", () => assert.equal(run(full).decision, "allow"));
test("no-test replaces red and green", () => assert.equal(run("no-test: text\nskipped: nothing\nsha: abc1234").decision, "allow"));
test("missing red and green: denies and names them", () => {
  const r = run("skipped: nothing\nsha: abc1234");
  assert.ok(denied(r));
  assert.match(r.reason, /red:/);
  assert.match(r.reason, /green:/);
  assert.doesNotMatch(r.reason, /skipped:/);
  assert.match(r.reason, /before the fix/i);
});
test("missing skipped and sha", () => {
  const { reason } = run("red: t::c - l\ngreen: t::c");
  assert.match(reason, /skipped:/);
  assert.match(reason, /sha:/);
});
test("blocked, needs judgment and cannot test pass", () => {
  for (const m of ["blocked: which?", "needs judgment: x", "cannot test: y"]) assert.equal(run(m).decision, "allow");
});
test("the escape accepts markdown and the reason names blocked:", () => {
  for (const m of ["**blocked:** which?", "- `blocked: x`", "> needs judgment: y"]) assert.equal(run(m).decision, "allow", m);
  assert.match(run("nothing").reason, /blocked:/);
});
test("a note 'Cannot test...' with no colon is not the escape, and the reason asks for plain keys", () => {
  const r = run("- Cannot test the 360 layout headless; checked 1280.");
  assert.ok(denied(r));
  assert.match(r.reason, /no bold or numbering/);
});
test("'cannot test the layout' without a colon is denied", () => assert.ok(denied(run("cannot test the layout"))));
test("'Blocked: x' capitalised is denied", () => assert.ok(denied(run("Blocked: x"))));
test("the escape only counts at line start", () => assert.ok(denied(run("done, there was blocked: nothing"))));
test("another agent or none passes; every implementer is held", () => {
  assert.equal(run("nothing", "Explore").decision, "allow");
  assert.equal(decide({ kind: "handback", message: "nothing" }, fake()).decision, "allow");
  assert.ok(denied(run("nothing", "mechanical")));
});
test("a missing field or another kind or event is allowed", () => {
  assert.equal(decide({ kind: "handback", agent: "implement" }, fake()).decision, "deny");
  assert.equal(decide({ kind: "shell", command: "ls" }, fake()).decision, "allow");
  assert.equal(decide({ event: "prompt", prompt: "x" }, fake()).decision, "allow");
});
test("reviewers: without reviewed: and not checked: denies and names them", () => {
  for (const agent of ["review", "risk-review"]) {
    const r = run("verdict: ok", agent);
    assert.ok(denied(r));
    assert.match(r.reason, /reviewed:.*files/);
    assert.match(r.reason, /not checked:.*nothing/);
    const only = run("reviewed: a.ts\nverdict: ok", agent).reason;
    assert.match(only, /not checked:/);
    assert.doesNotMatch(only, /`reviewed:/);
  }
});
test("reviewers: both lines, or blocked:, pass; no red or sha asked", () => {
  for (const agent of ["review", "risk-review"]) {
    assert.equal(run("reviewed: a.ts, b.ts\nnot checked: nothing", agent).decision, "allow");
    assert.equal(run("reviewed: a.ts\nnot checked: the 360", agent).decision, "allow");
    assert.equal(run("blocked: which?", agent).decision, "allow");
  }
});
test("reviewer: cannot test: is no escape and keys sit at line start", () => {
  assert.ok(denied(run("cannot test: x", "review")));
  assert.ok(denied(run("needs judgment: x", "review")));
  assert.ok(denied(run("saw reviewed: a.ts and not checked: nothing", "risk-review")));
});
test("verifier: red: or discarded:, or blocked:", () => {
  assert.equal(run("red: t::c - fails", "verify-finding").decision, "allow");
  assert.equal(run("- discarded: guarded upstream", "verify-finding").decision, "allow");
  assert.equal(run("blocked: which?", "verify-finding").decision, "allow");
  const r = run("it is fine", "verify-finding");
  assert.ok(denied(r));
  assert.match(r.reason, /red:/);
  assert.match(r.reason, /discarded:/);
  assert.ok(denied(run("cannot test: x", "verify-finding")));
});
test("the deny names the owner from config", () => assert.match(run("x").reason, /Ana/));
test("an allowed handback resets the agent count; a denied one saves nothing", () => {
  const ok = fake();
  ok.save("agents", "3");
  run(full, "implement", ok);
  assert.equal(ok.state("agents"), "0");
  const no = fake();
  no.save("agents", "3");
  run("nothing", "implement", no);
  assert.equal(no.state("agents"), "3");
  // changed: an agent in no role used to save nothing; every allowed handback resets the count
  const other = fake();
  other.save("agents", "2");
  run("nothing", "Explore", other);
  assert.equal(other.state("agents"), "0");
});
test("an installed name (xwf-<role>) is held to its role's report", () => {
  const ctx = { ...fake(), agentName: (id) => `xwf-${id}` };
  assert.ok(denied(run("verdict: ok", "xwf-review", ctx)));
  assert.ok(denied(run("nothing", "xwf-implement", ctx)));
  assert.ok(denied(run("nothing", "xwf-verify-finding", ctx)));
  assert.equal(run("reviewed: a\nnot checked: nothing", "xwf-review", ctx).decision, "allow");
  // the bare name is then the project's own agent: not held to our report
  assert.equal(run("verdict: ok", "review", ctx).decision, "allow");
});

test("through the real runner: deny, then allow and reset", () => {
  const dir = mkdtempSync(join(tmpdir(), "xwf-test-"));
  const env = { ...process.env, XWORKFLOWS_STATE_DIR: dir };
  for (const k of ["CLAUDE_PROJECT_DIR", "XWORKFLOWS_FREE", "XWORKFLOWS_RECORD"]) delete env[k];
  const spawn = (message) => spawnSync("node", [join(import.meta.dirname, "..", "run.mjs"), "claude", "handback"], {
    input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "SubagentHandback", session_id: "s1", cwd: dir, agent_id: "a1", agent_type: "implement", tool_input: { message } }),
    env, encoding: "utf8",
  });
  const r1 = spawn("nothing");
  assert.equal(JSON.parse(r1.stdout).hookSpecificOutput.permissionDecision, "deny");
  assert.ok(!readdirSync(dir).some((f) => f.startsWith("xwf-agents-")));
  assert.equal(spawn(full).stdout, "");
  assert.equal(readFileSync(join(dir, "xwf-agents-s1"), "utf8"), "0");
});
