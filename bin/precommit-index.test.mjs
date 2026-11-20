import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { isoEnv, repo, git, cli } from "./shared.test.mjs";

// a plan changed without the pending list is refused at commit time, also for `git commit -a` (git hands the hook a temporary index)
test("pre-commit: a plan changed without the list is refused by `git commit -a` as by add + commit", () => {
  const r = repo();
  const plan = join(r, "docs/superpowers/plans/p.md");
  mkdirSync(join(r, "docs/superpowers/plans"), { recursive: true });
  writeFileSync(plan, "one\n");
  git(r, "add -A");
  assert.equal(spawnSync("git", ["commit", "-q", "-m", "init"], { cwd: r, env: isoEnv() }).status, 0);
  assert.equal(cli(r, ["install", "--yes"]).status, 0);
  const commit = (...a) => spawnSync("git", ["commit", "-q", "-m", "x", ...a], { cwd: r, env: isoEnv() }).status;
  writeFileSync(plan, "two\n");
  git(r, "add -A");
  assert.notEqual(commit(), 0, "add + commit is refused");
  git(r, "reset -q");
  assert.notEqual(commit("-a"), 0, "commit -a is refused too");
});
