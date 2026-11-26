import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync as makeTmp, readFileSync, rmSync, symlinkSync, writeFileSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "../../test-tmp.mjs";
import { normalize, answer } from "./antigravity.mjs";
import * as orchestrator from "../core/orchestrator.mjs";
import * as handback from "../core/handback.mjs";
import * as adaptRecord from "../core/adapt-record.mjs";
import * as adaptGates from "../core/adapt-gates.mjs";
import * as memory from "../core/memory.mjs";
import { DEFAULTS } from "../core/config.mjs";
import { makeCtx } from "../core/ctx.mjs";

const madeTmp = [];
const mkdtempSync = (p) => { const d = makeTmp(p); madeTmp.push(d); return d; };
test.after(() => { for (const d of madeTmp) rmSync(d, { recursive: true, force: true }); });

const run = join(import.meta.dirname, "..", "run.mjs");
const base = (over = {}) => ({ conversationId: "c-main", workspacePaths: ["/p"], cwd: "/p/sub", lastUserInput: "hi", ...over });
const pre = (name, args, over = {}) => base({ hookEventName: "PreToolUse", toolCall: { id: "t1", name, args }, ...over });

test("antigravity: CLI and App/IDE file, shell, web, ask, agent and workflow tools normalize", () => {
  const env = { XWORKFLOWS_STATE_DIR: mkdtempSync(join(tmpdir(), "xwf-ag-")) };
  const w1 = normalize(pre("write_file", { Path: "/p/a.txt", Content: "x" }), env);
  assert.deepEqual([w1.kind, w1.root, w1.cwd, w1.toolDir, w1.writes], ["write", "/p", "/p/sub", ".agents", [{ path: "/p/a.txt", content: "x" }]]);
  const wApp = normalize(pre("write_file", { Path: "/p/a.txt", Content: "more", Append: true }), env);
  assert.deepEqual(wApp.writes, [{ path: "/p/a.txt", old: "", new: "more" }]);
  assert.deepEqual(normalize(pre("write_to_file", { TargetFile: "/p/b.txt", CodeContent: "y" }), env).writes, [{ path: "/p/b.txt", content: "y" }]);
  assert.deepEqual(normalize(pre("edit_file", { Path: "/p/a.txt", Target: "x", Replacement: "z" }), env).writes, [{ path: "/p/a.txt", old: "x", new: "z" }]);
  assert.deepEqual(normalize(pre("replace_file_content", { TargetFile: "/p/a.txt", TargetContent: "x", ReplacementContent: "z" }), env).writes, [{ path: "/p/a.txt", old: "x", new: "z" }]);
  assert.deepEqual(normalize(pre("multi_replace_file_content", { TargetFile: "/p/a.txt", ReplacementChunks: [{ TargetContent: "1", ReplacementContent: "2" }, { TargetContent: "3", ReplacementContent: "4" }] }), env).writes, [
    { path: "/p/a.txt", old: "1", new: "2" },
    { path: "/p/a.txt", old: "3", new: "4" },
  ]);
  assert.deepEqual(normalize(pre("run_command", { CommandLine: "npm test" }), env).command, "npm test");
  const r1 = normalize(pre("read_file", { Path: "/p/a.js", StartLine: 10, EndLine: 20 }), env);
  assert.deepEqual([r1.kind, r1.path, r1.limit], ["read", "/p/a.js", 11]);
  assert.equal(normalize(pre("read_file", { Path: "/p/a.js" }), env).limit, undefined);
  const r2 = normalize(pre("view_file", { AbsolutePath: "/p/a.js", EndLine: 40 }), env);
  assert.deepEqual([r2.kind, r2.path, r2.limit], ["read", "/p/a.js", 40]);
  assert.equal(normalize(pre("search_web", { query: "q" }), env).kind, "web");
  assert.equal(normalize(pre("read_url_content", { Url: "https://example.com" }), env).kind, "web");
  assert.equal(normalize(pre("ask_question", { questions: [] }), env).kind, "ask");
  const ag1 = normalize(pre("invoke_subagent", { TypeName: "explore", Prompt: "find x", Role: "Lookup" }), env);
  assert.deepEqual([ag1.kind, ag1.agent, ag1.prompt], ["agent", "explore", "find x"]);
  const wf = normalize(pre("run_workflow", { ScriptPath: "/p/.agents/skills/adapt/research.workflow.py", Args: { root: "/p" } }), env);
  assert.deepEqual([wf.kind, wf.inline, wf.scriptPath, wf.args], ["workflow", false, "/p/.agents/skills/adapt/research.workflow.py", { root: "/p" }]);
  assert.equal(normalize(pre("run_workflow", { Script: "print(1)" }), env).inline, true);
});

