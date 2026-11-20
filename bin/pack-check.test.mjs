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

// the manifest at HEAD already holds the change once it is committed on the branch: the comparison is with the merge-base with the main branch
function branchCopy() {
  const copy = packedCopy();
  const g = (...a) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: copy, env: isoEnv(), encoding: "utf8" });
  const run = (...a) => spawnSync("node", [join(copy, "bin/xworkflows.mjs"), "pack", ...a], { cwd: copy, env: isoEnv(), input: "", encoding: "utf8" });
  const write = (m) => writeFileSync(join(copy, "manifest.json"), JSON.stringify(m, null, 2) + "\n");
  g("commit", "-qm", "base");
  g("checkout", "-qb", "work");
  return { copy, g, run, write, m: JSON.parse(readFileSync(join(copy, "manifest.json"), "utf8")) };
}

test("pack: a hook id dropped and committed on a branch fails until it is listed as retired", () => {
  const { g, run, write, m } = branchCopy();
  delete m.pieces.find((p) => p.id === "safe-db").claude;
  write(m);
  g("commit", "-qam", "drop");
  for (const a of [[], ["--check"]]) { const r = run(...a); assert.equal(r.status, 1); assert.match(r.stderr, /safe-db/); }
  m.retiredHooks = ["safe-db"];
  write(m);
  assert.equal(run().status, 0);
  assert.equal(run("--check").status, 0);
});

test("pack: git failing at the merge-base is a warning, not a silent pass", () => {
  const { g, run } = branchCopy();
  g("branch", "-m", "main", "trunk");
  const r = run();
  assert.equal(r.status, 0);
  assert.match(r.stderr, /^warn: .*main/m);
});

test("pack: a manifest that does not parse at the merge-base is a warning, not a silent pass", () => {
  const { copy, g, run, write, m } = branchCopy();
  g("checkout", "-q", "main");
  writeFileSync(join(copy, "manifest.json"), "{ not json");
  g("commit", "-qam", "break");
  g("checkout", "-q", "work");
  g("reset", "-q", "--hard", "main");
  write(m);
  const r = run();
  assert.equal(r.status, 0);
  assert.match(r.stderr, /^warn: .*manifest/m);
});

const quiet = (r) => { assert.equal(r.status, 0); assert.doesNotMatch(r.stderr, /^warn:/m); };

test("pack: a repository with no commit passes without a warning", () => {
  const copy = packedCopy();
  quiet(spawnSync("node", [join(copy, "bin/xworkflows.mjs"), "pack"], { cwd: copy, env: isoEnv(), input: "", encoding: "utf8" }));
});

test("pack: an orphan branch with no merge-base passes without a warning", () => {
  const { g, run } = branchCopy();
  g("checkout", "-q", "--orphan", "orph");
  g("commit", "-qam", "root");
  quiet(run());
});

test("pack: no manifest at the merge-base passes without a warning", () => {
  const { g, run, write, m } = branchCopy();
  g("checkout", "-q", "main");
  g("rm", "-q", "manifest.json");
  g("commit", "-qm", "no manifest");
  g("checkout", "-q", "work");
  g("reset", "-q", "--hard", "main");
  write(m);
  quiet(run());
});
