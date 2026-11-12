import { test } from "node:test";
import assert from "node:assert/strict";
import { makeRepo } from "../test/helpers/repo.mjs";
import * as pending from "./pending.mjs";

delete process.env.CI; // the brake skips its "branch exists nowhere" rule under CI
const PEND = "docs/PENDING.md";
const PLAN = "docs/superpowers/plans/a.md";
const card = (n, status = "unscheduled") => `- **P-${n}** — thing ${n}. Status: ${status}.\n`;
const withRepo = (opts, fn) => async () => {
  const repo = makeRepo(opts);
  try { await fn(repo); } finally { repo.cleanup(); }
};

test("mainOnly", () => assert.equal(pending.mainOnly, true));

test("rule 1 passes when the closed card is gone", withRepo({}, async (r) => {
  r.commit("close\n", { files: { [PEND]: card(2) }, body: "closes P-1" });
  assert.deepEqual(await r.run(pending), { ok: true, lines: [] });
}));

test("rule 1 fails on a closed card still listed, also inside a list", withRepo({}, async (r) => {
  r.commit("close", { files: { [PEND]: card(1) + card(2) + card(3) + card(4) }, body: "closes P-1, P-2 and P-3" });
  const res = await r.run(pending);
  assert.equal(res.ok, false);
  const text = res.lines.join("\n");
  for (const id of ["P-1", "P-2", "P-3"]) assert.match(text, new RegExp(id));
  assert.doesNotMatch(text, /P-4/);
}));

test("rule 2 fails for a branch already merged into main", withRepo({}, async (r) => {
  r.branch("feat");
  r.commit("work");
  r.checkout("main");
  r.merge("feat", "merge feat");
  r.commit("list", { files: { [PEND]: card(1, "in progress on feat") } });
  const res = await r.run(pending);
  assert.equal(res.ok, false);
  assert.match(res.lines.join("\n"), /P-1.*feat/);
}));

test("rule 2 fails for a branch that exists nowhere", withRepo({}, async (r) => {
  r.commit("list", { files: { [PEND]: card(1, "in progress on ghost") } });
  const res = await r.run(pending);
  assert.equal(res.ok, false);
  assert.match(res.lines.join("\n"), /ghost/);
}));

test("rule 2 passes for a live unmerged branch", withRepo({}, async (r) => {
  r.branch("feat");
  r.commit("work");
  r.checkout("main");
  r.commit("list", { files: { [PEND]: card(1, "in progress on feat") } });
  assert.deepEqual(await r.run(pending), { ok: true, lines: [] });
}));

test("rule 3 fails for a plan commit without the list", withRepo({}, async (r) => {
  const sha = r.commit("write plan", { files: { [PLAN]: "plan\n", [PEND]: card(1) } });
  r.commit("edit plan", { files: { [PLAN]: "plan v2\n" } });
  const res = await r.run(pending, { base: sha });
  assert.equal(res.ok, false);
  assert.match(res.lines.join("\n"), /edit plan/);
}));

test("rule 3 fails with no pending file at all", withRepo({}, async (r) => {
  r.commit("write plan", { files: { [PLAN]: "plan\n" } });
  const res = await r.run(pending);
  assert.equal(res.ok, false);
  assert.match(res.lines.join("\n"), /write plan/);
}));

test("rule 3 passes when the commit itself updates the list", withRepo({}, async (r) => {
  r.commit("write plan", { files: { [PLAN]: "plan\n", [PEND]: card(1) } });
  assert.deepEqual(await r.run(pending), { ok: true, lines: [] });
}));

test("rule 3 is saved by the --no-ff merge that updates the list", withRepo({}, async (r) => {
  r.branch("feat");
  r.commit("write plan", { files: { [PLAN]: "plan\n" } });
  r.commit("list", { files: { [PEND]: card(1) } });
  r.checkout("main");
  r.merge("feat", "merge feat");
  assert.deepEqual(await r.run(pending), { ok: true, lines: [] });
}));

test("rule 3 is saved by a later pending-for commit", withRepo({}, async (r) => {
  const c = r.commit("write plan", { files: { [PLAN]: "plan\n" } });
  r.commit("list", { files: { [PEND]: card(1) }, body: `pending-for: ${c.slice(0, 7)}` });
  assert.deepEqual(await r.run(pending), { ok: true, lines: [] });
}));

test("a pending-for naming another commit does not save it", withRepo({}, async (r) => {
  r.commit("write plan", { files: { [PLAN]: "plan\n" } });
  r.commit("list", { files: { [PEND]: card(1) }, body: "pending-for: 0000000" });
  assert.equal((await r.run(pending)).ok, false);
}));

test("rule 3 does not ask it of a seal-only commit, a spec, or a merge-free no-op", withRepo({ files: { [PLAN]: "plan\n" } }, async (r) => {
  r.commit("seal", { files: { [PLAN]: "plan\nreview ok at abc1234\nrisk-review ok at abc1234def\n" } });
  r.commit("spec", { files: { "docs/superpowers/specs/s.md": "spec\n" } });
  assert.deepEqual(await r.run(pending), { ok: true, lines: [] });
}));

test("a seal written after a blank line, as the plan template lays it out, is still seal-only", withRepo({ files: { [PLAN]: "plan\n\n## Seals\n" } }, async (r) => {
  r.commit("seal", { files: { [PLAN]: "plan\n\n## Seals\n\nreview ok at abc1234\n" } });
  assert.deepEqual(await r.run(pending), { ok: true, lines: [] });
}));

test("a commit that seals and also edits the plan is asked", withRepo({ files: { [PLAN]: "plan\n" } }, async (r) => {
  r.commit("seal+edit", { files: { [PLAN]: "plan changed\nreview ok at abc1234\n" } });
  assert.equal((await r.run(pending)).ok, false);
}));

test("rule 4 fails on two cards with one number", withRepo({}, async (r) => {
  r.commit("list", { files: { [PEND]: card(1) + card(2) + card(1) } });
  const res = await r.run(pending);
  assert.equal(res.ok, false);
  assert.match(res.lines.join("\n"), /P-1/);
}));

test("a missing pending file with nothing to check passes", withRepo({}, async (r) => {
  r.commit("other");
  assert.deepEqual(await r.run(pending), { ok: true, lines: [] });
}));

for (const name of ["mïgration.md", "with space.md"]) {
  test(`rule 3 fails for a plan named "${name}" without the list`, withRepo({}, async (r) => {
    r.commit("write plan", { files: { [`docs/superpowers/plans/${name}`]: "plan\n" } });
    const res = await r.run(pending);
    assert.equal(res.ok, false);
    assert.match(res.lines.join("\n"), /write plan/);
  }));
}
