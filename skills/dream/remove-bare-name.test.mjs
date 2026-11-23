import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { run } from "./branch.mjs";
const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();

test("close: --remove with the absolute path of a note in the memory folder does not stop the close", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rb-")));
  git(root, "init", "-q", "-b", "main"); git(root, "config", "user.email", "t@t"); git(root, "config", "user.name", "T");
  writeFileSync(join(root, "x.txt"), "x\n"); git(root, "add", "-A"); git(root, "commit", "-q", "-m", "init");
  const home = realpathSync(mkdtempSync(join(tmpdir(), "rbh-")));
  const out = realpathSync(mkdtempSync(join(tmpdir(), "rbo-")));
  writeFileSync(join(out, "extract.json"), JSON.stringify({ out, sessions: [{ file: "s.txt", name: "s", bytes: 1, masked: 0, lines: 1 }], empty: [], outside: [] }));
  const o = JSON.parse(run(["open", "--out", out], root, home).stdout);
  mkdirSync(o.memory, { recursive: true });
  const n = join(o.memory, "a.md");
  writeFileSync(n, "---\nname: a\ndescription: a\n---\nx\n");
  const r = run(["close", "--worktree", o.worktree, "--out", out, "--remove", n], root, home);
  assert.notEqual(r.code, 2, r.stdout);
  assert.deepEqual(JSON.parse(r.stdout).skipped, []);
  assert.equal(git(root, "ls-tree", "-r", "--name-only", o.branch).includes("a.md"), false);
  assert.equal(git(root, "rev-list", "--count", `main..${o.branch}`), "1");
});
