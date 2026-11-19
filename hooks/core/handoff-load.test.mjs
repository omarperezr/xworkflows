import { test } from "node:test";
import assert from "node:assert/strict";
import { decide } from "./handoff-load.mjs";

const SHA = "a".repeat(40);
const ctx = (text, { sha = SHA, head = sha, cap = 1500, branch = "main" } = {}) => ({
  config: { mainBranch: branch, tokens: { handoffBytes: cap } },
  readFile: (p) => (p.endsWith(".xworkflows/handoff.md") ? text : null),
  git: (...a) => (a.join(" ") === "rev-parse " + branch ? sha : a.join(" ") === "rev-parse HEAD" ? head : null),
});
const ev = (event, source) => ({ event, source, root: "/r" });
const file = `main: ${SHA}\ndone: batch x\nnext: T2 in docs/p.md\n`;

test("a fresh hand-off loads at startup and clear, not at resume or compact", () => {
  for (const s of ["startup", "clear"]) assert.deepEqual(decide(ev("sessionStart", s), ctx(file)), { decision: "allow", context: file, notice: `Hand-off loaded: main ${SHA.slice(0, 7)}.` });
  for (const s of ["resume", "compact"]) assert.deepEqual(decide(ev("sessionStart", s), ctx(file)), { decision: "allow" });
});

test("PreCompact gives the same text", () => {
  assert.equal(decide(ev("preCompact"), ctx(file)).context, file);
});

test("a stale, foreign or missing hand-off adds nothing", () => {
  assert.deepEqual(decide(ev("sessionStart", "startup"), ctx(file, { sha: "b".repeat(40) })), { decision: "allow" });
  assert.deepEqual(decide(ev("sessionStart", "startup"), ctx("done\n" + file)), { decision: "allow" });
  assert.deepEqual(decide(ev("sessionStart", "startup"), ctx(null)), { decision: "allow" });
  assert.deepEqual(decide(ev("sessionStart", "startup"), ctx(file, { sha: null })), { decision: "allow" });
});

test("a hand-off loads only while HEAD is also its sha, at session start and on PreCompact", () => {
  const other = { head: "c".repeat(40) };
  assert.deepEqual(decide(ev("sessionStart", "startup"), ctx(file, other)), { decision: "allow" });
  assert.deepEqual(decide(ev("preCompact"), ctx(file, other)), { decision: "allow" });
  assert.deepEqual(decide(ev("preCompact"), ctx(file, { head: null })), { decision: "allow" });
});

test("a stale hand-off is silent at any size, even over the cap", () => {
  assert.deepEqual(decide(ev("sessionStart", "startup"), ctx(file, { cap: 10, sha: "b".repeat(40) })), { decision: "allow" });
  assert.deepEqual(decide(ev("preCompact"), ctx(file, { cap: 10, head: "c".repeat(40) })), { decision: "allow" });
});

test("a cap that is not a whole number above zero is the default", () => {
  for (const cap of [0, -1, 1.5, "10", null, NaN]) assert.equal(decide(ev("sessionStart", "startup"), ctx(file, { cap })).context, file, String(cap));
  assert.match(decide(ev("sessionStart", "startup"), ctx(file + "x".repeat(1500), { cap: 0 })).context, /not loaded[^\n]*1500/);
});

test("a hand-off over the cap says so in one line", () => {
  const d = decide(ev("sessionStart", "startup"), ctx(file, { cap: 10 }));
  assert.match(d.context, /^[^\n]*not loaded[^\n]*10[^\n]*$/);
  assert.deepEqual(d, { decision: "allow", context: d.context, notice: d.context }); // the owner sees the same line, never "loaded"
});

test("the cap counts bytes, and the sha is read from the configured main branch", () => {
  assert.equal(decide(ev("sessionStart", "startup"), ctx(file, { cap: Buffer.byteLength(file) })).context, file);
  assert.equal(decide(ev("sessionStart", "startup"), ctx(file, { branch: "trunk" })).context, file);
});

test("other events and broken input let the call through", () => {
  assert.deepEqual(decide(ev("preTool"), ctx(file)), { decision: "allow" });
  const boom = { config: {}, readFile: () => { throw new Error("x"); }, git: () => { throw new Error("y"); } };
  assert.deepEqual(decide(ev("sessionStart", "startup"), boom), { decision: "allow" });
  assert.deepEqual(decide(ev("sessionStart", "startup"), { config: {}, readFile: () => file, git: () => { throw new Error("y"); } }), { decision: "allow" });
});
