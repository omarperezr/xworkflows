import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as brake from "./fix-has-test.mjs";
import { makeRepo } from "../test/helpers/repo.mjs";

const config = {
  paths: { code: ["src/"] },
  tests: { files: ["test/**/*.test.mjs", "test/*.py"], run: "node --test <files>", notRunnable: ["db-tests/"] },
};
const BUG = { "src/x.mjs": "export const x = () => 1;\n" };
const FIXED = { "src/x.mjs": "export const x = () => 2;\n" };
const NODE_TEST = { "test/x.test.mjs": `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { x } from "../src/x.mjs";\ntest("x", () => assert.equal(x(), 2));\n` };
const ALWAYS_PASSES = { "test/x.test.mjs": `import { test } from "node:test";\ntest("x", () => {});\n` };
const ALWAYS_FAILS = { "test/x.test.mjs": `import { test } from "node:test";\nimport assert from "node:assert/strict";\ntest("x", () => assert.fail("no"));\n` };

const withRepo = (opts, fn) => async () => {
  const repo = makeRepo({ config, files: BUG, ...opts });
  try {
    await fn(repo);
    assert.equal(repo.git("worktree", "list").split("\n").length, 1, "worktree left behind");
  } finally { repo.cleanup(); }
};
const subject = (repo) => repo.git("log", "-1", "--format=%h %s");

test("a test that fails at the parent and passes at the fix: pass", withRepo({}, async (repo) => {
  repo.commit("fix: x returns 2", { files: { ...FIXED, ...NODE_TEST } });
  assert.deepEqual(await repo.run(brake), { ok: true, lines: [] });
}));

test("a fix with no test: fail, naming the commit and the escapes", withRepo({}, async (repo) => {
  repo.commit("fix(x): x returns 2", { files: FIXED });
  const r = await repo.run(brake);
  assert.equal(r.ok, false);
  assert.ok(r.lines.join("\n").includes(subject(repo)));
  assert.ok(r.lines.join("\n").includes("no-test:"));
}));

test("a test that also passes at the parent: fail", withRepo({}, async (repo) => {
  repo.commit("fix: x returns 2", { files: { ...FIXED, ...ALWAYS_PASSES } });
  const r = await repo.run(brake);
  assert.equal(r.ok, false);
  assert.match(r.lines.join("\n"), /parent/);
}));

test("a test that still fails at the fix: fail", withRepo({}, async (repo) => {
  repo.commit("fix: x returns 2", { files: { ...FIXED, ...ALWAYS_FAILS } });
  const r = await repo.run(brake);
  assert.equal(r.ok, false);
  assert.match(r.lines.join("\n"), /still fail/);
}));

test("no-test: in the body escapes", withRepo({}, async (repo) => {
  repo.commit("fix: x returns 2", { files: FIXED, body: "no-test: covered by the e2e run" });
  assert.deepEqual(await repo.run(brake), { ok: true, lines: [] });
}));

test("no-test: without a reason does not escape", withRepo({}, async (repo) => {
  repo.commit("fix: x returns 2", { files: FIXED, body: "no-test: " });
  assert.equal((await repo.run(brake)).ok, false);
}));

test("no-test-for: in a later commit escapes; 6 chars or no reason does not", withRepo({}, async (repo) => {
  const fix = repo.commit("fix: x returns 2", { files: FIXED });
  repo.commit("docs: note", { files: { "docs/a.md": "a\n" }, body: `no-test-for: ${fix.slice(0, 6)} why` });
  assert.equal((await repo.run(brake)).ok, false);
  repo.commit("docs: note 2", { files: { "docs/b.md": "b\n" }, body: `no-test-for: ${fix.slice(0, 7)}` });
  assert.equal((await repo.run(brake)).ok, false);
  repo.commit("docs: note 3", { files: { "docs/c.md": "c\n" }, body: `no-test-for: ${fix.slice(0, 7)} the db suite covers it` });
  assert.deepEqual(await repo.run(brake), { ok: true, lines: [] });
}));

test("a fix that touches only docs, and a non-fix, are not checked", withRepo({}, async (repo) => {
  repo.commit("fix: typo", { files: { "docs/a.md": "a\n" } });
  repo.commit("feat: more", { files: { "src/y.mjs": "export {};\n" } });
  assert.deepEqual(await repo.run(brake), { ok: true, lines: [] });
}));

test("only not-runnable tests: pass with a note", withRepo({}, async (repo) => {
  repo.commit("fix: x returns 2", { files: { ...FIXED, "db-tests/x.sql": "select 1;\n" } });
  const r = await repo.run(brake);
  assert.equal(r.ok, true);
  assert.equal(r.lines.length, 1);
  assert.match(r.lines[0], /not run/);
}));

test("tests.run that is not Node", { skip: spawnSync("python3", ["-V"]).error ? "python3 is not installed" : false }, async () => {
  const py = `import sys\nfrom pathlib import Path\nsys.exit(0 if Path("src/x.txt").read_text().strip() == "2" else 1)\n`;
  const repo = makeRepo({ config: { ...config, tests: { ...config.tests, run: "python3 <files>" } }, files: { "src/x.txt": "1\n" } });
  try {
    repo.commit("fix: x is 2", { files: { "src/x.txt": "2\n", "test/x.py": py } });
    assert.deepEqual(await repo.run(brake), { ok: true, lines: [] });
    repo.commit("fix: x is 3", { files: { "src/x.txt": "3\n", "test/x.py": py } });
    assert.equal((await repo.run(brake)).ok, false);
  } finally { repo.cleanup(); }
});

test("a run that does not end in time: cannotRun", withRepo({ config: { ...config, tests: { ...config.tests, run: `node -e "setInterval(()=>{},1000)"` } } }, async (repo) => {
  brake.setLimitMs(500);
  try {
    repo.commit("fix: x returns 2", { files: { ...FIXED, ...NODE_TEST } });
    const r = await repo.run(brake);
    assert.equal(r.ok, false);
    assert.equal(r.cannotRun, true);
  } finally { brake.setLimitMs(120000); }
}));

test("needs names the four keys", () => {
  assert.deepEqual(brake.needs, ["paths.code", "tests.files", "tests.run", "tests.notRunnable"]);
});
