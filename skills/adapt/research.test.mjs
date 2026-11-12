import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const KINDS = ["values", "snap", "srvw", "delta", "idem", "txn", "access", "batch", "domain", "compat", "conc", "input"];
const text = readFileSync(new URL("./research.workflow.js", import.meta.url), "utf8");
const body = text.replace(/export const meta = \{[\s\S]*?\n\};\n/, "");
const AsyncFunction = (async () => {}).constructor;

async function run(args, areas = {}) {
  const calls = [];
  const agent = async (prompt, opts) => {
    calls.push({ prompt, opts });
    if (opts.agentType === "mechanism") return { kind: opts.label.slice(2), status: "found", rules: [], notChecked: [] };
    return opts.label === "t4" ? { lines: [], areas } : { lines: [] };
  };
  const parallel = (thunks) => Promise.all(thunks.map((t) => t()));
  const fn = new AsyncFunction("args", "agent", "parallel", "pipeline", "log", "phase", body);
  const result = await fn(args, agent, parallel, () => {}, () => {}, () => {});
  return { calls, result };
}

test("workflow script is fixed and compiles", () => {
  assert.match(text, /export const meta = \{[\s\S]*?name: "adapt-research"/);
  assert.doesNotMatch(body, /export const meta/);
  assert.doesNotMatch(body, /Date\.now|Math\.random/);
});

test("topics first, then kinds", async () => {
  const { calls } = await run({ root: ".", zeroHits: [] });
  assert.equal(calls.length, 18);
  assert.ok(calls.slice(0, 6).every((c) => c.opts.agentType === "explore"));
  assert.ok(calls.slice(6).every((c) => c.opts.agentType === "mechanism"));
});

test("one kind agent per non-skipped kind", async () => {
  const { calls, result } = await run({ root: ".", zeroHits: ["conc"] }, { conc: "absent" });
  assert.equal(calls.filter((c) => c.opts.agentType === "mechanism").length, 11);
  assert.ok(result.skipped.conc);
  assert.equal(result.kinds.conc.status, "not-present");
  assert.equal(typeof result.sum, "string");
});

test("a kind with 0 hits but present is not skipped", async () => {
  const { calls, result } = await run({ root: ".", zeroHits: ["conc"] }, { conc: "present" });
  assert.equal(calls.filter((c) => c.opts.agentType === "mechanism").length, 12);
  assert.deepEqual(result.skipped, {});
});

test("kind agents use sonnet", async () => {
  const { calls } = await run({ root: ".", zeroHits: [] });
  const k = calls.filter((c) => c.opts.agentType === "mechanism");
  assert.deepEqual(k.map((c) => c.opts.label.slice(2)), KINDS);
  for (const c of k) {
    assert.equal(c.opts.model, "sonnet");
    const p = c.opts.schema.properties;
    assert.deepEqual(p.status.enum, ["found", "absent", "not-present"]);
    assert.equal(p.rules.maxItems, 3);
    assert.deepEqual(p.general.properties.basis.enum, ["written", "code", "both"]);
    assert.deepEqual(p.general.required, ["rule", "basis", "file", "line", "quote"]);
    const v = p.verdicts.items;
    assert.deepEqual(v.properties.verdict.enum, ["enforced", "contradicted", "no-evidence"]);
    assert.deepEqual(v.required, ["id", "verdict"]);
    assert.equal(p.verdicts.maxItems, 15);
    assert.deepEqual(c.opts.schema.required, ["kind", "status", "verdicts", "rules", "notChecked"]);
  }
});

test("kind prompt: written rules first, then one general rule, then at most 3 details", async () => {
  const { calls } = await run({ root: ".", zeroHits: [] });
  for (const c of calls.filter((x) => x.opts.agentType === "mechanism")) {
    const p = c.prompt, k = c.opts.label.slice(2);
    assert.ok(p.includes(`\`kinds\` includes \`${k}\``), k);
    for (const w of ["the first 15 rules", ".xworkflows/rules.json", ".xworkflows/scan.json", "`enforced`", "`contradicted`", "`no-evidence`", "ONE", "`code`", "`both`", "at most 3"]) assert.ok(p.includes(w), `${k}: ${w}`);
    assert.ok(p.indexOf("rules.json") < p.indexOf("scan.json") && p.indexOf("ONE") < p.indexOf("at most 3"), k);
    assert.ok(p.includes("rules.json order (lowest W id first)"), k);
    assert.ok(p.includes("Take the first case that applies") && p.indexOf("(a) One or more written rules are `enforced`") < p.indexOf("(b) None is enforced") && p.indexOf("(b) None is enforced") < p.indexOf("(c) Otherwise: no general rule, status `absent`"), k);
    assert.ok(p.includes("the broadest enforced one") && p.includes("on a tie, the one with the lowest W id"), k);
    assert.ok(p.includes("A `contradicted` written rule never becomes the general rule."), k);
    assert.ok(p.includes("It must not name a function, file, table or column."), k);
    assert.equal(p.split("Anchor it on the pattern applied across files; cite one line where it is applied.").length, 3, k);
    assert.doesNotMatch(p, /use (that|its) rule's wording|Store amounts exact/);
    assert.ok(p.includes('For example: "Every label a user sees comes from the translation files."'), k);
  }
  const t = calls.slice(0, 6).map((c) => c.prompt);
  for (const p of t.slice(0, 5)) assert.match(p, /\.xworkflows\/rules\.json[\s\S]*empty `kinds`/);
  assert.doesNotMatch(t[5], /rules\.json/);
});

test("topic 6 skips .xworkflows, graphify-out and installer files", async () => {
  const { calls } = await run({ root: ".", zeroHits: [] });
  const p = calls.find((c) => c.opts.label === "t6").prompt;
  for (const t of [".xworkflows/", "graphify-out/", ".xworkflows/installed.json"]) assert.ok(p.includes(t), t);
});

test("every topic prompt carries the graphify-first and history-only rules", async () => {
  const { calls } = await run({ root: ".", zeroHits: [] });
  for (const c of calls.slice(0, 6)) {
    assert.match(c.prompt, /graphify query/);
    assert.match(c.prompt, /git show/);
  }
});

test("topic prompts do not force a heading and topic 2 proposes no zones", async () => {
  const { calls } = await run({ root: ".", zeroHits: [] });
  const topics = calls.slice(0, 6).map((c) => c.prompt);
  for (const p of topics) {
    assert.doesNotMatch(p, /Heading \d/);
    assert.match(p, /Put each line under the summary heading it belongs to/);
    assert.match(p, /'1' to '8', 'config' or 'written'/);
    for (let n = 1; n <= 8; n++) assert.ok(p.includes(`'${n}' `), `heading ${n}`);
  }
  assert.doesNotMatch(topics[1], /Propose \d/);
  assert.match(topics[1], /they come from the scan/);
});

test("every config key is named by exactly one topic prompt", async () => {
  const { calls } = await run({ root: ".", zeroHits: [] });
  const keys = ["paths.code", "paths.risk", "paths.heavyRead", "paths.codeAnyway", "tests.files", "tests.run", "tests.notRunnable", "checks.project", "checks.patterns", "checks.ratchets"];
  for (const k of keys) assert.equal(calls.slice(0, 6).filter((c) => c.prompt.includes("`" + k + "`")).length, 1, k);
  assert.match(calls[0].prompt, /\[\]/);
});

test("schemas use plain enums and topic 4 omits areas without zeroHits", async () => {
  const { calls } = await run({ root: ".", zeroHits: [] });
  const s = calls[0].opts.schema.properties;
  assert.deepEqual(s.lines.items.properties.heading.enum.slice(0, 2), ["1", "2"]);
  assert.ok(s.lines.items.properties.heading.enum.includes("config"));
  assert.deepEqual(s.areas.additionalProperties.enum, ["present", "absent", "unsure"]);
  assert.doesNotMatch(calls.find((c) => c.opts.label === "t4").prompt, /areas/);
  const w = await run({ root: ".", zeroHits: ["conc"] });
  assert.match(w.calls.find((c) => c.opts.label === "t4").prompt, /areas/);
});

// ---- research.mjs: run file, verify, render ----
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sum, verifyCitation, renderResearch, buildQueue, missing } from "./research.mjs";

const MJS = new URL("./research.mjs", import.meta.url).pathname;
const G = ["-c", "user.name=test", "-c", "user.email=test@example.invalid"];
function repo() {
  const d = mkdtempSync(join(tmpdir(), "res-"));
  execFileSync("git", ["init", "-q"], { cwd: d });
  writeFileSync(join(d, "a.js"), "line1\nconst  total =   round(x);\nline3\n");
  execFileSync("git", ["add", "a.js"], { cwd: d });
  execFileSync("git", [...G, "commit", "-qm", "init"], { cwd: d });
  mkdirSync(join(d, ".xworkflows"));
  return d;
}
const cli = (d, cmd) => spawnSync("node", [MJS, cmd], { cwd: d, encoding: "utf8" });
const rj = (d, f) => JSON.parse(readFileSync(join(d, ".xworkflows", f), "utf8"));
const X = (d, f) => join(d, ".xworkflows", f);

function sample(over = {}) {
  const kinds = {};
  for (const k of KINDS) kinds[k] = { kind: k, status: "absent", rules: [], notChecked: [] };
  kinds.values = { kind: "values", status: "found", general: { rule: "Round once, only when shown", basis: "both", file: "a.js", line: 2, quote: "round(x)" }, verdicts: [], rules: [{ rule: "round once", file: "a.js", line: 2, quote: "const total = round(x);" }], notChecked: [] };
  kinds.conc = { kind: "conc", status: "not-present", rules: [], notChecked: [] };
  const topics = { t1: { lines: [{ heading: "1", text: "a tool", tag: "code" }, { heading: "config", key: "tests.run", text: "node --test", tag: "code" }] }, t6: { lines: [{ heading: "written", text: "todo", tag: "git" }] } };
  for (const t of ["t2", "t3", "t4", "t5"]) topics[t] = { lines: [] };
  const r = { topics, kinds, skipped: { conc: "no hits" }, ...over };
  r.sum = sum(JSON.stringify({ topics: r.topics, kinds: r.kinds, skipped: r.skipped }));
  return r;
}
const SCAN = { commit: "abc", kinds: { values: { hits: [{ file: "a.js", line: 2, text: "x" }], total: 1 } }, sql: { triggers: [{ name: "t", file: "db.sql", line: 1 }] }, checks: ["npm test"] };
function put(d, r, scan = SCAN) {
  writeFileSync(X(d, "research.json"), JSON.stringify(r));
  writeFileSync(X(d, "scan.json"), JSON.stringify(scan));
}

test("script sum equals research.mjs sum", () => {
  const fn = new Function(body.match(/const sum = [\s\S]*?\n\};/)[0] + "\nreturn sum;")();
  for (const s of ["", "abc", '{"a":[1,"é"]}']) assert.equal(sum(s), fn(s));
});

