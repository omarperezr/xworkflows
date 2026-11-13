import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, utimesSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sum, verifyCitation, buildQueue, missing } from "./research.mjs";

const KINDS = ["values", "snap", "srvw", "delta", "idem", "txn", "access", "batch", "domain", "compat", "conc", "input"];
const MJS = new URL("./research.mjs", import.meta.url).pathname;
const G = ["-c", "user.name=test", "-c", "user.email=test@example.invalid"];
function repo() {
  const d = mkdtempSync(join(tmpdir(), "res-"));
  execFileSync("git", ["init", "-q"], { cwd: d });
  writeFileSync(join(d, "a.js"), "line1\nconst  total =   round(x);\nline3\n");
  writeFileSync(join(d, "README.md"), "Totals are rounded once.\n");
  execFileSync("git", ["add", "a.js"], { cwd: d });
  execFileSync("git", [...G, "commit", "-qm", "init"], { cwd: d });
  mkdirSync(join(d, ".xworkflows"));
  return d;
}
const cli = (d, cmd) => spawnSync("node", [MJS, cmd], { cwd: d, encoding: "utf8" });
const rj = (d, f) => JSON.parse(readFileSync(join(d, ".xworkflows", f), "utf8"));
const rt = (d, f) => readFileSync(join(d, ".xworkflows", f), "utf8");
const X = (d, f) => join(d, ".xworkflows", f);

// The Workflow result, version 3, its keys in the script's order.
function sample(over = {}) {
  const cite = { file: "a.js", line: 2, quote: "round(x)" };
  const areas = { truth: { area: "truth", status: "found", ideas: [{ text: "Totals are rounded once.", ...cite }], general: { rule: "Round once", basis: "both", risk: "high", cost: "wrong totals", ...cite }, support: [], exceptions: [], contradicted: [], unprotected: [], commentRules: [{ text: "Never round twice.", file: "a.js", line: 1, quote: "line1" }], details: [], notChecked: [], doubted: [{ rule: "Totals are rounded.", why: "no test covers it", ...cite }] } };
  const kinds = {
    values: { kind: "values", status: "found", general: { rule: "A loan is counted in whole days, in the library's time zone", basis: "both", ...cite }, verdicts: [], rules: [{ rule: "round once", ...cite }, { rule: "fake rule", file: "a.js", line: 2, quote: "absent text" }], notChecked: [] },
    conc: { kind: "conc", status: "not-present", rules: [], notChecked: [] },
  };
  const plain = { claims: [{ text: "Totals are rounded once.", from: ["truth.1"] }, { text: "A made up claim.", from: ["ghost.1"] }] };
  const r = { version: 3, profile: { what: "a tool" }, areaOrder: ["truth"], topics: {}, written: { count: 2, fromChecks: 1 }, areas, kinds, plain, questions: [], ...over };
  const { version, profile, areaOrder, topics, written, kinds: k, plain: p, questions } = r;
  r.sum = sum(JSON.stringify({ version, profile, areaOrder, topics, written, areas: r.areas, kinds: k, plain: p, questions }));
  return r;
}
const SCAN = { commit: "abc", checks: ["npm test"] };
function put(d, r, scan = SCAN) {
  writeFileSync(X(d, "research.json"), JSON.stringify(r));
  writeFileSync(X(d, "scan.json"), JSON.stringify(scan));
}

test("script sum equals research.mjs sum", () => {
  const text = readFileSync(new URL("./research.workflow.js", import.meta.url), "utf8");
  const fn = new Function(text.match(/const sum = [\s\S]*?\n\};/)[0] + "\nreturn sum;")();
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
});

