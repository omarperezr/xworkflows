import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { run } from "./branch.mjs";

const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();

test("unseen lists a feedback original that main holds no copy of, marked noCopy", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "fnc-")));
  git(root, "init", "-q", "-b", "main"); git(root, "config", "user.email", "t@t"); git(root, "config", "user.name", "T");
  writeFileSync(join(root, "x.txt"), "x\n"); git(root, "add", "-A"); git(root, "commit", "-q", "-m", "init");
  const home = realpathSync(mkdtempSync(join(tmpdir(), "fnch-")));
  const dflt = join(home, ".claude", "projects", root.replace(/[^a-zA-Z0-9]/g, "-"), "memory");
  mkdirSync(dflt, { recursive: true });
  writeFileSync(join(dflt, "f.md"), "---\nname: f\ntype: feedback\ndescription: f\n---\nbody\n");
  const out = realpathSync(mkdtempSync(join(tmpdir(), "fnco-")));
  writeFileSync(join(out, "s.txt"), "x\n");
  writeFileSync(join(out, "extract.json"), JSON.stringify({ out, sessions: [{ file: "s.txt", name: "s", bytes: 1, masked: 0, lines: 1 }], empty: [], outside: [{ kind: "default", folder: dflt, files: ["f.md"] }] }));
  const o = JSON.parse(run(["open", "--out", out], root, home).stdout);
  const c = run(["close", "--worktree", o.worktree, "--out", out], root, home);
  assert.equal(c.code, 0);
  git(root, "merge", "-q", "--no-ff", "-m", "m", o.branch);
  assert.equal(git(root, "ls-tree", "--name-only", "main", "docs/memory/").includes("f.md"), false, "main holds no copy");
  const originals = JSON.parse(run(["unseen"], root, home).stdout).originals;
  assert.deepEqual(originals, [{ n: 1, kind: "default", name: "f.md", noCopy: true }]); // still deletable after the question: the owner decides
});
