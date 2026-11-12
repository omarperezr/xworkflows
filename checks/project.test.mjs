import { test } from "node:test";
import assert from "node:assert/strict";
import { makeRepo } from "../test/helpers/repo.mjs";
import * as brake from "./project.mjs";

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