test("antigravity: a child started by run-agent.mjs (XWORKFLOWS_AGENT) is a subagent with its role", () => {
  const env = { XWORKFLOWS_STATE_DIR: mkdtempSync(join(tmpdir(), "xwf-ag-")), XWORKFLOWS_AGENT: "risk-review" };
  const ss = normalize(base({ conversationId: "c-child", hookEventName: "SessionStart", lastUserInput: "review" }), env);
  assert.deepEqual([ss.event, ss.isSubagent], ["other", true]);
  const r = normalize(pre("run_command", { CommandLine: "grep -rn x src/" }, { conversationId: "c-child" }), env);
  assert.deepEqual([r.isSubagent, r.agent], [true, "risk-review"]);
  assert.equal(normalize(pre("run_command", { CommandLine: "ls" }, { conversationId: "c-x" }), { ...env, XWORKFLOWS_AGENT: "bad name;" }).isSubagent, false);
});

test("antigravity: answer formats PreToolUse, SessionStart/PreInvocation injectSteps, and PostToolUse/Stop", () => {
  assert.deepEqual(JSON.parse(answer({ decision: "allow" }).stdout), { decision: "allow" });
  assert.deepEqual(JSON.parse(answer({ decision: "deny", reason: "no" }, { event: "preTool" }).stdout), { decision: "deny", reason: "no" });
  assert.deepEqual(JSON.parse(answer({ decision: "ask", reason: "sure?" }, { event: "preTool" }).stdout), { decision: "ask", reason: "sure?" });
  assert.deepEqual(JSON.parse(answer({ decision: "allow", context: "hi", notice: "shown" }, { event: "sessionStart" }).stdout), {
    injectSteps: [{ systemMessage: { systemMessage: "shown\n\nhi" } }],
  });
  assert.deepEqual(JSON.parse(answer({ decision: "allow", context: "same", notice: "same" }, { event: "sessionStart" }).stdout), {
    injectSteps: [{ systemMessage: { systemMessage: "same" } }],
  });
  assert.deepEqual(JSON.parse(answer({ decision: "allow", context: "hi" }, { event: "prompt" }).stdout), {
    injectSteps: [{ systemMessage: { systemMessage: "hi" } }],
  });
  assert.equal(answer({ decision: "allow" }, { event: "sessionStart" }).stdout, "{}");
  assert.equal(answer({ decision: "deny", reason: "no" }, { event: "sessionStart" }).stdout, "{}");
  assert.equal(answer({ decision: "allow" }, { event: "postTool" }).stdout, "{}");
  assert.equal(answer({ decision: "allow" }, { event: "stop" }).stdout, "{}");
});

test("antigravity: PostToolUse(invoke_subagent) links child events and enforces handback + curated boundary", () => {
  const dir = mkdtempSync(join(tmpdir(), "xwf-ag-sub-"));
  const stateDir = mkdtempSync(join(tmpdir(), "xwf-ag-st-"));
  const transcript = join(dir, "parent.jsonl");
  writeFileSync(transcript, JSON.stringify({ step_index: 5, type: "GENERIC", content: 'Created the following subagent:\n{"conversationId":"c-child-1","role":"Implementer"}' }) + "\n");
  const env = { XWORKFLOWS_STATE_DIR: stateDir };

  normalize(base({ hookEventName: "PostToolUse", stepIdx: 5, transcriptPath: transcript, toolCall: { name: "invoke_subagent", args: { TypeName: "implement", Prompt: "do T1" } } }), env);

  // Child SessionStart is suppressed (not emitted as sessionStart)
  const ss = normalize(base({ conversationId: "c-child-1", hookEventName: "SessionStart", lastUserInput: "" }), env);
  assert.deepEqual([ss.event, ss.isSubagent, ss.agent, ss.session], ["other", true, "implement", "c-main"]);

  // Child write to GEMINI.md or .agents/rules/ is denied by orchestrator
  const ctx = makeCtx({ root: dir, session: "c-main", toolDir: ".agents" }, { env, config: DEFAULTS, stateDir });
  for (const p of [join(dir, "GEMINI.md"), join(dir, ".agents/rules/front.md")]) {
    const wev = normalize(pre("write_file", { Path: p, Content: "bad" }, { conversationId: "c-child-1", workspacePaths: [dir], cwd: dir, lastUserInput: "" }), env);
    assert.equal(orchestrator.decide(wev, ctx).decision, "deny", p);
  }

  // Child send_message to parent enforces handback; bad report denied, valid report allowed & resets parent agents counter
  ctx.save("agents", "2");
  const badHb = normalize(pre("send_message", { Recipient: "c-main", Message: "all done" }, { conversationId: "c-child-1", workspacePaths: [dir], cwd: dir, lastUserInput: "" }), env);
  assert.deepEqual([badHb.kind, badHb.agent, badHb.session], ["handback", "implement", "c-main"]);
  assert.equal(handback.decide(badHb, ctx).decision, "deny");
  assert.equal(ctx.state("agents"), "2");

  const okHb = normalize(pre("send_message", { Recipient: "c-main", Message: "red: a.test.mjs::x - fail\ngreen: a.test.mjs::x\nskipped: nothing\nsha: abc1234" }, { conversationId: "c-child-1", workspacePaths: [dir], cwd: dir, lastUserInput: "" }), env);
  assert.equal(handback.decide(okHb, ctx).decision, "allow");
  assert.equal(ctx.state("agents"), "0");
});

