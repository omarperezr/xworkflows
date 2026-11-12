import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, cpSync, mkdirSync, existsSync, unlinkSync, rmSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grade, stats, kindsFound, noMoneyCheck, recommendedReport } from "./grade.mjs";
import { spawnSync, execFileSync } from "node:child_process";
import { answerFor, toAnswers, stripPlan, stripLeft, loadAnswers } from "./answers.mjs";
import { prepareCopy, stopFor, withOwnerBackup, apiKeyGuard, budgetStop, countedCost, restoreOwner, readLedger, addSpend, acquireLock, releaseLock, KEPT_FILES } from "./trial-lib.mjs";

const FX = new URL("../test/fixtures/proof/", import.meta.url).pathname;
const TRIAL = FX + "trial";
const LOG = readFileSync(FX + "interview.log.jsonl", "utf8");
const RUBRIC = JSON.parse(readFileSync(FX + "rubric.json", "utf8"));
const research = () => JSON.parse(readFileSync(TRIAL + "/research.json", "utf8"));
const made = [];
after(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "proof-")); made.push(d); return d; };
const copy = () => { const d = tmp(); cpSync(TRIAL, d, { recursive: true }); return d; };
const setJson = (d, f) => { const r = research(); f(r); writeFileSync(d + "/research.json", JSON.stringify(r)); };

test("answerFor rules", () => {
  const a = { "H1-a": "Yes", "H2-b": "yes", "H3-c": "free text", "H5-idem-r": "use keys" };
  const q = (header, options = []) => ({ header, question: "?", options });
  assert.deepEqual(answerFor(q("S5-next"), a), { answer: "", miss: false, stop: true });
  assert.equal(answerFor(q("P-H3"), a).answer, "Right");
  assert.equal(answerFor(q("H3-c"), a).answer, "free text");
  assert.equal(answerFor(q("H2-b", [{ label: "Yes" }, { label: "No" }]), a).answer, "Yes");
  assert.deepEqual(answerFor(q("H9-z"), a), { answer: "I don't know", miss: true });
  assert.deepEqual(answerFor(q("H5-idem-r"), a), { answer: "use keys", miss: false });
});

test("grade counts R on heading 5 and I on the rules", () => {
  const g = grade(TRIAL, RUBRIC);
  // inv-gamma is only in research.md heading 4: in neither; inv-batch only in rules (I)
  assert.deepEqual(g.R, ["inv-idem"]);
  assert.deepEqual(g.I, ["inv-idem", "inv-batch"]);
  const g2 = grade(TRIAL, { invariants: [{ id: "x", patterns: ["wrap multi-step"] }, { id: "y", patterns: ["IDEMPOTENCY KEY", "every write"] }] });
  assert.deepEqual(g2.R, ["y"]);
  assert.deepEqual(g2.I, ["x", "y"]);
});

test("a pattern matched only in research.md counts for R, not I", () => {
  const g = grade(TRIAL, { invariants: [{ id: "k", patterns: ["src/idem.js:10"] }] });
  assert.deepEqual(g, { R: ["k"], I: [] });
});

test("stats", () => {
  assert.deepEqual(stats([6, 7, 6]), { min: 6, max: 7, mean: 6.33, spread: 1 });
});

test("kindsFound", () => {
  assert.equal(kindsFound(TRIAL).length, 11);
});

test("noMoneyCheck", () => {
  assert.deepEqual(noMoneyCheck(TRIAL), { ok: true, why: [] });
  let d = copy();
  setJson(d, (r) => { r.kinds.conc.rules = [{ rule: "x", file: "a", line: 1, quote: "q" }]; });
  assert.equal(noMoneyCheck(d).ok, false);
  d = copy();
  setJson(d, (r) => { r.kinds.values.rules[0].rule = "Currency is rounded"; });
  assert.equal(noMoneyCheck(d).ok, false);
  d = copy();
  setJson(d, (r) => { for (const k of ["compat", "input"]) r.kinds[k].rules = []; r.kinds.input.status = "absent"; r.kinds.compat.status = "absent"; });
  assert.equal(noMoneyCheck(d).ok, false);
  d = copy();
  setJson(d, (r) => { for (const k of ["compat"]) { r.kinds[k].rules = []; r.kinds[k].status = "absent"; } });
  assert.equal(noMoneyCheck(d).ok, true);
});

