import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync as makeTmp, mkdirSync, writeFileSync, readFileSync, utimesSync, symlinkSync, chmodSync, statSync, lstatSync, lutimesSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decide } from "./memory.mjs";
const madeTmp = [];
const mkdtempSync = (p) => { const d = makeTmp(p); madeTmp.push(d); return d; };
test.after(() => { for (const d of madeTmp) rmSync(d, { recursive: true, force: true }); });

const run = join(import.meta.dirname, "..", "run.mjs");
const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 12);
const base = { owner: "Ana", memory: { dir: "docs/memory" }, paths: {}, lookup: { index: { command: "graphify query", folder: "graphify-out", minutes: 30 } } };
const turn = (n) => JSON.stringify({ type: "user", message: { content: `message-${n}` } });
const transcript = [1, 2, 3, 4, 5].map(turn).join("\n") + "\n";

function fake({ files = {}, config = base, git = null, mtimes = {}, qmd = { code: 0, out: "x".repeat(9000) } } = {}) {
  const calls = { bg: [], exec: [], written: {} };
  const ctx = {
    config,
    readFile: (p) => { const r = p.replace(/^\/r\//, ""); return calls.written[r] ?? files[r] ?? files[p] ?? null; },
    exists: (p) => p in files || Object.keys(files).some((f) => f.startsWith(p + "/")),
    mtime: (p) => mtimes[p] ?? null,
    listDir: (p) => Object.keys(files).filter((f) => f.startsWith(p + "/")).map((f) => f.slice(p.length + 1)),
    writeFile: (p, t) => { calls.written[p] = t; },
    now: () => NOW,
    git: (...a) => (a[0] === "log" ? git : null),
    exec: (cmd, args, o) => { calls.exec.push({ cmd, args, o }); return qmd; },
    background: (cmd, args) => calls.bg.push([cmd, args]),
  };
  return { ctx, calls };
}
const ev = (event, extra = {}) => ({ event, session: "s", root: "/r", isSubagent: false, ...extra });
const write = (path, content) => ev("preTool", { tool: "Write", kind: "write", writes: [{ path, content }] });
const note = (type) => `---\nname: n\ntype: ${type}\n---\nbody`;
const MEM = { "docs/memory/b.md": "---\nname: B\ndescription: bee\n---\n", "docs/memory/a.md": "x" };

test("preCompact: allowed with no context, the index is rebuilt and qmd update starts in the background", () => {
  const { ctx, calls } = fake({ files: MEM });
  const d = decide(ev("preCompact"), ctx);
  assert.deepEqual(d, { decision: "allow" });
  assert.equal(calls.written["docs/memory/MEMORY.md"], "- [a](a.md) — \n- [B](b.md) — bee\n");
  assert.deepEqual(calls.bg, [["qmd", ["update"]]]);
});

test("sessionEnd with memory.index: --index goes in front", () => {
  const { ctx, calls } = fake({ files: MEM, config: { ...base, memory: { dir: "docs/memory", index: "proj" } } });
  assert.deepEqual(decide(ev("sessionEnd"), ctx), { decision: "allow" });
  assert.deepEqual(calls.bg, [["qmd", ["--index", "proj", "update"]]]);
});

test("the index is written only when its text changes; MEMORY.md is not indexed", () => {
  const { ctx, calls } = fake({ files: { ...MEM, "docs/memory/MEMORY.md": "- [a](a.md) — \n- [B](b.md) — bee\n" } });
  decide(ev("sessionEnd"), ctx);
  assert.deepEqual(calls.written, {});
  assert.equal(calls.bg.length, 1);
});

test("a missing memory folder: nothing to do", () => {
  const { ctx, calls } = fake();
  assert.deepEqual(decide(ev("preCompact"), ctx), { decision: "allow" });
  assert.deepEqual(calls, { bg: [], exec: [], written: {} });
});

test("sessionStart compact: query from the last 3 things typed, output cut to 3000", () => {
  const { ctx, calls } = fake({ files: { "/t.jsonl": transcript } });
  const d = decide(ev("sessionStart", { source: "compact", transcript: "/t.jsonl" }), ctx);
  const q = calls.exec[0].args.find((a) => a.startsWith("lex:"));
  for (const n of [3, 4, 5]) assert.ok(q.includes(`message ${n}`));
  for (const n of [1, 2]) assert.ok(!q.includes(`message ${n}`));
  assert.equal(q, "lex: message 3 message 4 message 5\nvec: message 3 message 4 message 5");
  assert.deepEqual(calls.exec[0].args.slice(-3), ["-n", "5", "--no-rerank"]);
  assert.equal(calls.exec[0].o.timeout, 8000);
  assert.match(d.context, /^Memory notes on the current topic:\n/);
  assert.ok(d.context.length <= 3100);
});

test("sessionStart startup: nothing", () => {
  const { ctx, calls } = fake({ files: { "/t.jsonl": transcript } });
  assert.deepEqual(decide(ev("sessionStart", { source: "startup", transcript: "/t.jsonl" }), ctx), { decision: "allow" });
  assert.equal(calls.exec.length, 0);
});

test("qmd failing, missing or timed out: nothing", () => {
  for (const qmd of [{ code: 1, out: "x" }, { code: null, out: "" }, { code: 0, out: "  \n" }]) {
    const { ctx } = fake({ files: { "/t.jsonl": transcript }, qmd });
    assert.deepEqual(decide(ev("sessionStart", { source: "compact", transcript: "/t.jsonl" }), ctx), { decision: "allow" });
  }
});

test("typed text only: tool results, reports and meta entries are not the owner's", () => {
  const t = [
    turn(1),
    JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: "tooloutput" }] } }),
    JSON.stringify({ type: "user", message: { content: "<task-notification>report" } }),
    JSON.stringify({ type: "user", message: { content: "Another Claude session sent a message: hi" } }),
    JSON.stringify({ type: "user", isMeta: true, message: { content: "meta" } }),
    JSON.stringify({ type: "assistant", message: { content: "claude" } }),
    "not json",
    JSON.stringify({ type: "user", message: { content: [{ type: "text", text: "¿whät-now? a_b" }] } }),
  ].join("\n");
  const { ctx, calls } = fake({ files: { "/t.jsonl": t } });
  decide(ev("sessionStart", { source: "compact", transcript: "/t.jsonl" }), ctx);
  assert.equal(calls.exec[0].args.find((a) => a.startsWith("lex:")).split("\n")[0], "lex: message 1 whät now a b");
});