test("antigravity: resolves child agent from parent transcript when PostToolUse flushed late", () => {
  const dir = mkdtempSync(join(tmpdir(), "xwf-ag-late-"));
  const stateDir = mkdtempSync(join(tmpdir(), "xwf-ag-st-"));
  const env = { XWORKFLOWS_STATE_DIR: stateDir };
  const parentTr = join(dir, "parent-transcript_full.jsonl");
  const childTr = join(dir, "child-transcript_full.jsonl");
  // PreToolUse(invoke_subagent) records pending spawn; PostToolUse saw no step yet
  normalize(pre("invoke_subagent", { TypeName: "implement", Prompt: "do" }, { conversationId: "51a95bd0-0000-0000-0000-000000000001", stepIdx: 5, workspacePaths: [dir], cwd: dir, transcriptPath: parentTr }), env);
  // Child SessionStart arrives before child step 1 is written -> suppressed as subagent
  const css = normalize(base({ conversationId: "a5953c78-0000-0000-0000-000000000002", hookEventName: "SessionStart", workspacePaths: [dir], cwd: dir, lastUserInput: "", transcriptPath: childTr }), env);
  assert.deepEqual([css.event, css.isSubagent], ["other", true]);
  // Later both transcripts flush
  writeFileSync(parentTr, JSON.stringify({ step_index: 5, type: "GENERIC", content: 'Created the following subagent:\n{\n  "conversationId":  "a5953c78-0000-0000-0000-000000000002"\n}' }) + "\n");
  writeFileSync(childTr, JSON.stringify({ step_index: 1, type: "SYSTEM_MESSAGE", content: "[Message] sender=51a95bd0-0000-0000-0000-000000000001 content=hi" }) + "\n");
  const hb = normalize(pre("send_message", { Recipient: "51a95bd0-0000-0000-0000-000000000001", Message: "done" }, { conversationId: "a5953c78-0000-0000-0000-000000000002", workspacePaths: [dir], cwd: dir, lastUserInput: "", transcriptPath: childTr }), env);
  assert.deepEqual([hb.kind, hb.agent, hb.isSubagent, hb.session], ["handback", "implement", true, "51a95bd0-0000-0000-0000-000000000001"]);
  const ctx = makeCtx({ root: dir, session: hb.session, toolDir: ".agents" }, { env, config: DEFAULTS, stateDir });
  assert.equal(handback.decide(hb, ctx).decision, "deny");
});

test("antigravity: workflow child agents are marked isSubagent and carry Agent: role header for dream boundary", () => {
  const dir = mkdtempSync(join(tmpdir(), "xwf-ag-wf-"));
  const stateDir = mkdtempSync(join(tmpdir(), "xwf-ag-st-"));
  const env = { XWORKFLOWS_STATE_DIR: stateDir };
  const prompt = "Agent: dream-analyzer\nAnalyze session.\n\nWhen you are done, call the finish tool with your result.";
  const ev = normalize(pre("write_file", { Path: join(dir, "docs/memory/a.md"), Content: "x" }, { conversationId: "c-wf-1", workspacePaths: [dir], cwd: dir, lastUserInput: prompt }), env);
  assert.deepEqual([ev.isSubagent, ev.agent], [true, "dream-analyzer"]);
  const ctx = makeCtx({ root: dir, session: "c-wf-1", toolDir: ".agents" }, { env, config: DEFAULTS, stateDir });
  assert.equal(orchestrator.decide(ev, ctx).decision, "deny"); // no open dream worktree
});

