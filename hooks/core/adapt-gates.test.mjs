import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync as makeTmp, mkdirSync, writeFileSync, symlinkSync, realpathSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decide } from "./adapt-gates.mjs";
import { normalize } from "../adapters/claude.mjs";
const madeTmp = [];
const mkdtempSync = (p) => { const d = makeTmp(p); madeTmp.push(d); return d; };
test.after(() => { for (const d of madeTmp) rmSync(d, { recursive: true, force: true }); });

const HEADS = ["What it is", "Who pays, what is sold, what is not done", "Aspirations at about 3, 12 and 36 months", "Risks, the costliest mistake first", "What must not change; what is free to change", "Zones and which paths are risk paths", "How the owner works", "About you"];
const summary = (status, five = "") => `---\nstatus: ${status}\n---\n` + HEADS.map((h, i) => `## ${i + 1}. ${h}\n${i === 4 ? five : ""}\n`).join("");
const fresh = { run: "r1", startedAt: Date.now() };
const scan = { kinds: { values: { total: 3 }, snap: { total: 0 }, conc: { total: 0 } } };
const files = (run = fresh) => ({ "/r/.xworkflows/adapt-run.json": run && JSON.stringify(run), "/r/.xworkflows/scan.json": JSON.stringify(scan) });
const ctx = (f = files(), check = () => ({ code: 0, out: "" }), skill = "adapt") => ({ readFile: (p) => f[p] ?? null, runCheck: check, skillName: () => skill });
const wf = (extra = {}) => ({ event: "preTool", tool: "Workflow", kind: "workflow", session: "s", root: "/r", inline: false, scriptPath: "/r/.claude/skills/adapt/research.workflow.js", args: { root: "/r", zeroHits: ["conc", "snap"] }, ...extra });
const wr = (writes) => ({ event: "preTool", tool: "Write", kind: "write", session: "s", root: "/r", writes });
const sw = (content) => wr([{ path: "/r/.xworkflows/summary.md", content }]);
const deny = (d, re) => { assert.equal(d.decision, "deny"); assert.match(d.reason, re); assert.match(d.reason, /If no \/adapt is in progress \(a stale run file\), run node \.claude\/skills\/adapt\/research\.mjs done\./); assert.doesNotMatch(d.reason, /No adapt running/); assert.match(d.reason, /To bypass in an emergency: XWORKFLOWS_FREE=1\.$/); };
const ok = (d) => assert.equal(d.decision, "allow");
const missing = (out) => () => ({ code: 1, out });
const FIVE = "- snap: not applicable (you)\n";

