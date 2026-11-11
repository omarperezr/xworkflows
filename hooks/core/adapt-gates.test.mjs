import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, realpathSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decide } from "./adapt-gates.mjs";
import { normalize } from "../adapters/claude.mjs";

const KINDS = ["values", "snap", "srvw", "delta", "idem", "txn", "access", "batch", "domain", "compat", "conc", "input"];
const HEADS = ["What it is", "Who pays, what is sold, what is not done", "Aspirations at about 3, 12 and 36 months", "Risks, the costliest mistake first", "What must not change; what is free to change", "Zones and which paths are risk paths", "How the owner works", "About you"];
const summary = (status, five = "") => `---\nstatus: ${status}\n---\n` + HEADS.map((h, i) => `## ${i + 1}. ${h}\n${i === 4 ? five : ""}\n`).join("");
const fresh = { run: "r1", startedAt: Date.now() };
const research = { kinds: Object.fromEntries(KINDS.map((k) => [k, { status: k === "snap" ? "absent" : "found" }])) };
const scan = { kinds: { values: { total: 3 }, snap: { total: 0 }, conc: { total: 0 } } };
const files = (run = fresh) => ({ "/r/.xworkflows/adapt-run.json": run && JSON.stringify(run), "/r/.xworkflows/scan.json": JSON.stringify(scan), "/r/.xworkflows/research.json": JSON.stringify(research) });
const ctx = (f = files(), check = () => ({ code: 0, out: "" }), skill = "adapt") => ({ readFile: (p) => f[p] ?? null, runCheck: check, skillName: () => skill });
const wf = (extra = {}) => ({ event: "preTool", tool: "Workflow", kind: "workflow", session: "s", root: "/r", inline: false, scriptPath: "/r/.claude/skills/adapt/research.workflow.js", args: { root: "/r", zeroHits: ["conc", "snap"] }, ...extra });
const wr = (writes) => ({ event: "preTool", tool: "Write", kind: "write", session: "s", root: "/r", writes });
const sw = (content) => wr([{ path: "/r/.xworkflows/summary.md", content }]);
const deny = (d, re) => { assert.equal(d.decision, "deny"); assert.match(d.reason, re); assert.match(d.reason, /No adapt running\? Run node \.claude\/skills\/adapt\/research\.mjs done\./); assert.match(d.reason, /To bypass in an emergency: XWORKFLOWS_FREE=1\.$/); };
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
test("draft summary denied while ids are missing", () => {
  deny(decide(sw(summary("draft", FIVE)), ctx(files(), missing("H1-a\nH2-b"))), /Ask these first: H1-a, H2-b/);
  ok(decide(sw(summary("draft", FIVE)), ctx()));
  deny(decide(sw(summary("draft", FIVE).replace("## 8. About you", "## x")), ctx()), /About you/);
});
test("draft summary denied without a line for an absent kind", () => {
  deny(decide(sw(summary("draft")), ctx()), /snap/);
  ok(decide(sw(summary("draft", "- snap: unprotected: stale reads\n")), ctx()));
});
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
  const r = spawnSync("node", [join(import.meta.dirname, "..", "run.mjs"), "claude", "adapt-gates"], { input: JSON.stringify(input), encoding: "utf8", env: { ...process.env, XWORKFLOWS_FREE: "" } });
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
  ok(decide(wf({ root: real, scriptPath: join(link, ".claude/skills/adapt/research.workflow.js") }), { ...ctx(f) }));
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