test("antigravity: PreInvocation resets agents only once per genuine USER_EXPLICIT step, not on subsequent invocations or subagent wakeups", () => {
  const dir = mkdtempSync(join(tmpdir(), "xwf-ag-pre-"));
  const stateDir = mkdtempSync(join(tmpdir(), "xwf-ag-st-"));
  const env = { XWORKFLOWS_STATE_DIR: stateDir };
  const tr = join(dir, "transcript_full.jsonl");
  writeFileSync(tr, JSON.stringify({ step_index: 0, type: "USER_INPUT", source: "USER_EXPLICIT", content: "first prompt" }) + "\n");

  const p0 = normalize(base({ hookEventName: "PreInvocation", invocationNum: 0, initialNumSteps: 1, transcriptPath: tr, lastUserInput: "first prompt" }), env);
  assert.deepEqual([p0.event, p0.fromUser], ["prompt", true]);
  // Same turn, second model invocation after a tool call
  writeFileSync(tr, JSON.stringify({ step_index: 0, type: "USER_INPUT", source: "USER_EXPLICIT", content: "first prompt" }) + "\n" + JSON.stringify({ step_index: 1, type: "GENERIC", content: "tool output" }) + "\n");
  const p1 = normalize(base({ hookEventName: "PreInvocation", invocationNum: 1, initialNumSteps: 2, transcriptPath: tr, lastUserInput: "first prompt" }), env);
  assert.equal(p1.fromUser, false);
  // Subagent message wakes up loop with invocationNum: 0
  writeFileSync(tr, JSON.stringify({ step_index: 2, type: "USER_INPUT", source: "SUBAGENT_MESSAGE", content: "[Message] done" }) + "\n");
  const p2 = normalize(base({ hookEventName: "PreInvocation", invocationNum: 0, initialNumSteps: 3, transcriptPath: tr, lastUserInput: "first prompt" }), env);
  assert.equal(p2.fromUser, false);
  // Second user prompt (even identical text!) has new step_index
  writeFileSync(tr, JSON.stringify({ step_index: 3, type: "USER_INPUT", source: "USER_EXPLICIT", content: "first prompt" }) + "\n");
  const p3 = normalize(base({ hookEventName: "PreInvocation", invocationNum: 0, initialNumSteps: 4, transcriptPath: tr, lastUserInput: "first prompt" }), env);
  assert.equal(p3.fromUser, true);
});

test("antigravity: PostToolUse(ask_question) parses transcript answers and adapt-record writes interview.log.jsonl", () => {
  const root = mkdtempSync(join(tmpdir(), "xwf-ag-ask-"));
  const stateDir = mkdtempSync(join(tmpdir(), "xwf-ag-st-"));
  const env = { XWORKFLOWS_STATE_DIR: stateDir };
  mkdirSync(join(root, ".xworkflows"));
  writeFileSync(join(root, ".xworkflows/adapt-run.json"), JSON.stringify({ run: "run-9", startedAt: Date.now() }));
  const tr = join(root, "t.jsonl");
  writeFileSync(tr, JSON.stringify({ step_index: 7, type: "GENERIC", content: "Q1: [T0-q] Is this a test?\nA1: Yes\n\nQ2: [T0-r] Say something.\nA2: typed answer" }) + "\n");

  const ev = normalize(base({
    workspacePaths: [root], cwd: root, hookEventName: "PostToolUse", stepIdx: 7, transcriptPath: tr,
    toolCall: {
      name: "ask_question",
      args: {
        questions: [
          { question: "[T0-q] Is this a test?", options: ["Yes", "No"] },
          { question: "[T0-r] Say something.", options: ["A", "B"] },
        ],
      },
    },
  }), env);
  assert.deepEqual([ev.event, ev.kind], ["postTool", "ask"]);
  const ctx = makeCtx(ev, { env, config: DEFAULTS, stateDir });
  assert.equal(adaptRecord.decide(ev, ctx).decision, "allow");
  const lines = readFileSync(join(root, ".xworkflows/interview.log.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(lines, [
    { run: "run-9", id: "T0-q", question: "[T0-q] Is this a test?", options: ["Yes", "No"], answer: "Yes" },
    { run: "run-9", id: "T0-r", question: "[T0-r] Say something.", options: ["A", "B"], answer: "typed answer" },
  ]);
});