test("the query keeps the last 300 characters", () => {
  const t = JSON.stringify({ type: "user", message: { content: "a".repeat(250) + " " + "b".repeat(250) } });
  const { ctx, calls } = fake({ files: { "/t.jsonl": t } });
  decide(ev("sessionStart", { source: "compact", transcript: "/t.jsonl" }), ctx);
  const q = calls.exec[0].args.find((a) => a.startsWith("lex:")).split("\n")[0].slice(5);
  assert.equal(q.length, 300);
  assert.ok(q.endsWith("b"));
});

test("old approved goals: one line with the months; recent, draft or dateless: nothing", () => {
  const sum = (s, date) => ({ ".xworkflows/summary.md": `---\nstatus: ${s}\ndate: ${date}\n---\n` });
  const at = (files) => decide(ev("sessionStart", { source: "startup" }), fake({ files }).ctx);
  assert.equal(at(sum("approved", "2026-07-01")).context, "Goals written 4 months ago: run /adapt to refresh them.");
  assert.equal(at(sum("approved", "2026-08-13")).context, undefined);
  assert.equal(at(sum("approved", "2026-08-12")).context, undefined);
  assert.match(at(sum("approved", "2026-08-11")).context, /3 months ago/);
  assert.equal(at(sum("draft", "2020-01-01")).context, undefined);
  assert.equal(at({ ".xworkflows/summary.md": "status: approved\n" }).context, undefined);
});

