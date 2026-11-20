import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repo, cli, git } from "./shared.test.mjs";

test("a plugin held false before install leaves skills-travel passing after a clean install", () => {
  const r = repo();
  mkdirSync(join(r, ".claude"), { recursive: true });
  writeFileSync(join(r, ".claude/settings.json"), JSON.stringify({ enabledPlugins: { "ponytail@ponytail": false } }));
  const i = cli(r, ["install"]);
  assert.equal(i.status, 0, i.stdout + i.stderr);
  git(r, "add -A");
  git(r, "-c user.name=t -c user.email=t@t commit -qm install");
  const c = spawnSync("node", [".xworkflows/checks/run.mjs", "--only", "skills-travel"], { cwd: r, encoding: "utf8" });
  assert.equal(c.status, 0, c.stdout + c.stderr);
  rmSync(r, { recursive: true, force: true });
});