test("render writes research.md, screens.json and details.md, and no kinds.json; an unverified citation reaches none of them but the dropped list", () => {
  const d = repo();
  put(d, sample());
  assert.equal(cli(d, "render").status, 0);
  const md = rt(d, "research.md");
  assert.match(md, /^---\ncommit: abc\nversion: 3\n---/);
  assert.match(md, /1\. Totals are rounded once\. \(a\.js:2\) Risk high\./);
  assert.match(md, /## Dropped\n\n- plain: sentence: A made up claim\. names no item with a verified citation/);
  const s = rj(d, "screens.json");
  assert.deepEqual(s.drawer1.map((x) => x.text), ["Totals are rounded once."]);
  assert.deepEqual(s.drawer2.map((g) => g.kind), ["doubted"]);
  const det = rt(d, "details.md");
  assert.match(det, /Round once \(both; risk high: wrong totals\) a\.js:2/);
  assert.match(det, /## Mechanism rules[\s\S]*- round once \(code\) a\.js:2/);
  assert.match(det, /## Rules found in comments[\s\S]*- \[truth\] Never round twice\. a\.js:1/);
  for (const bad of ["fake rule", "A made up claim", "absent text"]) assert.ok(!det.includes(bad), bad);
  assert.ok(!JSON.stringify(s.drawer1).includes("made up"));
  assert.ok(!existsSync(X(d, "kinds.json")));
  const before = [md, rt(d, "details.md")];
  cli(d, "render");
  assert.deepEqual([rt(d, "research.md"), rt(d, "details.md")], before);
});

test("render exits 1 when the Workflow's key order or any value changed", () => {
  const d = repo();
  put(d, sample());
  assert.equal(cli(d, "render").status, 0);
  writeFileSync(X(d, "research.json"), rt(d, "research.json").replace("a tool", "a tooL"));
  const r = cli(d, "render");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /research.json was altered/);
  const p = sample();
  put(d, { ...p, plain: { claims: [] } }); // plain changed, sum kept
  assert.equal(cli(d, "render").status, 1);
});

test("render fails with one line when an area or a mechanism agent returned nothing", () => {
  const d = repo();
  put(d, sample({ areas: { truth: null } }));
  const a = cli(d, "render");
  assert.equal(a.status, 1);
  assert.match(a.stderr, /truth: agent returned nothing/);
  put(d, sample({ kinds: { snap: null } }));
  assert.match(cli(d, "render").stderr, /snap: agent returned nothing/);
  put(d, sample({ profile: null }));
  assert.match(cli(d, "render").stderr, /profile: agent returned nothing/);
});

test("render fails with one line when the plain agent returned nothing", () => {
  const d = repo();
  put(d, sample({ plain: null }));
  const out = cli(d, "render");
  assert.equal(out.status, 1);
  assert.match(out.stderr, /plain: agent returned nothing, rerun the Workflow/);
});

test("the printed dropped count includes the mechanism drops, and the line is in research.md", () => {
  const d = repo();
  put(d, sample({ kinds: { snap: { kind: "snap", status: "found", general: { rule: "Prices never change.", basis: "code", file: "a.js", line: 2, quote: "nope" }, rules: [], verdicts: [], notChecked: [] } } }));
  const out = cli(d, "render");
  assert.match(out.stdout, /dropped: 2$/m); // the made up sentence and the mechanism rule
  assert.match(rt(d, "research.md"), /- snap: general rule: Prices never change\. a\.js:2/);
  assert.ok(!rt(d, "details.md").includes("Prices never change"));
});

// ---- queue and check

const SC = (over = {}) => ({
  errors: [], dropped: [], noRule: [], notPresent: [],
  drawer1: [{ text: "Totals are rounded once.", from: ["truth"], at: "a.js:2", risk: "high" }, { text: "Ids are never reused.", from: ["state"], at: "a.js:3", risk: "low" }], drawer1LeftOut: [],
  drawer2: [{ id: "X1", kind: "doubted", area: "truth", risk: 0, text: "The code follows this rule.", options: ["You are right: a pending card", "Keep it, because ...", "I don't know"] }, { id: "X2", kind: "exceptions", area: "truth", risk: 0, text: "Mistake or exception?", options: ["Mistake: fix it", "Exception: keep it", "I don't know"] }], drawer2LeftOut: [],
  drawer3: ["B-rules", "B-refused", "B-mistake", "B-incident", "B-free", "G-3m", "G-12m", "G-36m", "G-interim"].map((id, i) => ({ id, text: `Question ${id}?`, lead: "Research found nothing on this.", options: i === 2 ? [{ label: "A lost book", description: "it is the costliest", at: "README.md:1" }] : [] })),
  ...over,
});
test("the queue says in how many more places a general rule was seen, the same words as research.md", () => {
  const q = buildQueue(SC({ drawer1: [{ text: "Rule.", from: ["truth"], at: "a.js:1", also: 0, risk: "low" }, { text: "Other.", from: ["state"], at: "a.js:2", also: 2 }] }));
  assert.equal(q[0].text, "Rule. (a.js:1) seen in 0 more place(s).");
  assert.equal(q[1].text, "Other. (a.js:2) seen in 2 more place(s).");
});
const ids = (q) => q.map((i) => i.id);

const SHIPPED = ["H1-what", "H2-pays", "H6-zones", "H6-r1", "H7-g1", "H7-g2", "H7-g3", "H7-g4", "H7-depth", "H7-push", "H8-reply", "H8-budget"];
const CFG = (n) => Array.from({ length: n }, (_, i) => `C${i + 1}`);
const topics = { t1: { lines: [{ heading: "2", text: "Libraries pay a yearly fee.", tag: "docs" }, { heading: "2", text: "Never sells data.", tag: "docs" }, { heading: "config", key: "tests.run", text: "npm test", tag: "code" }] } };

test("the queue is S1-<n>, X<n>, the nine ids of screen 3, then the shipped questions no screen asks", () => {
  const q = buildQueue(SC(), { topics }, { zones: [{ key: "src" }] }, null, {});
  assert.deepEqual(ids(q), ["S1-1", "S1-2", "X1", "X2", "B-rules", "B-refused", "B-mistake", "B-incident", "B-free", "G-3m", "G-12m", "G-36m", "G-interim", ...SHIPPED, ...CFG(10)]);
  assert.deepEqual(q[0], { id: "S1-1", heading: "1", style: "choice", text: "Totals are rounded once. (a.js:2)", options: ["Right", "Real, but a bad rule", "Not how it works", "I don't know"] });
  assert.deepEqual(q[2], { id: "X1", heading: "2", style: "choice", text: "The code follows this rule.", options: ["You are right: a pending card", "Keep it, because ...", "I don't know"] });
  const by = Object.fromEntries(q.map((i) => [i.id, i]));
  assert.equal(by["B-mistake"].text, "Question B-mistake? Research found nothing on this.");
  assert.deepEqual(by["B-mistake"].options, [{ label: "A lost book", description: "it is the costliest (README.md:1)" }, "I don't know"]);
  assert.deepEqual(by["B-rules"].options, ["I don't know", "Skip: not relevant here"]);
  assert.deepEqual(by["H1-what"], { id: "H1-what", heading: "1", style: "confirm", text: "Is this what the project is?", options: ["Yes", "No", "I don't know"] });
  assert.deepEqual(by["H2-pays"].options.map((o) => o.label ?? o), ["Libraries pay a yearly fee.", "I don't know"]);
  assert.match(by["H6-r1"].text, /mistake in src/);
  assert.equal(by["C6"].style, "confirm");
  assert.equal(by["C6"].text, "Is this right for the command that runs the tests: npm test?");
  assert.equal(by["C1"].style, "open");
  for (const i of q) { assert.ok(["open", "choice", "confirm"].includes(i.style)); assert.ok(!i.options || (i.options.length >= 2 && i.options.length <= 4), i.id); }
  assert.ok(!ids(q).some((i) => /^(H2-refused|H3-|H4-|H5-)/.test(i)));
});

test("a re-adaptation keeps of the shipped questions only the config keys still without a value", () => {
  const q = buildQueue(SC(), { topics }, { zones: [] }, {}, { tests: { run: "npm test" } });
  assert.deepEqual(ids(q).slice(13), ["C1", "C2", "C3", "C4", "C5", "C7", "C8", "C9", "C10"]);
});

test("queue reads screens.json; same screens give a byte-identical interview.json; no screens is one line", () => {
  const d = repo();
  let r = cli(d, "queue");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^adapt: screens\.json is missing or unreadable\n$/);
  writeFileSync(X(d, "screens.json"), JSON.stringify(SC())); put(d, sample());
  assert.equal(cli(d, "queue").status, 0);
  const a = rt(d, "interview.json");
  cli(d, "queue");
  assert.equal(rt(d, "interview.json"), a);
  assert.deepEqual(ids(JSON.parse(a)).slice(0, 3), ["S1-1", "S1-2", "X1"]);
});

const L = (id, answer, run = "r1") => ({ run, id, question: "q", options: [], answer });
const fullLog = (q, run = "r1") => q.map((i) => L(i.id, "Right", run));

test("check ignores other runs", () => {
  const q = buildQueue(SC());
  assert.deepEqual(missing(q, fullLog(q, "old"), "r1"), ids(q));
  assert.deepEqual(missing(q, fullLog(q), "r1"), []);
});

test("check counts answers from the resumed run", () => {
  const d = repo();
  cli(d, "start");
  const run = rj(d, "adapt-run.json").run;
  writeFileSync(X(d, "screens.json"), JSON.stringify(SC())); put(d, sample());
  cli(d, "queue");
  writeFileSync(X(d, "interview.log.jsonl"), fullLog(rj(d, "interview.json"), run).map((l) => JSON.stringify(l)).join("\n") + "\n");
  writeFileSync(X(d, "summary.md"), "---\nstatus: draft\n---\n");
  cli(d, "start");
  const r = cli(d, "check");
  assert.equal(r.status, 0, r.stdout);
  assert.equal(r.stdout, "");
});

test("no follow-up for an item the queue cannot hold (H5-*)", () => {
  const q = [{ id: "H5-idem", style: "mechanism" }];
  assert.deepEqual(missing(q, [L("H5-idem", "Nothing does today")], "r1"), []);
});

test("H1-what-fix required after a No on H1-what", () => {
  const q = [{ id: "H1-what", style: "confirm" }];
  assert.deepEqual(missing(q, [L("H1-what", "No")], "r1"), ["H1-what-fix"]);
  assert.deepEqual(missing(q, [L("H1-what", "No"), L("H1-what-fix", "a shop")], "r1"), []);
});

test("a last answer of the bare label Keep it, because ... asks for <id>-why until it is answered", () => {
  const q = [{ id: "X1", style: "choice" }, { id: "X2", style: "choice" }];
  assert.deepEqual(missing(q, [L("X1", "Keep it, because ..."), L("X2", "x")], "r1"), ["X1-why"]);
  assert.deepEqual(missing(q, [L("X1", "Keep it, because ..."), L("X2", "x"), L("X1-why", "it is on purpose")], "r1"), []);
  assert.deepEqual(missing(q, [L("X1", "Keep it, because ..."), L("X1", "Keep it, because it is old"), L("X2", "x")], "r1"), []);
});

test("C<n>-fix required after a No on a config confirm", () => {
  const q = [{ id: "C5", style: "confirm" }, { id: "C6", style: "open" }];
  assert.deepEqual(missing(q, [L("C5", "No"), L("C6", "No")], "r1"), ["C5-fix"]);
  assert.deepEqual(missing(q, [L("C5", "No"), L("C6", "x"), L("C5-fix", "npm test")], "r1"), []);
});

test("translated label is not a pick", () => {
  const q = buildQueue(SC());
  const P = (a) => [1, 2, 3, 4, 5, 6, 7].map((n) => L(`P-H${n}`, n === 3 ? a : "Right"));
  assert.deepEqual(missing(q, [...fullLog(q), ...P("Bien")], "r1", true), ["P-H3"]);
  assert.deepEqual(missing(q, [...fullLog(q), ...P("Right")], "r1", true), []);
});

test("approved check needs every heading Right", () => {
  const d = repo();
  cli(d, "start");
  const run = rj(d, "adapt-run.json").run;
  writeFileSync(X(d, "screens.json"), JSON.stringify(SC())); put(d, sample());
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

test("check and queue fail with one line, not a stack, and skip a truncated log line", () => {
  const d = repo();
  for (const c of ["queue", "check"]) {
    const r = cli(d, c);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /^adapt: .* is missing or unreadable\n$/);
  }
  cli(d, "start");
  writeFileSync(X(d, "screens.json"), JSON.stringify(SC())); put(d, sample());
  cli(d, "queue");
  const run = rj(d, "adapt-run.json").run;
  writeFileSync(X(d, "interview.log.jsonl"), fullLog(rj(d, "interview.json"), run).map((l) => JSON.stringify(l)).join("\n") + '\n{"run":"x","id":');
  assert.equal(cli(d, "check").status, 0);
});

test("start git-ignores the run's private files from the first question", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, mkdirSync, writeFileSync, appendFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const g = (r, ...a) => execFileSync("git", a, { cwd: r, encoding: "utf8" });
  const start = (r) => execFileSync("node", [new URL("./research.mjs", import.meta.url).pathname, "start", r], { cwd: r, encoding: "utf8" });
  const r = mkdtempSync(join(tmpdir(), "adapt-ign-"));
  g(r, "init", "-q"); writeFileSync(join(r, "a.txt"), "a");
  g(r, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qam", "x", "--allow-empty"); g(r, "add", "a.txt");
  g(r, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "a");
  start(r);
  for (const f of ["research.md", "research.json", "research.prev.json", "scan.json", "interview.json", "rules.json", "screens.json", "details.md", "research.answered.json"]) writeFileSync(join(r, ".xworkflows", f), "{}");
  appendFileSync(join(r, ".xworkflows", "interview.log.jsonl"), '{"run":"x"}\n');
  assert.equal(g(r, "status", "--porcelain", "--untracked-files=all"), "");
  const r2 = mkdtempSync(join(tmpdir(), "adapt-ign-"));
  g(r2, "init", "-q"); writeFileSync(join(r2, "a.txt"), "a"); g(r2, "add", "a.txt");
  g(r2, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "a");
  mkdirSync(join(r2, ".xworkflows")); writeFileSync(join(r2, ".xworkflows", ".gitignore"), "mine\n");
  start(r2);
  assert.equal(readFileSync(join(r2, ".xworkflows", ".gitignore"), "utf8"), "mine\n");
  const ro = join(mkdtempSync(join(tmpdir(), "adapt-ign-")), "ro");
  mkdirSync(ro); g(ro, "init", "-q"); writeFileSync(join(ro, "a.txt"), "a"); g(ro, "add", "a.txt");
  g(ro, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "a");
  mkdirSync(join(ro, ".xworkflows")); writeFileSync(join(ro, ".xworkflows", ".gitignore"), "mine\n", { mode: 0o444 });
  start(ro);
  assert.ok(existsSync(join(ro, ".xworkflows", "adapt-run.json")));
});

test("a tracked symlink under .xworkflows is never written through, and render writes nothing when any output is a link", () => {
  for (const f of ["research.md", "screens.json", "details.md"]) {
    const d = repo();
    put(d, sample());
    const out = join(mkdtempSync(join(tmpdir(), "res-out-")), "outside.txt");
    writeFileSync(out, "keep");
    symlinkSync(out, X(d, f));
    const r = cli(d, "render");
    assert.equal(r.status, 1, f);
    assert.match(r.stderr, new RegExp(`${f.replace(".", "\\.")} is a symlink`));
    assert.equal(readFileSync(out, "utf8"), "keep");
    for (const g of ["research.md", "screens.json", "details.md"]) if (g !== f) assert.ok(!existsSync(X(d, g)), `${g} written next to a link at ${f}`);
  }
  const d = repo();
  cli(d, "start");
  const out = join(mkdtempSync(join(tmpdir(), "res-out-")), "outside.txt");
  writeFileSync(out, "keep");
  writeFileSync(X(d, "screens.json"), JSON.stringify(SC())); put(d, sample());
  symlinkSync(out, X(d, "interview.json"));
  assert.equal(cli(d, "queue").status, 1);
  assert.equal(readFileSync(out, "utf8"), "keep");
});

test("start refuses when interview.log.jsonl is a symlink, before creating anything", () => {
  const d = repo();
  const out = join(mkdtempSync(join(tmpdir(), "res-out-")), "outside.txt");
  writeFileSync(out, "keep");
  symlinkSync(out, X(d, "interview.log.jsonl"));
  const r = cli(d, "start");
  assert.equal(r.status, 1);
  assert.ok(!existsSync(X(d, "adapt-run.json")));
  assert.ok(!existsSync(X(d, ".gitignore")));
  assert.equal(readFileSync(out, "utf8"), "keep");
});

test("start refuses when .xworkflows itself is a symlink", () => {
  const d = repo();
  const real = mkdtempSync(join(tmpdir(), "res-out-"));
  rmSync(X(d, ""), { recursive: true });
  symlinkSync(real, X(d, ""));
  assert.equal(cli(d, "start").status, 1);
  assert.ok(!existsSync(join(real, "adapt-run.json")));
});

// ---- the second page, a folder as citation

const MORE = (n) => Array.from({ length: n }, (_, i) => ({ text: `More ${i}.`, from: ["truth.1"], at: "a.js:2" }));
test("with sentences left out the queue adds S1-more after screen 1, then the first 12 of them as S1-13 and on built like the first twelve", () => {
  const left = [{ text: "Second.", from: ["truth.1"], at: "a.js:5", also: 1 }, { text: "Third.", from: ["truth.1"], at: "a.js:6" }, ...MORE(13)];
  const q = buildQueue(SC({ drawer1LeftOut: left }));
  assert.deepEqual(ids(q).slice(0, 5), ["S1-1", "S1-2", "S1-more", "S1-13", "S1-14"]);
  assert.equal(ids(q).filter((i) => /^S1-\d+$/.test(i)).length, 2 + 12);
  assert.ok(!ids(q).includes("S1-27"));
  const more = q.find((i) => i.id === "S1-more");
  assert.deepEqual(more.options, ["Yes, show them", "No, skip them"]);
  assert.equal(more.text, "The second page holds 12 sentence(s). Show them?");
  assert.deepEqual(q[3], { id: "S1-13", heading: "1", style: "choice", text: "Second. (a.js:5) seen in 1 more place(s).", options: ["Right", "Real, but a bad rule", "Not how it works", "I don't know"] });
  assert.equal(q[4].text, "Third. (a.js:6)");
});

test("S1-more says the size of the second page, not how many were left out", () => {
  const text = (n) => buildQueue(SC({ drawer1LeftOut: MORE(n) })).find((i) => i.id === "S1-more").text;
  assert.equal(text(15), "The second page holds 12 sentence(s). Show them?");
  assert.equal(text(3), "The second page holds 3 sentence(s). Show them?");
});

test("nothing left out: no S1-more", () => {
  assert.ok(!ids(buildQueue(SC())).includes("S1-more"));
});

test("the second page starts at S1-13: S1-12 is always asked, S1-13 only after the logged answer Yes, show them", () => {
  const q = [{ id: "S1-1", style: "choice" }, { id: "S1-12", style: "choice" }, { id: "S1-more", style: "choice" }, { id: "S1-13", style: "choice" }, { id: "X1", style: "choice" }];
  const first = [L("S1-1", "Right")];
  assert.deepEqual(missing(q, first, "r1"), ["S1-12", "S1-more", "X1"]);
  assert.deepEqual(missing(q, [...first, L("S1-more", "No, skip them"), L("X1", "x")], "r1"), ["S1-12"]);
  assert.deepEqual(missing(q, [...first, L("S1-12", "Right"), L("S1-more", "No, skip them"), L("X1", "x")], "r1"), []);
  assert.deepEqual(missing(q, [...first, L("S1-12", "Right"), L("S1-more", "Yes, show them"), L("X1", "x")], "r1"), ["S1-13"]);
  assert.deepEqual(missing(q, [...first, L("S1-12", "Right"), L("S1-more", "Yes, show them"), L("S1-13", "Right"), L("X1", "x")], "r1"), []);
});

test("a citation whose file is a folder does not verify; render drops it and goes on", () => {
  const d = repo();
  assert.equal(verifyCitation(d, { file: ".xworkflows", line: 1, quote: "x" }), false);
  const r = sample();
  r.areas.truth.ideas.push({ text: "In a folder.", file: ".xworkflows", line: 1, quote: "x" });
  const { version, profile, areaOrder, topics, written, kinds: k, plain: p, questions } = r;
  r.sum = sum(JSON.stringify({ version, profile, areaOrder, topics, written, areas: r.areas, kinds: k, plain: p, questions }));
  put(d, r);
  const out = cli(d, "render");
  assert.equal(out.status, 0, out.stderr);
  assert.match(rt(d, "research.md"), /idea: In a folder\./);
});

// ---- a re-adaptation asks only what changed (P-69)

const A1 = { text: "Totals are rounded once.", at: "a.js:2", answer: "Right" };
function again(over = {}) {
  const d = repo();
  const prev = sample();
  const earlier = { root: d, answered: [A1], docs: [], ...over };
  return { d, prev, earlier, ids: (sc = SC()) => ids(buildQueue(sc, {}, {}, prev, {}, earlier)).filter((i) => i.startsWith("S1-")) };
}

test("a second adaptation where nothing changed does not ask a sentence the owner answered, and the other keeps its number", () => {
  assert.deepEqual(again().ids(), ["S1-2"]); // "Ids are never reused." is S1-2 on every screen and in research.md
});

test("a sentence whose cited line changed is asked again", () => {
  const t = again();
  writeFileSync(join(t.d, "a.js"), "line1\nconst total = 5;\nline3\n");
  assert.deepEqual(t.ids(), ["S1-1", "S1-2"]);
});

test("a sentence with a new wording is asked", () => {
  const t = again();
  const sc = SC(); sc.drawer1[0].text = "Totals are rounded one time.";
  assert.deepEqual(t.ids(sc), ["S1-1", "S1-2"]);
});

test("a list kept for one sentence is not used for the same words citing another place", () => {
  const t = again();
  const sc = SC(); sc.drawer1[0].at = "a.js:3";
  assert.deepEqual(t.ids(sc), ["S1-1", "S1-2"]);
});

test("a sentence whose cited file a newer spec or plan names is asked again", () => {
  const t = again({ docs: ["The plan changes how a.js rounds."] });
  assert.deepEqual(t.ids(), ["S1-1", "S1-2"]);
});

test("a first adaptation asks every sentence", () => {
  const t = again();
  assert.deepEqual(ids(buildQueue(SC(), {}, {}, null, {}, t.earlier)).filter((i) => i.startsWith("S1-")), ["S1-1", "S1-2"]);
});

// An approved run: its queue, its screens, and the owner's answers in the log.
function approved(answers, status = "approved") {
  const d = repo();
  put(d, sample()); writeFileSync(X(d, "screens.json"), JSON.stringify(SC()));
  const run = cli(d, "start").stdout.trim();
  writeFileSync(X(d, "interview.json"), JSON.stringify([{ id: "S1-1" }, { id: "S1-2" }]));
  writeFileSync(X(d, "interview.log.jsonl"), answers.map(([id, answer]) => JSON.stringify({ run, id, question: "q", answer })).join("\n") + "\n");
  writeFileSync(X(d, "summary.md"), `---\nstatus: ${status}\n---\n`);
  return d;
}

test("done keeps the answered sentences of an approved run, not an I don't know", () => {
  const d = approved([["S1-1", "Right"], ["S1-2", "I don't know"]]);
  cli(d, "done");
  assert.deepEqual(rj(d, "research.answered.json"), [A1]);
});

test("a run that stopped before its summary was approved leaves no list, so its answers are not reused", () => {
  const d = approved([["S1-1", "Right"], ["S1-2", "Right"]], "draft");
  cli(d, "done");
  assert.ok(!existsSync(X(d, "research.answered.json")));
});

test("queue run twice gives the same ids; the next run asks only the sentence not kept, and done keeps both", () => {
  const d = approved([["S1-1", "Right"]]);
  cli(d, "done");
  writeFileSync(X(d, "research.prev.json"), JSON.stringify(sample()));
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: d, encoding: "utf8" }).trim();
  writeFileSync(X(d, "summary.md"), `---\nstatus: approved\ncommit: ${head}\n---\n`);
  const s1 = () => { cli(d, "queue"); return ids(JSON.parse(rt(d, "interview.json"))).filter((i) => i.startsWith("S1-")); };
  assert.deepEqual(s1(), ["S1-2"]);
  assert.deepEqual(s1(), ["S1-2"]);
  const run = cli(d, "start").stdout.trim();
  writeFileSync(X(d, "interview.log.jsonl"), JSON.stringify({ run, id: "S1-2", question: "q", answer: "Right" }) + "\n");
  writeFileSync(X(d, "summary.md"), `---\nstatus: approved\ncommit: ${head}\n---\n`);
  cli(d, "done");
  assert.deepEqual(rj(d, "research.answered.json"), [A1, { text: "Ids are never reused.", at: "a.js:3", answer: "Right" }]);
});