test("code graph: older than HEAD or missing starts the update; current does not; no code, no rule", () => {
  const cfg = { ...base, paths: { code: ["src/"] } };
  const head = Math.floor(NOW / 1000);
  const stale = fake({ config: cfg, git: String(head), mtimes: { "graphify-out/graph.json": NOW - DAY } });
  assert.match(decide(ev("sessionStart", {}), stale.ctx).context, /code graph/);
  assert.deepEqual(stale.calls.bg, [["sh", ["-c", '"$0" update . && touch -c -h -- "$1"', "graphify", "graphify-out/graph.json"]]]);
  const gone = fake({ config: cfg, git: String(head) });
  assert.match(decide(ev("sessionStart", {}), gone.ctx).context, /code graph/);
  const fresh = fake({ config: cfg, git: String(head), mtimes: { "graphify-out/graph.json": NOW } });
  assert.deepEqual(decide(ev("sessionStart", {}), fresh.ctx), { decision: "allow" });
  assert.equal(fresh.calls.bg.length, 0);
  const none = fake({ config: { ...cfg, paths: { code: [] } } });
  assert.deepEqual(decide(ev("sessionStart", {}), none.ctx), { decision: "allow" });
  assert.equal(none.calls.bg.length, 0);
});

test("context lines are joined by a newline", () => {
  const files = { ".xworkflows/summary.md": "status: approved\ndate: 2025-01-01\n" };
  const { ctx } = fake({ files, config: { ...base, paths: { code: ["src/"] } } });
  const lines = decide(ev("sessionStart", {}), ctx).context.split("\n");
  assert.equal(lines.length, 2);
});

test("a write of type user or feedback under memory.dir: deny with the owner file", () => {
  for (const type of ["user", "feedback"]) {
    const d = decide(write("/r/docs/memory/x.md", note(type)), fake().ctx);
    assert.equal(d.decision, "deny");
    assert.match(d.reason, /~\/\.xworkflows\/owner\.md/);
  }
  const meta = decide(write("docs/memory/x.md", "---\nmetadata:\n  type: feedback\n---\n"), fake().ctx);
  assert.equal(meta.decision, "deny");
});

test("other types, other folders, no header: allow", () => {
  const c = fake().ctx;
  assert.equal(decide(write("/r/docs/memory/x.md", note("project")), c).decision, "allow");
  assert.equal(decide(write("/r/docs/other/x.md", note("user")), c).decision, "allow");
  assert.equal(decide(write("/r/docs/memory/x.md", "just text"), c).decision, "allow");
});

test("an edit: its new text is judged, and the current header of the file", () => {
  const e = (w) => ev("preTool", { kind: "write", writes: [w] });
  const c = fake({ files: { "/r/docs/memory/x.md": note("feedback") } }).ctx;
  assert.equal(decide(e({ path: "/r/docs/memory/x.md", old: "body", new: "more" }), c).decision, "deny");
  assert.equal(decide(e({ path: "/r/docs/memory/y.md", old: "a", new: "---\ntype: user\n---" }), c).decision, "deny");
  assert.equal(decide(e({ path: "/r/docs/memory/y.md", old: "a", new: "b" }), c).decision, "allow");
});

test("an edit is judged on the file as it will be after it", () => {
  const e = (w) => ev("preTool", { kind: "write", writes: [w] });
  const f = (t) => fake({ files: { "/r/docs/memory/x.md": t } }).ctx;
  assert.equal(decide(e({ path: "/r/docs/memory/x.md", old: "type: project", new: "type: feedback" }), f(note("project"))).decision, "deny");
  assert.equal(decide(e({ path: "/r/docs/memory/x.md", old: "type: feedback", new: "type: project" }), f(note("feedback"))).decision, "allow");
  assert.equal(decide(e({ path: "/r/docs/memory/x.md", old: "body", new: "more" }), f(note("project"))).decision, "allow");
  const d = decide(e({ path: "/r/docs/memory/x.md", old: "body", new: "more" }), f(note("feedback")));
  assert.equal(d.decision, "deny");
  assert.match(d.reason, /owner\.md/);
});

