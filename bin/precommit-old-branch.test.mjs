import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { repo, cli, commit } from "./shared.test.mjs";

// .git/hooks is shared by every branch: on a branch made before the upgrade the tree lacks .xworkflows/git/pre-commit
test("a commit on a branch whose tree lacks .xworkflows/git/pre-commit passes", () => {
  const r = repo();
  cli(r, ["install"]);
  const f = join(r, ".xworkflows/git/pre-commit");
  assert.ok(existsSync(f));
  rmSync(f);
  const c = commit(r, "a.md", "x\n");
  assert.equal(c.status, 0, c.stderr);
});
