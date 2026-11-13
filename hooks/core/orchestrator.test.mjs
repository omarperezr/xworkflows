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
const cfg = { ...base, owner: "Ana", paths: { ...base.paths, code: ["src/"], heavyRead: ["src/", "db/"] } };
const ev = (kind, extra = {}) => ({ event: "preTool", tool: "t", kind, session: "s", root: "/r", isSubagent: false, ...extra });
const agent = (type, extra = {}) => ev("agent", { agent: type, ...extra });
const read = (path, limit) => ev("read", { path, limit });
const sh = (command) => ev("shell", { command });
const SUMMARY = "/r/.xworkflows/summary.md";
// a ctx where the session is oriented: approved summary, orchestrate mark, every agent type defined, index fresh
function mk({ marks = ["orchestrate"], files = { [SUMMARY]: "status: approved\n" }, exist = [".claude/agents/", "graphify-out"], head = "h1", state = {}, config = cfg, home = "/h" } = {}) {
  const st = new Map(Object.entries({ index: T0 - 1000, ...state }));
  return {
    config, st, home,
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
  assert.ok(denied(decide(read("/r/db/m.sql"), mk())));
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
  assert.ok(denied(decide(sh("sed -n 1,5p db/x.sql"), mk())));
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
  assert.ok(denied(decide(e, c), /already reviewed.*name the commit to review/));
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

test("shell: a write into a heavy folder is not a read; a here-document body is not searched", () => {
  const ok = ["cat > src/a.ts", "cat >> src/a.ts", "head -3 f > db/x.sql", "tail f >>src/a.ts", "cat <<EOF > src/a.ts\nuse src/b.ts\nEOF", "cat <<'EOF' >> /r/src/a.ts\nsrc/b.ts\nEOF", "cat <<EOF\ncat src/a.ts\nEOF", "cat docs/src/a.ts", "cat ./docs/src/a.ts"];
  for (const c of ok) assert.ok(allowed(decide(sh(c), mk())), c);
});

test("shell: a heavy folder matches at the root only, and a plain read still denies", () => {
  const no = ["cat src/a.ts", "cat ./src/a.ts", "cat /r/src/a.ts", 'cat "src/a.ts"', "head -5 src/a.ts > /tmp/o", "tail src/a.ts >> /tmp/o", "sed -n 1,5p src/a.ts", "cat <<EOF > /tmp/o\nx\nEOF\ncat src/a.ts", "cat src/a.ts 2>&1"];
  for (const c of no) assert.ok(denied(decide(sh(c), mk())), c);
});

test("shell: a long command stays fast", () => {
  const t = Date.now();
  for (const c of ["cat " + "a ".repeat(20000), "cat <<EOF\n" + "x\n".repeat(50000), "<<A ".repeat(20000), "env ".repeat(20000) + "x", "A=1 ".repeat(20000), "> ".repeat(20000)]) decide(sh(c), mk());
  assert.ok(Date.now() - t < 2000);
});

test("the index query counts behind env, -u and NAME=value words", () => {
  const q = (command) => { const c = mk({ state: { index: 0 } }); decide(sh(command), c); return c.st.get("index"); };
  for (const c of ['env graphify query "x"', 'env -u FOO graphify query "x"', 'env A=1 B=2 graphify query "x"', 'env -u A B=2 -u C graphify query "x"', 'A=1 graphify query "x"', 'cd p && A=1 B= graphify query "x"', 'FOO=1 /home/u/bin/graphify query "x"', '/usr/bin/env A=1 graphify query "x"'])
    assert.equal(q(c), T0, c);
  for (const c of ['echo A=1 graphify query x', 'env A=1 echo graphify query x', 'FOO=graphify query x', 'env -u graphify query x'])
    assert.equal(q(c), 0, c);
});

test("risk reviewer keys on the commit ids the prompt names, cut to 7, with the root HEAD", () => {
  const p = (ids) => agent("risk-review", { prompt: `docs/superpowers/specs/x.md ${ids}` });
  const c = mk({ head: "h000000" });
  assert.ok(allowed(decide(p("abc1234 and def5678"), c)));
  assert.equal(c.st.get("risk"), "abc1234,def5678,h000000");
  assert.ok(denied(decide(p("def5678 abc1234 abc1234"), c), /already reviewed/));
  assert.ok(allowed(decide(p("abc1234"), c))); // other ids: another review
  assert.ok(denied(decide(p("abc1234abcdef0123456789abcdef0123456789"), c))); // the long spelling of the same commit is the same key
  assert.ok(allowed(decide(p("abc123"), c))); // 6 chars is no id: keys on HEAD alone
  assert.equal(c.st.get("risk"), "h000000");
  assert.ok(denied(decide(p("abc123"), c)));
  assert.ok(allowed(decide(p("abc123"), { ...c, git: () => "h2" })));
});

test("the same ids after a fix commit moved HEAD are another review", () => {
  const p = (t) => agent("risk-review", { prompt: `docs/superpowers/plans/x.md ${t}` });
  const c = mk({ head: "1d81d4e0000000000000000000000000000000aa" });
  assert.ok(allowed(decide(p("main...1d81d4e (reviewed sha 1d81d4e)"), c)));
  assert.ok(denied(decide(p("main...1d81d4e (reviewed sha 1d81d4e)"), c), /name the commit to review/));
  const moved = { ...c, git: () => "9999999ffffffffffffffffffffffffffffffffff" };
  assert.ok(allowed(decide(p("findings; reviewed sha 1d81d4e, git diff 1d81d4e..HEAD"), moved)));
});

test("the same commit under another spelling is the same key", () => {
  const p = (t) => agent("risk-review", { prompt: `docs/superpowers/plans/x.md ${t}` });
  const full = "1d81d4e0000000000000000000000000000000aa";
  const a = mk({ head: full });
  assert.ok(allowed(decide(p("1d81d4e"), a)));
  assert.ok(denied(decide(p(full), a)));
  const b = mk({ head: full });
  assert.ok(allowed(decide(p("no id here"), b)));
  assert.ok(denied(decide(p("1d81d4e"), b)));
});

test("shell: a redirect target stops at a separator", () => {
  assert.ok(denied(decide(sh("ls x 2>/dev/null; cat src/a.ts"), mk())));
  assert.ok(denied(decide(sh("echo hi > /tmp/o; cat src/a.ts"), mk())));
  assert.ok(denied(decide(sh("git status 2>&1; cat src/a.ts"), mk())));
  assert.ok(allowed(decide(sh("cat README.md 2>/dev/null; ls src/"), mk())));
  assert.ok(allowed(decide(sh("head -3 f 2>/dev/null; git add src/x"), mk())));
});

test("shell: a line break is a command boundary, and here-document bodies are not searched for the index query", () => {
  assert.ok(allowed(decide(sh("cat > /tmp/n.md <<'EOF'\nx\nEOF\ngit add src/x.mjs"), mk())));
  assert.ok(allowed(decide(sh("git commit -m \"$(cat <<'EOF'\nmsg\nEOF\n)\"\ngit status -- src/"), mk())));
  assert.ok(denied(decide(sh("ls\ncat src/a.ts"), mk())));
  for (const c of ["cat \\\n  src/a.ts", "cat \\\n src/a.ts \\\n src/b.ts", "head -50 \\\n src/a.ts", "sed -n '1,80p' \\\n src/a.ts"]) assert.ok(denied(decide(sh(c), mk())), c);
  assert.ok(allowed(decide(sh("git add \\\n src/a.ts"), mk())));
  const q = (command) => { const c = mk({ state: { index: 0 } }); decide(sh(command), c); return c.st.get("index"); };
  assert.equal(q('cd /p\ngraphify query "x"'), T0);
  assert.equal(q("cat <<EOF\ngraphify query x\nEOF"), 0);
});

test("shell: a here-string and a shift are not here-documents; a delimiter with a dot or a dash is read whole", () => {
  for (const c of ['head -1 <<< "abc"\ncat src/a.ts', "head -c $((1<<10)) f\ncat src/a.ts", "cat <<'END-X' > /tmp/o\nbody\nEND-X\ncat src/a.ts", "cat <<E.OF > /tmp/o\nbody\nE.OF\ncat src/a.ts", "head -c $((1 << 10)) f\ncat src/a.ts", "python3 -c 'print(1 << 10)'\ncat src/a.ts"])
    assert.ok(denied(decide(sh(c), mk())), c);
  assert.ok(allowed(decide(sh("cat <<'END-X'\ncat src/b.ts\nEND-X"), mk())));
  assert.ok(allowed(decide(sh('python3<<EOF\nhead = open("src/a.ts")\nEOF'), mk())));
});

test("shell: the root under its usual spellings", () => {
  const at = (command, c = mk()) => decide({ ...sh(command), root: "/h/proj" }, c);
  for (const c of ["cat ~/proj/src/x", "cat $HOME/proj/src/x", "cat ${HOME}/proj/src/x", "cat $PWD/src/x", 'cat "$CLAUDE_PROJECT_DIR/src/x"', 'cat "$CLAUDE_PROJECT_DIR"/src/x', 'cat "${CLAUDE_PROJECT_DIR}"/src/x', 'cat "$PWD"/src/x', 'cat "$HOME"/proj/src/x', "cat /h/proj//src/x", "cat /h/proj/./src/x", "cat /h//proj/src/x"])
    assert.ok(denied(at(c)), c);
  assert.ok(denied(decide({ ...sh("cat /h/proj/src/x"), root: "/h/proj/" }, mk())));
  assert.ok(allowed(at("cat ~/other/src/x")));
  assert.ok(allowed(at('cat "$HOME"/other/src/x')));
  assert.ok(allowed(at('cat a > "$PWD"/src/x')));
  assert.ok(allowed(at("cat ~/proj/docs/src/x")));
});

test("shell: a reader behind a shell keyword or a NAME=value word, and the root as $(pwd), a rev-parse or ../", () => {
  const at = (command) => decide({ ...sh(command), root: "/h/proj" }, mk());
  for (const c of ["for f in a; do cat src/x; done", "if x; then cat src/x; fi", "if x; then :; else head src/x; fi", "time cat src/x", "! cat src/x", "{ cat src/x; }", "LC_ALL=C cat src/x", "A=1 B=2 tail src/x", "cat $(pwd)/src/x", 'cat "$(pwd)"/src/x', "cat $(git rev-parse --show-toplevel)/src/x", "cat /h/proj/docs/../src/x", "cat src/../src/x", "cat ../proj/src/x"])
    assert.ok(denied(at(c)), c);
  for (const c of ["do_it cat src/x", "echo then cat src/x", "for f in a; do cat docs/x; done", "cat $(pwd)/docs/x", "cat /h/proj/src/../docs/x", "cat ../other/src/x", "X=src/x echo done"])
    assert.ok(allowed(at(c)), c);
});

test("shell: the home folder comes from ctx.home, with its backslashes turned", () => {
  const at = (home, command) => decide({ ...sh(command), root: "C:/Work/u/proj" }, mk({ home }));
  assert.ok(denied(at("C:\\Work\\u", "cat ~/proj/src/x")));
  assert.ok(denied(at("C:/Work/u", "cat $HOME/proj/src/x")));
  assert.ok(allowed(at("/other", "cat ~/proj/src/x")));
});

test("shell: no pattern grows with the square of a long command", () => {
  // growth, not a wall-clock limit: four times the repeats must not cost more than about eight times the time
  const shapes = [(n) => "echo " + "7".repeat(n), (n) => ";A=x".repeat(n), (n) => "(".repeat(n), (n) => ";".repeat(n), (n) => "a;".repeat(n), (n) => "cat " + "a/".repeat(n), (n) => "A=x ".repeat(n), (n) => "\n".repeat(n), (n) => " \n".repeat(n), (n) => "\r\n".repeat(n), (n) => "A=x\n".repeat(n), (n) => "-u a\n".repeat(n), (n) => "env\n".repeat(n), (n) => "(cat ".repeat(n), (n) => "$(cat x)".repeat(n)];
  const cost = (c) => Math.min(...[0, 1].map(() => { const t = performance.now(); decide(sh(c), mk()); return performance.now() - t; }));
  for (const shape of shapes) {
    const small = cost(shape(5000)), big = cost(shape(20000));
    assert.ok(big <= 8 * Math.max(small, 25), `${shape(3).slice(0, 12)} took ${small} ms, then ${big} ms for four times the repeats`);
  }
});

test("shell: a continued line that ends in CR LF is joined, a redirect `>&` is not a reader's argument, a root with backslashes is the root", () => {
  assert.ok(denied(decide(sh("cat \\\r\nsrc/a.ts"), mk())));
  assert.ok(denied(decide(sh("cat >&2 src/a.ts"), mk())));
  assert.ok(allowed(decide(sh("cat a >&src/a.ts"), mk())));
  const at = (command) => decide({ ...sh(command), root: "C:\\Work\\proj" }, mk());
  assert.ok(denied(at("cat $PWD/src/x")));
  assert.ok(denied(at("cat C:\\Work\\proj\\src\\x")));
  assert.ok(allowed(at("cat C:\\Work\\other\\src\\x")));
});
