import { test } from "node:test";
import assert from "node:assert/strict";
import { makeRepo } from "../test/helpers/repo.mjs";
import * as brake from "./ratchet.mjs";

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
    assert.notEqual(r.cannotRun, true);
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