test("gates deny inline Workflow during a run", () => deny(decide(wf({ inline: true }), ctx()), /scriptPath \.claude\/skills\/adapt\/research\.workflow\.js/));
test("research scriptPath Workflow allowed", () => ok(decide(wf(), ctx())));
test("other scriptPath denied during a run", () => deny(decide(wf({ scriptPath: "/r/x.workflow.js" }), ctx()), /research script/));
test("Workflow args must match the scan", () => {
  deny(decide(wf({ args: { zeroHits: ["snap"] } }), ctx()), /zeroHits/);
  deny(decide(wf({ args: { zeroHits: ["snap", "conc", "values"] } }), ctx()), /zeroHits/);
  deny(decide(wf({ args: {} }), ctx()), /zeroHits/);
  const f = files(); delete f["/r/.xworkflows/scan.json"];
  deny(decide(wf(), ctx(f)), /scan first/);
});
test("research.md write denied during a run", () => deny(decide(wr([{ path: "/r/.xworkflows/research.md", content: "x" }]), ctx()), /research\.mjs render/));
test("script-written sidecars denied during a run", () => {
  deny(decide(wr([{ path: "/r/.xworkflows/rules.json", old: "a", new: "b" }]), ctx()), /rules\.json is written by node \.claude\/skills\/adapt\/rules\.mjs\./);
  deny(decide(wr([{ path: "/r/.xworkflows/scan.json", content: "{}" }]), ctx()), /scan\.json is written by node \.claude\/skills\/adapt\/scan\.mjs\./);
  ok(decide(wr([{ path: "/r/.xworkflows/config.json", content: "{}" }]), ctx()));
});
test("screens.json and details.md writes denied during a run", () => {
  deny(decide(wr([{ path: "/r/.xworkflows/screens.json", content: "{}" }]), ctx()), /screens\.json is written by node \.claude\/skills\/adapt\/research\.mjs render\./);
  deny(decide(wr([{ path: "/r/.xworkflows/details.md", content: "x" }]), ctx()), /details\.md is written by node \.claude\/skills\/adapt\/research\.mjs render\./);
});
test("draft summary denied while ids are missing", () => {
  deny(decide(sw(summary("draft", FIVE)), ctx(files(), missing("H1-a\nH2-b"))), /Ask these first: H1-a, H2-b/);
  ok(decide(sw(summary("draft", FIVE)), ctx()));
  deny(decide(sw(summary("draft", FIVE).replace("## 8. About you", "## x")), ctx()), /About you/);
});
test("draft summary passes without a line for an absent kind", () => ok(decide(sw(summary("draft")), ctx())));
test("approved summary denied until P-H1..P-H7 are Right", () => {
  const c = (code, out) => ctx(files(), (a) => (a.includes("--approved") ? { code, out } : { code: 0, out: "" }));
  deny(decide(sw(summary("approved")), c(1, "P-H1\nP-H2")), /P-H1, P-H2/);
  ok(decide(sw(summary("approved")), c(0, "")));
});
test("approved summary with 7 headings allowed when P-ids are Right", () => ok(decide(sw(summary("approved").replace(/## 8[^]*/, "")), ctx())));
test("no run file, nothing denied or recorded", () => {
  const c = ctx(files(null), missing("x"));
  ok(decide(wf({ inline: true }), c));
  ok(decide(wr([{ path: "/r/.xworkflows/research.md", content: "x" }]), c));
});
test("stale run file denies nothing", () => ok(decide(wf({ inline: true }), ctx(files({ ...fresh, startedAt: Date.now() - 13 * 3600e3 })))));
test("gates active during a re-adapt", () => deny(decide(wf({ inline: true }), ctx(files())), /fixed research/));
test("summary Edit denied during a run", () => deny(decide(wr([{ path: "/r/.xworkflows/summary.md", old: "a", new: "b" }]), ctx()), /Write the whole summary with Write\./));
test("deny reason names the installed skill", () => {
  const d = decide(wf({ inline: true }), ctx(files(), undefined, "xwf-adapt"));
  assert.match(d.reason, /\.claude\/skills\/xwf-adapt\/research\.workflow\.js/);
  assert.match(d.reason, /xwf-adapt\/research\.mjs done/);
});
const quiet = (f) => { const w = process.stderr.write; let t = ""; process.stderr.write = (x) => ((t += x), true); try { f(); } finally { process.stderr.write = w; } return t; };
test("spawn error allows and logs", () => {
  for (const r of [{ code: null }, { code: 1, out: "", err: "Error: Cannot find module" }, { code: 137, out: "x" }, { code: 1, out: "" }]) {
    let d;
    const t = quiet(() => { d = decide(sw(summary("draft", FIVE)), ctx(files(), () => r)); });
    ok(d);
    assert.match(t, /xworkflows: adapt check could not run/);
  }
});
test("exit 1 with an adapt: line on stderr denies with that line", () =>
  deny(decide(sw(summary("draft", FIVE)), ctx(files(), () => ({ code: 1, out: "", err: "adapt: interview.json is missing or unreadable\n" }))), /adapt: interview\.json is missing or unreadable/));
test("run.mjs: a check that cannot run lets the call through and says so", () => {
  const d = mkdtempSync(join(tmpdir(), "xwf-g-"));
  mkdirSync(join(d, ".xworkflows"));
  writeFileSync(join(d, ".xworkflows/adapt-run.json"), JSON.stringify(fresh));
  const input = { session_id: "s", cwd: d, tool_name: "Write", tool_input: { file_path: join(d, ".xworkflows/summary.md"), content: summary("draft", FIVE) } };
  const r = spawnSync("node", [join(import.meta.dirname, "..", "run.mjs"), "claude", "adapt-gates"], { input: JSON.stringify(input), encoding: "utf8", env: { ...process.env, XWORKFLOWS_FREE: "", XWORKFLOWS_STATE_DIR: mkdtempSync(join(tmpdir(), "xwf-state-")) } });
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /xworkflows: adapt check could not run/);
});
test("status is read case-insensitively; none means draft rules", () => {
  const c = ctx(files(), missing("H1-a"));
  deny(decide(sw(summary("Draft", FIVE)), c), /H1-a/);
  deny(decide(sw(summary('"draft"', FIVE)), c), /H1-a/);
  deny(decide(sw("no front matter"), c), /H1-a/);
  deny(decide(sw(""), c), /H1-a/);
  deny(decide(sw(summary("APPROVED")), c), /exactly the English label Right/);
});
test("heading 5 keeps its ### sub-headings", () => ok(decide(sw(summary("draft", "### Risk a\n- snap: not applicable (you)\n### Risk b\n")), ctx())));
test("zeroHits compared as a set", () => ok(decide(wf({ args: { zeroHits: ["conc", "snap", "snap"] } }), ctx())));
test("a symlinked write path to research.md is denied; a not-yet-existing file resolves", () => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "xwf-g-")));
  mkdirSync(join(d, ".xworkflows"));
  const link = join(d, "alias");
  symlinkSync(join(d, ".xworkflows"), link);
  try {
    const f = { [join(d, ".xworkflows/adapt-run.json")]: JSON.stringify(fresh) };
    const c = { readFile: (p) => f[p] ?? null, runCheck: () => ({ code: 0 }), skillName: () => "adapt" };
    const e = (p) => ({ ...wr([{ path: p, content: "x" }]), root: d });
    deny(decide(e(join(link, "research.md")), c), /research\.mjs render/);
    deny(decide(e("./.xworkflows/../.xworkflows/research.md"), c), /render/);
  } finally { rmSync(link); }
});
test("scriptPath compared after realpath", () => {
  const d = mkdtempSync(join(tmpdir(), "xwf-g-"));
  const real = realpathSync(d);
  mkdirSync(join(real, ".claude/skills/adapt"), { recursive: true });
  writeFileSync(join(real, ".claude/skills/adapt/research.workflow.js"), "");
  const link = join(real, "..", `xwf-link-${Date.now()}`);
  symlinkSync(real, link);
  const f = { [join(real, ".xworkflows/adapt-run.json")]: JSON.stringify(fresh), [join(real, ".xworkflows/scan.json")]: JSON.stringify(scan) };
  try { ok(decide(wf({ root: real, scriptPath: join(link, ".claude/skills/adapt/research.workflow.js") }), { ...ctx(f) })); } finally { rmSync(link); }
});
test("translated label is not a pick", () => {
  const d = mkdtempSync(join(tmpdir(), "xwf-g-"));
  const x = (f) => join(d, ".xworkflows", f);
  mkdirSync(join(d, ".xworkflows"));
  spawnSync("git", ["init", "-q"], { cwd: d });
  writeFileSync(x("adapt-run.json"), JSON.stringify(fresh));
  writeFileSync(x("interview.json"), "[]");
  writeFileSync(x("interview.log.jsonl"), [1, 2, 3, 4, 5, 6, 7].map((n) => JSON.stringify({ run: "r1", id: `P-H${n}`, answer: "Bien" })).join("\n") + "\n");
  const mjs = join(import.meta.dirname, "..", "..", "skills", "adapt", "research.mjs");
  const runCheck = (a) => { const r = spawnSync("node", [mjs, "check", ...a], { cwd: d, encoding: "utf8" }); return { code: r.status, out: r.stdout.trim() }; };
  const f = { [x("adapt-run.json")]: JSON.stringify(fresh) };
  const e = { ...sw(summary("approved")), root: d, writes: [{ path: x("summary.md"), content: summary("approved") }] };
  const r = decide(e, { readFile: (p) => (p in f ? f[p] : null), runCheck, skillName: () => "adapt" });
  deny(r, /P-H1, P-H2, P-H3, P-H4, P-H5, P-H6, P-H7/);
});
test("Workflow event from the real payload", () => {
  const raw = JSON.parse(readFileSync(join(import.meta.dirname, "..", "fixtures/claude/workflow-pre-real.json"), "utf8")).input;
  const ev = normalize(raw, {});
  assert.equal(ev.kind, "workflow");
  assert.equal(ev.inline, false);
  assert.equal(ev.scriptPath, raw.tool_input.scriptPath);
  assert.deepEqual(ev.args, raw.tool_input.args);
});
test("agent-forged log, queue and run file denied during a run, each naming its way out", () => {
  deny(decide(wr([{ path: "/r/.xworkflows/interview.log.jsonl", content: "{}" }]), ctx()), /interview\.log\.jsonl is written by the adapt-record hook.*AskUserQuestion/);
  deny(decide(wr([{ path: "/r/.xworkflows/interview.json", old: "a", new: "b" }]), ctx()), /interview\.json is written by node \.claude\/skills\/adapt\/research\.mjs queue\./);
  deny(decide(wr([{ path: "/r/.xworkflows/adapt-run.json", content: "{}" }]), ctx()), /adapt-run\.json is written by node \.claude\/skills\/adapt\/research\.mjs start\./);
  ok(decide(wr([{ path: "/r/.xworkflows/research.json", content: "{}" }]), ctx()));
});
test("no run file, the log, queue and run file are writable", () => {
  const c = ctx(files(null), missing("x"));
  for (const f of ["interview.log.jsonl", "interview.json", "adapt-run.json"]) ok(decide(wr([{ path: `/r/.xworkflows/${f}`, content: "x" }]), c));
});