test("toAnswers: last answer per id, last run only", () => {
  assert.deepEqual(toAnswers(LOG), {
    "H1-a": "Yes", "H5-idem": "Nothing does today", "H5-idem-r": "use keys", "H6-r1": "Other",
    "H4-x": "No", "H5-snap": "x", "H5-conc": "x",
  });
});

test("recommendedReport", () => {
  const rep = recommendedReport(LOG, research());
  const by = Object.fromEntries(rep.map((r) => [r.id, r.cited]));
  assert.equal(by["H5-idem"], true); // kind found, and names verified src/idem.js:10
  assert.equal(by["H6-r1"], false);
  assert.equal(by["H4-x"], true); // names src/values.js:10
  assert.equal(by["H5-conc"], false); // not-present kind
  assert.equal(by["H5-snap"], true); // H5-<kind> with kind found
  assert.equal(rep.length, 5);
});

test("loadAnswers reads the pretty object and a log, and fails when empty", () => {
  assert.deepEqual(loadAnswers(JSON.stringify({ "H1-a": "Yes" }, null, 2)), { "H1-a": "Yes" });
  assert.equal(loadAnswers(LOG)["H1-a"], "Yes");
  assert.throws(() => loadAnswers("not json\n"), /no answer/);
  assert.throws(() => loadAnswers("{}"), /no answer/);
});

test("prepareCopy order: strip before install before graphify", () => {
  const calls = [];
  const exec = (cmd, args) => {
    calls.push([cmd, ...args].join(" "));
    return args[0] === "ls-files" ? (calls.some((c) => c.includes(" rm ")) ? "src/x.js\n" : "AGENTS.md\nsrc/x.js\n") : "abc123\n";
  };
  const sha = prepareCopy({ dir: "/d", source: "/s", commit: "c1", strip: ["AGENTS.md"], repo: "/r", exec, copyDir() {} });
  assert.equal(sha, "abc123");
  const at = (s) => calls.findIndex((c) => c.includes(s));
  assert.ok(at("clone") < at(" rm ") && at(" rm ") < at("remove instruction files") && at("remove instruction files") < at("install --yes") && at("install --yes") < at("graphify update"));
  assert.throws(() => prepareCopy({ dir: "/d", source: "/s", commit: "c1", strip: ["AGENTS.md"], repo: "/r", exec: (c, a) => (a[0] === "ls-files" ? "AGENTS.md\n" : ""), copyDir() {} }), /strip left/);
});

test("stopFor ends the trial on next-step or full-review", () => {
  assert.equal(stopFor("Skill", { skill: "next-step" }), "S5-skip");
  assert.equal(stopFor("Skill", { skill: "xworkflows:full-review" }), "S5-skip");
  assert.equal(stopFor("Skill", { skill: "adapt" }), null);
  assert.equal(stopFor("Bash", { skill: "next-step" }), null);
});

test("withOwnerBackup removes the profile during the run and restores it, also on error", async () => {
  const home = tmp();
  mkdirSync(join(home, ".xworkflows"));
  const f = join(home, ".xworkflows/owner.md");
  writeFileSync(f, "mine");
  await withOwnerBackup(home, () => { assert.equal(existsSync(f), false); writeFileSync(f, "trial"); });
  assert.equal(readFileSync(f, "utf8"), "mine");
  await assert.rejects(withOwnerBackup(home, () => { throw new Error("x"); }));
  assert.equal(readFileSync(f, "utf8"), "mine");
  // a killed run leaves the backup on disk: restoring puts it back
  renameSync(f, f + ".proof-backup");
  assert.equal(restoreOwner(home), true);
  assert.equal(readFileSync(f, "utf8"), "mine");
  assert.equal(restoreOwner(home), false);
  // during the run the profile exists on disk as owner.md.proof-backup
  await withOwnerBackup(home, () => assert.equal(readFileSync(f + ".proof-backup", "utf8"), "mine"));
  const empty = tmp();
  await withOwnerBackup(empty, () => { mkdirSync(join(empty, ".xworkflows")); writeFileSync(join(empty, ".xworkflows/owner.md"), "t"); });
  assert.equal(existsSync(join(empty, ".xworkflows/owner.md")), false);
});

