import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as brake from "./fix-has-test.mjs";
import { makeRepo } from "../test/helpers/repo.mjs";

const config = {
  paths: { code: ["src/"] },
  tests: { files: ["test/**/*.test.mjs", "test/*.py"], run: "node --test <files>", notRunnable: ["sql-suite/"] },
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
  repo.commit("fix: x returns 2", { files: { ...FIXED, "sql-suite/x.sql": "select 1;\n" } });
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

test("non-ASCII and spaced file names: a code path is seen, a test path is seen", withRepo({ config: { ...config, paths: { code: ["src/"] } } }, async (repo) => {
  repo.commit("fix: x", { files: { "src/cönfig.mjs": "export {};\n" } });
  assert.equal((await repo.run(brake)).ok, false);
  repo.commit("fix: y", { files: { "src/a b.mjs": "export {};\n", "test/xö y.test.mjs": NODE_TEST["test/x.test.mjs"].replace("../src/x.mjs", "../src/x.mjs") } });
  const r = await repo.run(brake);
  assert.doesNotMatch(r.lines.join("\n"), /fix: y: it changes code and adds no test file/);
}));

test("a timed-out run leaves no process behind", withRepo({}, async (repo) => {
  const pidf = join(tmpdir(), `xwf-pid-${process.pid}`);
  const cfg = { ...config, tests: { ...config.tests, run: `node -e "require('fs').writeFileSync('${pidf}',String(process.pid));setInterval(()=>{},1000)" ; true` } };
  const r2 = makeRepo({ config: cfg, files: BUG });
  brake.setLimitMs(1500);
  try {
    r2.commit("fix: x returns 2", { files: { ...FIXED, ...NODE_TEST } });
    assert.equal((await r2.run(brake)).cannotRun, true);
    const pid = Number(readFileSync(pidf, "utf8"));
    await new Promise((r) => setTimeout(r, 300));
    assert.throws(() => process.kill(pid, 0), /ESRCH/);
  } finally { brake.setLimitMs(120000); r2.cleanup(); rmSync(pidf, { force: true }); }
}));

test("SIGINT to the process group kills the test command, removes the worktree, ends non-zero", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "xwf-sig-"));
  const pidf = join(tmp, "pid");
  const cfg = { ...config, tests: { ...config.tests, run: `node -e "require('fs').writeFileSync('${pidf}',String(process.pid));setInterval(()=>{},1000)"` } };
  const repo = makeRepo({ config: cfg, files: BUG });
  let child;
  try {
    repo.commit("fix: x returns 2", { files: { ...FIXED, ...NODE_TEST } });
    const script = join(tmp, "child.mjs");
    writeFileSync(script, `import * as brake from ${JSON.stringify(new URL("./fix-has-test.mjs", import.meta.url).href)};
import { makeRepo } from ${JSON.stringify(new URL("../test/helpers/repo.mjs", import.meta.url).href)};
import { load } from ${JSON.stringify(new URL("../hooks/core/config.mjs", import.meta.url).href)};
import { makeCtx, rangeFor } from ${JSON.stringify(new URL("./run.mjs", import.meta.url).href)};
const ctx = makeCtx(${JSON.stringify(repo.root)}, load(${JSON.stringify(repo.root)}));
const first = ${JSON.stringify(repo.git("rev-parse", "HEAD~1"))}, head = ${JSON.stringify(repo.git("rev-parse", "HEAD"))};
await brake.run(rangeFor(ctx, { base: first, head }), ctx);
`);
    child = spawn(process.execPath, [script], { detached: true, stdio: "ignore" });
    const exited = new Promise((res) => child.on("exit", (code, sig) => res({ code, sig })));
    const late = new Promise((_, rej) => setTimeout(() => rej(new Error("the child did not end after SIGINT")), 30000).unref());
    for (let i = 0; i < 100 && !existsSync(pidf); i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 200));
    const pid = Number(readFileSync(pidf, "utf8"));
    process.kill(-child.pid, "SIGINT");
    const { code, sig } = await Promise.race([exited, late]);
    assert.ok(sig || code !== 0, "child must not end as if nothing happened");
    assert.throws(() => process.kill(pid, 0), /ESRCH/);
    assert.equal(repo.git("worktree", "list").split("\n").length, 1, "worktree left behind");
  } finally {
    try { process.kill(-child.pid, "SIGKILL"); } catch {}
    repo.cleanup(); rmSync(tmp, { recursive: true, force: true });
  }
});

