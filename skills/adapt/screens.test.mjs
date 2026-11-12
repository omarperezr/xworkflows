import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { screens, render, details, mechanism, MAX_RULES, MAX_GAPS, MAX_WORDS } from "./screens.mjs";

const root = mkdtempSync(join(tmpdir(), "xwf-screens-"));
mkdirSync(join(root, "src"));
writeFileSync(join(root, "src/a.js"), "const due = days(loan);\nlate(loan);\nold(loan);\n");
writeFileSync(join(root, "README.md"), "Loans are counted in whole days.\n");
test.after(() => rmSync(root, { recursive: true, force: true }));

const c = (line, quote, more = {}) => ({ file: "src/a.js", line, quote, ...more });
const area = (more = {}) => ({ status: "found", ideas: [{ text: "i", ...c(1, "days(loan)") }], support: [], exceptions: [], contradicted: [], unprotected: [], commentRules: [], details: [], notChecked: [], ...more });
const general = (rule, risk, cite) => ({ rule, basis: "code", risk, cost: "wrong due dates", ...cite });
const research = (areas, plain = { claims: [], rest: [] }, more = {}) => ({ version: 3, profile: { what: "A lending desk." }, areaOrder: Object.keys(areas), areas, written: { count: 0, fromChecks: 0 }, kinds: {}, plain, questions: [{ id: "B-mistake", lead: "The README says so.", options: [{ label: "A lost book", description: "it is the costliest", file: "README.md", line: 1, quote: "whole days" }] }], ...more });
const claim = (text, ...from) => ({ text, from });

test("a sentence is shown only when an idea it names has a verified citation; its citation is the first verified idea's, never the general rule's", () => {
  const s = screens(root, research({
    truth: area({ general: general("Loans count whole days.", "medium", c(1, "days(loan)")), ideas: [{ text: "a", ...c(2, "late(loan)") }, { text: "b", ...c(3, "old(loan)") }, { text: "c", ...c(4, "not in the file") }] }),
    state: area({ general: general("Made up.", "high", c(1, "days(loan)")), ideas: [{ text: "d", ...c(1, "not in the file") }] }),
  }, { claims: [claim("Loans count whole days.", "truth.1"), claim("Made up.", "state.1"), claim("Nothing names an idea.", "nowhere.1"), claim("Names a rule id.", "truth"), claim("Late old loans.", "truth.3", "truth.2", "truth.1")], rest: [] }));
  assert.deepEqual(s.drawer1.map((x) => [x.text, x.at, x.risk]), [
    ["Loans count whole days.", "src/a.js:2", "medium"],
    ["Late old loans.", "src/a.js:3", "medium"],
  ]);
  assert.deepEqual(s.drawer1.map((x) => x.from), [["truth.1"], ["truth.3", "truth.2", "truth.1"]]);
  assert.deepEqual(s.dropped.filter((d) => d.area === "plain").map((d) => d.what), ["sentence: Made up.", "sentence: Nothing names an idea.", "sentence: Names a rule id."]);
  assert.ok(s.dropped.filter((d) => d.area === "plain").every((d) => d.reason));
});

test("a sentence of 15 words is dropped with its reason; 14 words stay", () => {
  const w = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join("  ");
  assert.equal(MAX_WORDS, 14);
  const s = screens(root, research({ truth: area({ general: general("r", "low", c(1, "days(loan)")) }) }, { claims: [claim(w(14), "truth.1"), claim(w(15), "truth.1")], rest: [] }));
  assert.equal(s.drawer1.length, 1);
  assert.match(s.dropped.find((d) => d.what.startsWith("sentence: w0")).reason, /15 words/);
});