function plan() {
  const d = repo();
  mkdirSync(join(d, "docs/superpowers/plans"), { recursive: true });
  const f = join(d, "docs/superpowers/plans/nuevo-diseño.md");
  writeFileSync(f, "Other.\n");
  execFileSync("git", ["add", "."], { cwd: d });
  execFileSync("git", [...G, "commit", "-qm", "plan"], { cwd: d });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: d, encoding: "utf8" }).trim();
  writeFileSync(X(d, "screens.json"), JSON.stringify(SC())); put(d, sample());
  writeFileSync(X(d, "research.prev.json"), JSON.stringify(sample()));
  writeFileSync(X(d, "summary.md"), `---\nstatus: approved\ncommit: ${head}\n---\n`);
  writeFileSync(X(d, "research.answered.json"), JSON.stringify([A1]));
  writeFileSync(f, "Change a.js.\n");
  return d;
}

test("queue finds the newer specs and plans since the summary's commit", () => {
  const d = repo();
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: d, encoding: "utf8" }).trim();
  writeFileSync(X(d, "screens.json"), JSON.stringify(SC())); put(d, sample());
  writeFileSync(X(d, "research.prev.json"), JSON.stringify(sample()));
  writeFileSync(X(d, "summary.md"), `---\nstatus: approved\ncommit: ${head}\n---\n`);
  writeFileSync(X(d, "research.answered.json"), JSON.stringify([A1]));
  const s1 = () => { cli(d, "queue"); return ids(JSON.parse(rt(d, "interview.json"))).filter((i) => i.startsWith("S1-")); };
  assert.deepEqual(s1(), ["S1-2"]);
  mkdirSync(join(d, "docs/superpowers/plans"), { recursive: true });
  writeFileSync(join(d, "docs/superpowers/plans/new.md"), "Change a.js.\n");
  assert.deepEqual(s1(), ["S1-1", "S1-2"]);
});

