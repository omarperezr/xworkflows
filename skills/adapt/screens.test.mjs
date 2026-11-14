import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { screens, render, details, mechanism, MAX_RULES, MAX_GAPS, MAX_WORDS } from "./screens.mjs";

const root = mkdtempSync(join(tmpdir(), "xwf-screens-"));
mkdirSync(join(root, "src"));
writeFileSync(join(root, "src/a.js"), "const due = days(loan);\nlate(loan);\nold(loan);\n");
writeFileSync(join(root, "src/b.js"), "late(loan);\n");
writeFileSync(join(root, "src/c.js"), "old(loan);\n");
mkdirSync(join(root, "src/dir"));
writeFileSync(join(root, "README.md"), "Loans are counted in whole days.\n");
test.after(() => rmSync(root, { recursive: true, force: true }));

const c = (line, quote, more = {}) => ({ file: "src/a.js", line, quote, ...more });
const at = (file, line, quote) => ({ file, line, quote });
const area = (more = {}) => ({ status: "found", ideas: [{ text: "i", ...c(1, "days(loan)") }], support: [], exceptions: [], contradicted: [], unprotected: [], commentRules: [], details: [], notChecked: [], ...more });
const general = (rule, risk, cite) => ({ rule, basis: "code", risk, cost: "wrong due dates", ...cite });
const research = (areas, plain = { claims: [] }, more = {}) => ({ version: 3, profile: { what: "A lending desk." }, areaOrder: Object.keys(areas), areas, written: { count: 0, fromChecks: 0 }, kinds: {}, plain, questions: [{ id: "B-mistake", lead: "The README says so.", options: [{ label: "A lost book", description: "it is the costliest", file: "README.md", line: 1, quote: "whole days" }] }], ...more });
const claim = (text, ...from) => ({ text, from });

test("a sentence is shown only when an idea it names has a verified citation; its citation is the first verified idea's, never the general rule's", () => {
  const s = screens(root, research({
    truth: area({ general: general("Loans count whole days.", "medium", c(1, "days(loan)")), ideas: [{ text: "a", ...c(2, "late(loan)") }, { text: "b", ...c(3, "old(loan)") }, { text: "c", ...c(4, "not in the file") }] }),
    state: area({ general: general("Made up.", "high", c(1, "days(loan)")), ideas: [{ text: "d", ...c(1, "not in the file") }] }),
  }, { claims: [claim("Loans count whole days.", "truth.1"), claim("Made up.", "state.1"), claim("Nothing names an idea.", "nowhere.1"), claim("Late old loans.", "truth.3", "truth.2", "truth.1")] }));
  assert.deepEqual(s.drawer1.map((x) => [x.text, x.at, x.risk]), [
    ["Late old loans.", "src/a.js:2", "medium"],
    ["Loans count whole days.", "src/a.js:2", "medium"],
  ]);
  assert.deepEqual(s.drawer1.map((x) => x.from), [["truth.3", "truth.2", "truth.1"], ["truth.1"]]);
  assert.deepEqual(s.dropped.filter((d) => d.area === "plain").map((d) => d.what), ["sentence: Made up.", "sentence: Nothing names an idea."]);
  assert.ok(s.dropped.filter((d) => d.area === "plain").every((d) => d.reason));
});

test("a sentence of 15 words is dropped with its reason; 14 words stay", () => {
  const w = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join("  ");
  assert.equal(MAX_WORDS, 14);
  const s = screens(root, research({ truth: area({ general: general("r", "low", c(1, "days(loan)")) }) }, { claims: [claim(w(14), "truth.1"), claim(w(15), "truth.1")] }));
  assert.equal(s.drawer1.length, 1);
  assert.match(s.dropped.find((d) => d.what.startsWith("sentence: w0")).reason, /15 words/);
});

test("screen 1 holds 12; the rest is counted in the left-out line, never cut in silence", () => {
  const r = research({ truth: area({ general: general("r", "low", c(1, "days(loan)")) }) }, {
    claims: Array.from({ length: MAX_RULES + 4 }, (_, i) => claim(`sentence ${String(i).padStart(2, "0")}`, "truth.1")),
  });
  const s = screens(root, r);
  assert.equal(s.drawer1.length, MAX_RULES);
  assert.equal(s.drawer1LeftOut.length, 4);
  assert.match(render(r, s, "abc"), /Left out of this screen: 4 sentence\(s\)/);
});

test("a doubted rule with a verified citation becomes a screen 2 question, after contradictions and before exceptions", () => {
  const s = screens(root, research({
    truth: area({
      general: general("Loans count whole days.", "medium", c(1, "days(loan)")),
      exceptions: [c(3, "old(loan)", { how: "counts hours" })],
      contradicted: [c(2, "late(loan)", { written: "Loans are counted in whole days.", wfile: "README.md", wline: 1, wquote: "whole days", how: "it uses hours" })],
      unprotected: [c(2, "late(loan)", { risk: "a fee charged twice" })],
      doubted: [{ rule: "Late loans are flagged.", why: "no test covers it", ...c(2, "late(loan)") }],
    }),
    state: area({ doubted: [{ rule: "Made up.", why: "x", ...c(2, "not there") }] }),
  }));
  assert.deepEqual(s.drawer2.map((g) => [g.id, g.kind]), [["X1", "contradicted"], ["X2", "doubted"], ["X3", "exceptions"], ["X4", "unprotected"]]);
  const d = s.drawer2[1];
  assert.deepEqual(d.options, ["You are right: a pending card", "Keep it, because ...", "I don't know"]);
  assert.match(d.text, /Late loans are flagged\./);
  assert.match(d.text, /no test covers it/);
  assert.match(d.text, /src\/a\.js:2/);
  assert.ok(s.dropped.some((x) => x.area === "state" && /doubted/.test(x.what)));
});

