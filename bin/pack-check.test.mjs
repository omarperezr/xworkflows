import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// the one test that reads the tracked manifest of the repository: the push checks it through the whole suite
const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
delete env.XWORKFLOWS_FREE;
delete env.XWORKFLOWS_RECORD;

test("pack --check passes on this repository", () => {
  const r = spawnSync("node", [join(PKG_ROOT, "bin/xworkflows.mjs"), "pack", "--check"], { cwd: PKG_ROOT, env, input: "", encoding: "utf8" });
  assert.equal(r.status, 0);
});