test("apiKeyGuard refuses per-token billing", () => {
  assert.match(apiKeyGuard({ ANTHROPIC_API_KEY: "k" }), /billed per token/);
  assert.match(apiKeyGuard({ ANTHROPIC_AUTH_TOKEN: "t" }), /claude\.ai login/);
  assert.match(apiKeyGuard({ ANTHROPIC_API_KEY: "k" }), /--api-credits/);
  assert.equal(apiKeyGuard({ ANTHROPIC_API_KEY: "k" }, true), null);
  assert.equal(apiKeyGuard({}), null);
});

test("countedCost is conservative unless the end was clean", () => {
  const ok = { costUsd: 2, stoppedAt: "S5-next", error: null, failed: false };
  assert.equal(countedCost(ok, 15), 2);
  assert.equal(countedCost({ ...ok, stoppedAt: null }, 15), 2);
  assert.equal(countedCost({ ...ok, stoppedAt: "S5-skip" }, 15), 2);
  for (const bad of [{ stoppedAt: "timeout" }, { stoppedAt: "budget" }, { error: "x" }, { failed: true }, { stoppedAt: "error_during_execution" }]) assert.equal(countedCost({ ...ok, ...bad }, 15), 15);
  assert.equal(countedCost({ ...ok, failed: true, costUsd: 20 }, 15), 20);
  assert.equal(countedCost({ ...ok, noResult: true }, 15), 15);
  assert.equal(countedCost({ ...ok, stoppedAt: null, noResult: true }, 15), 15);
});

test("spend ledger sums counted costs across runs and the total cap applies to it", () => {
  const f = tmp() + "/proof-spend.json";
  assert.deepEqual(readLedger(f), { totalUsd: 0, trials: [] });
  assert.equal(addSpend(f, { trial: 1, countedUsd: 15 }), 15);
  assert.equal(addSpend(f, { trial: 2, countedUsd: 2.1 }), 17.1);
  // a second harness run starts from the file
  const l = readLedger(f);
  assert.equal(l.totalUsd, 17.1);
  assert.equal(l.trials.length, 2);
  assert.equal(addSpend(f, { trial: 1, countedUsd: 30 }), 47.1);
  assert.match(budgetStop(readLedger(f).totalUsd, 15, 60), /exceed/);
  writeFileSync(f, "{}");
  assert.throws(() => readLedger(f), /not a spend ledger/);
});

test("budgetStop keeps spent plus one trial cap within the total", () => {
  assert.equal(budgetStop(0, 15, 60), null);
  assert.equal(budgetStop(45, 15, 60), null);
  assert.match(budgetStop(45.01, 15, 60), /exceed/);
});

test("grade and report ignore dropped citations; empty stats; missing research.md", () => {
  const d = copy();
  writeFileSync(d + "/research.md", readFileSync(d + "/research.md", "utf8") + "\n## Dropped citations\n\n- idem: src/idem.js:10 \"q\"\n");
  assert.equal(kindsFound(d).includes("idem"), false);
  assert.equal(kindsFound(d).length, 10);
  const rep = recommendedReport(LOG, research(), readFileSync(d + "/research.md", "utf8"));
  assert.equal(rep.find((r) => r.id === "H4-x").cited, true);
  assert.deepEqual(stats([]), { min: null, max: null, mean: null, spread: null });
  unlinkSync(d + "/research.md");
  assert.equal(kindsFound(d).length, 0);
  assert.equal(noMoneyCheck(d).ok, false);
});

