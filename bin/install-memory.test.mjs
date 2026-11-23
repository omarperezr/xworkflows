import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repo, cli, readJson, writeJson } from "./shared.test.mjs";

const LOCAL = ".xworkflows/local.json";
const ignored = (r) => (existsSync(join(r, ".gitignore")) ? readFileSync(join(r, ".gitignore"), "utf8").split("\n") : []);

test("install: creates docs/memory/MEMORY.md empty when missing, and a later install leaves its text", () => {
  const r = repo();
  assert.equal(cli(r, ["install"]).status, 0);
  assert.equal(readFileSync(join(r, "docs/memory/MEMORY.md"), "utf8"), "");
  writeFileSync(join(r, "docs/memory/MEMORY.md"), "- [a](a.md)\n");
  cli(r, ["install"]);
  assert.equal(readFileSync(join(r, "docs/memory/MEMORY.md"), "utf8"), "- [a](a.md)\n");
});
test("install: with memory.autoDirectory false, no MEMORY.md", () => {
  const r = repo({ ".xworkflows/config.json": JSON.stringify({ memory: { autoDirectory: false } }) });
  cli(r, ["install"]);
  assert.ok(!existsSync(join(r, "docs/memory/MEMORY.md")));
});
test("install: a different earlier autoMemoryDirectory goes into .xworkflows/local.json, git-ignored, and not into installed.json", () => {
  const r = repo({ ".claude/settings.local.json": JSON.stringify({ autoMemoryDirectory: "/old/memory" }) });
  assert.equal(cli(r, ["install"]).status, 0);
  assert.deepEqual(readJson(r, LOCAL), { memory: { earlierAutoDirectory: "/old/memory" } });
  assert.ok(ignored(r).includes(LOCAL));
  assert.ok(!readFileSync(join(r, ".xworkflows/installed.json"), "utf8").includes("/old/memory"));
});
test("install: a later install keeps the value already stored", () => {
  const r = repo({ ".claude/settings.local.json": JSON.stringify({ autoMemoryDirectory: "/old/memory" }) });
  cli(r, ["install"]);
  writeJson(r, ".claude/settings.local.json", { autoMemoryDirectory: "/other/memory" });
  cli(r, ["install"]);
  assert.equal(readJson(r, LOCAL).memory.earlierAutoDirectory, "/old/memory");
});
test("install: no earlier value, or the same one, writes no local.json", () => {
  const a = repo();
  cli(a, ["install"]);
  assert.ok(!existsSync(join(a, LOCAL)));
  cli(a, ["install"]);
  assert.ok(!existsSync(join(a, LOCAL)));
});
test("install: an existing local.json keeps its other keys", () => {
  const r = repo({ ".claude/settings.local.json": JSON.stringify({ autoMemoryDirectory: "/old/memory" }), [LOCAL]: JSON.stringify({ x: 1 }) });
  cli(r, ["install"]);
  assert.deepEqual(readJson(r, LOCAL), { x: 1, memory: { earlierAutoDirectory: "/old/memory" } });
});
test("uninstall: removes local.json and its ignore line, and leaves MEMORY.md alone", () => {
  const r = repo({ ".claude/settings.local.json": JSON.stringify({ autoMemoryDirectory: "/old/memory" }) });
  cli(r, ["install"]);
  writeFileSync(join(r, "docs/memory/MEMORY.md"), "- [a](a.md)\n");
  assert.equal(cli(r, ["uninstall"]).status, 0);
  assert.ok(!existsSync(join(r, LOCAL)));
  assert.ok(!ignored(r).includes(LOCAL));
  assert.equal(readFileSync(join(r, "docs/memory/MEMORY.md"), "utf8"), "- [a](a.md)\n");
});
test("uninstall: an untouched empty MEMORY.md that install made goes with the folder", () => {
  const r = repo();
  cli(r, ["install"]);
  cli(r, ["uninstall"]);
  assert.ok(!existsSync(join(r, "docs/memory")));
});
