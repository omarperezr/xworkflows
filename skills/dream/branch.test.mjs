import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, isAbsolute } from "node:path";
import { execFileSync } from "node:child_process";
import { run } from "./branch.mjs";
import { shared } from "./shared.mjs";

const { buildIndex } = await shared("hooks/core/memory-index.mjs");

const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
const d = new Date(), p = (n) => String(n).padStart(2, "0");
const today = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;

const made = [];
after(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

// a repository with one commit on main holding two notes
function repo() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dream-b-")));
  made.push(root);
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "T");
  mkdirSync(join(root, "docs/memory"), { recursive: true });
  writeFileSync(join(root, "docs/memory/a.md"), "---\nname: a\ndescription: first\n---\nbody a\n");
  writeFileSync(join(root, "docs/memory/b.md"), "---\nname: b\ndescription: second\n---\nbody b\n");
  const notes = ["a.md", "b.md"].map((file) => ({ file, text: readFileSync(join(root, "docs/memory", file), "utf8") }));
  writeFileSync(join(root, "docs/memory/MEMORY.md"), buildIndex(notes));
  writeFileSync(join(root, "other.txt"), "x\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "init");
  return root;
}
const json = (r) => JSON.parse(r.stdout);
const opened = (root) => { const r = run(["open"], root); assert.equal(r.code, 0, r.stdout); made.push(json(r).worktree); return json(r); };

test("open makes the branch in a worktree outside the repository and leaves the main checkout alone", () => {
  const root = repo();
  const head = git(root, "rev-parse", "HEAD"), status = git(root, "status", "--porcelain");
  const o = opened(root);
  assert.equal(o.branch, `dream/${today}`);
  assert.equal(o.main, "main");
  assert.ok(isAbsolute(o.worktree) && relative(root, o.worktree).startsWith(".."));
  assert.equal(o.memory, join(o.worktree, "docs/memory"));
  assert.ok(existsSync(join(o.memory, "a.md")));
  assert.equal(git(root, "rev-parse", "HEAD"), head);
  assert.equal(git(root, "rev-parse", "--abbrev-ref", "HEAD"), "main");
  assert.equal(git(root, "status", "--porcelain"), status);
  assert.equal(git(root, "rev-parse", o.branch), head);
});

test("a second open the same day numbers the branch", () => {
  const root = repo();
  opened(root);
  assert.equal(opened(root).branch, `dream/${today}-2`);
  assert.equal(opened(root).branch, `dream/${today}-3`);
});

test("close commits the changed, added and masked notes with the index and dream.json, and removes the worktree", () => {
  const root = repo();
  const main = git(root, "rev-parse", "main");
  const o = opened(root);
  writeFileSync(join(o.memory, "a.md"), "---\nname: a\ndescription: first, edited\n---\nbody a\n");
  writeFileSync(join(o.memory, "c.md"), "---\nname: c\ndescription: third\n---\nbody c\n");
  writeFileSync(join(o.memory, "b.md"), "---\nname: b\ndescription: second\n---\ntoken: abcdef123456\n");
  const r = run(["close", "--worktree", o.worktree, "--name", "sess-1", "--time", "2030-01-02T10:00:00.000Z"], root);
  assert.equal(r.code, 0, r.stdout);
  const c = json(r);
  assert.deepEqual([c.branch, c.added, c.changed, c.removed, c.masked], [o.branch, 1, 2, 0, 1]);
  assert.deepEqual(c.outside, []);
  assert.ok(Array.isArray(c.stale));
  assert.equal(c.see, `git diff main...${o.branch} -- docs/memory`);
  assert.equal(c.adopt, `git merge --no-ff ${o.branch}`);
  assert.equal(c.discard, `git branch -D ${o.branch}`);
  assert.equal(git(root, "show", `${o.branch}:docs/memory/b.md`).includes("abcdef123456"), false);
  assert.match(git(root, "show", `${o.branch}:docs/memory/MEMORY.md`), /\bc\b/);
  assert.deepEqual(JSON.parse(git(root, "show", `${o.branch}:docs/memory/dream.json`)), { name: "sess-1", time: "2030-01-02T10:00:00.000Z" });
  assert.equal(git(root, "log", "-1", "--format=%s", o.branch), `dream: ${today}`);
  assert.equal(git(root, "rev-list", "--count", `main..${o.branch}`), "1");
  assert.equal(existsSync(o.worktree), false);
  assert.equal(git(root, "rev-parse", "main"), main);
  assert.equal(git(root, "status", "--porcelain"), "");
});

test("a file changed outside the memory folder is named and not committed", () => {
  const root = repo();
  const o = opened(root);
  writeFileSync(join(o.worktree, "other.txt"), "changed\n");
  const c = json(run(["close", "--worktree", o.worktree, "--name", "s", "--time", "t"], root));
  assert.deepEqual(c.outside, ["other.txt"]);
  assert.equal(git(root, "show", `${o.branch}:other.txt`), "x");
});

test("close with only dream.json new commits that file and counts nothing", () => {
  const root = repo();
  const o = opened(root);
  const c = json(run(["close", "--worktree", o.worktree, "--name", "s", "--time", "t"], root));
  assert.deepEqual([c.added, c.changed, c.removed, c.masked], [0, 0, 0, 0]);
  assert.equal(git(root, "rev-list", "--count", `main..${o.branch}`), "1");
  assert.equal(git(root, "diff", "--name-only", `main...${o.branch}`), "docs/memory/dream.json");
});

test("close with nothing at all to commit makes no commit", () => {
  const root = repo();
  const o = opened(root);
  run(["close", "--worktree", o.worktree, "--name", "s", "--time", "t"], root); // first run adds dream.json
  const again = opened(root);
  writeFileSync(join(again.memory, "dream.json"), JSON.stringify({ name: "s", time: "t" }, null, 2) + "\n");
  git(again.worktree, "add", "-A"); git(again.worktree, "commit", "-q", "-m", "x");
  const c = json(run(["close", "--worktree", again.worktree, "--name", "s", "--time", "t"], root));
  assert.equal(git(root, "rev-list", "--count", `main..${again.branch}`), "1"); // only the setup commit
  assert.deepEqual([c.added, c.changed, c.removed], [0, 0, 0]);
});

test("a worktree that is not a dream worktree of this repository is refused", () => {
  const root = repo();
  const other = mkdtempSync(join(tmpdir(), "dream-b-other-"));
  made.push(other);
  for (const w of [other, root, join(root, "nope")]) {
    const r = run(["close", "--worktree", w, "--name", "s", "--time", "t"], root);
    assert.equal(r.code, 2);
    assert.equal(r.stdout.trim().split("\n").length, 1);
  }
});