test("grade reads a live copy's .xworkflows/ and warns when research.md is missing", () => {
  const d = copy();
  mkdirSync(d + "/.xworkflows");
  for (const f of ["research.md", "research.json"]) renameSync(`${d}/${f}`, `${d}/.xworkflows/${f}`);
  writeFileSync(d + "/.xworkflows/interview.log.jsonl", LOG);
  assert.deepEqual(grade(d, RUBRIC), grade(TRIAL, RUBRIC));
  assert.deepEqual(kindsFound(d), kindsFound(TRIAL));
  const G = new URL("./grade.mjs", import.meta.url).pathname;
  const log = spawnSync("node", [G, "--log", d], { encoding: "utf8" });
  assert.equal(log.stderr, "");
  assert.ok(JSON.parse(log.stdout).length > 0);
  rmSync(d + "/.xworkflows/research.md");
  const r = spawnSync("node", [G, "--kinds", d], { encoding: "utf8" });
  assert.match(r.stderr, /warning: .*no research\.md/);
});

test("strip removes paths and fails if any remains", () => {
  const existing = ["AGENTS.md", "docs/a.md", "docs/b/c.md", "src/x.js"];
  assert.deepEqual(stripPlan(["AGENTS.md", "docs", "CLAUDE.md"], existing), { remove: ["AGENTS.md", "docs"], absent: ["CLAUDE.md"] });
  assert.deepEqual(stripLeft(["AGENTS.md", "docs"], ["docs/a.md", "src/x.js"]), ["docs"]);
  assert.deepEqual(stripLeft(["AGENTS.md", "docs"], ["src/x.js"]), []);
});

test("prepareCopy init on a git worktree source leaves the source repository untouched", () => {
  const sh = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8" });
  const main = tmp(), wt = join(tmp(), "wt"), dir = join(tmp(), "trial");
  const id = ["-c", "user.name=t", "-c", "user.email=t@example.invalid"];
  sh(main, "init", "-q"); writeFileSync(join(main, "a.txt"), "a");
  sh(main, "add", "-A"); sh(main, ...id, "commit", "-q", "-m", "one");
  sh(main, "worktree", "add", "-q", wt);
  writeFileSync(join(wt, "b.txt"), "b");
  const before = sh(wt, "rev-parse", "HEAD");
  const exec = (c, a, cwd) => (c === "git" ? execFileSync(c, a, { cwd, encoding: "utf8" }) : "");
  prepareCopy({ dir, source: wt, init: true, strip: [], repo: "/r", exec, copyDir: (s, d) => cpSync(s, d, { recursive: true }) });
  assert.equal(sh(wt, "rev-parse", "HEAD"), before);
  assert.equal(sh(wt, "status", "--porcelain"), "?? b.txt\n");
  assert.equal(sh(dir, "rev-list", "--count", "HEAD").trim(), "1");
});

test("harness lock: second run refused, stale lock taken over, profile intact", () => {
  const home = tmp(), x = join(home, ".xworkflows");
  mkdirSync(x);
  writeFileSync(join(x, "owner.md.proof-backup"), "REAL");
  assert.equal(acquireLock(home).ok, true);
  assert.equal(acquireLock(home).ok, false);
  assert.equal(readFileSync(join(x, "owner.md.proof-backup"), "utf8"), "REAL");
  assert.equal(existsSync(join(x, "owner.md")), false);
  releaseLock(home);
  writeFileSync(join(x, "owner.md.proof-lock"), "2147483646");
  assert.equal(acquireLock(home).ok, true);
  assert.equal(restoreOwner(home), true);
  assert.equal(readFileSync(join(x, "owner.md"), "utf8"), "REAL");
  releaseLock(home);
  assert.equal(existsSync(join(x, "owner.md.proof-lock")), false);
});

test("harness lock: empty or zero lock file is stale and taken over", () => {
  for (const body of ["", "0"]) {
    const home = tmp(), x = join(home, ".xworkflows");
    mkdirSync(x);
    writeFileSync(join(x, "owner.md.proof-lock"), body);
    assert.equal(acquireLock(home).ok, true, `lock holding ${JSON.stringify(body)}`);
    releaseLock(home);
  }
});

test("the harness keeps the files the new adapt writes", () => {
  for (const f of ["research.md", "research.json", "scan.json", "interview.log.jsonl", "screens.json", "details.md"]) assert.ok(KEPT_FILES.includes(f), f);
});
