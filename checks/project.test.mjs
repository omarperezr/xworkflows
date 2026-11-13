import { mkdtempSync as makeTmp, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeRepo } from "../test/helpers/repo.mjs";
import * as brake from "./project.mjs";
const madeTmp = [];
const mkdtempSync = (p) => { const d = makeTmp(p); madeTmp.push(d); return d; };
test.after(() => { for (const d of madeTmp) rmSync(d, { recursive: true, force: true }); });

const withRepo = async (list, fn, files) => {
  const repo = makeRepo({ config: { checks: { project: list } }, files });
  try { await fn(repo); } finally { repo.cleanup(); }
};

test("needs checks.project", () => assert.deepEqual(brake.needs, ["checks.project"]));

test("an empty list passes", () => withRepo([], async (repo) => {
  assert.deepEqual(await repo.run(brake), { ok: true, lines: [] });
}));

test("a passing command passes", () => withRepo([{ name: "types", run: "echo fine" }], async (repo) => {
  assert.deepEqual(await repo.run(brake), { ok: true, lines: [] });
}));

test("a failing command fails with the last 20 lines of stdout and stderr", () =>
  withRepo([{ name: "unit", run: "seq 1 25; echo err-line >&2; exit 3" }], async (repo) => {
    const r = await repo.run(brake);
    assert.equal(r.ok, false);
    assert.notEqual(r.cannotRun, true);
    assert.equal(r.lines[0], "unit failed (exit 3)");
    assert.equal(r.lines.length, 21);
    assert.equal(r.lines[1], "7");
    assert.equal(r.lines.at(-1), "err-line");
    assert.ok(!r.lines.includes("6"));
  }));

test("two entries, the second failing, names the second", () =>
  withRepo([{ name: "types", run: "true" }, { name: "unit", run: "exit 1" }], async (repo) => {
    const r = await repo.run(brake);
    assert.equal(r.lines[0], "unit failed (exit 1)");
  }));

test("all entries run even after a failure; the first failure is not hidden", () =>
  withRepo([{ name: "a", run: "exit 2" }, { name: "b", run: "exit 4" }], async (repo) => {
    const r = await repo.run(brake);
    assert.equal(r.lines[0], "a failed (exit 2)");
    assert.ok(r.lines.includes("b failed (exit 4)"));
  }));

test("a head that is not HEAD fails with the check-out line", () =>
  withRepo([{ name: "t", run: "true" }], async (repo) => {
    const old = repo.git("rev-parse", "HEAD");
    repo.commit("second");
    const r = await repo.run(brake, { head: old });
    assert.equal(r.ok, false);
    assert.match(r.lines[0], /^check out .+ or commit first$/);
  }));

test("a modified tracked file fails with the check-out line", () =>
  withRepo([{ name: "t", run: "true" }], async (repo) => {
    repo.write("a.txt", "changed");
    const r = await repo.run(brake);
    assert.equal(r.ok, false);
    assert.match(r.lines[0], /^check out .+ or commit first$/);
  }, { "a.txt": "one" }));

test("an untracked file does not", () =>
  withRepo([{ name: "t", run: "true" }], async (repo) => {
    repo.write("new.txt", "x");
    assert.equal((await repo.run(brake)).ok, true);
  }));

test("a checks.project that is not a list of { name, run } cannot run", async () => {
  for (const bad of [{ name: "t", run: "exit 1" }, [{ name: "t" }], ["exit 1"], [null]]) {
    await withRepo(bad, async (repo) => {
      const r = await repo.run(brake);
      assert.equal(r.ok, false);
      assert.equal(r.cannotRun, true);
      assert.deepEqual(r.lines, ["checks.project is not a list of { name, run }"]);
    });
  }
});

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

test("a command that passes the limit is cut: the line gives the command, the minutes and the key", async () => {
  const repo = makeRepo({ config: { checks: { timeoutMinutes: 0.01, project: [{ name: "unit", run: "sleep 30" }] } } });
  try {
    const r = await repo.run(brake);
    assert.equal(r.ok, false);
    assert.equal(r.cannotRun, true);
    assert.equal(r.lines.length, 1);
    const line = r.lines.join("\n");
    assert.match(line, /unit/);
    assert.match(line, /sleep 30/);
    assert.match(line, /0\.01 minutes/);
    assert.match(line, /checks\.timeoutMinutes/);
    assert.match(line, /by hand/);
  } finally { repo.cleanup(); }
});

test("a command that ends in time is not cut by the limit", async () => {
  const repo = makeRepo({ config: { checks: { timeoutMinutes: 0.5, project: [{ name: "unit", run: "echo fine; exit 3" }] } } });
  try {
    const r = await repo.run(brake);
    assert.equal(r.lines[0], "unit failed (exit 3)");
    assert.equal(r.lines[1], "fine");
  } finally { repo.cleanup(); }
});

test("a child the cut command started is not left running", async () => {
  const pidFile = join(mkdtempSync(join(tmpdir(), "xwf-pid-")), "pid");
  const repo = makeRepo({ config: { checks: { timeoutMinutes: 0.01, project: [{ name: "unit", run: `sleep 30 & echo $! > '${pidFile}'; wait` }] } } });
  try {
    assert.equal((await repo.run(brake)).ok, false);
    const pid = Number(readFileSync(pidFile, "utf8"));
    for (let i = 0; i < 50 && alive(pid); i++) await new Promise((r) => setTimeout(r, 100));
    assert.equal(alive(pid), false);
  } finally { repo.cleanup(); }
});

test("an interrupted check leaves no project command running", () =>
  withRepo([{ name: "hang", run: "sleep 4242" }], async (repo) => {
    const { spawn, spawnSync } = await import("node:child_process");
    const alive = () => spawnSync("pgrep", ["-f", "sleep 4242"]).status === 0;
    const run = new URL("./run.mjs", import.meta.url).pathname;
    const child = spawn(process.execPath, [run, "--only", "project"], { cwd: repo.root, detached: true, stdio: "ignore" });
    try {
      for (let i = 0; i < 50 && !alive(); i++) await new Promise((r) => setTimeout(r, 100));
      assert.ok(alive(), "the command did not start");
      process.kill(-child.pid, "SIGINT");
      await new Promise((r) => setTimeout(r, 1500));
      assert.equal(alive(), false, "the command is left running after SIGINT");
    } finally {
      spawnSync("pkill", ["-f", "sleep 4242"]);
      try { process.kill(-child.pid, "SIGKILL"); } catch {}
    }
  }));