test("start and done manage the run file", () => {
  const d = repo();
  cli(d, "start");
  const a = rj(d, "adapt-run.json");
  assert.equal(a.commit, execFileSync("git", ["rev-parse", "HEAD"], { cwd: d, encoding: "utf8" }).trim());
  assert.equal(a.mismatches, 0);
  writeFileSync(X(d, "summary.md"), "---\nstatus: draft\n---\n");
  cli(d, "start");
  const b = rj(d, "adapt-run.json");
  assert.equal(b.run, a.run);
  assert.ok(b.startedAt >= a.startedAt);
  writeFileSync(X(d, "research.prev.json"), "{}");
  rmSync(X(d, "summary.md"));
  cli(d, "start");
  assert.ok(!existsSync(X(d, "research.prev.json")));
  cli(d, "done");
  assert.ok(!existsSync(X(d, "adapt-run.json")));
});

test("prev is saved by done when the approved summary is written, never by start", () => {
  const d = repo();
  writeFileSync(X(d, "research.json"), '{"x":1}');
  cli(d, "start");
  writeFileSync(X(d, "summary.md"), "---\nstatus: approved\n---\n");
  cli(d, "done");
  assert.equal(readFileSync(X(d, "research.prev.json"), "utf8"), '{"x":1}');
  // a re-adapt that stops before the summary is approved again keeps the old prev
  utimesSync(X(d, "summary.md"), new Date(Date.now() - 60000), new Date(Date.now() - 60000));
  writeFileSync(X(d, "research.json"), '{"x":2}');
  cli(d, "start");
  assert.equal(readFileSync(X(d, "research.prev.json"), "utf8"), '{"x":1}');
  cli(d, "done");
  assert.equal(readFileSync(X(d, "research.prev.json"), "utf8"), '{"x":1}');
  // done with no run file copies nothing
  rmSync(X(d, "research.prev.json"));
  cli(d, "done");
  assert.ok(!existsSync(X(d, "research.prev.json")));
});

