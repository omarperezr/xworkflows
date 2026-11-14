import { mkdtempSync as makeTmp, existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
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

test("a timeoutMinutes that is not a positive number in the timer's range falls back to the default and says so", async () => {
  for (const bad of [0, null, "x", 40000, -1]) {
    const repo = makeRepo({ config: { checks: { timeoutMinutes: bad, project: [{ name: "unit", run: "sleep 0.3; echo fine" }] } } });
    try {
      const r = await repo.run(brake);
      assert.equal(r.ok, true, `timeoutMinutes ${JSON.stringify(bad)}`);
      assert.equal(r.lines.length, 1);
      assert.match(r.lines[0], /checks\.timeoutMinutes/);
      assert.match(r.lines[0], /10 minutes/);
    } finally { repo.cleanup(); }
  }
});

test("a daemon that leaves the group and holds the pipe does not hold the check past the cut", async () => {
  const dir = mkdtempSync(join(tmpdir(), "xwf-daemon-"));
  const pidFile = join(dir, "pid");
  const script = join(dir, "start.mjs");
  writeFileSync(script, `import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const d = spawn("sleep", ["31"], { detached: true, stdio: ["ignore", 1, 2] });
writeFileSync(${JSON.stringify(pidFile + ".self")}, String(process.pid));
writeFileSync(${JSON.stringify(pidFile)}, String(d.pid));
setInterval(() => {}, 1000);
`);
  const repo = makeRepo({ config: { checks: { timeoutMinutes: 0.02, project: [{ name: "unit", run: `node '${script}'` }] } } });
  try {
    const t0 = Date.now();
    const r = await repo.run(brake);
    assert.equal(r.cannotRun, true);
    assert.ok(Date.now() - t0 < 4000, `the check waited ${Date.now() - t0} ms`);
  } finally {
    try { process.kill(Number(readFileSync(pidFile, "utf8")), "SIGKILL"); } catch {}
    repo.cleanup();
  }
});

// a project command that starts a daemon outside its group, the daemon holding the output pipe
const daemonCommand = (dir) => {
  const pidFile = join(dir, "pid"), script = join(dir, "start.mjs");
  writeFileSync(script, `import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const d = spawn("sleep", ["32"], { detached: true, stdio: ["ignore", 1, 2] });
writeFileSync(${JSON.stringify(pidFile + ".self")}, String(process.pid));
writeFileSync(${JSON.stringify(pidFile)}, String(d.pid));
setInterval(() => {}, 1000);
`);
  return { pidFile, cmd: `node '${script}'` };
};

// runs the check as its own process, waits for the daemon, sends the signal; resolves how it ended
const dieBySignal = async (repo, only, pidFile, signal) => {
  const { spawn } = await import("node:child_process");
  const run = new URL("./run.mjs", import.meta.url).pathname;
  const child = spawn(process.execPath, [run, "--only", only], { cwd: repo.root, detached: true, stdio: "ignore" });
  const ended = new Promise((r) => child.on("exit", (code, sig) => r({ code, sig })));
  try {
    for (let i = 0; i < 100 && !existsSync(pidFile); i++) await new Promise((r) => setTimeout(r, 100));
    assert.ok(existsSync(pidFile), "the daemon did not start");
    const t0 = Date.now();
    child.kill(signal);
    const r = await Promise.race([ended, new Promise((r) => setTimeout(() => r({ late: true }), 3000))]);
    await new Promise((r) => setTimeout(r, 300));
    let self = true;
    try { process.kill(Number(readFileSync(pidFile + ".self", "utf8")), 0); } catch { self = false; }
    return { ...r, ms: Date.now() - t0, self };
  } finally {
    try { process.kill(Number(readFileSync(pidFile, "utf8")), "SIGKILL"); } catch {}
    try { process.kill(-child.pid, "SIGKILL"); } catch {}
  }
};

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  test(`${signal} ends the check by that signal at once, though a daemon holds the pipe`, async () => {
    const dir = mkdtempSync(join(tmpdir(), "xwf-sig-"));
    const { pidFile, cmd } = daemonCommand(dir);
    const repo = makeRepo({ config: { checks: { timeoutMinutes: 0.1, project: [{ name: "unit", run: cmd }] } } });
    try {
      const r = await dieBySignal(repo, "project", pidFile, signal);
      assert.equal(r.late, undefined, `the check was still running 3 s after ${signal}`);
      assert.equal(r.sig, signal);
      assert.equal(r.self, false, "the project command is left running");
    } finally { repo.cleanup(); }
  });
}

test("a run leaves the listeners of SIGINT, SIGTERM and SIGHUP as it found them", async () => {
  const sigs = ["SIGINT", "SIGTERM", "SIGHUP"];
  const count = () => sigs.map((s) => process.listenerCount(s));
  const before = count();
  const repo = makeRepo({ config: { checks: { timeoutMinutes: 0.01, project: [] } } });
  try {
    await brake.runLimited("true", { root: repo.root, config: { checks: { timeoutMinutes: 1 } } });
    assert.deepEqual(count(), before);
    await brake.runLimited("sleep 30", { root: repo.root, config: { checks: { timeoutMinutes: 0.01 } } });
    assert.deepEqual(count(), before);
  } finally { repo.cleanup(); }
});
