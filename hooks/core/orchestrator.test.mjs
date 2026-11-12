import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decide } from "./orchestrator.mjs";
import { load } from "./config.mjs";

const T0 = 1_000_000_000_000;
const base = load("/nonexistent", () => null);
const cfg = { ...base, owner: "Ana", paths: { ...base.paths, code: ["src/"], heavyRead: ["src/", "supabase/"] } };
const ev = (kind, extra = {}) => ({ event: "preTool", tool: "t", kind, session: "s", root: "/r", isSubagent: false, ...extra });
const agent = (type, extra = {}) => ev("agent", { agent: type, ...extra });
const read = (path, limit) => ev("read", { path, limit });
const sh = (command) => ev("shell", { command });
const SUMMARY = "/r/.xworkflows/summary.md";
// a ctx where the session is oriented: approved summary, orchestrate mark, every agent type defined, index fresh
function mk({ marks = ["orchestrate"], files = { [SUMMARY]: "status: approved\n" }, exist = [".claude/agents/", "graphify-out"], head = "h1", state = {}, config = cfg } = {}) {
  const st = new Map(Object.entries({ index: T0 - 1000, ...state }));
  return {
    config, st,
    marked: (s) => marks.includes(s),
    readFile: (p) => files[p] ?? null,
    exists: (p) => exist.includes(p) || (p.startsWith(".claude/agents/") && exist.includes(".claude/agents/")),
    git: () => head,
    state: (k) => st.get(k) ?? null,
    save: (k, v) => st.set(k, v),
    now: () => T0,
  };
}
const denied = (d, re) => d.decision === "deny" && (!re || re.test(d.reason));
const allowed = (d) => d.decision === "allow";
const explore = agent("explore");

test("agent and workflow need the orchestrate skill mark (any of the four)", () => {
  assert.ok(denied(decide(explore, mk({ marks: [] })), /orchestrate/));
  assert.ok(denied(decide(ev("workflow"), mk({ marks: ["front"] }))));
  for (const m of ["orchestrate", "adapt", "full-review", "next-step"]) assert.ok(allowed(decide(explore, mk({ marks: [m] }))), m);
  assert.ok(allowed(decide(ev("workflow"), mk())));
});

test("rule 0: no approved summary denies agents, except under adapt", () => {
  for (const files of [{}, { [SUMMARY]: "status: draft\n" }]) {
    assert.ok(denied(decide(explore, mk({ files })), /summary\.md/));
    assert.ok(denied(decide(ev("workflow"), mk({ files })), /Ana/));
    assert.ok(allowed(decide(explore, mk({ files, marks: ["adapt"] }))));
  }
  assert.ok(allowed(decide(explore, mk({ files: { [SUMMARY]: "date: 2026-11-12\nstatus: approved\n" } }))));
});

test("agent without type or without a definition denies; built-in types pass", () => {
  assert.ok(denied(decide(agent(undefined), mk())));
  assert.ok(denied(decide(agent("general-purpose"), mk({ exist: ["graphify-out"] })), /\.claude\/agents/));
  assert.ok(allowed(decide(agent("general-purpose"), mk({ exist: [], config: { ...cfg, roles: { ...cfg.roles, builtIn: ["general-purpose"] } } }))));
});

test("web denied; read of png, jpg or pdf denied in any case", () => {
  assert.ok(denied(decide(ev("web"), mk())));
  assert.ok(allowed(decide(ev("web"), mk({ config: { ...cfg, mainSession: { ...cfg.mainSession, denyWeb: false } } }))));
  assert.ok(denied(decide(read("/r/x/a.PNG"), mk())));
  assert.ok(denied(decide(read("C:\\x\\a.pdf"), mk())));
  assert.ok(allowed(decide(read("/r/x/a.txt"), mk())));
});

test("read under heavyRead: no limit or above 40 denies, 40 passes; elsewhere passes", () => {
  assert.ok(denied(decide(read("/r/src/a.ts"), mk()), /40/));
  assert.ok(denied(decide(read("src/a.ts", 41), mk())));
  assert.ok(allowed(decide(read("src/a.ts", 40), mk())));
  assert.ok(denied(decide(read("/r/supabase/m.sql"), mk())));
  assert.ok(allowed(decide(read("/r/docs/a.md"), mk())));
  assert.ok(allowed(decide(read("/elsewhere/src/a.ts"), mk())));
});

test("heavyRead unset or limit from config", () => {
  const { heavyRead, ...p } = cfg.paths;
  assert.ok(allowed(decide(read("/r/src/a.ts"), mk({ config: { ...cfg, paths: p } }))));
  assert.ok(allowed(decide(sh("cat src/a.ts"), mk({ config: { ...cfg, paths: p } }))));
  assert.ok(allowed(decide(read("src/a.ts", 100), mk({ config: { ...cfg, limits: { ...cfg.limits, inlineReadLines: 100 } } }))));
});

test("shell: cat of heavyRead denies, git/wc/grep -c pass", () => {
  assert.ok(denied(decide(sh("cat src/a.ts"), mk())));
  assert.ok(denied(decide(sh("sed -n 1,5p supabase/x.sql"), mk())));
  assert.ok(allowed(decide(sh("git diff src/a.ts"), mk())));
  assert.ok(allowed(decide(sh("wc -l src/a.ts; grep -c x src/a.ts"), mk())));
});

