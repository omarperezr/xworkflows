import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { realpathSync, mkdtempSync as makeTmp, mkdirSync, writeFileSync, readFileSync, utimesSync, symlinkSync, chmodSync, statSync, lstatSync, lutimesSync, rmSync } from "node:fs";
import { tmpdir } from "../../test-tmp.mjs";
import { join } from "node:path";
import { decide } from "./memory.mjs";
import { makeCtx } from "./ctx.mjs";
import { DEFAULTS } from "./config.mjs";
const madeTmp = [];
const mkdtempSync = (p) => { const d = makeTmp(p); madeTmp.push(d); return d; };
test.after(() => { for (const d of madeTmp) rmSync(d, { recursive: true, force: true }); });

const job = join(import.meta.dirname, "memory-job.mjs");
const run = join(import.meta.dirname, "..", "run.mjs");
const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 12);
const base = { owner: "Ana", memory: { dir: "docs/memory" }, paths: {}, lookup: { index: { command: "graphify query", folder: "graphify-out", minutes: 30 } } };
const turn = (n) => JSON.stringify({ type: "user", message: { content: `message-${n}` } });
const transcript = [1, 2, 3, 4, 5].map(turn).join("\n") + "\n";

function fake({ files = {}, config = base, git = null, mtimes = {}, qmd = { code: 0, out: "x".repeat(9000) }, outside = () => null } = {}) {
  const calls = { bg: [], exec: [], written: {} };
  const ctx = {
    config,
    readFile: (p) => { const r = p.replace(/^\/r\//, ""); return calls.written[r] ?? files[r] ?? files[p] ?? null; },
    exists: (p) => p in files || Object.keys(files).some((f) => f.startsWith(p + "/")),
    mtime: (p) => mtimes[p] ?? null,
    realPath: (p) => "/r/" + p,
    listDir: (p) => Object.keys(files).filter((f) => f.startsWith(p + "/")).map((f) => f.slice(p.length + 1)),
    outsideLine: outside,
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

test("preCompact: allowed with no context, the index is rebuilt and the memory job starts in the background", () => {
  const { ctx, calls } = fake({ files: MEM });
  const d = decide(ev("preCompact"), ctx);
  assert.deepEqual(d, { decision: "allow" });
  assert.equal(calls.written["docs/memory/MEMORY.md"], "- [a](a.md) — \n- [B](b.md) — bee\n");
  assert.deepEqual(calls.bg, [[process.execPath, [job, "/r"]]]);
});

test("sessionEnd with memory.index: the same job starts; the runner reads the index itself", () => {
  const { ctx, calls } = fake({ files: MEM, config: { ...base, memory: { dir: "docs/memory", index: "proj" } } });
  assert.deepEqual(decide(ev("sessionEnd"), ctx), { decision: "allow" });
  assert.deepEqual(calls.bg, [[process.execPath, [job, "/r"]]]); // the runner reads memory.index itself
});

test("the index is written only when its text changes; MEMORY.md is not indexed", () => {
  const { ctx, calls } = fake({ files: { ...MEM, "docs/memory/MEMORY.md": "- [a](a.md) — \n- [B](b.md) — bee\n" } });
  decide(ev("sessionEnd"), ctx);
  assert.deepEqual(calls.written, {});
  assert.equal(calls.bg.length, 1);
});

test("a missing memory folder: nothing to do", () => {
  const { ctx, calls } = fake({ config: { ...base, memory: DEFAULTS.memory } });
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

test("qmd failing or timed out: one line points to the memory index that exists; no hits: silent", () => {
  const start = (o) => decide(ev("sessionStart", { source: "compact", transcript: "/t.jsonl" }), fake({ ...o, files: { "/t.jsonl": transcript, ...o.files } }).ctx);
  for (const qmd of [{ code: 1, out: "x" }, { code: null, out: "" }]) {
    assert.deepEqual(start({ qmd, files: { "docs/memory/MEMORY.md": "- a\n" } }), { decision: "allow", context: "Memory search did not run: read docs/memory/MEMORY.md." });
    assert.deepEqual(start({ qmd }), { decision: "allow" }); // no notes yet: nothing to read
  }
  const bad = { code: 1, out: "" };
  const notes = { "notes/MEMORY.md": "- a\n", "docs/memory/MEMORY.md": "- b\n" };
  const linked = start({ qmd: bad, config: { ...base, memory: { dir: "notes" } }, outside: () => "notes leaves the repository", files: notes });
  assert.equal(linked.context, "notes leaves the repository\nMemory search did not run: read notes/MEMORY.md.");
  const refused = start({ qmd: bad, config: { ...base, memory: { dir: "../x" } }, files: notes });
  assert.equal(refused.context, 'memory.dir "../x" must be a folder inside the repository');
  assert.deepEqual(start({ qmd: { code: 0, out: "  \n" } }), { decision: "allow" });
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

test("sessionStart: a memory folder linked out of the repository, not listed, says to ask the owner; listed, it says nothing", () => {
  const root = mkdtempSync(join(tmpdir(), "xwf-mem-")), real = realpathSync(mkdtempSync(join(tmpdir(), "xwf-mem-")));
  mkdirSync(join(root, "docs"));
  symlinkSync(real, join(root, "docs", "memory"));
  const at = (outside) => decide(ev("sessionStart", { source: "startup", root }), makeCtx({ root, session: "s" }, { env: {}, config: { ...DEFAULTS, memory: { dir: "docs/memory", outside } }, stateDir: root }));
  assert.match(at([]).context, /ask the owner.*inside the project.*memory\.outside in \.xworkflows\/config\.json/);
  assert.equal(at([real]).context, undefined);
});

test("sessionStart: a memory.dir that is not a text is read as the default and does not throw", () => {
  for (const dir of [5, ["docs/memory"]]) {
    const root = mkdtempSync(join(tmpdir(), "xwf-mem-"));
    const run = () => decide(ev("sessionStart", { source: "startup", root }), makeCtx({ root, session: "s" }, { env: {}, config: { ...DEFAULTS, memory: { dir, outside: [] } }, stateDir: root }));
    assert.doesNotThrow(run, JSON.stringify(dir));
  }
});

test("sessionStart: a memory.dir outside the repository, absolute or ../, says it must be a folder inside", () => {
  for (const sub of ["abs", "../notes"]) {
    const top = realpathSync(mkdtempSync(join(tmpdir(), "xwf-mem-"))), root = join(top, "repo");
    mkdirSync(root);
    mkdirSync(join(top, "notes"));
    const dir = sub === "abs" ? join(top, "notes") : sub;
    const r = decide(ev("sessionStart", { source: "startup", root }), makeCtx({ root, session: "s" }, { env: {}, config: { ...DEFAULTS, memory: { dir, outside: [] } }, stateDir: root }));
    assert.match(r.context, /must be a folder inside the repository/, sub);
  }
});

test("sessionStart: a memory.dir outside the repository names the value, says it must be inside, and speaks of no list or link", () => {
  for (const sub of ["../notes", "/nowhere-xwf/notes", "abs-made"]) {
    const top = realpathSync(mkdtempSync(join(tmpdir(), "xwf-mem-"))), root = join(top, "repo");
    mkdirSync(root);
    const dir = sub === "abs-made" ? join(top, "notes") : sub;
    if (sub === "abs-made") mkdirSync(dir);
    const r = decide(ev("sessionStart", { source: "startup", root }), makeCtx({ root, session: "s" }, { env: {}, config: { ...DEFAULTS, memory: { dir, outside: [] } }, stateDir: root }));
    assert.ok(r.context.includes(dir), sub);
    assert.match(r.context, /must be a folder inside the repository/, sub);
    assert.doesNotMatch(r.context, /memory\.outside|link/, sub);
    assert.ok(!r.context.includes(top + "\n") && !/ \/ /.test(r.context), sub);
  }
});

test("a memory.dir outside the repository, absolute or ../, is refused by the hooks also when memory.outside lists it", () => {
  for (const sub of ["abs", "../notes"]) {
    const top = realpathSync(mkdtempSync(join(tmpdir(), "xwf-mem-"))), root = join(top, "repo");
    mkdirSync(root);
    mkdirSync(join(top, "notes"));
    writeFileSync(join(top, "notes", "a.md"), "---\nname: A\ndescription: first\n---\n");
    const dir = sub === "abs" ? join(top, "notes") : sub;
    const ctx = (outside) => makeCtx({ root, session: "s" }, { env: { XWORKFLOWS_DRY: "1" }, config: { ...DEFAULTS, memory: { dir, outside } }, stateDir: root });
    for (const outside of [[], [join(top, "notes")]]) {
      const r = decide(ev("sessionStart", { source: "startup", root }), ctx(outside));
      assert.ok(r.context.includes(dir) && /must be a folder inside the repository/.test(r.context), sub);
      assert.doesNotMatch(r.context, /memory\.outside|link/, sub);
      for (const event of ["sessionEnd", "preCompact"]) {
        decide(ev(event, { root }), ctx(outside));
        assert.throws(() => readFileSync(join(top, "notes", "MEMORY.md")), /ENOENT/, `${sub} ${event}`);
      }
    }
  }
});

test("a memory.dir that is a number or a list is read as the default at session end and at a note's write, and does not throw", () => {
  for (const dir of [5, ["docs/memory"]]) {
    const root = mkdtempSync(join(tmpdir(), "xwf-mem-"));
    const ctx = () => makeCtx({ root, session: "s" }, { env: { XWORKFLOWS_DRY: "1" }, config: { ...DEFAULTS, memory: { dir, outside: [] } }, stateDir: root });
    assert.doesNotThrow(() => decide(ev("sessionEnd", { root }), ctx()), JSON.stringify(dir));
    const r = decide({ ...write(`${DEFAULTS.memory.dir}/n.md`, note("user")), root }, ctx());
    assert.equal(r.decision, "deny", JSON.stringify(dir));
  }
});

test("a memory.dir empty, . or ./ is refused: no index is written in the root, over a MEMORY.md or without one, and session start says so", () => {
  for (const dir of ["", ".", "./"]) {
    const own = mkdtempSync(join(tmpdir(), "xwf-mem-")), bare = mkdtempSync(join(tmpdir(), "xwf-mem-"));
    const before = Buffer.from("# Our own notes\r\n\n- keep me\n");
    writeFileSync(join(own, "MEMORY.md"), before);
    for (const root of [own, bare]) writeFileSync(join(root, "AGENTS.md"), "---\nname: Agents\n---\n");
    const ctx = (root) => makeCtx({ root, session: "s" }, { env: { XWORKFLOWS_DRY: "1" }, config: { ...DEFAULTS, memory: { dir, outside: [] } }, stateDir: root });
    for (const event of ["sessionEnd", "preCompact"]) {
      for (const root of [own, bare]) decide(ev(event, { root }), ctx(root));
      assert.deepEqual(readFileSync(join(own, "MEMORY.md")), before, `${JSON.stringify(dir)} ${event}`);
      assert.throws(() => readFileSync(join(bare, "MEMORY.md")), /ENOENT/, `${JSON.stringify(dir)} ${event}`);
    }
    const r = decide(ev("sessionStart", { source: "startup", root: own }), ctx(own));
    assert.equal(r.context, `memory.dir ${JSON.stringify(dir)} must be a folder inside the repository`);
  }
});

test("a refused memory.dir is not the memory folder at a note's write: a feedback note elsewhere is allowed", () => {
  for (const dir of ["", ".", "..", "/"]) {
    const c = fake({ config: { ...base, memory: { dir } } }).ctx;
    assert.equal(decide(write("/r/src/guide.md", note("feedback")), c).decision, "allow", JSON.stringify(dir));
  }
});

test("the link test is ctx's: a folder it refuses is named at session start, and a note about the owner written into it is still denied", () => {
  const { ctx } = fake({ files: MEM, outside: (file) => `${file} is written outside the repository` });
  assert.equal(decide(ev("sessionStart", { source: "startup" }), ctx).context, "docs/memory/MEMORY.md is written outside the repository");
  assert.equal(decide(write("/r/docs/memory/n.md", note("user")), ctx).decision, "deny");
  assert.equal(decide(write("/r/src/guide.md", note("feedback")), ctx).decision, "allow");
});

test("a memory folder linked out of the repository and not listed: a note about the owner written into it is denied", () => {
  const root = mkdtempSync(join(tmpdir(), "xwf-mem-")), away = realpathSync(mkdtempSync(join(tmpdir(), "xwf-mem-")));
  mkdirSync(join(root, "docs"));
  symlinkSync(away, join(root, "docs", "memory"));
  const ctx = makeCtx({ root, session: "s" }, { env: { XWORKFLOWS_DRY: "1" }, config: { ...DEFAULTS, memory: { dir: "docs/memory", outside: [] } }, stateDir: root });
  assert.equal(decide({ ...write(join(root, "docs", "memory", "n.md"), note("feedback")), root }, ctx).decision, "deny");
  assert.equal(decide({ ...write(join(root, "docs", "memory", "n.md"), note("project")), root }, ctx).decision, "allow");
});

test("through the real runner: a config whose memory section is not an object is judged by the default memory folder: the feedback note is denied, and the warning names the section", () => {
  const root = mkdtempSync(join(tmpdir(), "xwf-mem-"));
  const state = mkdtempSync(join(tmpdir(), "xwf-state-"));
  mkdirSync(join(root, ".xworkflows"));
  writeFileSync(join(root, ".xworkflows", "config.json"), '{"memory":null}');
  const env = { ...process.env, XWORKFLOWS_STATE_DIR: state, PATH: "/nonexistent" };
  delete env.XWORKFLOWS_FREE; delete env.CLAUDE_PROJECT_DIR;
  const input = { session_id: "s", cwd: root, hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: join(root, "docs", "memory", "n.md"), content: note("feedback") } };
  const r = spawnSync(process.execPath, [run, "claude", "memory"], { input: JSON.stringify(input), env, encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /deny/);
  assert.equal(r.stderr, "xworkflows: .xworkflows/config.json: memory must be an object; using its default\n");
});

// the dream suggestion at the start of a new session
const ago = (days) => new Date(NOW - days * DAY).toISOString();
function due({ ran, sessions = [], extra = {}, config = base, files = MEM, source = "startup", transcript = "/s/cur.jsonl", dream } = {}) {
  const f = { ...files, ...(dream !== undefined ? { "docs/memory/dream.json": dream } : ran !== undefined ? { "docs/memory/dream.json": JSON.stringify({ ran }) } : {}) };
  const mtimes = {};
  const all = { "cur.jsonl": NOW, ...Object.fromEntries(sessions.map(([n, t], i) => [n ?? `s${i}.jsonl`, t])) };
  for (const [n, t] of Object.entries(all)) f[`/s/${n}`] = "text", mtimes[`/s/${n}`] = t;
  const { ctx } = fake({ files: f, config, mtimes });
  const d = decide(ev("sessionStart", { source, transcript, ...extra }), ctx);
  return d.context ?? null;
}
const newer = (n, t = NOW - 1000) => Array.from({ length: n }, () => [undefined, t]);

test("dream suggestion: below both thresholds gives nothing", () => {
  assert.equal(due({ ran: ago(6), sessions: newer(9) }), null);
});
test("dream suggestion: 7 days with one session gives the line", () => {
  const l = due({ ran: ago(7), sessions: newer(1) });
  assert.match(l, /1 sessions?/); assert.match(l, /7 days/); assert.match(l, /suggest \/dream to the owner/i);
});
test("dream suggestion: 10 sessions on day 1 gives the line; clear counts as a new session", () => {
  assert.match(due({ ran: ago(1), sessions: newer(10), source: "clear" }), /10 sessions/);
});
test("dream suggestion: never ran needs 10 sessions and says so in place of days", () => {
  assert.equal(due({ sessions: newer(9) }), null);
  const l = due({ sessions: newer(10) });
  assert.match(l, /never ran/); assert.doesNotMatch(l, /days/);
});
test("dream suggestion: the running session and files older than ran are not counted; unreadable times do not count", () => {
  assert.equal(due({ ran: ago(1), sessions: [...newer(9), ["old.jsonl", NOW - 2 * DAY], ["x.jsonl", null], ["notes.txt", NOW]] }), null);
  assert.match(due({ ran: ago(1), sessions: newer(10) }), /10 sessions/);
});
test("dream suggestion: resume, compact, no suggest, no session file, no memory note, sub-agent: nothing", () => {
  const s = { ran: ago(30), sessions: newer(20) };
  assert.equal(due({ ...s, source: "resume" }), null);
  assert.equal(due({ ...s, source: "compact" }), null);
  assert.equal(due({ ...s, config: { ...base, dream: { suggest: false } } }), null);
  assert.equal(due({ ...s, transcript: null }), null);
  assert.equal(due({ ...s, files: {} }), null);
  assert.equal(due({ ...s, extra: { isSubagent: true } }), null);
  assert.match(due(s), /suggest/i);
});
test("dream suggestion: a broken or odd dream.json counts as never ran and does not throw", () => {
  for (const dream of ["{nope", "[]", "null", "{}", JSON.stringify({ ran: 5 }), JSON.stringify({ ran: "yesterday" })]) {
    assert.equal(due({ dream, sessions: newer(9) }), null, dream);
    assert.match(due({ dream, sessions: newer(10) }), /never ran/, dream);
  }
});
test("dream suggestion: the settings in the config are obeyed", () => {
  const config = { ...base, dream: { suggestAfterDays: 2, suggestAfterSessions: 3 } };
  assert.match(due({ config, ran: ago(2), sessions: newer(1) }), /2 days/);
  assert.match(due({ config, ran: ago(1), sessions: newer(3) }), /3 sessions/);
  assert.equal(due({ config, ran: ago(1), sessions: newer(2) }), null);
});
test("dream suggestion: at most 160 bytes with the largest numbers", () => {
  const l = due({ ran: ago(99999), sessions: newer(99999) });
  assert.ok(Buffer.byteLength(l) <= 160, String(Buffer.byteLength(l)));
  assert.ok(Buffer.byteLength(due({ sessions: newer(99999) })) <= 160);
});
test("dream suggestion: it goes after the old lines and never pushes one out", () => {
  const s = { ran: ago(30), sessions: newer(20) };
  const goals = { ".xworkflows/summary.md": "status: approved\ndate: 2026-01-01\n", ...MEM };
  const l = due({ ...s, files: goals });
  assert.match(l, /^Goals written .*\n.*\/dream/s);
  const tight = { ...base, tokens: { sessionStartBytes: Buffer.byteLength("Goals written 10 months ago: run /adapt to refresh them.") } };
  assert.match(due({ ...s, files: goals, config: tight }), /^Goals written 10 months ago: run \/adapt to refresh them\.$/);
});

test("dream suggestion: by days it needs at least one session newer than the last run; by the count nothing changes", () => {
  assert.equal(due({ ran: ago(30), sessions: newer(0) }), null);
  assert.equal(due({ ran: ago(30), sessions: [["old.jsonl", NOW - 40 * DAY]] }), null);
  assert.match(due({ ran: ago(30), sessions: newer(1) }), /1 sessions since the last run 30 days ago/);
  assert.match(due({ ran: ago(1), sessions: newer(10) }), /10 sessions/);
});

// a threshold that is not a whole number above zero is its default: 7 days, 10 sessions
for (const [kind, bad] of [["zero", 0], ["a negative number", -3], ["a fraction", 2.5], ["a text", "3"], ["an empty text", ""], ["null", null], ["false", false], ["an object", { n: 3 }]]) {
  test(`dream suggestion: suggestAfterDays as ${kind} is 7`, () => {
    const config = { ...base, dream: { suggestAfterDays: bad } };
    assert.equal(due({ config, ran: ago(6), sessions: newer(1) }), null);
    assert.match(due({ config, ran: ago(7), sessions: newer(1) }), /7 days/);
  });
  test(`dream suggestion: suggestAfterSessions as ${kind} is 10`, () => {
    const config = { ...base, dream: { suggestAfterSessions: bad } };
    assert.equal(due({ config, ran: ago(1), sessions: newer(9) }), null);
    assert.match(due({ config, ran: ago(1), sessions: newer(10) }), /10 sessions/);
  });
}
// only false turns the line off; any other value is the default, true
for (const [kind, bad] of [["zero", 0], ["a text", "false"], ["an empty text", ""], ["null", null], ["an object", {}]]) {
  test(`dream suggestion: suggest as ${kind} is true`, () => {
    assert.match(due({ config: { ...base, dream: { suggest: bad } }, ran: ago(30), sessions: newer(20) }), /suggest \/dream/i);
  });
}

// a memory folder that is a link: dream refuses to run there, so the hook gives no line there
function linkedProject(target, { outside = false, inside = false, via = false } = {}) {
  let root = realpathSync(mkdtempSync(join(tmpdir(), "xwf-link-")));
  if (via) { mkdirSync(join(root, "real")); symlinkSync(join(root, "real"), join(root, "via")); root = join(root, "via"); } // the root as given passes through a link
  const dest = inside ? join(root, "elsewhere") : realpathSync(mkdtempSync(join(tmpdir(), "xwf-dest-")));
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(dest, { recursive: true });
  writeFileSync(join(dest, "a.md"), "x");
  if (target === "folder") { mkdirSync(join(root, "docs", "memory")); writeFileSync(join(root, "docs", "memory", "a.md"), "x"); }
  else symlinkSync(dest, join(root, "docs", "memory"));
  const sessions = realpathSync(mkdtempSync(join(tmpdir(), "xwf-sess-")));
  writeFileSync(join(sessions, "cur.jsonl"), "x");
  for (let i = 0; i < 10; i++) writeFileSync(join(sessions, `s${i}.jsonl`), "x");
  const config = { ...DEFAULTS, memory: { dir: "docs/memory", outside: outside ? [dest] : [] } };
  const d = decide(ev("sessionStart", { source: "startup", root, transcript: join(sessions, "cur.jsonl") }), makeCtx({ root, session: "s" }, { env: {}, config, stateDir: root }));
  return { context: d.context ?? null, dest };
}
test("dream suggestion: a real memory folder gives the line", () => {
  assert.match(linkedProject("folder").context, /Dream is due/);
});
test("dream suggestion: a repository reached through a link, as the temp folder of macOS, still gives the line", () => {
  assert.match(linkedProject("folder", { via: true }).context, /Dream is due/);
});
test("dream suggestion: a memory folder that is a link to a folder inside the repository gives no line", () => {
  assert.equal(linkedProject("memory", { inside: true }).context, null);
});
test("dream suggestion: a memory folder that is a link to a folder outside that memory.outside lists gives no line", () => {
  assert.equal(linkedProject("memory", { outside: true }).context, null);
});
test("dream suggestion: a folder above the memory folder that is a link gives no line", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "xwf-link-")));
  const dest = realpathSync(mkdtempSync(join(tmpdir(), "xwf-dest-")));
  mkdirSync(join(dest, "memory"));
  writeFileSync(join(dest, "memory", "a.md"), "x");
  symlinkSync(dest, join(root, "docs"));
  const sessions = realpathSync(mkdtempSync(join(tmpdir(), "xwf-sess-")));
  for (const n of ["cur", ...Array.from({ length: 10 }, (_, i) => `s${i}`)]) writeFileSync(join(sessions, `${n}.jsonl`), "x");
  const config = { ...DEFAULTS, memory: { dir: "docs/memory", outside: [dest] } };
  const d = decide(ev("sessionStart", { source: "startup", root, transcript: join(sessions, "cur.jsonl") }), makeCtx({ root, session: "s" }, { env: {}, config, stateDir: root }));
  assert.equal(d.context ?? null, null);
});

test("dream suggestion: a session path that is not text gives no line, throws nothing, and the other lines are still given", () => {
  const goals = { ".xworkflows/summary.md": "status: approved\ndate: 2026-01-01\n", ...MEM };
  for (const transcript of [5, true, {}, [], ["/s/cur.jsonl"]]) {
    const l = due({ ran: ago(30), sessions: newer(20), files: goals, transcript });
    assert.match(l, /^Goals written .*\/adapt to refresh them\.$/, JSON.stringify(transcript));
  }
});

test("preCompact: with no notes folder and memory.before set, the job starts and nothing is written", () => {
  const { ctx, calls } = fake({ config: { ...base, memory: { dir: "docs/memory", before: ["node", "x.mjs"] } } });
  decide(ev("preCompact"), ctx);
  assert.deepEqual(calls.bg, [[process.execPath, [job, "/r"]]]);
  assert.deepEqual(calls.written, {});
});

test("preCompact: with no notes folder and memory.index set, the job starts and nothing is written", () => {
  const { ctx, calls } = fake({ config: { ...base, memory: { dir: "docs/memory", index: "x" } } });
  decide(ev("preCompact"), ctx);
  assert.equal(calls.bg.length, 1);
  assert.deepEqual(calls.written, {});
});

test("preCompact: with no notes folder and memory.before a text, nothing starts: the job would only skip it", () => {
  const { ctx, calls } = fake({ config: { ...base, memory: { dir: "docs/memory", before: "node x.mjs" } } });
  decide(ev("preCompact"), ctx);
  assert.deepEqual(calls, { bg: [], exec: [], written: {} });
});

test("preCompact: with no notes folder and a memory.before with an empty or non-text item, nothing starts: the job would only skip it", () => {
  for (const before of [[""], [1], ["node", 3]]) {
    const { ctx, calls } = fake({ config: { ...base, memory: { dir: "docs/memory", before } } });
    decide(ev("preCompact"), ctx);
    assert.deepEqual(calls, { bg: [], exec: [], written: {} }, JSON.stringify(before));
  }
});
