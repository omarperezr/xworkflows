import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isoEnv, packedCopy } from "./shared.test.mjs";

// the one test that reads the tracked manifest of the repository: the push checks it through the whole suite
const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
delete env.XWORKFLOWS_FREE;
delete env.XWORKFLOWS_RECORD;

test("pack --check passes on this repository", () => {
  const r = spawnSync("node", [join(PKG_ROOT, "bin/xworkflows.mjs"), "pack", "--check"], { cwd: PKG_ROOT, env, input: "", encoding: "utf8" });
  assert.equal(r.status, 0);
});

// a hook id of the manifest at HEAD that the new manifest drops must be on its retired list
test("pack: a hook id the manifest at HEAD had and this one drops fails until it is listed as retired", () => {
  const copy = packedCopy();
  const run = (...a) => spawnSync("node", [join(copy, "bin/xworkflows.mjs"), "pack", ...a], { cwd: copy, env: isoEnv(), input: "", encoding: "utf8" });
  const g = (...a) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: copy, env: isoEnv() });
  g("commit", "-qm", "base");
  const m = JSON.parse(readFileSync(join(copy, "manifest.json"), "utf8"));
  delete m.pieces.find((p) => p.id === "safe-db").claude;
  writeFileSync(join(copy, "manifest.json"), JSON.stringify(m, null, 2) + "\n");
  for (const a of [[], ["--check"]]) { const r = run(...a); assert.equal(r.status, 1); assert.match(r.stderr, /safe-db/); }
  m.retiredHooks = ["safe-db"];
  writeFileSync(join(copy, "manifest.json"), JSON.stringify(m, null, 2) + "\n");
  assert.equal(run().status, 0);
  assert.equal(run("--check").status, 0);
});