test("queue reads a new plan whose file name holds a non-ASCII letter", () => {
  const d = repo();
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: d, encoding: "utf8" }).trim();
  writeFileSync(X(d, "screens.json"), JSON.stringify(SC())); put(d, sample());
  writeFileSync(X(d, "research.prev.json"), JSON.stringify(sample()));
  writeFileSync(X(d, "summary.md"), `---\nstatus: approved\ncommit: ${head}\n---\n`);
  writeFileSync(X(d, "research.answered.json"), JSON.stringify([A1]));
  mkdirSync(join(d, "docs/superpowers/plans"), { recursive: true });
  writeFileSync(join(d, "docs/superpowers/plans/nuevo-diseño.md"), "Change a.js.\n");
  cli(d, "queue");
  assert.deepEqual(ids(JSON.parse(rt(d, "interview.json"))).filter((i) => i.startsWith("S1-")), ["S1-1", "S1-2"]);
  // a plan committed before the summary's commit and changed after it goes through `git diff --name-only`
  const e = plan();
  cli(e, "queue");
  assert.deepEqual(ids(JSON.parse(rt(e, "interview.json"))).filter((i) => i.startsWith("S1-")), ["S1-1", "S1-2"]);
});

test("a one-character quote is not a verified citation", () => {
  const d = repo();
  assert.ok(!verifyCitation(d, { file: "a.js", line: 2, quote: "t" }));
  assert.ok(verifyCitation(d, { file: "a.js", line: 2, quote: "round(x)" }));
});

