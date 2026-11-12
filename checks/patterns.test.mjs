import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "./patterns.mjs";
import { makeRepo } from "../test/helpers/repo.mjs";

const entry = { name: "no-todo", regex: "TODO\\(", paths: ["src/"], why: "track it in an issue" };
const withRepo = (patterns, fn, files = { "src/a.js": "a\n" }) => async () => {
  const repo = makeRepo({ config: { checks: { patterns } }, files });
  try { repo.branch("feat"); await fn(repo); } finally { repo.cleanup(); }
};

test("needs checks.patterns", () => assert.deepEqual(mod.needs, ["checks.patterns"]));

test("empty list and no match pass", withRepo([], async (repo) => {
  repo.commit("c", { files: { "src/b.js": "TODO(x)\n" } });
  assert.deepEqual(await repo.run(mod), { ok: true, lines: [] });
}));

test("no match passes", withRepo([entry], async (repo) => {
  repo.commit("c", { files: { "src/b.js": "fine\n" } });
  assert.deepEqual(await repo.run(mod), { ok: true, lines: [] });
}));

test("added match fails with file:line, name, why", withRepo([entry], async (repo) => {
  repo.commit("c", { files: { "src/b.js": "ok\nTODO(x)\n" } });
  const r = await repo.run(mod);
  assert.equal(r.ok, false);
  const t = r.lines.join("\n");
  assert.ok(t.includes("src/b.js:2"));
  assert.ok(t.includes("no-todo") && t.includes("track it in an issue"));
}));

test("a line already at the base and untouched passes", withRepo([entry], async (repo) => {
  repo.commit("c", { files: { "src/b.js": "TODO(x)\n" } });
  repo.branch("feat2");
  repo.commit("d", { files: { "src/b.js": "TODO(x)\nmore\n" } });
  assert.deepEqual(await repo.run(mod, { base: repo.git("rev-parse", "feat") }), { ok: true, lines: [] });
}));

test("outside the entry's paths passes; no paths means every file", async () => {
  for (const [paths, ok] of [[["src/"], true], [undefined, false], [[], false]]) {
    const repo = makeRepo({ config: { checks: { patterns: [{ ...entry, paths }] } }, files: { "a": "a\n" } });
    try { repo.branch("feat"); repo.commit("c", { files: { "docs/x.md": "TODO(y)\n" } }); assert.equal((await repo.run(mod)).ok, ok); }
    finally { repo.cleanup(); }
  }
});

test("two entries each report", withRepo([entry, { name: "no-log", regex: "console\\.log", why: "use the logger" }], async (repo) => {
  repo.commit("c", { files: { "src/b.js": "TODO(x)\nconsole.log(1)\n" } });
  const t = (await repo.run(mod)).lines.join("\n");
  assert.ok(t.includes("no-todo") && t.includes("no-log") && t.includes("src/b.js:2"));
}));

test("invalid regex, missing fields, wrong shapes: could not run", async () => {
  for (const p of [[{ name: "bad", regex: "(" }], [{ regex: "x" }], [{ name: "n" }], { a: 1 }, ["x"], [{ ...entry, paths: "src/" }]]) {
    await withRepo(p, async (repo) => {
      repo.commit("c", { files: { "src/b.js": "x\n" } });
      const r = await repo.run(mod);
      assert.equal(r.ok, false);
      assert.equal(r.cannotRun, true);
      if (Array.isArray(p) && p[0]?.name === "bad") assert.ok(r.lines[0].includes("bad"));
    })();
  }
});

test("line number after an unchanged block", withRepo([entry], async (repo) => {
  const block = Array.from({ length: 30 }, (_, i) => `l${i}\n`).join("");
  repo.commit("c", { files: { "src/b.js": block } });
  repo.branch("feat2");
  repo.commit("d", { files: { "src/b.js": block + "TODO(late)\n" } });
  const r = await repo.run(mod, { base: repo.git("rev-parse", "feat") });
  assert.ok(r.lines[1].includes("src/b.js:31"));
}));

test("accented name with a space", withRepo([{ ...entry, paths: ["src/"] }], async (repo) => {
  repo.commit("c", { files: { "src/naïve résumé.js": "x\nTODO(x)\n" } });
  assert.ok((await repo.run(mod)).lines.join("\n").includes("src/naïve résumé.js:2"));
}));

test("color.ui=always in git config does not blind the brake", withRepo([entry], async (repo) => {
  repo.git("config", "color.ui", "always");
  repo.commit("c", { files: { "src/b.js": "TODO(x)\n" } });
  assert.equal((await repo.run(mod)).ok, false);
}));

test("diff.interHunkContext does not shift the reported line", withRepo([entry], async (repo) => {
  const ten = Array.from({ length: 10 }, (_, i) => `l${i + 1}\n`).join("");
  repo.commit("c", { files: { "src/a.js": ten } });
  repo.branch("feat2");
  repo.git("config", "diff.interHunkContext", "5");
  const lines = ten.split("\n"); lines[1] = "changed"; lines[4] = "TODO(here)";
  repo.commit("d", { files: { "src/a.js": lines.join("\n") } });
  const r = await repo.run(mod, { base: repo.git("rev-parse", "feat") });
  assert.ok(r.lines[1].includes("src/a.js:5"), r.lines[1]);
}));
