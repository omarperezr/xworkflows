import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sum } from "./research.mjs";
import { screens } from "./screens.mjs";

const KINDS = ["values", "snap", "srvw", "delta", "idem", "txn", "access", "batch", "domain", "compat", "conc", "input"];
const text = readFileSync(new URL("./research.workflow.js", import.meta.url), "utf8");
const body = text.replace(/export const meta = \{[\s\S]*?\n\};\n/, "");
const AsyncFunction = (async () => {}).constructor;

const PROFILE = {
  what: "A shop",
  languages: ["js"],
  docs: [{ file: "README.md", lines: 40 }],
  areas: [{ key: "truth", present: "yes", why: "prices", where: ["src"], patterns: ["price"] }, { key: "order", present: "no", why: "", where: [], patterns: [] }],
  projectAreas: [{ key: "shelf", name: "Shelves", covers: "stock", why: "lost sales", where: [], patterns: [] }],
};
const cite = { file: "a.js", line: 2, quote: "x" };

async function run(args, over = {}) {
  const calls = [];
  const agent = async (prompt, opts) => {
    calls.push({ prompt, opts });
    if (over[opts.label]) return over[opts.label](prompt, opts);
    if (opts.label === "profile") return PROFILE;
    if (opts.agentType === "mechanism" && opts.label.startsWith("k:")) return { kind: opts.label.slice(2), status: "found", verdicts: [], rules: [], notChecked: [] };
    if (opts.label.startsWith("a:")) return { area: opts.label.slice(2), status: "found", general: { rule: `rule of ${opts.label}`, short: `short of ${opts.label}`, basis: "code", risk: "high", cost: "c", ...cite }, second: { rule: "second", risk: "low", cost: "c", ...cite }, ideas: [{ text: `idea of ${opts.label}`, ...cite }, { text: `other of ${opts.label}`, ...cite }], support: [], exceptions: [], contradicted: [], unprotected: [], commentRules: [], details: [], doubted: [], notChecked: [] };
    if (opts.label === "plain") return { claims: [{ text: "One idea.", from: ["truth"] }], rest: [] };
    if (opts.label === "questions") return { questions: [] };
    if (opts.label.startsWith("docs") || opts.label === "checks") return { rules: [], notes: [], notRead: [] };
    return { lines: [] };
  };
  const parallel = (thunks) => Promise.all(thunks.map((t) => t()));
  const fn = new AsyncFunction("args", "agent", "parallel", "pipeline", "log", "phase", body);
  const result = await fn(args, agent, parallel, () => {}, () => {}, () => {});
  return { calls, result };
}