test("screen 1 holds 12; the rest and plain.rest are counted in the left-out line, never cut in silence", () => {
  const r = research({ truth: area({ general: general("r", "low", c(1, "days(loan)")) }) }, {
    claims: Array.from({ length: MAX_RULES + 2 }, (_, i) => claim(`sentence ${i}`, "truth.1")),
    rest: [claim("spare one", "truth.1"), claim("spare two", "truth.1")],
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
      support: [c(2, "late(loan)"), c(9, "nope")],
      commentRules: [{ text: "Never count hours.", ...c(3, "old(loan)") }, { text: "Made up comment.", ...c(3, "zzz") }],
    }),
  }, { claims: [claim("Loans count whole days.", "truth.1")], rest: [] }, {
    kinds: { values: { status: "found", general: { rule: "Round once.", basis: "code", ...c(1, "days(loan)") }, rules: [{ rule: "Round at the end.", ...c(2, "late(loan)") }, { rule: "Fake rule.", ...c(2, "zzz") }], notChecked: [] } },
  });
  const s = screens(root, r);
  const md = render(r, s, "abc");
  assert.match(md, /^---\ncommit: abc\nversion: 3\n---/);
  assert.doesNotMatch(md, /## Details/);
  const d = details(r, s, mechanism(root, r), root);
  assert.match(d, /Loans count whole days\.[\s\S]*src\/a\.js:1[\s\S]*src\/a\.js:2/);
  assert.match(d, /## Mechanism rules[\s\S]*values[\s\S]*Round once\.[\s\S]*Round at the end\./);
  assert.match(d, /## Rules found in comments[\s\S]*Never count hours\./);
  for (const bad of ["Fake rule.", "Made up comment.", "nope", "src/a.js:9"]) assert.ok(!d.includes(bad), bad);
});

test("mechanism keeps the shape of kinds.json: general, status, sorted by kind", () => {
  const m = mechanism(root, research({}, undefined, { kinds: {
    values: { status: "found", general: { rule: "Round once.", basis: "code", ...c(1, "days(loan)") }, rules: [] },
    snap: { status: "found", general: { rule: "Unproven.", basis: "code", ...c(1, "zzz") }, rules: [] },
    idem: { status: "absent", rules: [] },
    conc: { status: "not-present", rules: [] },
  } }));
  assert.deepEqual(m.errors, []);
  assert.deepEqual(JSON.parse(m.state), {
    conc: { general: null, status: "not-present" },
    idem: { general: null, status: "absent" },
    snap: { general: null, status: "absent" },
    values: { general: "Round once.", status: "found" },
  });
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

test("kinds.json never holds the text of a mechanism rule whose citation failed; its drop is a line", () => {
  const m = mechanism(root, { kinds: { snap: { status: "found", general: { rule: "Prices never change after the sale.", basis: "code", ...c(1, "not in the file") }, rules: [{ rule: "Fake detail.", ...c(2, "zzz") }] } } });
  const snap = JSON.parse(m.state).snap;
  assert.deepEqual(snap, { general: null, status: "absent" });
  assert.ok(!m.state.includes("Prices never change") && !m.lines.join("").includes("Prices never change"));
  assert.deepEqual(m.dropped.map((d) => [d.area, d.what]), [["snap", "general rule: Prices never change after the sale."], ["snap", "rule: Fake detail."]]);
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

test("details.md lists under each sentence its ideas with their citations, then the general rule of their area; a verified idea no shown sentence names has its own heading", () => {
  const r = research({
    truth: area({ general: general("Loans count whole days.", "high", c(1, "days(loan)")), ideas: [{ text: "Days are whole.", ...c(2, "late(loan)") }, { text: "Unnamed idea.", ...c(3, "old(loan)") }, { text: "Fake idea.", ...c(3, "zzz") }] }),
  }, { claims: [claim("Loans count whole days.", "truth.1")], rest: [] });
  const s = screens(root, r);
  const d = details(r, s, mechanism(root, r), root);
  assert.match(d, /### 1\. Loans count whole days\.\n\n- Days are whole\. src\/a\.js:2\n- Loans count whole days\. \(code; risk high: wrong due dates\) src\/a\.js:1\n/);
  assert.match(d, /## Rules no sentence shows\n\n- \[truth\.2\] Unnamed idea\. src\/a\.js:3\n/);
  assert.ok(!d.includes("Fake idea.") && !d.split("## Rules no sentence shows")[1].includes("Days are whole."));
});

test("verified sentences of plain.rest fill the free places of screen 1; the left-out line counts what remains", () => {
  const r = research({ truth: area({ general: general("r", "low", c(1, "days(loan)")) }) }, {
    claims: [claim("Made up.", "ghost.1"), claim("Good one.", "truth.1")],
    rest: [claim("Spare verified.", "truth.1"), claim("Spare made up.", "ghost.1")],
  });
  const s = screens(root, r);
  assert.deepEqual(s.drawer1.map((x) => x.text), ["Good one.", "Spare verified."]);
  assert.equal(s.drawer1LeftOut.length, 0);
  assert.equal(s.dropped.filter((d) => d.area === "plain").length, 2);
});

test("a verified sentence of plain.rest never pushes out one the plain agent chose", () => {
  const r = research({ lo: area({ general: general("r", "low", c(1, "days(loan)")) }), hi: area({ general: general("h", "high", c(2, "late(loan)")) }) }, {
    claims: Array.from({ length: MAX_RULES }, (_, i) => claim(`Chosen ${i}.`, "lo.1")),
    rest: [claim("Spare high.", "hi.1")],
  });
  const s = screens(root, r);
  assert.deepEqual(s.drawer1.map((x) => x.text), Array.from({ length: MAX_RULES }, (_, i) => `Chosen ${i}.`));
  assert.deepEqual(s.drawer1LeftOut.map((x) => x.text), ["Spare high."]);
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
  }, { claims: [claim("One.", "truth.1")], rest: [] });
  const d = details(r, screens(root, r), mechanism(root, r), root);
  assert.match(d, /SECOND TRUTH/);
  assert.match(d, /GENERAL STATE/);
});

test("a verified idea of an absent area is kept: not dropped, and in details.md", () => {
  const r = research({ pay: area({ status: "absent", ideas: [{ text: "Fees are kept in days.", ...c(1, "days(loan)") }] }) }, { claims: [claim("Fees count days.", "pay.1")], rest: [] });
  const s = screens(root, r);
  assert.equal(s.drawer1.length, 1, `sentence dropped: ${JSON.stringify(s.dropped)}`);
  assert.ok(details(r, s, mechanism(root, r), root).includes("Fees are kept"));
});

test("a sentence with no verified general rule shows no risk word and sorts after those that have one", () => {
  const r = research({
    bare: area({ general: general("bad", "high", c(1, "not in the file")) }),
    lo: area({ general: general("l", "low", c(1, "days(loan)")) }),
  }, { claims: [claim("No rule.", "bare.1"), claim("Low one.", "lo.1")], rest: [] });
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
  }, { claims: [claim("Medium.", "med.1"), claim("Low.", "lo.1"), claim("Merged.", "lo.1", "hi.1"), claim("High.", "hi.1")], rest: [] });
  assert.deepEqual(screens(root, r).drawer1.map((x) => [x.text, x.risk]), [["Merged.", "high"], ["High.", "high"], ["Medium.", "medium"], ["Low.", "low"]]);
});
