import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync as makeTmp, rmSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "../test-tmp.mjs";
import { join } from "node:path";
import * as brake from "./fix-has-test.mjs";
import { makeRepo } from "../test/helpers/repo.mjs";
const madeTmp = [];
const mkdtempSync = (p) => { const d = makeTmp(p); madeTmp.push(d); return d; };
test.after(() => { for (const d of madeTmp) rmSync(d, { recursive: true, force: true }); });

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

test("nothing runs at the fix commit: a test that fails there too passes this check, the push's whole run catches it", withRepo({}, async (repo) => {
  repo.commit("fix: x returns 2", { files: { ...FIXED, ...ALWAYS_FAILS } });
  assert.deepEqual(await repo.run(brake), { ok: true, lines: [] });
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

test("a run that does not end in time: cannotRun", withRepo({ config: { ...config, brakes: { fixHasTest: { seconds: 1 } }, tests: { ...config.tests, run: `node -e "setInterval(()=>{},1000)"` } } }, async (repo) => {
  repo.commit("fix: x returns 2", { files: { ...FIXED, ...NODE_TEST } });
  const r = await repo.run(brake);
  assert.equal(r.ok, false);
  assert.equal(r.cannotRun, true);
}));

const SLOW = { "test/x.test.mjs": `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { x } from "../src/x.mjs";\ntest("x", async () => { await new Promise((r) => setTimeout(r, 2500)); assert.equal(x(), 2); });\n` };
const withSeconds = (seconds) => ({ config: { ...config, brakes: { fixHasTest: { seconds } } } });

test("a test slower than the configured limit cannot run, and the line names the key", withRepo(withSeconds(1), async (repo) => {
  repo.commit("fix: x returns 2", { files: { ...FIXED, ...SLOW } });
  const r = await repo.run(brake);
  assert.equal(r.cannotRun, true);
  assert.match(r.lines[0], /did not end within 1s/);
  assert.match(r.lines[0], /brakes\.fixHasTest\.seconds/);
}));

test("the same slow fix passes with a larger configured limit", withRepo(withSeconds(60), async (repo) => {
  repo.commit("fix: x returns 2", { files: { ...FIXED, ...SLOW } });
  assert.deepEqual(await repo.run(brake), { ok: true, lines: [] });
}));

test("with no value in the config the limit is the default 120 seconds: a slow fix passes", withRepo({}, async (repo) => {
  repo.commit("fix: x returns 2", { files: { ...FIXED, ...SLOW } });
  assert.deepEqual(await repo.run(brake), { ok: true, lines: [] });
}));

for (const bad of [0, -5, "ten", 1.5, 2147484]) {
  test(`brakes.fixHasTest.seconds = ${JSON.stringify(bad)} cannot run and is named`, withRepo(withSeconds(bad), async (repo) => {
    repo.commit("fix: x returns 2", { files: { ...FIXED, ...NODE_TEST } });
    const r = await repo.run(brake);
    assert.equal(r.ok, false);
    assert.equal(r.cannotRun, true);
    assert.match(r.lines[0], /brakes\.fixHasTest\.seconds/);
    assert.doesNotMatch(r.lines[0], /did not end/, "refused before any run, not as a timeout");
    assert.match(r.lines[0], new RegExp(JSON.stringify(bad).replace(/[.]/g, "\\.")));
  }));
}

// the loader fills the defaults, so a config module older than the check is made by dropping the section
for (const [name, drop] of [["null", (c) => { c.brakes.fixHasTest = null; }], ["missing", (c) => { delete c.brakes; }]]) {
  test(`brakes.fixHasTest ${name} cannot run and names the key, never a TypeError`, withRepo({}, async (repo) => {
    repo.commit("fix: x returns 2", { files: { ...FIXED, ...NODE_TEST } });
    const r = await repo.run({ run: (range, ctx) => { drop(ctx.config); return brake.run(range, ctx); } });
    assert.equal(r.cannotRun, true);
    assert.match(r.lines[0], /brakes\.fixHasTest\.seconds/);
    assert.doesNotMatch(r.lines[0], /Cannot read/);
  }));
}

test("non-ASCII and spaced file names: a code path is seen, a test path is seen", withRepo({ config: { ...config, paths: { code: ["src/"] } } }, async (repo) => {
  repo.commit("fix: x", { files: { "src/cönfig.mjs": "export {};\n" } });
  assert.equal((await repo.run(brake)).ok, false);
  repo.commit("fix: y", { files: { "src/a b.mjs": "export {};\n", "test/xö y.test.mjs": NODE_TEST["test/x.test.mjs"].replace("../src/x.mjs", "../src/x.mjs") } });
  const r = await repo.run(brake);
  assert.doesNotMatch(r.lines.join("\n"), /fix: y: it changes code and adds no test file/);
}));

test("a timed-out run leaves no process behind", withRepo({}, async (repo) => {
  const pidf = join(tmpdir(), `xwf-pid-${process.pid}`);
  const cfg = { ...config, brakes: { fixHasTest: { seconds: 1 } }, tests: { ...config.tests, run: `node -e "require('fs').writeFileSync('${pidf}',String(process.pid));setInterval(()=>{},1000)" ; true` } };
  const r2 = makeRepo({ config: cfg, files: BUG });
  try {
    r2.commit("fix: x returns 2", { files: { ...FIXED, ...NODE_TEST } });
    assert.equal((await r2.run(brake)).cannotRun, true);
    const pid = Number(readFileSync(pidf, "utf8"));
    await new Promise((r) => setTimeout(r, 300));
    assert.throws(() => process.kill(pid, 0), /ESRCH/);
  } finally { r2.cleanup(); rmSync(pidf, { force: true }); }
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
  const log = join(mkdtempSync(join(tmpdir(), "xwf-ran-")), "ran");
  const t = { "test/x.test.mjs": `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { existsSync, appendFileSync } from "node:fs";\nimport { x } from "../src/x.mjs";\ntest("x", () => { appendFileSync(${JSON.stringify(log)}, String(existsSync(new URL("../pkg/node_modules/dep.txt", import.meta.url)))); assert.equal(x(), 2); });\n` };
  repo.commit("fix: x returns 2", { files: { ...FIXED, ...t } });
  assert.deepEqual(await repo.run(brake), { ok: true, lines: [] });
  assert.equal(readFileSync(log, "utf8"), "true");
}));

test("the test command does not inherit GIT_DIR", withRepo({}, async (repo) => {
  const log = join(mkdtempSync(join(tmpdir(), "xwf-ran-")), "ran");
  const t = { "test/x.test.mjs": `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { appendFileSync } from "node:fs";\nimport { x } from "../src/x.mjs";\ntest("x", () => { appendFileSync(${JSON.stringify(log)}, String(process.env.GIT_DIR)); assert.equal(x(), 2); });\n` };
  repo.commit("fix: x returns 2", { files: { ...FIXED, ...t } });
  process.env.GIT_DIR = "/nonexistent";
  try { assert.deepEqual(await repo.run(brake), { ok: true, lines: [] }); } finally { delete process.env.GIT_DIR; }
  assert.equal(readFileSync(log, "utf8"), "undefined");
}));

// each test of the file logs its name, so the log says which tests ran
const logged = (log, name, body) => `test(${JSON.stringify(name)}, async () => { appendFileSync(${JSON.stringify(log)}, ${JSON.stringify(name + "\n")}); ${body} });\n`;
const HEAD = `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { appendFileSync } from "node:fs";\nimport { x } from "../src/x.mjs";\n`;
const slowTests = (log) => [1, 2, 3, 4].map((i) => logged(log, `slow ${i}`, "await new Promise((r) => setTimeout(r, 2000));")).join("");
const newLog = () => join(mkdtempSync(join(tmpdir(), "xwf-ran-")), "ran");

test("a fix that adds one test to a file of many slow tests runs only that one, and only at the parent", withRepo({}, async (repo) => {
  const log = newLog();
  repo.commit("test: slow tests", { files: { "test/x.test.mjs": HEAD + slowTests(log) } });
  repo.commit("fix: x returns 2", { files: { ...FIXED, "test/x.test.mjs": HEAD + slowTests(log) + logged(log, "x is 2", "assert.equal(x(), 2);") } });
  const t0 = Date.now();
  assert.deepEqual(await repo.run(brake), { ok: true, lines: [] });
  const ms = Date.now() - t0;
  assert.equal(readFileSync(log, "utf8"), "x is 2\n");
  assert.ok(ms < 8000, `took ${ms} ms; one whole run of the file takes 8000`);
}));

test("a test whose text the fix changes is run, the unchanged ones are not", withRepo({}, async (repo) => {
  const log = newLog();
  repo.commit("test: slow tests", { files: { "test/x.test.mjs": HEAD + logged(log, "x", "assert.equal(x(), 1);") + slowTests(log) } });
  repo.commit("fix: x returns 2", { files: { ...FIXED, "test/x.test.mjs": HEAD + logged(log, "x", "assert.equal(x(), 2);") + slowTests(log) } });
  assert.deepEqual(await repo.run(brake), { ok: true, lines: [] });
  assert.equal(readFileSync(log, "utf8"), "x\n");
}));

test("names too long for one command line: the whole file runs, no E2BIG", withRepo({}, async (repo) => {
  const many = Array.from({ length: 30 }, (_, i) => `test("${String(i).padStart(2, "0")}${"a".repeat(40000)}", () => assert.equal(x(), 2));\n`).join("");
  repo.commit("fix: x returns 2", { files: { ...FIXED, "test/x.test.mjs": HEAD + many } });
  assert.deepEqual(await repo.run(brake), { ok: true, lines: [] });
}));

test("many short names, a command over the byte limit: the whole file runs, no spawn error", withRepo({}, async (repo) => {
  const log = newLog();
  const unchanged = `test("unchanged", () => { appendFileSync(${JSON.stringify(log)}, "u\\n"); });\n`;
  const many = Array.from({ length: 4500 }, (_, i) => `test("t${String(i).padStart(4, "0")}", () => assert.equal(x(), 2));\n`).join("");
  repo.commit("test: unchanged", { files: { "test/x.test.mjs": HEAD + unchanged } });
  repo.commit("fix: x returns 2", { files: { ...FIXED, "test/x.test.mjs": HEAD + unchanged + many } });
  assert.deepEqual(await repo.run(brake), { ok: true, lines: [] });
  assert.match(readFileSync(log, "utf8"), /u\n/, "only the changed names ran, not the whole file");
}));

test("a name that opens and does not close, with many backslashes, is read in linear time", withRepo({}, async (repo) => {
  const t = `// test("${"\\".repeat(46)}\ntest("x", () => assert.equal(x(), 2));\n`;
  repo.commit("fix: x returns 2", { files: { ...FIXED, "test/x.test.mjs": HEAD + t } });
  const t0 = Date.now();
  assert.deepEqual(await repo.run(brake), { ok: true, lines: [] });
  assert.ok(Date.now() - t0 < 4000, "the pattern took too long");
}));

test("a test named by a template runs by its pattern", withRepo({}, async (repo) => {
  const log = newLog();
  const t = `for (const n of [2]) test(\`x is \${n}\`, () => { appendFileSync(${JSON.stringify(log)}, "x\\n"); assert.equal(x(), n); });\n`;
  repo.commit("test: slow tests", { files: { "test/x.test.mjs": HEAD + slowTests(log) } });
  repo.commit("fix: x returns 2", { files: { ...FIXED, "test/x.test.mjs": HEAD + slowTests(log) + t } });
  assert.deepEqual(await repo.run(brake), { ok: true, lines: [] });
  assert.equal(readFileSync(log, "utf8"), "x\n");
}));

// a table above a generated test: the row a fix adds is no test of its own, the generated test after it runs with the changed ones
const rowsFile = (log, rows, tail) => `${HEAD}${logged(log, "head", "assert.ok(true);")}const ROWS = ${JSON.stringify(rows)};\nfor (const n of ROWS) test(\`row \${n}\`, () => { appendFileSync(${JSON.stringify(log)}, "row " + n + "\\n"); assert.equal(x(), n); });\n${tail}`;

test("a row added to a table above a generated test: that test runs with the changed ones, and a red of it decides", withRepo({}, async (repo) => {
  const log = newLog();
  repo.commit("test: rows", { files: { "test/x.test.mjs": rowsFile(log, [1], slowTests(log)) } });
  repo.commit("fix: x returns 2", { files: { ...FIXED, "test/x.test.mjs": rowsFile(log, [1, 2], slowTests(log)) } });
  const t0 = Date.now();
  assert.deepEqual(await repo.run(brake), { ok: true, lines: [] });
  assert.equal(readFileSync(log, "utf8"), "head\nrow 1\nrow 2\n");
  assert.ok(Date.now() - t0 < 8000, "the slow tests of the file ran");
}));

test("a generated test after the changed ones that passes at the parent: the whole file decides as before", withRepo({}, async (repo) => {
  const log = newLog();
  const tail = logged(log, "after", "assert.equal(x(), 2);");
  repo.commit("test: rows", { files: { "test/x.test.mjs": rowsFile(log, [1], tail) } });
  repo.commit("fix: x returns 2", { files: { ...FIXED, "test/x.test.mjs": rowsFile(log, [1, 1], tail) } });
  assert.deepEqual(await repo.run(brake), { ok: true, lines: [] });
  assert.match(readFileSync(log, "utf8"), /after\n$/);
}));

test("when the changed tests pass at the parent, the whole file decides as before", withRepo({}, async (repo) => {
  // the fix changes a value above the tests, which only the unchanged test reads
  const file = (want, extra) => `${HEAD}const WANT = ${want};\ntest("x", () => assert.equal(x(), WANT));\ntest("other", () => { ${extra} });\n`;
  repo.commit("test: x", { files: { "test/x.test.mjs": file(1, "") } });
  repo.commit("fix: x returns 2", { files: { ...FIXED, "test/x.test.mjs": file(2, "assert.ok(true);") } });
  assert.deepEqual(await repo.run(brake), { ok: true, lines: [] });
}));

test("a filtered run at the parent that ran no test is not a pass: the whole file decides", withRepo({}, async (repo) => {
  const log = newLog();
  // the escaped name matches no test by its pattern
  const t = `test("x\\u0020is 2", () => { appendFileSync(${JSON.stringify(log)}, "ran\\n"); assert.equal(x(), 2); });\n`;
  repo.commit("fix: x returns 2", { files: { ...FIXED, "test/x.test.mjs": HEAD + t } });
  assert.deepEqual(await repo.run(brake), { ok: true, lines: [] });
  assert.equal(readFileSync(log, "utf8"), "ran\n");
}));

test("needs names the four keys", () => {
  assert.deepEqual(brake.needs, ["paths.code", "tests.files", "tests.run", "tests.notRunnable"]);
});