test("the script is fixed, a literal meta, no filesystem", () => {
  assert.match(text, /export const meta = \{[\s\S]*?name: "adapt-research"/);
  assert.doesNotMatch(body, /export const meta|require\(|import |Date\.now|Math\.random|\bfs\b|readFile/);
});

test("the result has version 3 and its keys in order, sum over all but itself", async () => {
  const { result } = await run({ root: ".", zeroHits: [] });
  assert.deepEqual(Object.keys(result), ["version", "profile", "areaOrder", "topics", "written", "areas", "kinds", "plain", "questions", "sum"]);
  assert.equal(result.version, 3);
  const { sum: s, ...rest } = result;
  assert.equal(s, sum(JSON.stringify(rest)));
  assert.deepEqual(result.areaOrder, ["truth", "state", "access", "boundary", "compat", "order", "limits", "shelf"]);
  assert.equal(result.areas.order.status, "not-present");
  assert.deepEqual(result.areas.order.doubted, []);
});

test("no profile: version 3, sum over the same keys", async () => {
  const { result, calls } = await run({ root: ".", zeroHits: [] }, { profile: () => null });
  assert.equal(calls.length, 1);
  assert.deepEqual(result, { version: 3, profile: null, sum: sum(JSON.stringify({ version: 3, profile: null })) });
});

test("no topic agent of the shipped script: no t4 areas answer, kinds come from the scan", async () => {
  const { calls } = await run({ root: ".", zeroHits: [] });
  assert.ok(calls.every((c) => !/^Topic \d\.$/m.test(c.prompt) || c.opts.agentType === "explore"));
  assert.ok(!calls.some((c) => /say whether the project has that area/.test(c.prompt)));
});

test("one mechanism agent per kind the scan found, unchanged; zero-hit kinds are not-present", async () => {
  const { calls, result } = await run({ root: ".", zeroHits: ["conc", "snap"] });
  const k = calls.filter((c) => c.opts.label.startsWith("k:"));
  assert.deepEqual(k.map((c) => c.opts.label.slice(2)), KINDS.filter((x) => !["conc", "snap"].includes(x)));
  for (const c of k) {
    assert.equal(c.opts.agentType, "mechanism");
    assert.equal(c.opts.model, "sonnet");
    const p = c.opts.schema.properties;
    assert.equal(p.rules.maxItems, 3);
    assert.equal(p.verdicts.maxItems, 15);
    assert.deepEqual(c.opts.schema.required, ["kind", "status", "verdicts", "rules", "notChecked"]);
    assert.ok(c.prompt.includes("the first 15 rules") && c.prompt.includes("at most 3 details") && c.prompt.includes("A `contradicted` written rule never becomes the general rule."));
  }
  assert.deepEqual(Object.keys(result.kinds), KINDS);
  assert.equal(result.kinds.conc.status, "not-present");
  assert.equal(result.kinds.values.status, "found");
});

test("kind agents run beside the area agents, before the plain pass", async () => {
  let open = 0, both = false;
  const slow = (label) => async () => {
    open++;
    both ||= open > 1;
    await new Promise((r) => setTimeout(r, 5));
    open--;
    return label.startsWith("a:") ? { area: label.slice(2), status: "absent", support: [], exceptions: [], contradicted: [], unprotected: [], commentRules: [], doubted: [], details: [], notChecked: [] } : { kind: label.slice(2), status: "absent", verdicts: [], rules: [], notChecked: [] };
  };
  const over = { "a:truth": async (p, o) => slow(o.label)(), "k:values": async (p, o) => { assert.ok(open >= 1, "an area agent is running"); return slow(o.label)(); } };
  const { calls } = await run({ root: ".", zeroHits: [] }, over);
  assert.ok(both);
  assert.equal(calls[calls.length - 1].opts.label, "plain");
  assert.equal(calls.filter((c) => c.opts.label === "plain").length, 1);
});

test("an area answer can carry one doubted rule with a citation", async () => {
  const { calls } = await run({ root: ".", zeroHits: [] });
  const a = calls.find((c) => c.opts.label === "a:truth");
  const d = a.opts.schema.properties.doubted;
  assert.equal(d.maxItems, 1);
  assert.deepEqual(d.items.required, ["rule", "why", "file", "line", "quote"]);
  assert.ok(a.opts.schema.required.includes("doubted"));
  assert.match(a.prompt, /`doubted`[\s\S]*reason to doubt/);
});

test("the plain agent: language, rule ids, 14 words, 12 claims, nothing widened", async () => {
  const en = await run({ root: ".", zeroHits: [] });
  const p = en.calls.find((c) => c.opts.label === "plain");
  assert.match(p.prompt, /Write in English\./);
  assert.ok(p.prompt.includes('"id":"truth.1"') && p.prompt.includes('"id":"truth.2"') && !p.prompt.includes('"id":"truth.3"'));
  assert.ok(p.prompt.includes("idea of a:truth") && p.prompt.includes("other of a:truth"));
  assert.ok(!p.prompt.includes("rule of a:truth") && !p.prompt.includes("truth#2"));
  assert.ok(p.prompt.includes('{"id":"truth","rule":"short of a:truth","risk":"high"}'));
  assert.match(p.prompt, /general rules? first|from a general rule go first/i);
  assert.match(p.prompt, /high, medium, low/);
  assert.match(p.prompt, /only repeats its own area's general rule/);
  assert.match(p.prompt, /never split/i);
  assert.match(p.prompt, /14 words/);
  assert.match(p.prompt, /12/);
  assert.match(p.prompt, /never widen/i);
  assert.deepEqual(p.opts.schema.required, ["claims", "rest"]);
  assert.deepEqual(p.opts.schema.properties.claims.items.required, ["text", "from"]);
  const es = await run({ root: ".", zeroHits: [], language: "Spanish" });
  assert.match(es.calls.find((c) => c.opts.label === "plain").prompt, /Write in Spanish\./);
  assert.deepEqual(es.result.plain, { claims: [{ text: "One idea.", from: ["truth"] }], rest: [] });
});

test("an area answer carries at most four ideas, each cited, and the prompt says how to prove one", async () => {
  const { calls } = await run({ root: ".", zeroHits: [] });
  const a = calls.find((c) => c.opts.label === "a:truth");
  const i = a.opts.schema.properties.ideas;
  assert.equal(i.maxItems, 4);
  assert.deepEqual(i.items.required, ["text", "file", "line", "quote"]);
  assert.ok(a.opts.schema.required.includes("ideas"));
  assert.match(a.prompt, /14 words/);
  assert.match(a.prompt, /no more than its cited line/);
  assert.match(a.prompt, /"all", "always", "never" or "every"[\s\S]*enforces it for all cases/);
});

test("an area's general rule gains a short form, asked in one line, and the plain agent skips areas without a rule", async () => {
  const { calls } = await run({ root: ".", zeroHits: [] }, { "a:state": async () => ({ area: "state", status: "absent", support: [], exceptions: [], contradicted: [], unprotected: [], commentRules: [], doubted: [], details: [], ideas: [{ text: "only idea", ...cite }], notChecked: [] }) });
  const a = calls.find((c) => c.opts.label === "a:truth");
  const g = a.opts.schema.properties.general;
  assert.equal(g.properties.short.type, "string");
  assert.ok(g.required.includes("short"));
  assert.match(a.prompt, /`short`[^\n]*14 words at most/);
  const p = calls.find((c) => c.opts.label === "plain").prompt;
  assert.ok(!p.includes('"id":"state"') && p.includes('"id":"state.1"'));
  assert.ok(p.indexOf('"id":"truth"') < p.indexOf('"id":"truth.1"'));
});

test("a failed plain agent leaves plain null", async () => {
  const { result } = await run({ root: ".", zeroHits: [] }, { plain: () => null });
  assert.equal(result.plain, null);
});

test("every agent that reads the repository carries the index rule and the history rule", async () => {
  const { calls } = await run({ language: "English", kinds: KINDS, root: "/p" });
  const readers = calls.filter((c) => c.opts.label !== "plain" && c.opts.label !== "questions");
  const labels = new Set(readers.map((c) => c.opts.label.replace(/\d+$/, "").replace(/:.*/, ":")));
  for (const l of ["profile", "t", "docs", "checks", "a:", "k:"]) assert.ok(labels.has(l), l);
  for (const c of readers) {
    assert.ok(c.prompt.includes("Ask `graphify query` before opening files."), c.opts.label);
    assert.ok(c.prompt.includes("no `git show <sha>:<path>`, no `git log -p`; `git diff` and `git stash show` only with `--stat` or `--name-only`."), c.opts.label);
  }
});

// The ids the questions agent may answer must be the ids screens() looks up.
test("every question id the workflow asks is a drawer3 id", () => {
  const ids = [...text.match(/const QUESTIONS = \{([\s\S]*?)\n\};/)[1].matchAll(/^\s*"([^"]+)":/gm)].map((m) => m[1]);
  const drawer3 = screens(process.cwd(), { areas: {}, areaOrder: [], plain: { claims: [], rest: [] }, questions: [] }).drawer3.map((q) => q.id);
  assert.deepEqual(ids, drawer3);
});

test("the questions agent schema and prompt carry exactly the drawer3 ids", async () => {
  const drawer3 = screens(process.cwd(), { areas: {}, areaOrder: [], plain: { claims: [], rest: [] }, questions: [] }).drawer3.map((q) => q.id);
  const { calls } = await run({ root: ".", zeroHits: [] });
  const q = calls.find((c) => c.opts.label === "questions");
  assert.deepEqual(q.opts.schema.properties.questions.items.properties.id.enum, drawer3);
  for (const id of drawer3) assert.ok(q.prompt.includes(`\`${id}\``), id);
  assert.ok(!q.prompt.includes("G-provisional"));
});

test("the six topic agents run as t1 to t6, only t1 to t3 name config keys", async () => {
  const { calls, result } = await run({ root: ".", zeroHits: [] });
  const t = calls.filter((c) => /^t\d+$/.test(c.opts.label));
  const labels = ["t1", "t2", "t3", "t4", "t5", "t6"];
  assert.deepEqual(t.map((c) => c.opts.label), labels);
  assert.deepEqual(Object.keys(result.topics), labels);
  for (const c of t) assert.equal(/Also return one line per key with heading "config"/.test(c.prompt), ["t1", "t2", "t3"].includes(c.opts.label), c.opts.label);
});

test("the area prompt looks for the contradicting case and keeps the rule's key words in short", async () => {
  const { calls } = await run({ root: ".", zeroHits: [] });
  const p = calls.find((c) => c.opts.label === "a:truth").prompt;
  assert.ok(p.includes("look for the case that contradicts it"));
  assert.match(p, /without the guard/);
  assert.ok(p.includes("return that case under `exceptions`"));
  assert.match(p, /key words/);
  assert.ok(p.includes('It has no "all", "always", "never" or "every" unless'));
  assert.ok(p.includes('An idea about every case ("all", "always", "never" or "every")'));
  assert.match(p, /a loan is counted in whole days in the library's time zone/);
});

test("the plain agent keeps key words and the default language is English", async () => {
  const { calls } = await run({ root: ".", zeroHits: [] });
  const p = calls.find((c) => c.opts.label === "plain").prompt;
  assert.match(p, /Write in English\./);
  assert.match(p, /key words/);
  assert.match(p, /vaguer/);
  const es = await run({ root: ".", zeroHits: [], language: "Spanish" });
  assert.match(es.calls.find((c) => c.opts.label === "plain").prompt, /Write in Spanish\./);
});