test("a citation whose absolute path goes through a symlink of the root verifies", () => {
  const d = repo();
  const link = join(mkdtempSync(join(tmpdir(), "res-link-")), "root");
  symlinkSync(d, link);
  assert.ok(verifyCitation(d, { file: join(link, "a.js"), line: 2, quote: "round(x)" }));
  assert.ok(verifyCitation(link, { file: join(d, "a.js"), line: 2, quote: "round(x)" }));
  assert.ok(!verifyCitation(link, { file: join(tmpdir(), "elsewhere.js"), line: 2, quote: "round(x)" }));
});

test("start in a repository with no commit says so, no stack trace", () => {
  const d = mkdtempSync(join(tmpdir(), "res-empty-"));
  execFileSync("git", ["init", "-q"], { cwd: d });
  const r = cli(d, "start");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /adapt: .*no commit/);
  assert.doesNotMatch(r.stderr, /\n\s+at /);
});

test("start replaces the ignore file each earlier version wrote, never one the user changed", () => {
  const ALL = [".gitignore", "research.md", "research.json", "research.prev.json", "scan.json", "interview.json", "interview.log.jsonl", "adapt-run.json", "rules.json", "kinds.json", "screens.json", "details.md"];
  for (const n of [10, 12, 13]) {
    const EARLIER = ALL.slice(0, n).join("\n") + "\n";
    const d = repo();
    writeFileSync(X(d, ".gitignore"), EARLIER);
    assert.equal(cli(d, "start").status, 0);
    for (const f of ["screens.json", "details.md", "research.answered.json"]) assert.ok(rt(d, ".gitignore").split("\n").includes(f), `${n}: ${f}`);
    assert.ok(!rt(d, ".gitignore").split("\n").includes("kinds.json"), `${n}: kinds.json`);
    const e = repo();
    writeFileSync(X(e, ".gitignore"), EARLIER + "mine\n");
    assert.equal(cli(e, "start").status, 0);
    assert.equal(rt(e, ".gitignore"), EARLIER + "mine\n");
  }
});

