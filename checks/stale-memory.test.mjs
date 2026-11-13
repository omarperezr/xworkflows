import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import * as mod from "./stale-memory.mjs";
import { makeRepo } from "../test/helpers/repo.mjs";

const withRepo = (files, fn, config = { memory: { dir: "mem" } }) => async () => {
  const repo = makeRepo({ config, files: { "src/a.js": "a\n", "src/deep/b.js": "b\n", ...files } });
  try { await fn(repo); } finally { repo.cleanup(); }
};

test("existing file passes", withRepo({ "mem/n.md": "see `src/a.js` here\n" }, async (repo) => {
  assert.deepEqual(await repo.run(mod), { ok: true, lines: [] });
}));

test("missing file fails with file, line and path", withRepo({ "mem/n.md": "ok\nsee `src/gone.js` here\n" }, async (repo) => {
  const r = await repo.run(mod);
  assert.equal(r.ok, false);
  assert.match(r.lines.join("\n"), /mem\/n\.md:2/);
  assert.match(r.lines.join("\n"), /src\/gone\.js/);
  assert.match(r.lines.join("\n"), /delete/);
}));

test(":line and :line-line are stripped, trailing slash too, folder passes", withRepo(
  { "mem/n.md": "`src/a.js:42` `src/a.js:3-9` `src/deep/` `src/deep`\n" }, async (repo) => {
  assert.equal((await repo.run(mod)).ok, true);
}));

test("missing path with :42 fails without the suffix in the name", withRepo({ "mem/n.md": "`src/gone.js:42`\n" }, async (repo) => {
  const r = await repo.run(mod);
  assert.equal(r.ok, false);
  assert.match(r.lines.join("\n"), /src\/gone\.js(?!:42)/);
}));

test("url, glob, spaces, absolute, home, flag, placeholders are ignored", withRepo({ "mem/n.md":
  "`https://x.io/a/b` `src/*.js` `run src/x/y` `/etc/x/y` `~/a/b` `-a/b` `<dir>/f` `$HOME/f` `a/b>c`\n" }, async (repo) => {
  assert.equal((await repo.run(mod)).ok, true);
}));

test("fenced blocks are ignored, text after them is checked", withRepo({ "mem/n.md":
  "```\n`src/gone.js`\n```\n~~~sh\n`src/gone2.js`\n~~~\n`src/gone3.js`\n" }, async (repo) => {
  const r = await repo.run(mod);
  assert.equal(r.ok, false);
  const t = r.lines.join("\n");
  assert.match(t, /mem\/n\.md:7/);
  assert.ok(!t.includes("gone.js") && !t.includes("gone2"));
}));

test("on disk but not committed fails", withRepo({ "mem/n.md": "`src/new.js`\n" }, async (repo) => {
  writeFileSync(join(repo.root, "src-new.tmp"), "");
  try {
    repo.write("src/new.js", "x\n");
    assert.equal((await repo.run(mod)).ok, false);
  } finally { rmSync(join(repo.root, "src-new.tmp"), { force: true }); }
}));

test("accented name with a space, in memory file and in the span", withRepo({
  "mem/über note.md": "ok `docs/naïve/é.md` and `src/a.js`\n", "docs/naïve/é.md": "x\n" }, async (repo) => {
  assert.equal((await repo.run(mod)).ok, true);
  repo.commit("m", { files: { "mem/second ï.md": "x\n`docs/naïve/ï.md`\n" } });
  const r = await repo.run(mod, { base: undefined });
  assert.equal(r.ok, false);
  assert.match(r.lines.join("\n"), /mem\/second ï\.md:2/);
}));

test("no memory folder passes; non-md files are not read", withRepo({ "mem/x.txt": "`src/gone.js`\n" }, async (repo) => {
  assert.equal((await repo.run(mod)).ok, true);
}));

test("no memory files at all passes", withRepo({}, async (repo) => {
  assert.deepEqual(await repo.run(mod), { ok: true, lines: [] });
}));

