import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { repo, cli, git, isoEnv } from "./shared.test.mjs";

// no graphify on PATH: the post-commit hook starts no background job that writes into the repository the shared cleanup deletes
const without = { ...isoEnv(), PATH: `${dirname(process.execPath)}:/usr/bin:/bin` };

test("a plugin held false before install leaves skills-travel passing after a clean install", () => {
  const r = repo();
  mkdirSync(join(r, ".claude"), { recursive: true });
  writeFileSync(join(r, ".claude/settings.json"), JSON.stringify({ enabledPlugins: { "ponytail@ponytail": false } }));
  const i = cli(r, ["install"]);
  assert.equal(i.status, 0, i.stdout + i.stderr);
  git(r, "add -A");
  assert.equal(spawnSync("git", ["commit", "-qm", "install"], { cwd: r, env: without }).status, 0);
  const c = spawnSync("node", [".xworkflows/checks/run.mjs", "--only", "skills-travel"], { cwd: r, encoding: "utf8" });
  assert.equal(c.status, 0, c.stdout + c.stderr);
});
