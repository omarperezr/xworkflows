import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const text = readFileSync(new URL("./triage.workflow.js", import.meta.url), "utf8");
const body = text.replace(/export const meta = \{[\s\S]*?\n\};\n/, "");
const AsyncFunction = (async () => {}).constructor;

const cards = (k) => Array.from({ length: k }, (_, i) => ({ n: i + 1, text: `card ${i + 1}`, origin: "review" }));
const ARGS = (k) => ({ cards: cards(k), agent: "xwf-pending-triage", model: "haiku" });
const inPrompt = (p) => JSON.parse(p.slice(p.indexOf("[")));
// a judge: even cards are findings with row "pending", odd cards are ordered
const judge = (p) => ({ results: inPrompt(p).map((c) => (c.n % 2 ? { n: c.n, kind: "ordered", row: null, reason: "asked" } : { n: c.n, kind: "finding", row: "pending", reason: "real" })) });

async function run(args, over = judge) {
  const calls = [];
  const agent = async (prompt, opts) => { calls.push({ prompt, opts }); return over(prompt, opts, calls.length); };
  const parallel = (t) => Promise.all(t.map((f) => f()));
  const fn = new AsyncFunction("args", "agent", "parallel", "log", "phase", body);
  return { calls, result: await fn(args, agent, parallel, () => {}, () => {}) };
}

test("45 cards are cut into 3 agents of 20, 20 and 5", async () => {
  const { calls, result } = await run(ARGS(45));
  assert.deepEqual(calls.map((c) => inPrompt(c.prompt).length), [20, 20, 5]);
  assert.ok(calls.every((c) => c.opts.agentType === "xwf-pending-triage" && c.opts.model === "haiku" && c.opts.schema));
  assert.equal(result.judged.length + result.ordered.length, 45);
  assert.deepEqual(result.notJudged, []);
});

test("a card no agent returned is in notJudged", async () => {
  const { result } = await run(ARGS(5), (p) => ({ results: judge(p).results.filter((r) => r.n !== 4) }));
  assert.deepEqual(result.notJudged, [4]);
  assert.ok(![...result.judged, ...result.ordered].some((r) => r.n === 4));
});

test("an ordered card carries no row, even when the agent gave one", async () => {
  const { result } = await run(ARGS(2), () => ({ results: [{ n: 1, kind: "ordered", row: "drop", reason: "asked" }, { n: 2, kind: "finding", row: "blocking", reason: "r" }] }));
  assert.deepEqual(result.ordered, [{ n: 1, kind: "ordered", row: null, reason: "asked" }]);
  assert.deepEqual(result.judged.map((r) => [r.n, r.row]), [[2, "blocking"]]);
});

test("a finding without a valid row is not judged", async () => {
  const { result } = await run(ARGS(1), () => ({ results: [{ n: 1, kind: "finding", row: null, reason: "r" }] }));
  assert.deepEqual(result.notJudged, [1]);
});

test("a failed chunk is asked once and its cards are not judged", async () => {
  const { calls, result } = await run(ARGS(25), (p) => (inPrompt(p)[0].n === 21 ? null : judge(p)));
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => c.opts.model === "haiku"));
  assert.deepEqual(result.notJudged, [21, 22, 23, 24, 25]);
});

test("the script is fixed: no filesystem", () => {
  assert.doesNotMatch(body, /export const meta|require\(|import |Date\.now|Math\.random|\bfs\b|readFile/);
});