test("screen 2 holds 6 and counts the rest", () => {
  const unprotected = Array.from({ length: 2 }, () => c(2, "late(loan)", { risk: "r" }));
  const areas = {};
  for (let i = 0; i < 4; i++) areas[`a${i}`] = area({ unprotected });
  const r = research(areas);
  const s = screens(root, r);
  assert.equal(MAX_GAPS, 6);
  assert.equal(s.drawer2.length, 6);
  assert.equal(s.drawer2LeftOut.length, 2);
  assert.match(render(r, s, "abc"), /Left out of this screen: 2 question\(s\)/);
});

test("an area whose agent returned nothing is an error; absent and not-present areas are listed", () => {
  const s = screens(root, research({ truth: null, state: area({ status: "absent" }), order: area({ status: "not-present" }) }));
  assert.deepEqual([s.errors.length, s.noRule, s.notPresent], [1, ["state"], ["order"]]);
});

test("screen 3 keeps the nine fixed questions; an option's citation is shown only when it holds", () => {
  const r = research({});
  const s = screens(root, r);
  assert.equal(s.drawer3.length, 9);
  assert.equal(s.drawer3.find((q) => q.id === "B-mistake").options[0].at, "README.md:1");
  assert.match(render(r, s, "abc"), /B-incident Tell me about one real time/);
});

