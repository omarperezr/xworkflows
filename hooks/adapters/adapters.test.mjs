import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

const run = join(import.meta.dirname, "..", "run.mjs");
const fixtures = join(import.meta.dirname, "..", "fixtures");
const tools = {
  claude: { denied: (o) => JSON.parse(o).hookSpecificOutput.permissionDecision === "deny", allow: "" },
  codex: { denied: (o) => JSON.parse(o).hookSpecificOutput.permissionDecision === "deny", allow: "" },
  cursor: { denied: (o) => JSON.parse(o).permission === "deny", allow: '{"permission":"allow"}' },
  gemini: { denied: (o) => JSON.parse(o).decision === "deny", allow: "{}" },
};
const load = (tool, name) => existsSync(join(fixtures, tool, name + ".json")) ? JSON.parse(readFileSync(join(fixtures, tool, name + ".json"), "utf8")) : null;
const sessionKey = (tool) => (tool === "cursor" ? "conversation_id" : "session_id");

function spawn(tool, stdin, extra = {}) {
  const env = { ...process.env, ...extra };
  for (const k of ["CLAUDE_PROJECT_DIR", "XWORKFLOWS_FREE", "XWORKFLOWS_RECORD"]) if (!(k in extra)) delete env[k];
  const r = spawnSync("node", [run, tool, "design-first"], { input: typeof stdin === "string" ? stdin : JSON.stringify(stdin), env, encoding: "utf8" });
  return { stdout: r.stdout, stderr: r.stderr, exitCode: r.status };
}