test("antigravity: adapt-gates requires .agents/skills/adapt/research.workflow.py", () => {
  const root = mkdtempSync(join(tmpdir(), "xwf-ag-gate-"));
  const stateDir = mkdtempSync(join(tmpdir(), "xwf-ag-st-"));
  const env = { XWORKFLOWS_STATE_DIR: stateDir };
  mkdirSync(join(root, ".xworkflows"));
  mkdirSync(join(root, ".agents/skills/adapt"), { recursive: true });
  writeFileSync(join(root, ".xworkflows/adapt-run.json"), JSON.stringify({ run: "r1", startedAt: Date.now() }));
  writeFileSync(join(root, ".xworkflows/scan.json"), JSON.stringify({ kinds: { conc: { total: 0 } } }));
  writeFileSync(join(root, ".agents/skills/adapt/research.workflow.py"), "# py\n");
  const ctx = makeCtx({ root, session: "c-main", toolDir: ".agents" }, { env, config: DEFAULTS, stateDir });

  const bad = normalize(pre("run_workflow", { Script: "x" }, { workspacePaths: [root], cwd: root }), env);
  const dBad = adaptGates.decide(bad, ctx);
  assert.equal(dBad.decision, "deny");
  assert.match(dBad.reason, /\.agents\/skills\/adapt\/research\.workflow\.py/);

  const ok = normalize(pre("run_workflow", { ScriptPath: join(root, ".agents/skills/adapt/research.workflow.py"), Args: { zeroHits: ["conc"] } }, { workspacePaths: [root], cwd: root }), env);
  assert.equal(adaptGates.decide(ok, ctx).decision, "allow");
});

