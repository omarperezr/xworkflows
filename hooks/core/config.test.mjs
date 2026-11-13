import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, PROJECT_KEYS, merge, load, get, missing, inPaths } from "./config.mjs";

test("DEFAULTS has the product defaults and none of the project keys", () => {
  assert.equal(DEFAULTS.mainBranch, "main");
  assert.equal(DEFAULTS.git.rules.length, 4);
  assert.deepEqual(DEFAULTS.brakes.changeSize, { warn: 400, max: 800 });
  assert.deepEqual(missing(DEFAULTS, PROJECT_KEYS), PROJECT_KEYS);
  assert.equal(PROJECT_KEYS.length, 10);
});

test("merge keeps untouched defaults while a user object adds one comment mark", () => {
  const out = merge(DEFAULTS, { comments: { marks: { rb: ["#"] } } });
  assert.deepEqual(out.comments.marks.rb, ["#"]);
  assert.deepEqual(out.comments.marks.ts, ["//"]);
  assert.equal(out.owner, "the owner");
  assert.equal(DEFAULTS.comments.marks.rb, undefined);
});

test("merge: a user array, scalar or null replaces; inputs are not mutated", () => {
  const base = { a: [1, 2], b: { c: 1 }, d: 1 };
  const out = merge(base, { a: [3], d: null });
  assert.deepEqual(out, { a: [3], b: { c: 1 }, d: null });
  assert.deepEqual(base, { a: [1, 2], b: { c: 1 }, d: 1 });
  out.b.c = 9;
  assert.equal(base.b.c, 1);
});

test("DEFAULTS: .gitignore is not code", () => {
  assert.ok(DEFAULTS.paths.nonCode.includes(".gitignore"));
});

test("load: missing file gives a copy of DEFAULTS", () => {
  const out = load("/r", () => null);
  assert.deepEqual(out, DEFAULTS);
  out.paths.nonCode.push("x");
  assert.equal(DEFAULTS.paths.nonCode.includes("x"), false);
});

test("load: reads <root>/.xworkflows/config.json and merges", () => {
  let asked;
  const out = load("/r", (p) => ((asked = p), '{"owner":"Ana"}'));
  assert.equal(asked, "/r/.xworkflows/config.json");
  assert.equal(out.owner, "Ana");
  assert.equal(out.mainBranch, "main");
});

test("load: broken JSON and a JSON array throw", () => {
  assert.throws(() => load("/r", () => "{nope"), /^Error: .xworkflows\/config.json does not parse: /);
  assert.throws(() => load("/r", () => "[]"), /does not parse/);
});

test("get: dotted lookup, undefined when a step is absent", () => {
  assert.equal(get(DEFAULTS, "paths.specs"), "docs/superpowers/specs");
  assert.equal(get(DEFAULTS, "paths.code"), undefined);
  assert.equal(get(DEFAULTS, "tests.files.x"), undefined);
});

test("missing: only undefined counts; empty values are present", () => {
  const c = { paths: { code: [] }, a: "", b: 0, c: false, d: null };
  assert.deepEqual(missing(c, ["paths.code", "a", "b", "c", "d"]), []);
  assert.deepEqual(missing(c, ["paths.risk", "paths.code"]), ["paths.risk"]);
});

test("inPaths: prefixes", () => {
  assert.ok(inPaths("src/a.js", ["src"]));
  assert.ok(inPaths("src/a.js", ["src/"]));
  assert.ok(!inPaths("srcx/a.js", ["src"]));
  assert.ok(!inPaths("srcx/a.js", ["src/"]));
  assert.ok(inPaths("scripts/run.sh", ["scripts/run.sh"]));
  assert.ok(!inPaths("a.js", undefined));
  assert.ok(!inPaths("a.js", []));
});

test("inPaths: globs", () => {
  assert.ok(inPaths("README.md", ["**/*.md"]));
  assert.ok(inPaths("docs/a/b.md", ["**/*.md"]));
  assert.ok(inPaths("src/a.test.ts", ["src/*.test.ts"]));
  assert.ok(!inPaths("src/deep/a.test.ts", ["src/*.test.ts"]));
  assert.ok(inPaths("a.test.mjs", ["*.test.mjs"]));
  assert.ok(!inPaths("x/a.test.mjs", ["*.test.mjs"]));
  assert.ok(!inPaths("a.test.mjs.bak", ["*.test.mjs"]));
  assert.ok(!inPaths("axb", ["a.*b"]));
});

test("DEFAULTS: a project command is cut after 10 minutes, and a project can set it", () => {
  assert.equal(DEFAULTS.checks.timeoutMinutes, 10);
  assert.equal(merge(DEFAULTS, { checks: { project: [] } }).checks.timeoutMinutes, 10);
  assert.equal(merge(DEFAULTS, { checks: { timeoutMinutes: 2 } }).checks.timeoutMinutes, 2);
});