for (const tool of readdirSync(fixtures)) {
  const t = tools[tool];
  const [write, shell, after] = ["write-spec", "shell-mark", "write-spec-after"].map((n) => load(tool, n));
  const state = () => ({ XWORKFLOWS_STATE_DIR: mkdtempSync(join(tmpdir(), "xwf-test-")) });

  test(`${tool}: deny, mark, allow`, () => {
    const env = state();
    const replay = (f, r) => { if (f.output?.stdout && t.denied(f.output.stdout)) assert.ok(t.denied(r.stdout)); /* R1: deny text may change, decision only */ else if (f.output) assert.deepEqual({ stdout: r.stdout, exitCode: r.exitCode }, f.output); };
    const r1 = spawn(tool, write.input, env);
    assert.ok(t.denied(r1.stdout));
    assert.match(r1.stdout, /grill/);
    replay(write, r1);
    const r2 = spawn(tool, shell.input, env);
    assert.equal(r2.stdout, t.allow);
    assert.ok(readdirSync(env.XWORKFLOWS_STATE_DIR).some((f) => f.startsWith("xwf-mark-grill-")));
    replay(shell, r2);
    const r3 = spawn(tool, (after ?? write).input, env);
    assert.equal(r3.stdout, t.allow);
    if (after) replay(after, r3);
  });

  test(`${tool}: a mark from another session does not count`, () => {
    const env = state();
    spawn(tool, shell.input, env);
    const other = { ...write.input, [sessionKey(tool)]: "another-session" };
    assert.ok(t.denied(spawn(tool, other, env).stdout));
  });

  test(`${tool}: broken input lets the call through`, () => {
    const r = spawn(tool, "not json", state());
    assert.equal(r.stdout, t.allow);
    assert.equal(r.exitCode, 0);
    assert.match(r.stderr, /xworkflows/);
  });

  test(`${tool}: XWORKFLOWS_FREE lets the call through and says so`, () => {
    const r = spawn(tool, write.input, { ...state(), XWORKFLOWS_FREE: "1" });
    assert.equal(r.stdout, t.allow);
    assert.match(r.stderr, /XWORKFLOWS_FREE/);
  });

  test(`${tool}: labels`, () => {
    for (const f of [write, shell, after].filter(Boolean)) {
      assert.ok(["recorded", "documented", "not confirmed"].includes(f.label));
      if (f.label !== "recorded") assert.match(f.source, /^https:\/\//), assert.ok(f.read);
    }
  });

  test(`${tool}: no private path`, () => {
    for (const n of readdirSync(join(fixtures, tool)).filter((f) => f.endsWith(".json"))) {
      const text = readFileSync(join(fixtures, tool, n), "utf8");
      for (const bad of ["/Users/", "-Users-", homedir()]) assert.ok(!text.includes(bad), `${n} has ${bad}`);
    }
  });
}

test("recording replaces the home folder", () => {
  const rec = mkdtempSync(join(tmpdir(), "xwf-rec-"));
  const input = { session_id: "s1", cwd: "/home/fakeuser/proj", transcript_path: "/home/fakeuser/.claude/projects/-home-fakeuser-proj/s.jsonl",
    tool_name: "Write", tool_input: { file_path: "/home/fakeuser/proj/a.txt", content: "x" } };
  spawn("claude", input, { HOME: "/home/fakeuser", XWORKFLOWS_RECORD: rec, XWORKFLOWS_STATE_DIR: mkdtempSync(join(tmpdir(), "xwf-test-")) });
  const files = readdirSync(rec);
  assert.equal(files.length, 1);
  const text = readFileSync(join(rec, files[0]), "utf8");
  assert.ok(!text.includes("/home/fakeuser") && !text.includes("-home-fakeuser"));
  const j = JSON.parse(text);
  assert.equal(j.label, "recorded");
  assert.ok(j.input && j.output);
});

test("recorder drops cursor user_email", () => {
  const rec = mkdtempSync(join(tmpdir(), "xwf-rec-"));
  const input = { conversation_id: "c1", cwd: "/project", user_email: "someone@example.com", tool_name: "Read", tool_input: {} };
  spawn("cursor", input, { XWORKFLOWS_RECORD: rec, XWORKFLOWS_STATE_DIR: mkdtempSync(join(tmpdir(), "xwf-test-")) });
  const files = readdirSync(rec);
  assert.equal(files.length, 1);
  assert.ok(!readFileSync(join(rec, files[0]), "utf8").includes("someone@example.com"));
});

test("gemini replace on a missing spec is denied and maps to { path, old, new }", async () => {
  const { normalize } = await import("./gemini.mjs");
  const root = mkdtempSync(join(tmpdir(), "xwf-root-"));
  const input = { session_id: "g1", cwd: root, tool_name: "replace", tool_input: { file_path: join(root, "docs/superpowers/specs/n.md"), old_string: "", new_string: "# x" } };
  assert.deepEqual(normalize(input, {}).writes, [{ path: input.tool_input.file_path, old: "", new: "# x" }]);
  const state = { XWORKFLOWS_STATE_DIR: mkdtempSync(join(tmpdir(), "xwf-test-")) };
  assert.ok(tools.gemini.denied(spawn("gemini", input, state).stdout));
});

test("claude: Workflow and PostToolUse normalize", async () => {
  const { normalize, answer } = await import("./claude.mjs");
  const w = normalize({ session_id: "s", cwd: "/p", tool_name: "Workflow", tool_input: { script: "x" } }, {});
  assert.equal(w.kind, "workflow");
  assert.equal(w.inline, true);
  const p = normalize({ session_id: "s", cwd: "/p", hook_event_name: "PostToolUse", tool_name: "AskUserQuestion", tool_input: { a: 1 }, tool_response: { b: 2 } }, {});
  assert.deepEqual([p.event, p.tool, p.input, p.response], ["postTool", "AskUserQuestion", { a: 1 }, { b: 2 }]);
  assert.equal(answer({ decision: "allow" }).stdout, "");
});

const base = { session_id: "s", cwd: "/p" };
const pre = (tool_name, tool_input, more = {}) => ({ ...base, hook_event_name: "PreToolUse", tool_name, tool_input, ...more });

test("claude: new events normalize", async () => {
  const { normalize } = await import("./claude.mjs");
  const p = normalize({ ...base, hook_event_name: "UserPromptSubmit", prompt: "hola" }, {});
  assert.deepEqual([p.event, p.prompt, p.fromUser, p.hookEvent], ["prompt", "hola", true, "UserPromptSubmit"]);
  for (const t of ["  <task-notification>x", "Another Claude session sent a message: y"])
    assert.equal(normalize({ ...base, hook_event_name: "UserPromptSubmit", prompt: t }, {}).fromUser, false);
  const s = normalize({ ...base, hook_event_name: "SessionStart", source: "compact", transcript_path: "/t.jsonl" }, {});
  assert.deepEqual([s.event, s.source, s.transcript], ["sessionStart", "compact", "/t.jsonl"]);
  assert.equal(normalize({ ...base, hook_event_name: "PreCompact" }, {}).event, "preCompact");
  assert.equal(normalize({ ...base, hook_event_name: "SessionEnd" }, {}).event, "sessionEnd");
});

test("claude: new preTool kinds normalize", async () => {
  const { normalize } = await import("./claude.mjs");
  const r = normalize(pre("Read", { file_path: "/p/a.js", limit: 10 }), {});
  assert.deepEqual([r.event, r.kind, r.path, r.limit, r.hookEvent], ["preTool", "read", "/p/a.js", 10, "PreToolUse"]);
  const a = normalize(pre("Agent", { subagent_type: "explore", prompt: "go" }), {});
  assert.deepEqual([a.kind, a.agent, a.prompt], ["agent", "explore", "go"]);
  assert.equal(normalize(pre("WebSearch", {}), {}).kind, "web");
  assert.equal(normalize(pre("WebFetch", {}), {}).kind, "web");
  assert.equal(normalize(pre("AskUserQuestion", {}), {}).kind, "ask");
  const h = normalize(pre("SubagentHandback", { message: "done" }, { agent_type: "review" }), {});
  assert.deepEqual([h.kind, h.agent, h.message], ["handback", "review", "done"]);
  assert.equal(normalize(pre("SubagentHandback", {}), {}).message, "");
});

test("claude: answer carries context, and a deny only on preTool", async () => {
  const { answer } = await import("./claude.mjs");
  const ss = { event: "sessionStart", hookEvent: "SessionStart" };
  assert.deepEqual(JSON.parse(answer({ decision: "allow", context: "hi" }, ss).stdout), { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "hi" } });
  assert.equal(answer({ decision: "deny", reason: "no" }, ss).stdout, "");
  assert.equal(answer({ decision: "allow", context: "" }, ss).stdout, "");
  const pt = answer({ decision: "deny", reason: "no" }, { event: "preTool", hookEvent: "PreToolUse" });
  assert.equal(JSON.parse(pt.stdout).hookSpecificOutput.permissionDecision, "deny");
  assert.equal(JSON.parse(answer({ decision: "deny", reason: "no" }).stdout).hookSpecificOutput.permissionDecision, "deny");
});

test("hook log: a deny leaves a deny line, a free skip a free line", () => {
  const dir = mkdtempSync(join(tmpdir(), "xwf-test-"));
  const input = load("claude", "write-spec").input;
  const lines = () => readFileSync(join(dir, "xwf-hooks.log"), "utf8").trim().split("\n");
  spawn("claude", input, { XWORKFLOWS_STATE_DIR: dir });
  assert.equal(lines().length, 1);
  assert.match(lines()[0], new RegExp(`^\\d{4}-\\d\\d-\\d\\dT\\S+ ${input.session_id} design-first deny \\S`));
  assert.ok(!lines()[0].includes("\n"));
  spawn("claude", input, { XWORKFLOWS_STATE_DIR: dir, XWORKFLOWS_FREE: "1" });
  assert.equal(lines().length, 2);
  assert.match(lines()[1], new RegExp(` ${input.session_id} design-first free ${input.tool_name}$`));
});
