import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grade, stats, kindsFound, noMoneyCheck, recommendedReport } from "./grade.mjs";
import { answerFor, toAnswers, stripPlan, stripLeft } from "./answers.mjs";

const FX = new URL("../test/fixtures/proof/", import.meta.url).pathname;
const TRIAL = FX + "trial";
const LOG = readFileSync(FX + "interview.log.jsonl", "utf8");
const RUBRIC = JSON.parse(readFileSync(FX + "rubric.json", "utf8"));
const research = () => JSON.parse(readFileSync(TRIAL + "/research.json", "utf8"));
const copy = () => { const d = mkdtempSync(join(tmpdir(), "proof-")); cpSync(TRIAL, d, { recursive: true }); return d; };
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

test("strip removes paths and fails if any remains", () => {
  const existing = ["AGENTS.md", "docs/a.md", "docs/b/c.md", "src/x.js"];
  assert.deepEqual(stripPlan(["AGENTS.md", "docs", "CLAUDE.md"], existing), { remove: ["AGENTS.md", "docs"], absent: ["CLAUDE.md"] });
  assert.deepEqual(stripLeft(["AGENTS.md", "docs"], ["docs/a.md", "src/x.js"]), ["docs"]);
  assert.deepEqual(stripLeft(["AGENTS.md", "docs"], ["src/x.js"]), []);
});