test("subagent passes everything except a write under curated", () => {
  const sub = (kind, x = {}) => ev(kind, { isSubagent: true, ...x });
  for (const e of [sub("web"), sub("agent", { agent: "explore" }), sub("read", { path: "src/a.ts" })]) assert.ok(allowed(decide(e, mk({ marks: [], files: {} }))));
  assert.ok(allowed(decide(sub("write", { writes: [{ path: "/r/src/a.ts", content: "x" }] }), mk())));
  assert.ok(denied(decide(sub("write", { writes: [{ path: "/r/CLAUDE.md", content: "x" }] }), mk()), /report the change you wanted instead/));
  assert.ok(denied(decide(sub("write", { writes: [{ path: ".claude/rules/a.md", old: "a", new: "b" }] }), mk())));
  assert.ok(allowed(decide(ev("write", { writes: [{ path: "/r/CLAUDE.md", content: "x" }] }), mk())));
});

test("risk reviewer needs a plan or spec in the prompt", () => {
  assert.ok(denied(decide(agent("risk-review", { prompt: "review the diff" }), mk()), /plan or spec/));
  assert.ok(allowed(decide(agent("risk-review", { prompt: "against docs/superpowers/plans/x.md" }), mk())));
  assert.ok(allowed(decide(agent("risk-review", { prompt: "docs\\superpowers\\specs\\x.md" }), mk())));
});

test("risk reviewer twice on the same HEAD denies; a new HEAD passes", () => {
  const e = agent("risk-review", { prompt: "docs/superpowers/specs/x.md" });
  const c = mk();
  assert.ok(allowed(decide(e, c)));
  assert.equal(c.st.get("risk"), "h1");
  assert.ok(denied(decide(e, c), /already reviewed/));
  assert.ok(allowed(decide(e, { ...c, git: () => "h2" })));
});

test("third agent denies; risk reviewer does not count; ask, user prompt or seal reset", () => {
  const c = mk();
  assert.ok(allowed(decide(ev("prompt", { event: "prompt", prompt: "go", fromUser: true }), c)));
  assert.ok(allowed(decide(explore, c)));
  assert.ok(allowed(decide(explore, c)));
  assert.ok(allowed(decide(agent("risk-review", { prompt: "docs/superpowers/plans/x.md" }), c)));
  assert.ok(denied(decide(explore, c), /Workflow/));
  assert.ok(allowed(decide(ev("ask"), c)));
  assert.ok(allowed(decide(explore, c)));
  assert.ok(allowed(decide(explore, c)));
  assert.ok(denied(decide(explore, c)));
  const seal = ev("write", { writes: [{ path: "/r/docs/superpowers/plans/p.md", old: "Status: draft", new: "review ok at abc1234" }] });
  assert.ok(allowed(decide(seal, c)));
  assert.ok(allowed(decide(explore, c)));
  assert.ok(allowed(decide(explore, c)));
});

test("a seal resets only when added, in plans or specs, with the configured roles", () => {
  const w = (path, o) => ev("write", { writes: [{ path, ...o }] });
  const run = (e, files = {}) => { const c = mk({ state: { agents: 2 }, files: { [SUMMARY]: "status: approved\n", ...files } }); decide(e, c); return c.st.get("agents"); };
  const p = "/r/docs/superpowers/specs/s.md";
  assert.equal(run(w(p, { old: "", new: "risk-review ok at abc1234" })), 0);
  assert.equal(run(w(p, { content: "- review ok at abc1234\n" })), 0);
  assert.equal(run(w(p, { content: "- review ok at abc1234\n" }), { [p]: "- review ok at abc1234\n" }), 2); // already there
  assert.equal(run(w("/r/src/a.md", { content: "review ok at abc1234" })), 2);
  assert.equal(run(w(p, { content: "reviewed ok at abc1234" })), 2);
  assert.equal(run(w(p, { content: "review ok at nothex" })), 2);
  assert.equal(run(w(p, { content: "Status: review ok at abc1234" })), 2); // mid-line is not a seal
  assert.equal(run(w(p, { content: "review ok at abc123" })), 2); // 6 characters
});

test("a prompt not from the user changes nothing", () => {
  const c = mk({ state: { agents: 2 } });
  assert.ok(allowed(decide(ev("other", { event: "prompt", prompt: "<task-notification>x", fromUser: false }), c)));
  assert.ok(denied(decide(explore, c)));
  decide(ev("other", { event: "prompt", prompt: "go", fromUser: true }), c);
  assert.ok(allowed(decide(explore, c)));
});

test("lookup agent: index folder missing, then no recent query", () => {
  assert.ok(denied(decide(explore, mk({ exist: [".claude/agents/"] })), /graphify update \./));
  assert.ok(denied(decide(explore, mk({ state: { index: T0 - 31 * 60000 } })), /graphify query/));
  assert.ok(denied(decide(explore, mk({ state: { index: null } }))));
  assert.ok(allowed(decide(explore, mk({ state: { index: T0 - 29 * 60000 } }))));
  assert.ok(allowed(decide(agent("review"), mk({ state: { index: null } }))));
});

