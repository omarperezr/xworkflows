import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const text = read("./dream.workflow.js");
const body = text.replace(/export const meta = \{[\s\S]*?\n\};\n/, "");
const AsyncFunction = (async () => {}).constructor;

const FILES = ["/t/one.txt", "/t/two.txt", "/t/three.txt"];
const MEMORY = "/w/docs/memory";
const ARGS = { sessions: FILES, memory: MEMORY, focus: "deploy habits", agents: { analyzer: "xwf-dream-analyzer", organizer: "xwf-dream-organizer" }, model: "haiku" };

async function run(args = ARGS, over = {}) {
  const calls = [];
  const agent = async (prompt, opts) => {
    calls.push({ prompt, opts, done: calls.filter((c) => c.finished).length });
    const c = calls[calls.length - 1];
    await new Promise((r) => setTimeout(r, 5));
    c.finished = true;
    if (over[opts.agentType]) return over[opts.agentType](prompt, opts, c);
    if (opts.label.startsWith("analyze")) return { proposals: [{ rule: "Never skip tests", session: opts.label }] };
    return { merged: 3, conflicts: 1 };
  };
  const parallel = (thunks) => Promise.all(thunks.map((t) => t()));
  const fn = new AsyncFunction("args", "agent", "parallel", "log", "phase", body);
  return { calls, result: await fn(args, agent, parallel, () => {}, () => {}) };
}

test("the script is fixed: a literal meta, no filesystem", () => {
  assert.match(text, /export const meta = \{[\s\S]*?name: "dream"/);
  assert.doesNotMatch(body, /export const meta|require\(|import |Date\.now|Math\.random|\bfs\b|readFile/);
});

test("one analyzer per file in parallel, then one organizer after all three", async () => {
  const { calls } = await run();
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.slice(0, 3).map((c) => c.opts.agentType), Array(3).fill("xwf-dream-analyzer"));
  assert.equal(calls[3].opts.agentType, "xwf-dream-organizer");
  assert.equal(calls[3].done, 3);
  assert.ok(calls.slice(0, 3).every((c) => c.done === 0));
  assert.ok(calls.every((c) => c.opts.model === "haiku" && c.opts.schema));
});

test("every prompt names its file and the memory folder; the focus reaches all", async () => {
  const { calls } = await run();
  calls.slice(0, 3).forEach((c, i) => assert.ok(c.prompt.includes(FILES[i])));
  for (const c of calls) {
    assert.ok(c.prompt.includes(MEMORY));
    assert.ok(c.prompt.includes("deploy habits"));
  }
});

test("no focus: no focus line in the prompts", async () => {
  const { calls } = await run({ ...ARGS, focus: "" });
  assert.ok(calls.every((c) => !/focus/i.test(c.prompt)));
});

test("an analyzer that returns nothing is counted in missing and the organizer still runs", async () => {
  const { calls, result } = await run(ARGS, { "xwf-dream-analyzer": (p, o) => (o.label === "analyze 2" ? null : { proposals: [] }) });
  assert.equal(calls.length, 4);
  assert.equal(result.missing, 1);
});

test("the result has the four keys", async () => {
  const { result } = await run();
  assert.deepEqual(Object.keys(result), ["merged", "conflicts", "proposals", "missing"]);
  assert.equal(result.merged, 3);
  assert.equal(result.conflicts, 1);
  assert.deepEqual(result.proposals, [1, 2, 3].map((i) => ({ rule: "Never skip tests", session: `analyze ${i}` })));
  assert.equal(result.missing, 0);
});

test("a rule an analyzer proposed is returned and never enters the organizer's prompt", async () => {
  const marker = "Always rotate the staging marker";
  const { calls, result } = await run(ARGS, { "xwf-dream-analyzer": () => ({ proposals: [{ rule: marker, session: "one" }] }) });
  assert.ok(!calls[3].prompt.includes(marker));
  assert.ok(JSON.stringify(calls[3].opts.schema).indexOf("proposals") === -1);
  assert.equal(result.proposals.length, 3);
  assert.equal(result.proposals[0].rule, marker);
});

for (const n of ["dream-analyzer", "dream-organizer"]) {
  test(`${n}: cheap tier, file tools only`, () => {
    const t = read(`../../agents/${n}.md`);
    assert.match(t, new RegExp(`^---\\nname: ${n}\\ndescription: [^\\n]+\\ntier: cheap\\n`));
    const tools = t.match(/^tools: (.*)$/m)[1];
    assert.equal(tools, "Read, Write, Edit, Glob, Grep");
    assert.doesNotMatch(tools, /Bash/);
  });
}

test("SKILL.md starts its body with the mark line", () => {
  const t = read("./SKILL.md");
  assert.match(t, /^---\nname: dream\ndescription: [^\n]+\n---\n\nBefore anything else, run `node \.xworkflows\/mark\.mjs dream` in the shell\.\n/);
});

test("SKILL.md follows the new commands of the scripts", () => {
  const t = read("./SKILL.md");
  assert.match(t, /branch\.mjs unseen/);
  assert.match(t, /branch\.mjs close --worktree <worktree> --out <out>/);
  assert.doesNotMatch(t, /--name|--time|\.\.\.last|maxExtractBytes/);
  const extract = t.split("\n").find((l) => l.includes("extract.mjs"));
  assert.doesNotMatch(extract, /--out/);
});

for (const n of ["dream-analyzer", "dream-organizer"]) {
  test(`${n}: says a write outside the memory folder is denied by a hook`, () => {
    assert.match(read(`../../agents/${n}.md`), /denied by a hook/);
  });
}
