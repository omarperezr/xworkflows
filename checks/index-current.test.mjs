import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "./index-current.mjs";
import { buildIndex } from "../hooks/core/memory-index.mjs";
import { makeRepo } from "../test/helpers/repo.mjs";

const note = (name, d) => `---\nname: ${name}\ndescription: ${d}\ntype: project\n---\nbody\n`;
const A = note("Alpha", "first"), B = note("Beta", "second");
const withRepo = (fn, config = {}) => async () => {
  const repo = makeRepo({ config, files: { "README.md": "x\n" } });
  try { repo.branch("feat"); await fn(repo); } finally { repo.cleanup(); }
};

test("a current index passes", withRepo(async (repo) => {
  repo.commit("mem", { files: { "docs/memory/a.md": A, "docs/memory/b.md": B,
    "docs/memory/MEMORY.md": buildIndex([{ file: "a.md", text: A }, { file: "b.md", text: B }]) } });
  assert.deepEqual(await repo.run(mod), { ok: true, lines: [] });
}));

test("a hand-edited index fails and names the first differing line", withRepo(async (repo) => {
  const good = buildIndex([{ file: "a.md", text: A }, { file: "b.md", text: B }]).split("\n");
  good[1] = "- hand edited";
  repo.commit("mem", { files: { "docs/memory/a.md": A, "docs/memory/b.md": B, "docs/memory/MEMORY.md": good.join("\n") } });
  const r = await repo.run(mod);
  assert.equal(r.ok, false);
  const t = r.lines.join("\n");
  assert.match(t, /hand edited/);
  assert.match(t, /run `node \.xworkflows\/checks\/run\.mjs index` and commit/);
}));

test("a new memory file without a rebuilt index fails", withRepo(async (repo) => {
  repo.commit("mem", { files: { "docs/memory/a.md": A, "docs/memory/MEMORY.md": buildIndex([{ file: "a.md", text: A }]) } });
  repo.commit("more", { files: { "docs/memory/b.md": B } });
  assert.equal((await repo.run(mod)).ok, false);
}));

test("no memory folder passes", withRepo(async (repo) => {
  assert.deepEqual(await repo.run(mod), { ok: true, lines: [] });
}));

test("memory files with no index file fail", withRepo(async (repo) => {
  repo.commit("mem", { files: { "docs/memory/a.md": A } });
  const r = await repo.run(mod);
  assert.equal(r.ok, false);
  assert.match(r.lines.join("\n"), /MEMORY\.md/);
}));

test("an index with no memory files passes only when empty", withRepo(async (repo) => {
  repo.commit("idx", { files: { "docs/memory/MEMORY.md": "" } });
  assert.equal((await repo.run(mod)).ok, true);
}));

test("a memory file with an accented name and a space is indexed", withRepo(async (repo) => {
  const N = note("Über", "note");
  repo.commit("mem", { files: { "docs/memory/über note.md": N, "docs/memory/MEMORY.md": buildIndex([{ file: "über note.md", text: N }]) } });
  assert.equal((await repo.run(mod)).ok, true);
  repo.commit("stale", { files: { "docs/memory/MEMORY.md": "" } });
  assert.equal((await repo.run(mod)).ok, false);
}));

test("a wrong-shaped memory.dir cannot run", async () => {
  await withRepo(async (repo) => {
    const r = await repo.run(mod);
    assert.equal(r.ok, false);
    assert.equal(r.cannotRun, true);
  }, { memory: { dir: ["docs/memory"] } })();
});

const stale = { "docs/memory/a.md": A, "docs/memory/MEMORY.md": "" };
for (const dir of ["docs//memory", "./docs/memory", "docs/memory//"]) {
  test(`memory.dir ${dir} is normalised and a stale index fails`, async () => {
    await withRepo(async (repo) => {
      repo.commit("mem", { files: stale });
      assert.equal((await repo.run(mod)).ok, false);
    }, { memory: { dir } })();
  });
}
for (const dir of ["/docs/memory", "../memory", ".", "./"]) {
  test(`memory.dir ${dir} cannot run`, async () => {
    await withRepo(async (repo) => {
      repo.commit("mem", { files: stale });
      const r = await repo.run(mod);
      assert.equal(r.ok, false);
      assert.equal(r.cannotRun, true);
    }, { memory: { dir } })();
  });
}

test("a submodule entry under the memory folder is not a note", withRepo(async (repo) => {
  repo.commit("mem", { files: { "docs/memory/a.md": A, "docs/memory/MEMORY.md": buildIndex([{ file: "a.md", text: A }]) } });
  repo.git("update-index", "--add", "--cacheinfo", `160000,${repo.git("rev-parse", "HEAD")},docs/memory/sub.md`);
  repo.git("commit", "-q", "-m", "sub");
  assert.deepEqual(await repo.run(mod), { ok: true, lines: [] });
}));

test("a note whose name holds a newline is indexed", withRepo(async (repo) => {
  repo.commit("mem", { files: { "docs/memory/a\nb.md": A, "docs/memory/MEMORY.md": buildIndex([{ file: "a\nb.md", text: A }]) } });
  assert.equal((await repo.run(mod)).ok, true);
  repo.commit("stale", { files: { "docs/memory/MEMORY.md": "" } });
  assert.equal((await repo.run(mod)).ok, false);
}));

test("a memory folder name with glob characters is read as written", async () => {
  await withRepo(async (repo) => {
    repo.commit("mem", { files: { "m[1]*/a.md": A, "mx/b.md": B, "m[1]*/MEMORY.md": buildIndex([{ file: "a.md", text: A }]) } });
    assert.deepEqual(await repo.run(mod), { ok: true, lines: [] });
    repo.commit("stale", { files: { "m[1]*/MEMORY.md": "" } });
    assert.equal((await repo.run(mod)).ok, false);
  }, { memory: { dir: "m[1]*" } })();
});

for (const dir of ["..mem", "mem ", "./mem/"]) {
  test(`memory.dir written ${JSON.stringify(dir)} is read as its folder`, withRepo(async (repo) => {
    const d = dir.trim().replace(/^\.\//, "").replace(/\/$/, "");
    repo.commit("mem", { files: { [`${d}/a.md`]: A } });
    const r = await repo.run(mod);
    assert.equal(r.cannotRun, undefined);
    assert.equal(r.ok, false);
    assert.equal(r.lines[0], `${d}/MEMORY.md is missing`);
  }, { memory: { dir } }));
}