test("an interrupted first adapt keeps its run; a lost run file is found in the log", () => {
  const d = repo();
  cli(d, "start");
  const a = rj(d, "adapt-run.json");
  const b0 = Date.now();
  cli(d, "start");
  const b = rj(d, "adapt-run.json");
  assert.equal(b.run, a.run);
  assert.ok(b.startedAt >= b0);
  rmSync(X(d, "adapt-run.json"));
  writeFileSync(X(d, "interview.log.jsonl"), JSON.stringify(L("H1-what", "Yes", a.run)) + "\n{trunc");
  cli(d, "start");
  assert.equal(rj(d, "adapt-run.json").run, a.run);
  // a log from another commit, or a new HEAD, starts a new run
  writeFileSync(join(d, "a.js"), "changed\n");
  execFileSync("git", [...G, "commit", "-qam", "next"], { cwd: d });
  cli(d, "start");
  assert.notEqual(rj(d, "adapt-run.json").run, a.run);
  rmSync(X(d, "adapt-run.json"));
  cli(d, "start");
  assert.notEqual(rj(d, "adapt-run.json").run, a.run);
  // a draft whose run file expired resumes the log's run
  const c = rj(d, "adapt-run.json").run;
  writeFileSync(X(d, "interview.log.jsonl"), JSON.stringify(L("H1-what", "Yes", c)) + "\n");
  rmSync(X(d, "adapt-run.json"));
  writeFileSync(X(d, "summary.md"), "---\nstatus: \"Draft\"\n---\n");
  cli(d, "start");
  assert.equal(rj(d, "adapt-run.json").run, c);
});