test("SIGINT while git runs between two test runs still removes the worktree", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "xwf-sig-"));
  const repo = makeRepo({ config, files: BUG });
  let child;
  try {
    repo.commit("fix: x returns 2", { files: { ...FIXED, ...NODE_TEST } });
    const hook = join(repo.root, ".git", "hooks", "post-checkout");
    writeFileSync(hook, `#!/bin/sh\necho 1 > '${join(tmp, "in-git")}'\nsleep 1\n`, { mode: 0o755 });
    const script = join(tmp, "child.mjs");
    writeFileSync(script, `import * as brake from ${JSON.stringify(new URL("./fix-has-test.mjs", import.meta.url).href)};
import { load } from ${JSON.stringify(new URL("../hooks/core/config.mjs", import.meta.url).href)};
import { makeCtx, rangeFor } from ${JSON.stringify(new URL("./run.mjs", import.meta.url).href)};
const ctx = makeCtx(${JSON.stringify(repo.root)}, load(${JSON.stringify(repo.root)}));
const first = ${JSON.stringify(repo.git("rev-parse", "HEAD~1"))}, head = ${JSON.stringify(repo.git("rev-parse", "HEAD"))};
await brake.run(rangeFor(ctx, { base: first, head }), ctx);
`);
    child = spawn(process.execPath, [script], { stdio: "ignore" });
    const exited = new Promise((res) => child.on("exit", (code, sig) => res({ code, sig })));
    for (let i = 0; i < 100 && !existsSync(join(tmp, "in-git")); i++) await new Promise((r) => setTimeout(r, 50));
    process.kill(child.pid, "SIGINT");
    const { code, sig } = await Promise.race([exited, new Promise((_, rej) => setTimeout(() => rej(new Error("the child did not end after SIGINT")), 30000).unref())]);
    assert.ok(sig || code !== 0, "child must not end as if nothing happened");
    await new Promise((r) => setTimeout(r, 1500)); // a git the child left running ends
    assert.equal(repo.git("worktree", "list").split("\n").length, 1, "worktree left behind");
  } finally {
    try { child.kill("SIGKILL"); } catch {}
    repo.cleanup(); rmSync(tmp, { recursive: true, force: true });
  }
});

test("a test in a package with its own node_modules sees it", withRepo({ files: { ...BUG, "pkg/package.json": "{}\n", ".gitignore": "node_modules\n" } }, async (repo) => {
  repo.write("pkg/node_modules/dep.txt", "here\n");
  const t = { "test/x.test.mjs": `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { existsSync } from "node:fs";\nimport { x } from "../src/x.mjs";\ntest("x", () => { assert.ok(existsSync(new URL("../pkg/node_modules/dep.txt", import.meta.url))); assert.equal(x(), 2); });\n` };
  repo.commit("fix: x returns 2", { files: { ...FIXED, ...t } });
  const r = await repo.run(brake);
  assert.doesNotMatch(r.lines.join("\n"), /pass at the parent/);
  assert.deepEqual(r, { ok: true, lines: [] });
}));

test("the test command does not inherit GIT_DIR", withRepo({}, async (repo) => {
  const t = { "test/x.test.mjs": `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { x } from "../src/x.mjs";\ntest("x", () => { assert.equal(process.env.GIT_DIR, undefined); assert.equal(x(), 2); });\n` };
  repo.commit("fix: x returns 2", { files: { ...FIXED, ...t } });
  process.env.GIT_DIR = "/nonexistent";
  try { assert.deepEqual(await repo.run(brake), { ok: true, lines: [] }); } finally { delete process.env.GIT_DIR; }
}));

test("needs names the four keys", () => {
  assert.deepEqual(brake.needs, ["paths.code", "tests.files", "tests.run", "tests.notRunnable"]);
});