// The Workflow script is run as the Workflow tool runs it: a function of args, agent, parallel, pipeline, log, phase.
async function agentTypes(args) {
  const text = readFileSync(new URL("./research.workflow.js", import.meta.url), "utf8").replace(/export const meta = \{[\s\S]*?\n\};\n/, "");
  const types = new Set();
  const agent = async (prompt, opts) => {
    types.add(opts.agentType);
    if (opts.label === "profile") return { what: "A shop", languages: [], docs: [{ file: "README.md", lines: 3 }], areas: [], projectAreas: [] };
    return null;
  };
  const fn = new (async () => {}).constructor("args", "agent", "parallel", "pipeline", "log", "phase", text);
  await fn(args, agent, (thunks) => Promise.all(thunks.map((t) => t())), () => {}, () => {}, () => {});
  return [...types].filter(Boolean).sort();
}

test("the workflow calls its agents by the name install gave them", async () => {
  assert.deepEqual(await agentTypes({ root: ".", zeroHits: [] }), ["explore", "mechanism"]);
  assert.deepEqual(await agentTypes({ root: ".", zeroHits: [], agents: { mechanism: "xwf-mechanism", explore: "xwf-explore" } }), ["xwf-explore", "xwf-mechanism"]);
  assert.deepEqual(await agentTypes({ root: ".", zeroHits: [], agents: { mechanism: "xwf-mechanism" } }), ["explore", "xwf-mechanism"]);
});