const sh = (command) => ({ event: "preTool", tool: "Bash", kind: "shell", session: "s", root: "/r", command });
test("a shell redirect or tee into summary.md is denied during a run", () => {
  for (const c of [`cat <<'EOF' > .xworkflows/summary.md\nx\nEOF`, `echo x >> /r/.xworkflows/summary.md`, `echo x >"$PWD/.xworkflows/summary.md"`, `echo x | tee .xworkflows/summary.md`, `echo x | tee -a '.xworkflows/summary.md'`])
    deny(decide(sh(c), ctx()), /summary\.md is written with Write/);
});
test("shell commands that only read summary.md or write elsewhere pass", () => {
  for (const c of [`cat .xworkflows/summary.md`, `grep a .xworkflows/summary.md > /tmp/out.txt`, `echo x > docs/summary.md`, `echo x > .xworkflows/summary.md.bak`, `diff .xworkflows/summary.md a | tee out.txt`])
    ok(decide(sh(c), ctx()));
});
test("a commit message that mentions the file with an arrow writes nothing", () => ok(decide(sh(`git commit -m "adapt: research -> .xworkflows/summary.md"`), ctx())));
test("an escaped > before the file writes nothing", () => ok(decide(sh("grep -n \\> .xworkflows/summary.md"), ctx())));
test("a folder whose name starts with tee writes nothing", () => ok(decide(sh("cat /home/u/teemo/.xworkflows/summary.md"), ctx())));
test("tee with the file after another file is denied", () => deny(decide(sh("echo x | tee /tmp/copy .xworkflows/summary.md"), ctx()), /summary\.md is written with Write/));
test("a redirect into a doubled slash path is denied", () => deny(decide(sh("echo x > .xworkflows//summary.md"), ctx()), /summary\.md is written with Write/));
test("a redirect into a quoted file name is denied", () => deny(decide(sh('echo x > .xworkflows/"summary.md"'), ctx()), /summary\.md is written with Write/));
test("a long word after tee is judged in linear time", () => {
  const time = (n) => { const e = sh("tee -" + "a".repeat(n)); const t = process.hrtime.bigint(); ok(decide(e, ctx())); return Number(process.hrtime.bigint() - t) / 1e6; };
  time(1000);
  const small = time(20000), big = time(80000);
  assert.ok(big < 8 * Math.max(small, 1) + 20, `20000 chars ${small} ms, 80000 chars ${big} ms`);
});
test("a redirect glued to the word before it is denied", () => {
  for (const c of ["echo x>.xworkflows/summary.md", "cat draft.md>.xworkflows/summary.md", "{ echo a; }>.xworkflows/summary.md", "cat <<'EOF'>.xworkflows/summary.md"])
    deny(decide(sh(c), ctx()), /summary\.md is written with Write/);
});
test("tee that reads the summary writes nothing", () => ok(decide(sh("tee /tmp/copy < .xworkflows/summary.md"), ctx())));
test("many tee words are judged in linear time", () => {
  const time = (n) => { const e = sh("tee ".repeat(n)); const t = process.hrtime.bigint(); ok(decide(e, ctx())); return Number(process.hrtime.bigint() - t) / 1e6; };
  time(1000);
  const small = time(10000), big = time(40000);
  assert.ok(big < 8 * Math.max(small, 1) + 20, `10000 words ${small} ms, 40000 words ${big} ms`);
});
test("a shell redirect into summary.md passes when no run is in progress", () => ok(decide(sh("echo x > .xworkflows/summary.md"), ctx(files(null)))));
test("a missing interview.json denies with the command that writes it", () =>
  deny(decide(sw(summary("draft", FIVE)), ctx(files(), () => ({ code: 1, out: "", err: "adapt: interview.json is missing or unreadable\n" }))), /interview\.json is missing or unreadable.*research\.mjs queue/));
test("an incomplete draft summary is allowed when no run file exists", () => {
  const c = ctx(files(null), missing("H1-a"));
  ok(decide(sw(summary("draft", FIVE)), c));
  ok(decide(sw("no headings at all"), c));
});
test("a write spelled in another case is the summary only on a disk that ignores case", () => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "xwf-g-")));
  mkdirSync(join(d, ".xworkflows"));
  const folded = existsSync(join(d, ".XWORKFLOWS"));
  const f = { [join(d, ".xworkflows/adapt-run.json")]: JSON.stringify(fresh) };
  const c = { readFile: (p) => f[p] ?? null, runCheck: () => ({ code: 1, out: "H1-a" }), skillName: () => "adapt" };
  const e = (p) => ({ ...wr([{ path: p, content: "x" }]), root: d });
  deny(decide(e(join(d, ".xworkflows/summary.md")), c), /H1-a/);
  const r = decide(e(join(d, ".XWORKFLOWS/Summary.md")), c);
  if (folded) deny(r, /H1-a/); else ok(r);
});
