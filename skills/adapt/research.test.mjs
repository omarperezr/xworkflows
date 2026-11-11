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
    assert.equal(p.rules.maxItems, 5);
  }
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
