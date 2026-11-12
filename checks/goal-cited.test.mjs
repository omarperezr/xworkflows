import { test } from "node:test";
import assert from "node:assert/strict";
import { makeRepo } from "../test/helpers/repo.mjs";
import * as mod from "./goal-cited.mjs";

const BIZ = "# Business\n\n- G1 (about 3 months): ship\nG2: grow\n";
const PLAN = "docs/superpowers/plans/a.md";

async function withRepo(files, then, after) {
  const repo = makeRepo({ files });
  try {
    if (then) then(repo);
    return await after(repo);
  } finally { repo.cleanup(); }
}

test("added plan citing an existing goal passes", async () => {
  await withRepo({ "docs/BUSINESS.md": BIZ }, (r) => r.commit("plan", { files: { [PLAN]: "# P\nGoal: G1\n" } }),
    async (r) => assert.deepEqual(await r.run(mod), { ok: true, lines: [] }));
});

test("goal in G2: form passes", async () => {
  await withRepo({ "docs/BUSINESS.md": BIZ }, (r) => r.commit("plan", { files: { [PLAN]: "Goal: G2\n" } }),
    async (r) => assert.equal((await r.run(mod)).ok, true));
});

test("no Goal line fails and names the plan", async () => {
  await withRepo({ "docs/BUSINESS.md": BIZ }, (r) => r.commit("plan", { files: { [PLAN]: "# P\n" } }),
    async (r) => {
      const res = await r.run(mod);
      assert.equal(res.ok, false);
      assert.ok(res.lines.join("\n").includes(PLAN));
    });
});

test("goal absent from the business file fails", async () => {
  await withRepo({ "docs/BUSINESS.md": BIZ }, (r) => r.commit("plan", { files: { [PLAN]: "Goal: G7\n" } }),
    async (r) => assert.equal((await r.run(mod)).ok, false));
});

test("G1 does not match a line for G10", async () => {
  await withRepo({ "docs/BUSINESS.md": "G10 (about 1 month): x\n" }, (r) => r.commit("plan", { files: { [PLAN]: "Goal: G1\n" } }),
    async (r) => assert.equal((await r.run(mod)).ok, false));
});

test("accented and spaced plan names are checked", async () => {
  const p = "docs/superpowers/plans/plän one.md";
  await withRepo({ "docs/BUSINESS.md": BIZ }, (r) => r.commit("plan", { files: { [p]: "# P\n" } }),
    async (r) => {
      const res = await r.run(mod);
      assert.equal(res.ok, false);
      assert.ok(res.lines.join("\n").includes(p));
    });
});

test("plan only changed is not checked", async () => {
  await withRepo({ "docs/BUSINESS.md": BIZ, [PLAN]: "old\n" }, (r) => r.commit("edit", { files: { [PLAN]: "new\n" } }),
    async (r) => assert.equal((await r.run(mod)).ok, true));
});

test("no plan added passes without a business file", async () => {
  await withRepo({}, (r) => r.commit("x", { files: { "a.txt": "1\n" } }),
    async (r) => assert.deepEqual(await r.run(mod), { ok: true, lines: [] }));
});

test("plan added without a business file fails and says so", async () => {
  await withRepo({}, (r) => r.commit("plan", { files: { [PLAN]: "Goal: G1\n" } }),
    async (r) => {
      const res = await r.run(mod);
      assert.equal(res.ok, false);
      assert.match(res.lines.join("\n"), /BUSINESS\.md/);
    });
});