test("lookup rule does not apply without paths.code or with it empty; command and minutes come from config", () => {
  const { code, ...p } = cfg.paths;
  const old = { index: T0 - 31 * 60000 };
  assert.ok(allowed(decide(explore, mk({ state: old, exist: [".claude/agents/"], config: { ...cfg, paths: p } }))));
  assert.ok(allowed(decide(explore, mk({ state: old, exist: [".claude/agents/"], config: { ...cfg, paths: { ...p, code: [] } } }))));
  const c2 = { ...cfg, lookup: { index: { command: "idx find", folder: "idx", minutes: 60 } } };
  assert.ok(denied(decide(explore, mk({ config: c2 })), /`idx update \.`/));
  assert.ok(allowed(decide(explore, mk({ config: c2, exist: [".claude/agents/", "idx"], state: old }))));
});

test("only a real index command stamps the time", () => {
  const q = (command) => { const c = mk({ state: { index: 0 } }); decide(sh(command), c); return c.st.get("index"); };
  for (const c of ['grep "graphify query" README.md', "echo graphify query x"]) assert.equal(q(c), 0, c);
  for (const c of ['graphify query "x"', 'cd /tmp && graphify query "x"', 'cd /p && (graphify query "x")', '(graphify query "x")', '/home/u/.local/bin/graphify query "x"'])
    assert.equal(q(c), T0, c);
});

test("a stamped query lets the lookup agent through", () => {
  const c = mk({ state: { index: null } });
  assert.ok(denied(decide(explore, c)));
  decide(sh('graphify query "sales"'), c);
  assert.ok(allowed(decide(explore, c)));
});

test("a real report does not reset; a message from the owner does", () => {
  const count = (fromUser) => { const c = mk({ state: { agents: 2 } }); decide(ev("other", { event: "prompt", fromUser }), c); return decide(explore, c).decision; };
  assert.equal(count(false), "deny");
  assert.equal(count(true), "allow");
});

test("unknown events and missing fields are allowed", () => {
  const c = mk({ marks: [], files: {} });
  for (const e of [ev("other"), { event: "sessionStart" }, { event: "postTool" }, ev("handback"), ev("write"), ev("shell"), ev("read"), { event: "preTool", isSubagent: true }])
    assert.ok(allowed(decide({ root: "/r", ...e }, c)), JSON.stringify(e));
});

test("through the real runner: denied, then allowed after the mark", () => {
  const dir = mkdtempSync(join(tmpdir(), "xwf-orch-"));
  const state = join(dir, "state");
  mkdirSync(state);
  mkdirSync(join(dir, ".xworkflows"));
  writeFileSync(join(dir, ".xworkflows", "summary.md"), "status: approved\n");
  const input = JSON.stringify({ session_id: "s1", cwd: dir, hook_event_name: "PreToolUse", tool_name: "WebSearch", tool_input: {} });
  const env = { ...process.env, XWORKFLOWS_STATE_DIR: state };
  for (const k of ["CLAUDE_PROJECT_DIR", "XWORKFLOWS_FREE", "XWORKFLOWS_RECORD"]) delete env[k];
  const go = (i) => spawnSync("node", [join(import.meta.dirname, "..", "run.mjs"), "claude", "orchestrator"], { input: i, env, encoding: "utf8" });
  assert.equal(JSON.parse(go(input).stdout).hookSpecificOutput.permissionDecision, "deny");
  const agentIn = JSON.stringify({ session_id: "s1", cwd: dir, hook_event_name: "PreToolUse", tool_name: "Agent", tool_input: { subagent_type: "review" } });
  assert.match(JSON.parse(go(agentIn).stdout).hookSpecificOutput.permissionDecisionReason, /orchestrate/);
  const ask = JSON.stringify({ session_id: "s1", cwd: dir, hook_event_name: "PreToolUse", tool_name: "AskUserQuestion", tool_input: {} });
  assert.equal(go(ask).stdout, "");
  rmSync(dir, { recursive: true, force: true });
});

test("shell: a reader word is a command, not an argument or message text", () => {
  for (const c of ['grep -n "tail" src/a.ts', "rg -n cat src/", 'git commit -m "head of list in src/a.ts"']) assert.ok(allowed(decide(sh(c), mk())), c);
  for (const c of ["cat src/a.ts", "cd x && head -5 src/a.ts", "sed -n 1,200p src/a.ts", "/bin/cat src/a.ts"]) assert.ok(denied(decide(sh(c), mk())), c);
});

test("an installed (renamed) agent name counts as its role", () => {
  const names = { agentName: (r) => `xwf-${r}` };
  const c = (o) => ({ ...mk({ state: { index: null }, ...o }), ...names });
  assert.ok(denied(decide(agent("xwf-" + cfg.roles.lookup), c()), /index/));
  assert.ok(denied(decide(agent("xwf-" + cfg.roles.riskReviewer, { prompt: "none" }), c()), /plan or spec/));
});