test("hash mismatch twice stops", () => {
  const d = repo();
  cli(d, "start");
  put(d, { ...sample(), sum: "bad" });
  const one = cli(d, "render");
  assert.equal(one.status, 1);
  assert.match(one.stderr, /write the Workflow result again, unchanged/);
  const two = cli(d, "render");
  assert.equal(two.status, 1);
  assert.match(two.stderr, /Research could not be copied unchanged twice: stop and tell the owner\./);
  assert.equal(rj(d, "adapt-run.json").mismatches, 2);
});

test("citation kept, fake dropped and listed", () => {
  const d = repo();
  assert.ok(verifyCitation(d, { file: "a.js", line: 3, quote: "const total = round(x);" }));
  assert.ok(!verifyCitation(d, { file: "a.js", line: 2, quote: "nope" }));
  assert.ok(!verifyCitation(d, { file: "../x", line: 2, quote: "x" }));
  const r = sample();
  r.kinds.values.rules.push({ rule: "fake", file: "a.js", line: 2, quote: "absent text" });
  const out = renderResearch(d, r, SCAN);
  assert.equal(out.errors.length, 0);
  assert.equal(out.dropped.length, 1);
  assert.match(out.md, /## Dropped citations[\s\S]*absent text/);
  assert.doesNotMatch(out.md, /fake \(code\)/);
});

test("render failure conditions", () => {
  const d = repo();
  const bad = (mut, re) => {
    const r = sample();
    mut(r);
    const out = renderResearch(d, r, SCAN);
    assert.match(out.errors.join("\n"), re);
  };
  bad((r) => { r.kinds.snap = null; }, /snap/);
  bad((r) => { r.kinds.txn.status = "maybe"; }, /txn/);
  const r = sample();
  r.kinds.values.notChecked = ["./b.js", "a.js"];
  r.kinds.idem.notChecked = ["a.js", "db.sql", "other/x.js", "a.js"];
  const o = renderResearch(d, r, SCAN);
  assert.equal(o.errors.length, 0);
  assert.ok(o.md.includes("## Not checked\n\n- idem: a.js\n- idem: db.sql\n- idem: other/x.js\n- values: a.js\n- values: b.js\n"));
  assert.ok(!renderResearch(d, sample(), SCAN).md.includes("## Not checked"));
  put(d, { ...sample(), kinds: { ...sample().kinds, snap: null } });
  assert.equal(cli(d, "render").status, 1);
});

test("render exits 1 on a hash mismatch", () => {
  const d = repo();
  put(d, sample());
  assert.equal(cli(d, "render").status, 0);
  writeFileSync(X(d, "research.json"), readFileSync(X(d, "research.json"), "utf8").replace("a tool", "a tooL"));
  const r = cli(d, "render");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /research.json was altered/);
});