test("research.md is version 3 and carries no detail; details.md holds every verified citation, mechanism rules and comment rules", () => {
  const r = research({
    truth: area({
      general: general("Loans count whole days.", "high", c(1, "days(loan)")),
      support: [at("src/b.js", 1, "late(loan)"), c(9, "nope")],
      commentRules: [{ text: "Never count hours.", ...c(3, "old(loan)") }, { text: "Made up comment.", ...c(3, "zzz") }],
    }),
  }, { claims: [claim("Loans count whole days.", "truth.1")] }, {
    kinds: { values: { status: "found", general: { rule: "Round once.", basis: "code", ...c(1, "days(loan)") }, rules: [{ rule: "Round at the end.", ...c(2, "late(loan)") }, { rule: "Fake rule.", ...c(2, "zzz") }], notChecked: [] } },
  });
  const s = screens(root, r);
  const md = render(r, s, "abc");
  assert.match(md, /^---\ncommit: abc\nversion: 3\n---/);
  assert.doesNotMatch(md, /## Details/);
  const d = details(r, s, mechanism(root, r), root);
  assert.match(d, /Loans count whole days\.[\s\S]*src\/a\.js:1[\s\S]*src\/b\.js:1/);
  assert.match(d, /## Mechanism rules[\s\S]*values[\s\S]*Round once\.[\s\S]*Round at the end\./);
  assert.match(d, /## Rules found in comments[\s\S]*Never count hours\./);
  for (const bad of ["Fake rule.", "Made up comment.", "nope", "src/a.js:9"]) assert.ok(!d.includes(bad), bad);
});

test("mechanism builds no kinds.json state; a kind with no answer or an invalid status is an error, sorted by kind", () => {
  const m = mechanism(root, research({}, undefined, { kinds: {
    values: { status: "found", general: { rule: "Round once.", basis: "code", ...c(1, "days(loan)") }, rules: [] },
    snap: { status: "found", general: { rule: "Unproven.", basis: "code", ...c(1, "zzz") }, rules: [] },
    idem: { status: "absent", rules: [] },
    conc: { status: "not-present", rules: [] },
  } }));
  assert.deepEqual(m.errors, []);
  assert.equal(m.state, undefined);
  assert.match(mechanism(root, research({}, undefined, { kinds: { txn: null, access: { status: "maybe" } } })).errors.join("\n"), /access[\s\S]*txn/);
});

test("details.md lists each written rule with the kinds' verdict; a verdict without a verified citation is no-evidence", () => {
  const written = [{ id: "W1", text: "Round once." }, { id: "W2", text: "Never count hours." }, { id: "W3", text: "Unjudged." }];
  const r = research({}, undefined, { kinds: { values: { status: "found", rules: [], verdicts: [
    { id: "W1", verdict: "enforced", ...c(1, "days(loan)") },
    { id: "W2", verdict: "contradicted", ...c(2, "zzz") },
    { id: "W9", verdict: "enforced", ...c(1, "days(loan)") },
  ] } } });
  const d = details(r, screens(root, r), mechanism(root, r), root, written);
  assert.match(d, /## Written rules and their verdicts\n\n- values W1 enforced: Round once\. src\/a\.js:1\n- values W2 no-evidence: Never count hours\.\n/);
  assert.ok(!d.includes("W9") && !d.includes("Unjudged") && !d.includes("src/a.js:2 "));
});

test("the parts never hold the text of a mechanism rule whose citation failed; its drop is a line", () => {
  const m = mechanism(root, { kinds: { snap: { status: "found", general: { rule: "A fee never changes after the loan is returned.", basis: "code", ...c(1, "not in the file") }, rules: [{ rule: "Fake detail.", ...c(2, "zzz") }] } } });
  assert.ok(!JSON.stringify(m.parts).includes("A fee never changes"));
  assert.deepEqual(m.dropped.map((d) => [d.area, d.what]), [["snap", "general rule: A fee never changes after the loan is returned."], ["snap", "rule: Fake detail."]]);
});

test("a verdict turned into no-evidence gets a dropped line; one that verifies, or was no-evidence, gets none", () => {
  const m = mechanism(root, research({}, undefined, { kinds: { values: { status: "found", rules: [], verdicts: [
    { id: "W1", verdict: "enforced", ...c(1, "days(loan)") },
    { id: "W2", verdict: "contradicted", ...c(2, "zzz") },
    { id: "W3", verdict: "no-evidence", ...c(2, "zzz") },
  ] } } }));
  assert.deepEqual(m.dropped.map((d) => [d.area, d.what]), [["values", "verdict W2 contradicted"]]);
  const a = mechanism(root, research({}, undefined, { kinds: { idem: { status: "absent", verdicts: [{ id: "W2", verdict: "contradicted", ...c(2, "zzz") }] } } }));
  assert.deepEqual(a.dropped.map((d) => [d.area, d.what]), [["idem", "verdict W2 contradicted"]]);
});

test("render stops when the plain agent, the questions agent or a config agent returned nothing", () => {
  const a = { truth: area({ general: general("r", "low", c(1, "days(loan)")) }) };
  assert.match(screens(root, research(a, null)).errors.join("\n"), /plain: agent returned nothing, rerun the Workflow/);
  assert.match(screens(root, research(a, undefined, { questions: null })).errors.join("\n"), /questions: agent returned nothing, rerun the Workflow/);
  assert.match(screens(root, research(a, undefined, { topics: { t3: null } })).errors.join("\n"), /topic t3: agent returned nothing, rerun the Workflow/);
  assert.deepEqual(screens(root, research(a)).errors, []);
});

test("details.md lists under each sentence only the items it names, with their citations; a verified idea no shown sentence names has its own heading", () => {
  const r = research({
    truth: area({ general: general("Loans count whole days.", "high", c(1, "days(loan)")), ideas: [{ text: "Days are whole.", ...c(2, "late(loan)") }, { text: "Unnamed idea.", ...c(3, "old(loan)") }, { text: "Fake idea.", ...c(3, "zzz") }] }),
  }, { claims: [claim("Loans count whole days.", "truth.1")] });
  const s = screens(root, r);
  const d = details(r, s, mechanism(root, r), root);
  assert.match(d, /### 1\. Loans count whole days\.\n\n- Days are whole\. src\/a\.js:2\n\n/);
  assert.doesNotMatch(d.split("## Rules no sentence shows")[0], /Loans count whole days\. \(code/);
  assert.match(d.split("## Rules no sentence shows")[1], /- \[truth\] Loans count whole days\. \(code; risk high: wrong due dates\) src\/a\.js:1\n/);
  assert.match(d, /## Rules no sentence shows\n\n- \[truth\.2\] Unnamed idea\. src\/a\.js:3\n/);
  assert.ok(!d.includes("Fake idea.") && !d.split("## Rules no sentence shows")[1].includes("Days are whole."));
});

test("a plain.rest of a research.json written before this round is read like claims: no verified sentence is lost", () => {
  const r = research({ truth: area({ general: general("r", "low", c(1, "days(loan)")) }) }, {
    claims: [claim("Made up.", "ghost.1"), claim("Good one.", "truth.1")],
    rest: [claim("Spare verified.", "truth.1")],
  });
  const s = screens(root, r);
  assert.deepEqual(s.drawer1.map((x) => x.text).sort(), ["Good one.", "Spare verified."]);
  assert.deepEqual(s.errors, []);
  assert.equal(s.dropped.filter((d) => d.area === "plain").length, 1);
});

test("a kind's own risk ranks its sentences: the list of kind sentences sorts by risk first, the fixed order of kinds only breaks ties; the risk word shows", () => {
  const withRisk = (risk) => ({ ...kinds().snap, general: { ...kinds().snap.general, risk, cost: "fees change under a borrower" } });
  const r = research({ a1: area({ general: general("r", "low", c(1, "days(loan)")) }) }, { claims: [claim("Snap low.", "kind:snap"), claim("Txn high.", "kind:txn"), claim("Idem high.", "kind:idem"), claim("Values med.", "kind:values"), claim("Mixed.", "kind:snap", "a1")] }, { kinds: { snap: withRisk("low"), idem: withRisk("high"), txn: withRisk("high"), values: withRisk("medium") } });
  const s = screens(root, r);
  assert.deepEqual(s.drawer1.map((x) => [x.text, x.risk]), [["Idem high.", "high"], ["Txn high.", "high"], ["Values med.", "medium"], ["Mixed.", "low"], ["Snap low.", "low"]]);
  assert.match(render(r, s, "abc"), /1\. Idem high\. \(src\/a\.js:1\) Risk high\.\n/);
  assert.match(details(r, s, mechanism(root, r), root), /### 1\. Idem high\.\n\n- A fee never changes after the loan is returned\. \(code; risk high: fees change under a borrower\) src\/a\.js:1\n/);
});

test("the left-out line of screen 2 says the cut is by kind, then by risk", () => {
  const low = Array.from({ length: 3 }, (_, i) => [`l${i}`, area({ general: general("r", "low", c(1, "days(loan)")), doubted: [{ rule: "d", why: "w", ...c(2, "late(loan)") }], exceptions: [c(3, "old(loan)", { how: "h" })] })]);
  const r = research({ ...Object.fromEntries(low), pay: area({ unprotected: [c(2, "late(loan)", { risk: "a charge taken twice" })] }) });
  const md = render(r, screens(root, r), "abc");
  assert.match(md, /Left out of this screen: 1 question\(s\), the last in this order: contradicted, doubted, exceptions, unprotected, then the least risky \(unprotected in pay\)/);
  assert.doesNotMatch(md, /the least risky ones/);
});

test("a doubted rule with a blank reason is dropped with a line; a doc path in screen 2 is repo-relative", () => {
  const s = screens(root, research({ truth: area({
    general: general("r", "low", c(1, "days(loan)")),
    doubted: [{ rule: "Totals are rounded.", why: "  ", ...c(2, "late(loan)") }],
    contradicted: [c(2, "late(loan)", { written: "Whole days.", wfile: join(root, "README.md"), wline: 1, wquote: "whole days", how: "hours" })],
  }) }));
  assert.deepEqual(s.drawer2.map((g) => g.kind), ["contradicted"]);
  assert.match(s.dropped.find((d) => /doubted/.test(d.what)).reason, /reason/);
  assert.ok(!s.drawer2[0].text.includes(root));
  assert.match(s.drawer2[0].text, /\(README\.md:1\)/);
});

test("details.md lists verified general and second rules that no shown idea belongs to", () => {
  const r = research({
    truth: area({ general: general("GENERAL TRUTH", "high", c(1, "days(loan)")), second: { rule: "SECOND TRUTH", risk: "high", cost: "c", ...c(2, "late(loan)") } }),
    state: area({ general: general("GENERAL STATE", "high", c(3, "old(loan)")), ideas: [{ text: "idea s1", ...c(3, "zzz") }] }),
  }, { claims: [claim("One.", "truth.1")] });
  const d = details(r, screens(root, r), mechanism(root, r), root);
  assert.match(d, /SECOND TRUTH/);
  assert.match(d, /GENERAL STATE/);
});

test("a verified idea of an absent area is kept: not dropped, and in details.md", () => {
  const r = research({ pay: area({ status: "absent", ideas: [{ text: "Fees are kept in days.", ...c(1, "days(loan)") }] }) }, { claims: [claim("Fees count days.", "pay.1")] });
  const s = screens(root, r);
  assert.equal(s.drawer1.length, 1, `sentence dropped: ${JSON.stringify(s.dropped)}`);
  assert.ok(details(r, s, mechanism(root, r), root).includes("Fees are kept"));
});

test("a sentence with no verified general rule shows no risk word and sorts after those that have one", () => {
  const r = research({
    bare: area({ general: general("bad", "high", c(1, "not in the file")) }),
    lo: area({ general: general("l", "low", c(1, "days(loan)")) }),
  }, { claims: [claim("No rule.", "bare.1"), claim("Low one.", "lo.1")] });
  const s = screens(root, r);
  assert.deepEqual(s.drawer1.map((x) => [x.text, x.risk]), [["Low one.", "low"], ["No rule.", undefined]]);
  const md = render(r, s, "abc");
  assert.match(md, /2\. No rule\. \(src\/a\.js:1\)\n/);
  assert.doesNotMatch(md, /No rule\. \(src\/a\.js:1\) Risk/);
});

test("screen 1 is ordered by risk, and a merged sentence takes its highest risk", () => {
  const r = research({
    med: area({ general: general("m", "medium", c(1, "days(loan)")) }),
    lo: area({ general: general("l", "low", c(1, "days(loan)")) }),
    hi: area({ general: general("h", "high", c(2, "late(loan)")) }),
  }, { claims: [claim("Medium.", "med.1"), claim("Low.", "lo.1"), claim("Merged.", "lo.1", "hi.1"), claim("High.", "hi.1")] });
  assert.deepEqual(screens(root, r).drawer1.map((x) => [x.text, x.risk]), [["Merged.", "high"], ["High.", "high"], ["Medium.", "medium"], ["Low.", "low"]]);
});

test("a sentence from a verified general rule shows that rule's citation as an example and counts its verified support; it goes before idea-only sentences", () => {
  const r = research({
    truth: area({ general: general("Loans count whole days.", "low", c(1, "days(loan)")), support: [at("src/b.js", 1, "late(loan)"), at("src/c.js", 1, "old(loan)"), c(9, "nope")], ideas: [{ text: "Days are whole.", ...c(4, "") }, { text: "i2", ...c(2, "late(loan)") }] }),
    bad: area({ general: general("Made up.", "high", c(1, "not in the file")), ideas: [{ text: "x", ...c(1, "not in the file") }] }),
    pay: area({ general: general("Fees in days.", "high", c(2, "late(loan)")), support: [] }),
  }, { claims: [claim("Idea only.", "pay.1"), claim("From a rule.", "truth.2", "truth"), claim("Unverified rule.", "bad"), claim("Rule with no support.", "pay")] });
  const s = screens(root, r);
  assert.deepEqual(s.drawer1.map((x) => [x.text, x.at, x.also]), [
    ["Rule with no support.", "src/a.js:2", 0],
    ["Idea only.", "src/a.js:1", undefined],
    ["From a rule.", "src/a.js:1", 2],
  ]);
  assert.ok(s.dropped.some((d) => d.what === "sentence: Unverified rule."));
  const md = render(r, s, "abc");
  assert.match(md, /From a rule\. \(src\/a\.js:1\) seen in 2 more place\(s\)\./);
  assert.match(md, /Rule with no support\. \(src\/a\.js:2\) seen in 0 more place\(s\)\./);
  assert.doesNotMatch(md, /Idea only\. .*seen in/);
});

test("a support citation counts only when its file differs from the example's and from the other supports'; details.md lists it once", () => {
  const r = research({
    truth: area({ general: general("Loans count whole days.", "high", c(1, "days(loan)")), support: [c(1, "days(loan)"), c(2, "late(loan)"), at("./src/b.js", 1, "late(loan)"), at("src/b.js", 1, "late(loan)"), at(join(root, "src/b.js"), 1, "late(loan)")] }),
  }, { claims: [claim("From a rule.", "truth")] });
  const s = screens(root, r);
  assert.equal(s.drawer1[0].also, 1);
  assert.ok(!("general" in s.drawer1[0]));
  assert.match(details(r, s, mechanism(root, r), root), /src\/a\.js:1, \.\/src\/b\.js:1\n/);
});

test("details.md lists a named general rule in full with its example and every verified support; a rule a shown sentence names is not in the lost list", () => {
  const r = research({
    truth: area({ general: general("Loans count whole days.", "high", c(1, "days(loan)")), support: [at("src/b.js", 1, "late(loan)"), c(9, "nope")], ideas: [{ text: "Unnamed idea.", ...c(3, "old(loan)") }] }),
  }, { claims: [claim("Loans count whole days.", "truth")] });
  const d = details(r, screens(root, r), mechanism(root, r), root);
  assert.match(d, /### 1\. Loans count whole days\.\n\n- Loans count whole days\. \(code; risk high: wrong due dates\) src\/a\.js:1, src\/b\.js:1\n/);
  assert.ok(!d.includes("src/a.js:9"));
  assert.doesNotMatch(d, /## Rules no sentence shows[\s\S]*\[truth\] Loans count/);
});

test("a sentence that names an area whose general rule did not verify is dropped, even beside a verified idea; its idea stays in the detail", () => {
  const r = research({
    bad: area({ general: general("Wide and unproven.", "high", c(1, "not in the file")), ideas: [{ text: "Small idea.", ...c(2, "late(loan)") }] }),
  }, { claims: [claim("Wide and unproven.", "bad", "bad.1"), claim("Small idea.", "bad.1")] });
  const s = screens(root, r);
  assert.deepEqual(s.drawer1.map((x) => x.text), ["Small idea."]);
  assert.equal(s.dropped.find((d) => d.what === "sentence: Wide and unproven.").reason, "its general rule did not verify");
});

test("a sentence naming an absent area whose general rule did not verify is dropped, and its failed idea gets a Dropped line", () => {
  const r = research({
    pay: area({ status: "absent", general: general("Wide and unproven.", "high", c(1, "not in the file")), ideas: [{ text: "Good idea.", ...c(2, "late(loan)") }, { text: "Bad idea.", ...c(3, "not in the file") }] }),
  }, { claims: [claim("Wide and unproven.", "pay", "pay.1"), claim("Good idea.", "pay.1")] });
  const s = screens(root, r);
  assert.deepEqual(s.drawer1.map((x) => x.text), ["Good idea."]);
  assert.equal(s.dropped.find((d) => d.what === "sentence: Wide and unproven.").reason, "its general rule did not verify");
  assert.ok(s.dropped.some((d) => d.what === "idea: Bad idea."));
});

test("an idea or a support citation that fails gets a Dropped line, and the count includes it", () => {
  const r = research({
    truth: area({ general: general("r", "low", c(1, "days(loan)")), support: [c(9, "nope"), at("src/b.js", 1, "late(loan)")], ideas: [{ text: "Fake idea.", ...c(1, "zzz") }, { text: "Fine.", ...c(2, "late(loan)") }] }),
  }, { claims: [claim("Fine.", "truth.2")] });
  const s = screens(root, r);
  assert.deepEqual(s.dropped.map((d) => [d.area, d.what]), [["truth", "idea: Fake idea."], ["truth", "support: r"]]);
  assert.match(render(r, s, "abc"), /## Dropped\n\n- truth: idea: Fake idea\. src\/a\.js:1 "zzz"\n- truth: support: r src\/a\.js:9 "nope"\n/);
});

test("a citation whose file is a folder does not verify and does not throw", () => {
  const r = research({ truth: area({ general: general("r", "low", c(1, "days(loan)")), ideas: [{ text: "In a folder.", file: "src/dir", line: 1, quote: "x" }] }) }, { claims: [claim("In a folder.", "truth.1")] });
  const s = screens(root, r);
  assert.equal(s.drawer1.length, 0);
  assert.ok(s.dropped.some((d) => d.what === "idea: In a folder."));
});

test("the second page: the first 12 of drawer1LeftOut, and the rest is counted beyond in the one left-out line", () => {
  const r = research({ truth: area({ general: general("r", "low", c(1, "days(loan)")) }) }, {
    claims: Array.from({ length: MAX_RULES + 14 }, (_, i) => claim(`sentence ${String(i).padStart(2, "0")}`, "truth.1")),
  });
  const s = screens(root, r);
  assert.equal(s.drawer1.length, MAX_RULES);
  assert.ok(!("drawer1More" in s));
  assert.equal(s.drawer1LeftOut.length, 14);
  const md = render(r, s, "abc");
  assert.match(md, /Left out of this screen: 14 sentence\(s\): 12 on the second page, 2 beyond it, not asked\./);
  assert.doesNotMatch(md, /Second page:|they are in the research, not asked/);
  const d = details(r, s, mechanism(root, r), root);
  assert.match(d, /### 13\. sentence 12\n/);
  assert.ok(!d.includes("sentence 24"));
});

test("with nothing left out there is no second page and no line for it", () => {
  const r = research({ truth: area({ general: general("r", "low", c(1, "days(loan)")) }) }, { claims: [claim("One.", "truth.1")] });
  const s = screens(root, r);
  assert.deepEqual(s.drawer1LeftOut, []);
  assert.doesNotMatch(render(r, s, "abc"), /second page/);
});

const FEE = "A fee never changes after the loan is returned.";
const kinds = (more = {}) => ({ snap: { status: "found", general: { rule: FEE, basis: "code", ...c(1, "days(loan)") }, rules: [{ rule: "Same in b.", ...at("src/b.js", 1, "late(loan)") }, { rule: "Same in c.", ...at("src/c.js", 1, "old(loan)") }] }, ...more });

test("a sentence naming kind:<kind> shows the kind's own citation only: its other rules are not other places of it", () => {
  const r = research({ pay: area({ ideas: [{ text: "i", ...c(2, "late(loan)") }] }) }, { claims: [claim("Idea only.", "pay.1"), claim("Fees stay.", "kind:snap")] }, { kinds: kinds() });
  const s = screens(root, r);
  assert.deepEqual(s.drawer1.map((x) => [x.text, x.at, x.also]), [["Fees stay.", "src/a.js:1", undefined], ["Idea only.", "src/a.js:2", undefined]]);
  const md = render(r, s, "abc");
  assert.match(md, /Fees stay\. \(src\/a\.js:1\)\n/);
  assert.doesNotMatch(md, /seen in/);
});

test("a sentence naming a kind that does not resolve is dropped with the reason, whatever the kind's status", () => {
  const absentWithRule = { status: "absent", general: { rule: "An absent kind's rule.", basis: "code", ...c(1, "days(loan)") }, rules: [] };
  const r = research({ pay: area() }, { claims: [claim("A.", "kind:snap", "pay.1"), claim("B.", "kind:gone"), claim("C.", "kind:abs")] }, { kinds: kinds({ abs: absentWithRule }) });
  r.kinds.snap.general.quote = "not in the file";
  const s = screens(root, r);
  assert.deepEqual(s.drawer1, []);
  for (const t of ["A.", "B.", "C."]) assert.equal(s.dropped.find((d) => d.what === `sentence: ${t}`).reason, "its general rule did not verify");
});

test("a sentence naming a verified rule and a failed one is shown with the verified one's citation; each failed rule has its own dropped line", () => {
  const r = research({ truth: area({ general: general("r", "low", c(2, "late(loan)")) }) }, { claims: [claim("Both.", "kind:snap", "truth"), claim("Neither.", "kind:snap", "kind:gone")] }, { kinds: kinds() });
  r.kinds.snap.general.quote = "not in the file";
  const s = screens(root, r);
  assert.deepEqual(s.drawer1.map((x) => [x.text, x.at, x.also, x.risk]), [["Both.", "src/a.js:2", 0, "low"]]);
  const lines = s.dropped.filter((d) => d.area === "plain").map((d) => `${d.what} | ${d.reason}`);
  assert.deepEqual(lines, ["rule kind:snap, named by: Both. | did not verify", "sentence: Neither. | its general rule did not verify", "rule kind:snap, named by: Neither. | did not verify", "rule kind:gone, named by: Neither. | did not verify"]);
  assert.match(render(r, s, "abc"), /- plain: rule kind:snap, named by: Both\. did not verify\n/);
});

test("the first page: one list by risk; inside a risk, general rules first (a kind's and an area-only one in turn), then ideas", () => {
  const rule = (risk) => general("r", risk, c(1, "days(loan)"));
  const r = research({ a1: area({ general: rule("low") }), a2: area({ general: rule("high") }), a3: area({ general: rule("medium") }), a4: area({ general: rule("high") }), a5: area({ general: rule("high"), ideas: [{ text: "i", ...c(2, "late(loan)") }] }), a6: area({ ideas: [{ text: "i", ...c(1, "days(loan)") }] }) }, {
    claims: [claim("I-none-1.", "a6.1"), claim("A-low.", "a1"), claim("K1.", "kind:snap"), claim("A-high-1.", "a2"), claim("A-med.", "a3"), claim("K2.", "kind:idem"), claim("I-high.", "a5.1"), claim("A-high-2.", "a4"), claim("K3 and area.", "kind:txn", "a1")],
  }, { kinds: kinds({ idem: kinds().snap, txn: kinds().snap }) });
  const s = screens(root, r);
  assert.deepEqual(s.drawer1.slice(0, MAX_RULES).map((x) => x.text), ["A-high-1.", "A-high-2.", "I-high.", "A-med.", "K3 and area.", "A-low.", "K1.", "K2.", "I-none-1."]);
  const both = s.drawer1.find((x) => x.text === "K3 and area.");
  assert.ok(both.at === "src/a.js:1" && !("also" in both));
  const twelve = research({ a1: area({ general: general("r", "low", c(1, "days(loan)")) }) }, { claims: Array.from({ length: 13 }, (_, i) => claim(`S${i}.`, i < 5 ? "a1.1" : "a1")) });
  const t = screens(root, twelve);
  assert.deepEqual([t.drawer1.length, t.drawer1LeftOut.map((x) => x.text)], [12, ["S4."]]);
  assert.deepEqual(t.drawer1.slice(0, 2).map((x) => x.text), ["S10.", "S11."]);
});

test("details.md lists a shown kind's general rule once under its sentence, an unshown one once in the mechanism section; no 'undefined' anywhere", () => {
  const r = research({}, { claims: [claim("Fees stay.", "kind:snap")] }, { kinds: kinds() });
  const d = details(r, screens(root, r), mechanism(root, r), root);
  assert.match(d, /### 1\. Fees stay\.\n\n- A fee never changes after the loan is returned\. \(code\) src\/a\.js:1\n/);
  assert.equal(d.split("A fee never changes").length, 2);
  assert.match(d, /### snap\n\n- Same in b\. \(code\) src\/b\.js:1\n- Same in c\./);
  const u = research({}, { claims: [] }, { kinds: kinds() });
  const du = details(u, screens(root, u), mechanism(root, u), root);
  assert.match(du, /- general: A fee never changes after the loan is returned\./);
  assert.equal(du.split("A fee never changes").length, 2);
  assert.ok(!du.includes("undefined") && !d.includes("undefined"));
  assert.ok(!du.includes("Rules no sentence shows"));
});

test("the same sentences in the reverse order give the same two pages: the script's own order breaks ties, never the agent's", () => {
  const rule = (risk) => general("r", risk, c(1, "days(loan)"));
  const areas = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`a${i}`, area({ general: rule("high"), ideas: [{ text: "i", ...c(1, "days(loan)") }, { text: "j", ...c(2, "late(loan)") }] })]));
  const k = kinds({ idem: kinds().snap, txn: kinds().snap, values: kinds().snap });
  const claims = [
    ...["snap", "idem", "txn", "values"].map((x) => claim(`K ${x}.`, `kind:${x}`)),
    ...Object.keys(areas).map((a) => claim(`Area ${a}.`, a)),
    ...Object.keys(areas).flatMap((a) => [claim(`Idea ${a}.2.`, `${a}.2`), claim(`Idea ${a}.1.`, `${a}.1`)]),
    claim("Both ways.", "a3.1", "a1.2"), claim("Both ways.", "a1.2", "a3.1"),
  ];
  const pages = (list) => { const s = screens(root, research(areas, { claims: list }, { kinds: k })); return [s.drawer1.map((x) => x.text), s.drawer1LeftOut.map((x) => x.text)]; };
  const fwd = pages(claims);
  assert.deepEqual(fwd[0], ["Area a0.", "Area a1.", "Area a2.", "Area a3.", "Area a4.", "Area a5.", "Area a6.", "Area a7.", "Area a8.", "Idea a0.1.", "Idea a0.2.", "Idea a1.1."]);
  assert.deepEqual(pages([...claims].reverse()), fwd);
  assert.deepEqual(pages(claims.map((x) => ({ ...x, from: [...x.from].reverse() }))), fwd);
  assert.ok(fwd[1].length > 0);
});

test("screen 1 is one list by risk: a high sentence of an area goes before a medium sentence of a kind", () => {
  const med = kinds({ snap: { ...kinds().snap, general: { ...kinds().snap.general, risk: "medium", cost: "x" } } });
  const r = research({ a1: area({ general: general("r", "high", c(1, "days(loan)")) }) }, { claims: [claim("K medium.", "kind:snap"), claim("Area high.", "a1")] }, { kinds: med });
  assert.deepEqual(screens(root, r).drawer1.map((x) => x.text), ["Area high.", "K medium."]);
});

test("with more sentences than one page holds, every high-risk sentence is on the first page before any lower one", () => {
  const areas = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`a${i}`, area({ general: general("r", i < 13 ? "high" : "low", c(1, "days(loan)")) })]));
  const hi = kinds({ snap: { ...kinds().snap, general: { ...kinds().snap.general, risk: "low", cost: "x" } } });
  const claims = [claim("Kind low.", "kind:snap"), ...Object.keys(areas).map((a) => claim(`Area ${a}.`, a))];
  const s = screens(root, research(areas, { claims }, { kinds: hi }));
  assert.equal(s.drawer1.length, MAX_RULES);
  assert.ok(s.drawer1.every((x) => x.risk === "high"));
  assert.deepEqual(s.drawer1LeftOut.map((x) => x.risk).sort(), ["high", "low", "low"]);
});

test("a question about an exception carries the place where the rule itself holds", () => {
  const s = screens(root, research({ truth: area({
    general: general("Loans count whole days.", "high", c(1, "days(loan)")),
    exceptions: [at("src/b.js", 1, "late(loan)")].map((e) => ({ ...e, how: "counts hours" })),
  }) }));
  assert.match(s.drawer2.find((g) => g.kind === "exceptions").text, /The rule itself holds at src\/a\.js:1\./);
});

test("inside one risk a kind's sentence and an area's alternate, as before", () => {
  const hi = (id) => ({ ...kinds().snap, general: { ...kinds().snap.general, risk: "high", cost: "x" } });
  const areas = { a1: area({ general: general("r", "high", c(1, "days(loan)")) }), a2: area({ general: general("r", "high", c(1, "days(loan)")) }) };
  const r = research(areas, { claims: [claim("A1.", "a1"), claim("A2.", "a2"), claim("K1.", "kind:snap"), claim("K2.", "kind:idem")] }, { kinds: { snap: hi(), idem: hi() } });
  assert.deepEqual(screens(root, r).drawer1.map((x) => x.text), ["K1.", "A1.", "K2.", "A2."]);
});

test("a question about a contradicted written rule never points at the area's general rule as the place where that written rule holds", () => {
  const s = screens(root, research({ truth: area({
    general: general("Loans count whole days.", "high", c(1, "days(loan)")),
    contradicted: [at("src/b.js", 1, "late(loan)")].map((e) => ({ ...e, written: "Fees are charged only after the due date.", wfile: "README.md", wline: 1, wquote: "whole days", how: "it charges early" })),
  }) }));
  const q = s.drawer2.find((g) => g.kind === "contradicted");
  assert.doesNotMatch(q.text, /The rule itself holds at/);
});

test("a screen 2 item with a blank how or risk is dropped with a line, never asked with empty text", () => {
  const s = screens(root, research({ truth: area({
    general: general("r", "low", c(1, "days(loan)")),
    contradicted: [c(2, "late(loan)", { written: "Whole days.", wfile: "README.md", wline: 1, wquote: "whole days", how: "  " })],
    exceptions: [c(3, "old(loan)", { how: "" }), c(2, "late(loan)", { how: "counts hours" })],
    unprotected: [c(2, "late(loan)", { risk: " " })],
  }), state: area({ general: general("r", "low", c(1, "days(loan)")), exceptions: [c(3, "old(loan)")] }) }));
  assert.deepEqual(s.drawer2.map((g) => g.kind), ["exceptions"]);
  assert.match(s.drawer2[0].text, /in 1 place: src\/a\.js:2 \(counts hours\)/);
  assert.deepEqual(s.dropped.map((d) => [d.area, d.what.split(":")[0], d.reason]), [["truth", "exception", "no written how"], ["truth", "contradicted", "no written how"], ["truth", "unprotected", "no written risk"], ["state", "exception", "no written how"]]);
  assert.ok(!render(research({}), s, "abc").includes("undefined"));
});

test("a citation spelled through a link of the project root, or through its real path, verifies and is shown repo-relative", () => {
  const linkDir = mkdtempSync(join(tmpdir(), "xwf-link-"));
  test.after(() => rmSync(linkDir, { recursive: true, force: true }));
  const link = join(linkDir, "p");
  symlinkSync(root, link);
  const real = realpathSync(root);
  for (const [base, file] of [[link, join(real, "src/a.js")], [real, join(link, "src/a.js")], [link, join(link, "src/a.js")]]) {
    const r = research({ truth: area({ general: general("Loans count whole days.", "high", at(file, 1, "days(loan)")), support: [at(file, 1, "days(loan)"), at(join(real, "src/b.js"), 1, "late(loan)"), at(join(link, "src/b.js"), 1, "late(loan)")] }) }, { claims: [claim("From a rule.", "truth")] });
    const s = screens(base, r);
    assert.deepEqual(s.drawer1.map((x) => [x.at, x.also]), [["src/a.js:1", 1]], base + " " + file);
    assert.deepEqual(s.dropped, []);
  }
});

test("a verdict with no citation at all is dropped with the reason no citation, not with undefined", () => {
  const m = mechanism(root, research({}, undefined, { kinds: { values: { status: "found", rules: [], verdicts: [{ id: "W1", verdict: "enforced" }, { id: "W2", verdict: "contradicted", ...c(2, "zzz") }] } } }));
  assert.deepEqual(m.dropped.map((d) => [d.what, d.reason]), [["verdict W1 enforced", "no citation"], ["verdict W2 contradicted", undefined]]);
  const md = render(research({}), { drawer1: [], drawer1LeftOut: [], drawer2: [], drawer2LeftOut: [], drawer3: [], noRule: [], notPresent: [], dropped: m.dropped }, "abc");
  assert.match(md, /- values: verdict W1 enforced no citation\n/);
  assert.ok(!md.includes("undefined"));
});

test("screen 1 tells the owner to strike habits and to correct the level of a rule stated too narrowly", () => {
  const r = research({ truth: area({ general: general("r", "low", c(1, "days(loan)")) }) }, { claims: [claim("One.", "truth.1")] });
  assert.match(render(r, screens(root, r), "abc"), /\n## Screen 1: what the code shows\n\nStrike what is habit and not rule; correct the level where a rule is stated too narrowly\.\n\n1\. One\./);
});

test("details.md: an idea named only by a sentence of the second page is listed under it; one named only beyond the second page is in the lost list", () => {
  const n = MAX_RULES + 12 + 2;
  const r = research({ truth: area({ ideas: Array.from({ length: n }, (_, i) => ({ text: `idea ${i + 1}`, ...c(1, "days(loan)") })) }) }, { claims: Array.from({ length: n }, (_, i) => claim(`sentence ${String(i + 1).padStart(2, "0")}`, `truth.${i + 1}`)) });
  const s = screens(root, r);
  const d = details(r, s, mechanism(root, r), root);
  const [named, lost] = d.split("## Rules no sentence shows");
  assert.match(named, /### 13\. sentence 13\n\n- idea 13 src\/a\.js:1\n/);
  assert.match(named, /### 24\. sentence 24\n\n- idea 24 /);
  assert.ok(!lost.includes("[truth.13]") && !lost.includes("[truth.24]"));
  assert.match(lost, /\[truth\.25\] idea 25 /);
  assert.match(lost, /\[truth\.26\] idea 26 /);
  assert.ok(!named.includes("idea 25"));
});