test("wrong-shaped memory.dir cannot run", withRepo({}, async (repo) => {
  const r = await repo.run(mod);
  assert.equal(r.ok, false);
  assert.equal(r.cannotRun, true);
}, { memory: { dir: { a: 1 } } }));

const stale = { "docs/memory/a.md": "see `src/gone.js`\n" };
test("memory.dir written ./docs/memory is still checked", withRepo(stale, async (repo) => {
  assert.equal((await repo.run(mod)).ok, false);
}, { memory: { dir: "./docs/memory" } }));

test("memory.dir written docs//memory is still checked", withRepo(stale, async (repo) => {
  assert.equal((await repo.run(mod)).ok, false);
}, { memory: { dir: "docs//memory" } }));

test("absolute or escaping memory.dir cannot run", async () => {
  for (const dir of ["/docs/memory", "../x", ".", "./"]) {
    await withRepo({}, async (repo) => {
      const r = await repo.run(mod);
      assert.equal(r.cannotRun, true, dir);
    }, { memory: { dir } })();
  }
});

test("inline triple-backtick line is not a fence", withRepo({ "mem/n.md": "```npm test``` runs it\nsee `src/gone.js`\n" }, async (repo) => {
  assert.equal((await repo.run(mod)).ok, false);
}));

test("existing ./ path passes", withRepo({ "mem/n.md": "see `./src/a.js`\n" }, async (repo) => {
  assert.equal((await repo.run(mod)).ok, true);
}));

test("unreadable memory blob cannot be read as empty", withRepo({ "mem/n.md": "`src/gone.js`\n" }, async (repo) => {
  const blob = repo.git("rev-parse", "HEAD:mem/n.md");
  rmSync(join(repo.root, ".git/objects", blob.slice(0, 2), blob.slice(2)), { force: true });
  await assert.rejects(() => repo.run(mod));
}));

test("a fence of four backticks hides its spans, and an inner triple does not close it", withRepo({ "mem/n.md": "````md\nsee `src/gone.js`\n```\nstill `src/gone.js`\n````\nafter `src/gone.js`\n" }, async (repo) => {
  const r = await repo.run(mod);
  assert.equal(r.ok, false);
  assert.deepEqual(r.lines.filter((l) => /mem\/n\.md:\d+/.test(l)).map((l) => l.match(/mem\/n\.md:(\d+)/)[1]), ["6"]);
}));

test("a longer closing fence closes the block: what follows is checked", withRepo({ "mem/n.md": "```\n`src/gone.js`\n````\nafter `src/gone2.js`\n" }, async (repo) => {
  const r = await repo.run(mod);
  assert.equal(r.ok, false);
  assert.match(r.lines.join("\n"), /mem\/n\.md:4/);
}));

const GITLINK = (repo, path) => repo.git("update-index", "--add", "--cacheinfo", `160000,${repo.git("rev-parse", "HEAD")},${path}`);

test("a submodule entry named like a note is not read as a blob", withRepo({ "mem/n.md": "see `src/a.js`\n" }, async (repo) => {
  GITLINK(repo, "mem/sub.md");
  repo.git("commit", "-q", "-m", "sub");
  assert.deepEqual(await repo.run(mod), { ok: true, lines: [] });
}));

test("a note whose name holds a newline is read, and named", withRepo({ "mem/a\nb.md": "`src/gone.js`\n" }, async (repo) => {
  const r = await repo.run(mod);
  assert.equal(r.ok, false);
  assert.match(r.lines.join("\n"), /src\/gone\.js/);
}));

test("a memory folder name with glob characters is checked", withRepo({ "m[1]*/n.md": "`src/gone.js`\n", "mx/n.md": "`src/gone2.js`\n" }, async (repo) => {
  const r = await repo.run(mod);
  assert.equal(r.ok, false);
  const t = r.lines.join("\n");
  assert.match(t, /src\/gone\.js/);
  assert.ok(!t.includes("gone2"));
}, { memory: { dir: "m[1]*" } }));