test("several edits to one file in one call: each is judged on the file as the edits before it left it", () => {
  const e = (...writes) => ev("preTool", { kind: "write", writes });
  const f = (t) => fake({ files: { "/r/docs/memory/x.md": t } }).ctx;
  const p = "/r/docs/memory/x.md";
  assert.equal(decide(e({ path: p, old: "type: feedback", new: "type: project" }, { path: p, old: "body", new: "more" }), f(note("feedback"))).decision, "allow");
  const d = decide(e({ path: p, old: "type: project", new: "type: x" }, { path: p, old: "type: x", new: "type: user" }), f(note("project")));
  assert.equal(d.decision, "deny");
  assert.match(d.reason, /owner\.md/);
});

test("unknown events, kinds and missing fields: allow", () => {
  const c = fake().ctx;
  for (const e of [ev("postTool"), ev("prompt", { prompt: "x" }), ev("preTool", { kind: "shell", command: "ls" }), ev("preTool", { kind: "write" }), ev("weird")]) {
    assert.equal(decide(e, c).decision, "allow");
  }
  assert.equal(decide(ev("sessionStart", { source: "compact" }), c).decision, "allow");
});

test("memory.dir from config is honored", () => {
  const c = fake({ config: { ...base, memory: { dir: "notes" } } }).ctx;
  assert.equal(decide(write("/r/notes/x.md", note("user")), c).decision, "deny");
  assert.equal(decide(write("/r/docs/memory/x.md", note("user")), c).decision, "allow");
});

test("through the real runner: a deny on a feedback write, an index on preCompact", () => {
  const root = mkdtempSync(join(tmpdir(), "xwf-mem-"));
  const state = mkdtempSync(join(tmpdir(), "xwf-state-"));
  mkdirSync(join(root, "docs", "memory"), { recursive: true });
  writeFileSync(join(root, "docs", "memory", "a.md"), "---\nname: A\ndescription: first\n---\n");
  const go = (input) => {
    const env = { ...process.env, XWORKFLOWS_STATE_DIR: state, PATH: "/nonexistent" + (process.platform === "win32" ? "" : "") };
    delete env.XWORKFLOWS_FREE; delete env.CLAUDE_PROJECT_DIR;
    return spawnSync(process.execPath, [run, "claude", "memory"], { input: JSON.stringify({ session_id: "s", cwd: root, ...input }), env, encoding: "utf8" });
  };
  const r = go({ hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: join(root, "docs", "memory", "n.md"), content: note("feedback") } });
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, "deny");
  const p = go({ hook_event_name: "PreCompact" });
  assert.equal(p.status, 0);
  assert.equal(readFileSync(join(root, "docs", "memory", "MEMORY.md"), "utf8"), "- [A](a.md) — first\n");
});

test("code graph: the command it starts sets the time of a linked graph file itself, in a folder named with a leading dash", () => {
  const cfg = { ...base, paths: { code: ["src/"] }, lookup: { index: { command: "tool query", folder: "-out", minutes: 30 } } };
  const stale = fake({ config: cfg, git: String(Math.floor(NOW / 1000)) });
  decide(ev("sessionStart", {}), stale.ctx);
  const dir = mkdtempSync(join(tmpdir(), "xwf-mem-"));
  mkdirSync(join(dir, "-out")); mkdirSync(join(dir, "bin"));
  writeFileSync(join(dir, "elsewhere.json"), "{}");
  const old = new Date("2020-01-01T00:00:00Z");
  utimesSync(join(dir, "elsewhere.json"), old, old);
  symlinkSync("../elsewhere.json", join(dir, "-out/graph.json")); lutimesSync(join(dir, "-out/graph.json"), old, old);
  writeFileSync(join(dir, "bin/tool"), "#!/bin/sh\nexit 0\n"); chmodSync(join(dir, "bin/tool"), 0o755);
  const [cmd, args] = stale.calls.bg[0];
  const r = spawnSync(cmd, args, { cwd: dir, env: { ...process.env, PATH: `${join(dir, "bin")}:${process.env.PATH}` }, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(statSync(join(dir, "elsewhere.json")).mtimeMs, old.getTime(), "the file behind the link was touched");
  assert.ok(lstatSync(join(dir, "-out/graph.json")).mtimeMs > old.getTime(), "the link's own time was not set");
});