// ---- the second page and the answered list under the cap

const THIRTY = Array.from({ length: 30 }, (_, i) => ({ text: `Rule ${i + 1}.`, from: ["truth.1"], at: "a.js:2" }));
test("a re-adaptation never queues a sentence past place 24, even when the answered ones before it are skipped", () => {
  const t = again({ answered: THIRTY.slice(0, 24).map((x) => ({ text: x.text, at: x.at, answer: "Right" })) });
  t.prev.plain.claims = THIRTY.map((x) => ({ text: x.text, from: ["truth.1"] }));
  const q = t.ids(SC({ drawer1: THIRTY.slice(0, 12), drawer1LeftOut: THIRTY.slice(12) }));
  assert.deepEqual(q, []);
});

test("in a re-adaptation S1-more counts the sentences it will show, as research.md counts the second page", () => {
  const t = again({ answered: THIRTY.slice(0, 20).map((x) => ({ text: x.text, at: x.at, answer: "Right" })) });
  t.prev.plain.claims = THIRTY.map((x) => ({ text: x.text, from: ["truth.1"] }));
  const q = buildQueue(SC({ drawer1: THIRTY.slice(0, 12), drawer1LeftOut: THIRTY.slice(12) }), {}, {}, t.prev, {}, t.earlier);
  assert.deepEqual(ids(q).filter((i) => /^S1-/.test(i)), ["S1-more", "S1-21", "S1-22", "S1-23", "S1-24"]);
  assert.equal(q.find((i) => i.id === "S1-more").text, "The second page holds 4 sentence(s). Show them?");
});

