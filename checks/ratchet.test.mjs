import { test } from "node:test";
import assert from "node:assert/strict";
import { makeRepo } from "../test/helpers/repo.mjs";
import * as brake from "./ratchet.mjs";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = ".xworkflows/ratchets.json";
const withRepo = async (list, base, fn) => {
  const files = base === undefined ? {} : { [BASE]: typeof base === "string" ? base : JSON.stringify(base) };
  const repo = makeRepo({ config: { checks: { ratchets: list } }, files });
  try { await fn(repo); } finally { repo.cleanup(); }
};
const debt = (n, name = "todo") => [{ name, count: `echo ${n}` }];

test("needs checks.ratchets", () => assert.deepEqual(brake.needs, ["checks.ratchets"]));

test("an empty list passes", () => withRepo([], undefined, async (repo) => {
  assert.deepEqual(await repo.run(brake), { ok: true, lines: [] });
}));

test("equal passes with no lines", () => withRepo(debt(5), { todo: 5 }, async (repo) => {
  assert.deepEqual(await repo.run(brake), { ok: true, lines: [] });
}));

test("above fails with both numbers", () => withRepo(debt(7), { todo: 5 }, async (repo) => {
  const r = await repo.run(brake);
  assert.equal(r.ok, false);
  assert.notEqual(r.cannotRun, true);
  assert.match(r.lines[0], /todo/);
  assert.match(r.lines[0], /7/);
  assert.match(r.lines[0], /5/);
}));

test("below passes with the note", () => withRepo(debt(3), { todo: 5 }, async (repo) => {
  assert.deepEqual(await repo.run(brake), { ok: true, lines: ["todo: lower the baseline to 3"] });
}));

test("a missing baseline entry fails and names the number to add", () => withRepo(debt(4), { other: 1 }, async (repo) => {
  const r = await repo.run(brake);
  assert.equal(r.ok, false);
  assert.match(r.lines.join("\n"), /"todo": 4/);
}));

test("a missing baseline file fails", () => withRepo(debt(4), undefined, async (repo) => {
  const r = await repo.run(brake);
  assert.equal(r.ok, false);
  assert.notEqual(r.cannotRun, true);
  assert.match(r.lines.join("\n"), /"todo": 4/);
}));

test("a baseline file that is not an object of numbers is could not run", () => withRepo(debt(4), "[1]", async (repo) => {
  const r = await repo.run(brake);
  assert.equal(r.ok, false);
  assert.equal(r.cannotRun, true);
}));

test("a command that prints text is could not run", () => withRepo([{ name: "todo", count: "echo many" }], { todo: 5 }, async (repo) => {
  const r = await repo.run(brake);
  assert.equal(r.ok, false);
  assert.equal(r.cannotRun, true);
}));

test("a command that exits non-zero is could not run", () => withRepo([{ name: "todo", count: "echo 1; exit 2" }], { todo: 5 }, async (repo) => {
  const r = await repo.run(brake);
  assert.equal(r.ok, false);
  assert.equal(r.cannotRun, true);
}));

test("a head that is not HEAD fails with the check-out line", () => withRepo(debt(5), { todo: 5 }, async (repo) => {
  const first = repo.git("rev-parse", "HEAD");
  repo.commit("second");
  const r = await repo.run(brake, { head: first });
  assert.equal(r.ok, false);
  assert.notEqual(r.cannotRun, true);
  assert.match(r.lines[0], /check out/);
}));

test("modified tracked files fail with the check-out line", () => withRepo(debt(5), { todo: 5 }, async (repo) => {
  repo.write(BASE, '{"todo":9}');
  const r = await repo.run(brake);
  assert.equal(r.ok, false);
  assert.match(r.lines[0], /check out/);
}));

test("the baseline is read at head, not the working tree", () => withRepo(debt(7), { todo: 5 }, async (repo) => {
  repo.commit("raise", { files: { [BASE]: '{"todo":9}' } });
  assert.equal((await repo.run(brake)).ok, true);
}));

test("accented, spaced names and a command run in the repository root", () =>
  withRepo([{ name: "über résumé", count: "ls -A | wc -l | tr -d ' '" }], { "über résumé": 0 }, async (repo) => {
    const r = await repo.run(brake);
    assert.equal(r.ok, false);
    assert.match(r.lines[0], /über résumé/);
  }));

test("an accented file name does not break the clean-tree test", () =>
  withRepo(debt(5), { todo: 5 }, async (repo) => {
    repo.commit("add", { files: { "naïve final.txt": "x\n" } });
    repo.write("naïve final.txt", "y\n");
    assert.equal((await repo.run(brake)).ok, false);
  }));

for (const [what, list] of [["an object", { name: "a", count: "echo 1" }], ["an entry without count", [{ name: "a" }]], ["a non-string count", [{ name: "a", count: 1 }]]]) {
  test(`a wrong-shaped list (${what}) is could not run`, () => withRepo(list, { a: 1 }, async (repo) => {
    const r = await repo.run(brake);
    assert.equal(r.ok, false);
    assert.equal(r.cannotRun, true);
  }));
}

test("a count command that passes the limit is cut: the line gives the command, the minutes and the key", async () => {
  const repo = makeRepo({ config: { checks: { timeoutMinutes: 0.01, ratchets: [{ name: "todo", count: "sleep 30" }] } }, files: { [BASE]: '{"todo":5}' } });
  try {
    const r = await repo.run(brake);
    assert.equal(r.ok, false);
    assert.equal(r.cannotRun, true);
    const line = r.lines.join("\n");
    assert.match(line, /todo/);
    assert.match(line, /sleep 30/);
    assert.match(line, /0\.01 minutes/);
    assert.match(line, /checks\.timeoutMinutes/);
    assert.match(line, /by hand/);
  } finally { repo.cleanup(); }
});

test("a count command that ends in time is not cut by the limit", async () => {
  const repo = makeRepo({ config: { checks: { timeoutMinutes: 0.5, ratchets: debt(7) } }, files: { [BASE]: '{"todo":5}' } });
  try {
    const r = await repo.run(brake);
    assert.match(r.lines[0], /7 is above the baseline 5/);
  } finally { repo.cleanup(); }
});

test("a timeoutMinutes of 0 falls back to the default and says so; the count command still runs", async () => {
  const repo = makeRepo({ config: { checks: { timeoutMinutes: 0, ratchets: debt(5) } }, files: { [BASE]: '{"todo":5}' } });
  try {
    const r = await repo.run(brake);
    assert.equal(r.ok, true);
    assert.equal(r.lines.length, 1);
    assert.match(r.lines[0], /checks\.timeoutMinutes/);
  } finally { repo.cleanup(); }
});

// a count command that starts a daemon outside its group, the daemon holding the output pipe
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

test("SIGTERM ends the ratchet check by that signal at once, though a daemon holds the pipe", async () => {
  const dir = mkdtempSync(join(tmpdir(), "xwf-sig-"));
  const { pidFile, cmd } = daemonCommand(dir);
  const repo = makeRepo({ config: { checks: { timeoutMinutes: 0.1, ratchets: [{ name: "todo", count: cmd }] } }, files: { [BASE]: '{"todo":5}' } });
  try {
    const r = await dieBySignal(repo, "ratchet", pidFile, "SIGTERM");
    assert.equal(r.late, undefined, "the check was still running 3 s after SIGTERM");
    assert.equal(r.sig, "SIGTERM");
    assert.equal(r.self, false, "the count command is left running");
  } finally { repo.cleanup(); rmSync(dir, { recursive: true, force: true }); }
});