test("render layout", () => {
  const d = repo();
  put(d, sample());
  assert.equal(cli(d, "render").status, 0);
  const md = readFileSync(X(d, "research.md"), "utf8");
  assert.match(md, /^---\ncommit: abc\n---/);
  const idx = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => md.indexOf(`## ${n}. `));
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b));
  assert.ok(idx.every((i) => i >= 0));
  assert.match(md, /- round once \(code\) a\.js:2/);
  assert.match(md, /- no rule found: snap/);
  assert.match(md, /- conc: not-present \(skipped: no hits\)/);
  assert.ok(md.indexOf("round once") < md.indexOf("no rule found: snap") && md.indexOf("no rule found: snap") < md.indexOf("no rule found: input"));
  assert.match(md, /## Existing checks\n\n- npm test/);
  assert.match(md, /## Config\n\n- `tests\.run`: node --test \(code\)/);
  assert.match(md, /## Written down\n\n- todo \(git\)/);
  const again = readFileSync(X(d, "research.md"), "utf8");
  cli(d, "render");
  assert.equal(readFileSync(X(d, "research.md"), "utf8"), again);
});

test("fix round 1: dead topic, path spellings, missing run file", () => {
  const d = repo();
  const r = sample();
  r.topics.t3 = null;
  assert.match(renderResearch(d, r, SCAN).errors.join("\n"), /topic t3: agent returned nothing, rerun the Workflow/);
  for (const p of ["./a.js", "x/../a.js", "a.js/"]) {
    const q = sample();
    q.kinds.values.notChecked = [p];
    const o = renderResearch(d, q, SCAN);
    assert.equal(o.errors.length, 0, p);
    assert.ok(o.md.includes("- values: a.js"), p);
  }
  writeFileSync(X(d, "summary.md"), "---\nstatus: draft\n---\n");
  cli(d, "start");
  assert.ok(existsSync(X(d, "adapt-run.json")));
  rmSync(X(d, "adapt-run.json"));
  put(d, { ...sample(), sum: "bad" });
  const m = cli(d, "render");
  assert.equal(m.status, 1);
  assert.match(m.stderr, /write the Workflow result again, unchanged/);
});

const WR = [{ id: "W1", text: "Amounts are rounded once.", file: "README.md", line: 1, kinds: ["values"] }, { id: "W2", text: "Never store a float. " + "x".repeat(200), file: "README.md", line: 2, kinds: ["values"] }, { id: "W3", text: "Use a lock.", file: "README.md", line: 3, kinds: ["values", "snap", "conc"] }];

test("render: general rule, then verdicts, then details; contradicted listed", () => {
  const d = repo();
  const r = sample();
  r.kinds.values.verdicts = [
    { id: "W1", verdict: "enforced", file: "a.js", line: 2, quote: "round(x)" },
    { id: "W2", verdict: "contradicted", file: "a.js", line: 1, quote: "line1" },
    { id: "W3", verdict: "no-evidence" },
  ];
  const o = renderResearch(d, r, SCAN, WR);
  assert.deepEqual(o.errors, []);
  const w2 = "Never store a float. " + "x".repeat(200);
  assert.ok(o.md.includes(["- general: Round once, only when shown (both) a.js:2", "- W1 enforced: Amounts are rounded once. a.js:2", `- W2 contradicted: ${w2.slice(0, 157)}... a.js:1`, "- W3 no-evidence: Use a lock.", "- round once (code) a.js:2", "- no rule found: snap"].join("\n")), o.md);
  assert.ok(o.md.includes(`## Contradicted written rules\n\n- values: W2: ${w2.slice(0, 157)}... a.js:1\n`), o.md);
  assert.ok(!renderResearch(d, sample(), SCAN, WR).md.includes("## Contradicted written rules"));
  // an absent kind keeps its block, but its contradicted rule is still listed
  r.kinds.snap.verdicts = [{ id: "W3", verdict: "contradicted", file: "a.js", line: 3, quote: "line3" }];
  const a = renderResearch(d, r, SCAN, WR).md;
  assert.ok(a.includes("- no rule found: snap\n") && !a.includes("- W3 contradicted"), a);
  assert.ok(a.includes("a.js:1\n- snap: W3: Use a lock. a.js:3\n"), a);
  // an enforced verdict of an absent kind is not shown in its block, but noted
  r.kinds.snap.verdicts = [{ id: "W3", verdict: "enforced", file: "a.js", line: 3, quote: "line3" }];
  assert.ok(renderResearch(d, r, SCAN, WR).md.includes("- snap: W3 enforced, but the kind is absent: not shown a.js:3\n"));
  r.kinds.snap.verdicts = [];
  assert.equal(renderResearch(d, r, SCAN, WR).md, o.md);
});

test("render: dropped verdict citations become no-evidence; dropped general is unverified", () => {
  const d = repo();
  const r = sample();
  r.kinds.values.general.quote = "nowhere";
  r.kinds.values.verdicts = [{ id: "W2", verdict: "contradicted", file: "a.js", line: 2, quote: "nowhere" }, { id: "W1", verdict: "enforced" }, { id: "W9", verdict: "enforced", file: "a.js", line: 2, quote: "round(x)" }];
  const o = renderResearch(d, r, SCAN, WR);
  assert.deepEqual(o.errors, []);
  assert.match(o.md, /- values: general rule unverified: Round once, only when shown\n- W2 no-evidence: Never store a float\. x+\.\.\.\n- W1 no-evidence: Amounts are rounded once\.\n- round once/);
  assert.doesNotMatch(o.md, /- W9 |## Contradicted/);
  assert.ok(o.md.includes(['- values: general: a.js:2 "nowhere"', '- values: W2 contradicted, now no-evidence: a.js:2 "nowhere"', "- values: W1 enforced, now no-evidence: no citation", "- values: W9 is not one of this kind's first 15 written rules: a.js:2 \"round(x)\""].join("\n")), o.md);
  // nothing verified left: the unverified rule is kept for the owner to confirm, never fatal
  r.kinds.values.rules[0].quote = "zzz";
  const m = renderResearch(d, r, SCAN, WR);
  assert.deepEqual(m.errors, []);
  assert.match(m.md, /- values: general rule unverified: Round once, only when shown\n- W2 no-evidence/);
  assert.deepEqual(JSON.parse(m.kinds).values, { general: "Round once, only when shown", status: "found", unverified: true });
  const n = sample();
  delete n.kinds.values.general;
  const nm = renderResearch(d, n, SCAN, WR);
  assert.deepEqual(nm.errors, []);
  assert.match(nm.md, /- values: general rule missing \(needs the owner\)\n- round once \(code\) a\.js:2/);
  assert.deepEqual(JSON.parse(nm.kinds).values, { general: null, status: "absent", unverified: false });
  // a dropped general with a verified detail stays found, marked unverified
  const u = sample();
  u.kinds.values.general.quote = "nowhere";
  assert.deepEqual(JSON.parse(renderResearch(d, u, SCAN, WR).kinds).values, { general: "Round once, only when shown", status: "found", unverified: true });
});

test("render keeps verdicts on the kind's first 15 tagged rules, once each", () => {
  const d = repo();
  const r = sample();
  // W1 is tagged for snap only; W2..W18 for values, so W17 and W18 are past values' first 15 (W order, not array order)
  const many = Array.from({ length: 18 }, (_, i) => ({ id: `W${i + 1}`, text: `Rule ${i + 1}.`, file: "README.md", line: i + 1, kinds: [i ? "values" : "snap"] })).reverse();
  r.kinds.values.verdicts = [...many, { id: "W2" }].map((w) => ({ id: w.id, verdict: "no-evidence" }));
  const o = renderResearch(d, r, SCAN, many);
  assert.equal((o.md.match(/^- W\d+ no-evidence/gm) || []).length, 15);
  assert.ok(!/^- W(1|17|18) no-evidence/m.test(o.md), o.md);
  for (const id of ["W18", "W17", "W1"]) assert.ok(o.md.includes(`- values: ${id} is not one of this kind's first 15 written rules: no citation\n`), id);
  assert.ok(o.md.includes("- values: W2 repeated: no citation\n"));
});

test("render reads rules.json and the sum still covers topics, kinds, skipped", () => {
  const d = repo();
  const r = sample();
  r.kinds.values.verdicts = [{ id: "W2", verdict: "contradicted", file: "a.js", line: 1, quote: "line1" }];
  r.sum = sum(JSON.stringify({ topics: r.topics, kinds: r.kinds, skipped: r.skipped }));
  put(d, r);
  writeFileSync(X(d, "rules.json"), JSON.stringify({ rules: WR }));
  assert.equal(cli(d, "render").status, 0);
  assert.match(readFileSync(X(d, "research.md"), "utf8"), /## Contradicted written rules\n\n- values: W2: Never store/);
  const k = readFileSync(X(d, "kinds.json"), "utf8");
  assert.deepEqual(Object.keys(JSON.parse(k)), [...KINDS].sort());
  assert.deepEqual(JSON.parse(k).values, { general: "Round once, only when shown", status: "found", unverified: false });
  assert.deepEqual(JSON.parse(k).snap, { general: null, status: "absent", unverified: false });
  // a found kind without a general rule: exit 0, absent in the sidecar
  const g = sample();
  delete g.kinds.values.general;
  g.sum = sum(JSON.stringify({ topics: g.topics, kinds: g.kinds, skipped: g.skipped }));
  put(d, g);
  assert.equal(cli(d, "render").status, 0);
  assert.deepEqual(JSON.parse(readFileSync(X(d, "kinds.json"), "utf8")).values, { general: null, status: "absent", unverified: false });
  assert.match(readFileSync(X(d, "research.md"), "utf8"), /- values: general rule missing \(needs the owner\)/);
  const before = readFileSync(X(d, "kinds.json"), "utf8");
  cli(d, "render");
  assert.equal(readFileSync(X(d, "kinds.json"), "utf8"), before);
  put(d, r);
  writeFileSync(X(d, "research.json"), JSON.stringify({ ...r, kinds: { ...r.kinds, values: { ...r.kinds.values, verdicts: [] } } }));
  assert.equal(cli(d, "render").status, 1);
});

// ---- queue and check
const CFG = ["paths.code", "paths.risk", "paths.heavyRead", "paths.codeAnyway", "tests.files", "tests.run", "tests.notRunnable", "checks.project", "checks.patterns", "checks.ratchets"];
const ZSCAN = { zones: [{ key: "api", paths: ["api"], bytes: 1 }, { key: "web", paths: ["web"], bytes: 1 }] };
const allAbsent = () => {
  const kinds = {};
  for (const k of KINDS) kinds[k] = { kind: k, status: "absent", rules: [], notChecked: [] };
  const topics = {};
  for (const t of ["t1", "t2", "t3", "t4", "t5", "t6"]) topics[t] = { lines: [] };
  return { topics, kinds, skipped: {} };
};
const withStatus = (r, o) => { for (const [k, st] of Object.entries(o)) r.kinds[k] = { ...r.kinds[k], status: st }; return r; };
const allFound = () => withStatus(allAbsent(), Object.fromEntries(KINDS.map((k) => [k, "found"])));
const ids = (q) => q.map((i) => i.id);

test("re-adapt asks only changed kinds", () => {
  const prev = withStatus(allFound(), {});
  const cur = withStatus(allFound(), { idem: "absent" });
  const q = buildQueue(cur, ZSCAN, prev);
  assert.deepEqual(ids(q).filter((i) => !/^C\d+$/.test(i)), ["H5-idem"]);
  assert.deepEqual(ids(q).filter((i) => /^C\d+$/.test(i)), CFG.map((_, i) => `C${i + 1}`));
});

test("re-adapt skips config keys already in config.json", () => {
  const prev = allFound();
  const config = { paths: { code: ["src/"], risk: [] }, tests: { run: "npm test" } };
  const c = ids(buildQueue(allFound(), ZSCAN, prev, config)).filter((i) => /^C\d+$/.test(i));
  assert.deepEqual(c, CFG.map((_, i) => `C${i + 1}`).filter((i) => !["C1", "C2", "C6"].includes(i)));
  assert.ok(ids(buildQueue(allFound(), ZSCAN, null, config)).includes("C1")); // a first adapt asks every key research left empty
});

test("queue order and styles", () => {
  const q = buildQueue(withStatus(allFound(), { idem: "absent" }), ZSCAN);
  assert.deepEqual(ids(q).slice(0, 22), ["H1-what", "H2-pays", "H2-refused", "H4-incident", "H4-risks", "H5-idem", "H5-keep", "H5-free", "H6-zones", "H6-r1", "H6-r2",
    "H7-g1", "H7-g2", "H7-g3", "H7-g4", "H7-depth", "H7-push", "H3-3m", "H3-12m", "H3-36m", "H8-reply", "H8-budget"]);
  const st = Object.fromEntries(q.map((i) => [i.id, i.style]));
  for (const i of ["H2-pays", "H2-refused", "H4-incident", "H4-risks", "H5-keep", "H5-free", "C1"]) assert.equal(st[i], "open", i);
  for (const i of ["H1-what", "H6-r1", "H6-r2", "H7-g1", "H7-g4"]) assert.equal(st[i], "confirm", i);
  for (const i of ["H5-idem"]) assert.equal(st[i], "mechanism");
  for (const i of ["H6-zones", "H7-depth", "H7-push", "H3-3m", "H8-reply", "H8-budget"]) assert.equal(st[i], "choice", i);
  assert.equal(q.find((i) => i.id === "H6-r1").text, "Does a mistake in api risk money, data or access?");
  assert.equal(q.find((i) => i.id === "H4-incident").text, "Tell me about one real time something went wrong here: what broke, and what did it cost?");
  assert.ok(q.find((i) => i.id === "H5-idem").text.endsWith(" How does the code prevent this today, and what rule must every change follow?"));
});

test("one H5 item per absent kind", () => {
  const q = buildQueue(withStatus(allFound(), { idem: "absent", txn: "absent", conc: "not-present" }), ZSCAN);
  assert.deepEqual(ids(q).filter((i) => /^H5-/.test(i) && !["H5-keep", "H5-free"].includes(i)), ["H5-idem", "H5-txn"]);
});

test("a config line removes its C item", () => {
  const r = allFound();
  r.topics.t1.lines.push({ heading: "config", key: "tests.run", text: "x", tag: "code" });
  assert.ok(!ids(buildQueue(r, ZSCAN)).includes("C6"));
  assert.ok(ids(buildQueue(r, ZSCAN)).includes("C5"));
});

test("ids are unique and at most 12 characters", () => {
  const q = buildQueue(allAbsent(), ZSCAN);
  const i = ids(q);
  assert.equal(new Set(i).size, i.length);
  for (const x of [...i, ...i.filter((y) => /^H5-/.test(y)).map((y) => y + "-r"), "P-H7-fix", "H1-what-fix", "H6-split"]) assert.ok(x.length <= 12, x);
  assert.ok(i.includes("H5-values") && i.includes("C10"));
});

test("styles define I don't know", () => {
  for (const i of buildQueue(allAbsent(), ZSCAN)) {
    if (i.style === "open") assert.ok(i.options.includes("I don't know"), i.id);
    if (i.style === "mechanism") assert.deepEqual(i.options, ["Nothing does today", "I don't know"], i.id);
  }
});

test("same research gives byte-identical interview.json", () => {
  const out = [];
  for (let n = 0; n < 2; n++) {
    const d = repo();
    put(d, sample(), { ...SCAN, ...ZSCAN });
    assert.equal(cli(d, "queue").status, 0);
    out.push(readFileSync(X(d, "interview.json"), "utf8"));
  }
  assert.equal(out[0], out[1]);
  assert.ok(JSON.parse(out[0]).some((i) => i.id === "H1-what"));
});

const L = (id, answer, run = "r1") => ({ run, id, question: "q", options: [], answer });
const fullLog = (q, run = "r1") => q.map((i) => L(i.id, "Yes", run));

test("check ignores other runs", () => {
  const q = buildQueue(allFound(), ZSCAN);
  assert.deepEqual(missing(q, fullLog(q, "old"), "r1"), ids(q));
  assert.deepEqual(missing(q, fullLog(q), "r1"), []);
});

test("check counts answers from the resumed run", () => {
  const d = repo();
  put(d, sample(), { ...SCAN, ...ZSCAN });
  cli(d, "start");
  const run = readFileSync(X(d, "adapt-run.json"), "utf8").match(/"run": "([^"]+)"/)[1];
  cli(d, "queue");
  const q = rj(d, "interview.json");
  writeFileSync(X(d, "interview.log.jsonl"), fullLog(q, run).map((l) => JSON.stringify(l)).join("\n") + "\n");
  writeFileSync(X(d, "summary.md"), "---\nstatus: draft\n---\n");
  cli(d, "start");
  const r = cli(d, "check");
  assert.equal(r.status, 0, r.stdout);
  assert.equal(r.stdout, "");
});

test("H1-what-fix required after a No on H1-what", () => {
  const q = buildQueue(allFound(), ZSCAN);
  const log = fullLog(q).map((l) => (l.id === "H1-what" ? { ...l, answer: "No" } : l));
  assert.deepEqual(missing(q, log, "r1"), ["H1-what-fix"]);
  assert.deepEqual(missing(q, [...log, L("H1-what-fix", "a shop")], "r1"), []);
  assert.deepEqual(missing(q, fullLog(q), "r1"), []);
});

test("follow-up required", () => {
  const q = buildQueue(withStatus(allFound(), { idem: "absent" }), ZSCAN);
  const log = fullLog(q).map((l) => (l.id === "H5-idem" ? { ...l, answer: "Nothing does today" } : l));
  assert.deepEqual(missing(q, log, "r1"), ["H5-idem-r"]);
  assert.deepEqual(missing(q, [...log, L("H5-idem-r", "use a key")], "r1"), []);
});

test("translated label is not a pick", () => {
  const q = buildQueue(allFound(), ZSCAN);
  const P = (a) => [1, 2, 3, 4, 5, 6, 7].map((n) => L(`P-H${n}`, n === 3 ? a : "Right"));
  assert.deepEqual(missing(q, [...fullLog(q), ...P("Bien")], "r1", true), ["P-H3"]);
  assert.deepEqual(missing(q, [...fullLog(q), ...P("Right")], "r1", true), []);
});

test("approved check needs every heading Right", () => {
  const d = repo();
  put(d, sample(), { ...SCAN, ...ZSCAN });
  cli(d, "start");
  const run = readFileSync(X(d, "adapt-run.json"), "utf8").match(/"run": "([^"]+)"/)[1];
  cli(d, "queue");
  const lines = [...fullLog(rj(d, "interview.json"), run)];
  for (let n = 1; n <= 7; n++) lines.push(L(`P-H${n}`, n === 3 ? "Wrong" : "Right", run));
  const w = (ls) => writeFileSync(X(d, "interview.log.jsonl"), ls.map((l) => JSON.stringify(l)).join("\n") + "\n");
  w(lines);
  assert.equal(spawnSync("node", [MJS, "check"], { cwd: d, encoding: "utf8" }).status, 0);
  const r = spawnSync("node", [MJS, "check", "--approved"], { cwd: d, encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "P-H3\n");
  w([...lines, L("P-H3", "Right", run)]);
  assert.equal(spawnSync("node", [MJS, "check", "--approved"], { cwd: d, encoding: "utf8" }).status, 0);
});

test("H5 texts are kind-specific and end with the spec sentence", () => {
  const t = buildQueue(allAbsent(), ZSCAN).filter((i) => i.style === "mechanism").map((i) => i.text);
  assert.equal(t.length, 12);
  assert.equal(new Set(t).size, 12);
  for (const x of t) {
    assert.ok(x.endsWith(" How does the code prevent this today, and what rule must every change follow?"), x);
    assert.doesNotMatch(x, /only through|for every row|client untrusted/);
  }
});

test("follow-up only for H5 kinds", () => {
  const q = buildQueue(allFound(), ZSCAN);
  assert.deepEqual(missing(q, fullLog(q).map((l) => (l.id === "H5-keep" ? { ...l, answer: "Nothing does today" } : l)), "r1"), []);
});

test("C texts carry a gloss and the key", () => {
  const c = buildQueue(allFound(), ZSCAN).filter((i) => /^C\d+$/.test(i.id));
  assert.equal(c.length, 10);
  assert.ok(c.every((i, n) => i.text.includes(CFG[n]) && /\(.+\)/.test(i.text)));
  assert.match(c[4].text, /test file patterns/);
});

test("a kind absent in prev and now is not re-asked; full order with C ids", () => {
  const prev = withStatus(allFound(), { idem: "absent" });
  assert.deepEqual(ids(buildQueue(withStatus(allFound(), { idem: "absent" }), ZSCAN, prev)).filter((i) => i.startsWith("H5-")), []);
  assert.deepEqual(ids(buildQueue(allFound(), ZSCAN)).slice(-12), ["H8-reply", "H8-budget", ...CFG.map((_, i) => `C${i + 1}`)]);
});

test("check and queue fail with one line, not a stack, and skip a truncated log line", () => {
  const d = repo();
  for (const c of ["queue", "check"]) {
    const r = cli(d, c);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /^adapt: .* is missing or unreadable\n$/);
  }
  put(d, sample(), { ...SCAN, ...ZSCAN });
  cli(d, "start");
  cli(d, "queue");
  const run = rj(d, "adapt-run.json").run;
  const q = rj(d, "interview.json");
  writeFileSync(X(d, "interview.log.jsonl"), fullLog(q, run).map((l) => JSON.stringify(l)).join("\n") + '\n{"run":"x","id":');
  assert.equal(cli(d, "check").status, 0);
});