test("done keeps an old answer only for a sentence skipped because it was answered, not for one the cap cut", () => {
  const d = repo();
  put(d, sample()); writeFileSync(X(d, "screens.json"), JSON.stringify(SC({ drawer1: THIRTY.slice(0, 12), drawer1LeftOut: THIRTY.slice(12) })));
  const run = cli(d, "start").stdout.trim();
  const old = THIRTY.map((x) => ({ text: x.text, at: x.at, answer: "Right" }));
  writeFileSync(X(d, "research.answered.json"), JSON.stringify(old));
  const queue = [...THIRTY.slice(0, 12).map((_, i) => ({ id: `S1-${i + 1}` })), { id: "S1-more" }, ...THIRTY.slice(12, 24).map((_, i) => ({ id: `S1-${i + 13}` }))];
  writeFileSync(X(d, "interview.json"), JSON.stringify(queue));
  writeFileSync(X(d, "interview.log.jsonl"), queue.filter((q) => q.id !== "S1-more").map((q) => JSON.stringify({ run, id: q.id, question: "q", answer: "Right" })).join("\n") + "\n");
  writeFileSync(X(d, "summary.md"), `---\nstatus: approved\n---\n`);
  cli(d, "done");
  assert.equal(rj(d, "research.answered.json").length, 24);
});