test("antigravity: SessionStart records session in .xworkflows/local.json (symlink-safe) and Stop rebuilds memory only when stale", () => {
  const root = mkdtempSync(join(tmpdir(), "xwf-ag-mem-"));
  const stateDir = mkdtempSync(join(tmpdir(), "xwf-ag-st-"));
  const env = { XWORKFLOWS_STATE_DIR: stateDir };
  mkdirSync(join(root, ".xworkflows"));
  mkdirSync(join(root, "docs/memory"), { recursive: true });
  writeFileSync(join(root, "docs/memory/note.md"), "---\nname: Note\ndescription: one\n---\nbody\n");

  // SessionStart records session into local.json
  const trDir = mkdtempSync(join(tmpdir(), "xwf-ag-tr-"));
  const curTr = join(trDir, "cur.jsonl");
  writeFileSync(curTr, "");
  const ss = normalize(base({ conversationId: "c-cur", workspacePaths: [root], cwd: root, hookEventName: "SessionStart", transcriptPath: curTr }), env);
  assert.deepEqual([ss.event, ss.source], ["sessionStart", "startup"]);
  const local = JSON.parse(readFileSync(join(root, ".xworkflows/local.json"), "utf8"));
  assert.equal(local.antigravity.sessions.length, 1);
  assert.equal(local.antigravity.sessions[0].id, "c-cur");

  // Stop with fullyIdle: false does nothing
  const ctx = makeCtx({ root, session: "c-cur", toolDir: ".agents" }, { env: { ...env, XWORKFLOWS_DRY: "1" }, config: DEFAULTS, stateDir });
  memory.decide(normalize(base({ workspacePaths: [root], cwd: root, hookEventName: "Stop", fullyIdle: false }), env), ctx);
  assert.throws(() => readFileSync(join(root, "docs/memory/MEMORY.md"), "utf8"), /ENOENT/);

  // Stop with fullyIdle: true rebuilds MEMORY.md
  memory.decide(normalize(base({ workspacePaths: [root], cwd: root, hookEventName: "Stop", fullyIdle: true }), env), ctx);
  assert.equal(readFileSync(join(root, "docs/memory/MEMORY.md"), "utf8"), "- [Note](note.md) — one\n");

  // dreamLine reads antigravity.sessions from local.json
  const extraSessions = [];
  for (let i = 0; i < 10; i++) {
    const p = join(trDir, `s${i}.jsonl`);
    writeFileSync(p, "");
    const t = new Date(Date.now() - 1000);
    utimesSync(p, t, t);
    extraSessions.push({ id: `c-${i}`, transcript: p, startedAt: t.toISOString() });
  }
  writeFileSync(join(root, ".xworkflows/local.json"), JSON.stringify({ antigravity: { sessions: [...extraSessions, { id: "c-cur", transcript: curTr }] } }));
  const d = memory.decide(ss, ctx);
  assert.match(d.context, /Dream is due: 10 sessions/);

  // Symlinked local.json (live or dangling), XWORKFLOWS_FREE, and non-memory hooks never write local.json
  const root2 = mkdtempSync(join(tmpdir(), "xwf-ag-sym-"));
  mkdirSync(join(root2, ".xworkflows"));
  const target = join(root2, "outside.json");
  writeFileSync(target, "untouched");
  symlinkSync(target, join(root2, ".xworkflows/local.json"));
  normalize(base({ conversationId: "c-sym", workspacePaths: [root2], cwd: root2, hookEventName: "SessionStart", transcriptPath: curTr }), env);
  assert.equal(readFileSync(target, "utf8"), "untouched");

  const root3 = mkdtempSync(join(tmpdir(), "xwf-ag-dangle-"));
  mkdirSync(join(root3, ".xworkflows"));
  const missingTarget = join(root3, "never-created.json");
  symlinkSync(missingTarget, join(root3, ".xworkflows/local.json"));
  normalize(base({ conversationId: "c-dangle", workspacePaths: [root3], cwd: root3, hookEventName: "SessionStart", transcriptPath: curTr }), env);
  assert.throws(() => readFileSync(missingTarget, "utf8"), /ENOENT/);

  const root4 = mkdtempSync(join(tmpdir(), "xwf-ag-free-"));
  mkdirSync(join(root4, ".xworkflows"));
  normalize(base({ conversationId: "c-free", workspacePaths: [root4], cwd: root4, hookEventName: "SessionStart", transcriptPath: curTr }), { ...env, XWORKFLOWS_FREE: "1" }, "memory");
  normalize(base({ conversationId: "c-modes", workspacePaths: [root4], cwd: root4, hookEventName: "SessionStart", transcriptPath: curTr }), env, "modes");
  assert.throws(() => readFileSync(join(root4, ".xworkflows/local.json"), "utf8"), /ENOENT/);
});

test("antigravity: orchestrator resolves agents under .agents/agents/", () => {
  const root = mkdtempSync(join(tmpdir(), "xwf-ag-orch-"));
  const stateDir = mkdtempSync(join(tmpdir(), "xwf-ag-st-"));
  mkdirSync(join(root, ".xworkflows"));
  mkdirSync(join(root, ".agents/agents"), { recursive: true });
  writeFileSync(join(root, ".xworkflows/summary.md"), "status: approved\n");
  writeFileSync(join(root, ".agents/agents/implement.md"), "---\nname: implement\n---\n");
  const env = { ...process.env, XWORKFLOWS_STATE_DIR: stateDir };
  delete env.XWORKFLOWS_FREE; delete env.CLAUDE_PROJECT_DIR;
  // Mark orchestrate via run_command
  const mark = spawnSync(process.execPath, [run, "antigravity", "orchestrator"], {
    input: JSON.stringify(pre("run_command", { CommandLine: "node .xworkflows/mark.mjs orchestrate" }, { workspacePaths: [root], cwd: root })),
    env, encoding: "utf8",
  });
  assert.equal(JSON.parse(mark.stdout).decision, "allow");
  const ok = spawnSync(process.execPath, [run, "antigravity", "orchestrator"], {
    input: JSON.stringify(pre("invoke_subagent", { TypeName: "implement", Prompt: "go" }, { workspacePaths: [root], cwd: root })),
    env, encoding: "utf8",
  });
  assert.equal(JSON.parse(ok.stdout).decision, "allow");
  const bad = spawnSync(process.execPath, [run, "antigravity", "orchestrator"], {
    input: JSON.stringify(pre("invoke_subagent", { TypeName: "unknown-agent", Prompt: "go" }, { workspacePaths: [root], cwd: root })),
    env, encoding: "utf8",
  });
  assert.equal(JSON.parse(bad.stdout).decision, "deny");
  assert.match(JSON.parse(bad.stdout).reason, /\.agents\/agents\//);
});
