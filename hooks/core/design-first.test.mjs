import { test } from "node:test";
import assert from "node:assert/strict";
import { decide } from "./design-first.mjs";

const cfg = { owner: "Ana", paths: { specs: "docs/superpowers/specs", plans: "docs/superpowers/plans" } };
const ev = (writes, extra = {}) => ({ event: "preTool", tool: "t", kind: "write", session: "s", root: "/r", isSubagent: false, writes, ...extra });
const ctx = (files = {}, marked = false, config = cfg) => ({ config, marked: () => marked, readFile: (p) => files[p] ?? null });
const denied = (d) => d.decision === "deny" && /grill/.test(d.reason) && /Ana/.test(d.reason);
const allowed = (d) => d.decision === "allow";

const spec = "/r/docs/superpowers/specs/x.md";
const planQ = "/r/docs/superpowers/plans/q.md";
const addQ = { old: "1. Which DB?", new: "1. Which DB?\n2. Which cache?" };
const qFile = { [planQ]: "## Questions for the owner\n1. Which DB?\n" };

test("new spec without grill: deny; with grill: allow", () => {
  const w = [{ path: spec, content: "# x" }];
  assert.ok(denied(decide(ev(w), ctx())));
  assert.ok(allowed(decide(ev(w), ctx({}, true))));
});

test("new spec made by an edit with an empty old string: deny; with grill: allow", () => {
  const w = [{ path: spec, old: "", new: "# x" }];
  assert.ok(denied(decide(ev(w), ctx())));
  assert.ok(allowed(decide(ev(w), ctx({}, true))));
});

test("edit adding a question under the heading: deny; with grill: allow", () => {
  const w = [{ path: planQ, ...addQ }];
  assert.ok(denied(decide(ev(w), ctx(qFile))));
  assert.ok(allowed(decide(ev(w), ctx(qFile, true))));
});

test("two writes, the second adds a question: deny", () => {
  const w = [{ path: planQ, old: "a", new: "b" }, { path: planQ, ...addQ }];
  assert.ok(denied(decide(ev(w), ctx(qFile))));
});

test("whole write of an existing plan with the same questions: allow; with a new one: deny", () => {
  const c = "## Questions for the owner\n1. Which DB?\n- review ok at abc1234\n";
  assert.ok(allowed(decide(ev([{ path: planQ, content: c }]), ctx(qFile))));
  assert.ok(denied(decide(ev([{ path: planQ, content: c + "2. Which cache?\n" }]), ctx(qFile))));
});

test("answering on the same line is not a new question: allow", () => {
  const p = "/r/docs/superpowers/specs/s.md";
  const files = { [p]: "## Owner's answers\n1. Which DB?\n" };
  assert.ok(allowed(decide(ev([{ path: p, old: "1. Which DB?", new: "1. Which DB? Postgres." }]), ctx(files))));
});

test("status line edit of an existing spec: allow", () => {
  const files = { [spec]: "Status: draft\n" };
  assert.ok(allowed(decide(ev([{ path: spec, old: "Status: draft", new: "Status: review ok at abc1234" }]), ctx(files))));
});

test("a question without the heading: allow", () => {
  const files = { [planQ]: "# plan\nnotes\n" };
  assert.ok(allowed(decide(ev([{ path: planQ, old: "notes", new: "Why?" }]), ctx(files))));
});

test("other paths: allow", () => {
  assert.ok(allowed(decide(ev([{ path: "/r/src/a.ts", content: "x" }]), ctx())));
  assert.ok(allowed(decide(ev([{ path: "/r/docs/superpowers/specs/x.txt", content: "x" }]), ctx())));
});

test("path forms", () => {
  const d = (path) => decide(ev([{ path, content: "# x" }]), ctx());
  assert.ok(denied(d("docs/superpowers/specs/x.md")));
  assert.ok(denied(d("docs\\superpowers\\specs\\x.md")));
  assert.ok(allowed(d("../docs/superpowers/specs/x.md")));
  assert.ok(allowed(d("/elsewhere/docs/superpowers/specs/x.md")));
});

test("config paths are honored", () => {
  const c = ctx({}, false, { ...cfg, paths: { ...cfg.paths, specs: "specs" } });
  assert.ok(denied(decide(ev([{ path: "/r/specs/x.md", content: "# x" }]), c)));
  assert.ok(allowed(decide(ev([{ path: "/r/docs/superpowers/specs/x.md", content: "# x" }]), c)));
});

test("non-write events: allow", () => {
  assert.ok(allowed(decide(ev([], { kind: "shell", command: "ls" }), ctx())));
  assert.ok(allowed(decide(ev([], { kind: "other" }), ctx())));
});
