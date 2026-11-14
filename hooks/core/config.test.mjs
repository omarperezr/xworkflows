import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULTS, PROJECT_KEYS, merge, load, loadLenient, get, missing, inPaths, memoryDir, memoryFolder } from "./config.mjs";
import { outsideLine } from "./ctx.mjs";

test("DEFAULTS has the product defaults and none of the project keys", () => {
  assert.equal(DEFAULTS.mainBranch, "main");
  assert.equal(DEFAULTS.git.rules.length, 4);
  assert.deepEqual(DEFAULTS.brakes.changeSize, { warn: 400, max: 800 });
  assert.equal(DEFAULTS.brakes.fixHasTest.seconds, 120);
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

test("load: a section that is not an object is refused by its name; the whole file that is not an object does not parse", () => {
  for (const [text, name] of [['{"memory":null}', "memory"], ['{"paths":5}', "paths"], ['{"packs":[]}', "packs"], ['{"lookup":"x"}', "lookup"], ['{"tests":"node --test"}', "tests"], ['{"owner":"Ana","checks":false}', "checks"]]) {
    assert.throws(() => load("/r", () => text), { message: `.xworkflows/config.json: ${name} must be an object` }, text);
  }
  assert.throws(() => load("/r", () => "null"), { message: ".xworkflows/config.json does not parse: not a JSON object" });
  assert.equal(load("/r", () => '{"owner":"Ana","zones":[],"memory":{"dir":"n"},"tests":{"run":"x"}}').memory.dir, "n");
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

test("memoryDir: a folder name inside the repository comes back plain, anything else is null", () => {
  for (const [dir, want] of [["docs/memory", "docs/memory"], ["./x", "x"], ["x/", "x"], ["x//", "x"], [" x ", "x"], ["docs//memory", "docs/memory"], ["..x", "..x"], ["a/..b", "a/..b"],
    ["", null], [" ", null], [".", null], ["./", null], ["/x", null], ["..", null], ["../x", null], ["a/../..", null], [undefined, null], [{ a: 1 }, null]]) {
    assert.equal(memoryDir(dir), want, JSON.stringify(dir));
  }
});

test("memory.outside is an empty list by default", () => {
  assert.deepEqual(DEFAULTS.memory.outside, []);
  assert.deepEqual(merge(DEFAULTS, { memory: { dir: "n" } }).memory, { dir: "n", outside: [] });
});

test("dream.maxExtractBytes defaults to 4000000 and a project value replaces it", () => {
  assert.deepEqual(DEFAULTS.dream, { maxExtractBytes: 4000000, suggest: true, suggestAfterDays: 7, suggestAfterSessions: 10 });
  assert.equal(merge(DEFAULTS, { dream: { maxExtractBytes: 10 } }).dream.maxExtractBytes, 10);
});

test("memoryFolder: the folder every reader uses, or the line that refuses it", () => {
  const top = realpathSync(mkdtempSync(join(tmpdir(), "xwf-cfg-")));
  try {
    const root = join(top, "repo"), away = join(top, "away"), linkedRoot = join(top, "linked-repo");
    mkdirSync(root); mkdirSync(away); mkdirSync(join(linkedRoot, "docs"), { recursive: true });
    symlinkSync(away, join(root, "linked"));
    symlinkSync(away, join(linkedRoot, "docs", "memory"));
    const inside = (v) => ({ dir: null, line: `memory.dir ${JSON.stringify(v)} must be a folder inside the repository` });
    const link = (r, file) => ({ dir: null, line: outsideLine(r, file, []) });
    assert.ok(link(root, "linked/MEMORY.md").line);
    for (const [r, dir, outside, want] of [
      [root, undefined, [], { dir: "docs/memory", line: null }],
      [root, 5, [], { dir: "docs/memory", line: null }],
      [root, null, [], { dir: "docs/memory", line: null }],
      [root, ["notes"], [], { dir: "docs/memory", line: null }],
      [root, "notes", [], { dir: "notes", line: null }],
      [root, " ./notes/ ", [], { dir: "notes", line: null }],
      [root, "", [], inside("")],
      [root, ".", [], inside(".")],
      [root, "./", [], inside("./")],
      [root, "..", [], inside("..")],
      [root, "a/../..", [], inside("a/../..")],
      [root, "../away", [], inside("../away")],
      [root, "../away", [away], inside("../away")],
      [root, away, [away], inside(away)],
      [root, "linked", [], link(root, "linked/MEMORY.md")],
      [root, "linked", [away], { dir: "linked", line: null }],
      [linkedRoot, 5, [], link(linkedRoot, "docs/memory/MEMORY.md")],
    ]) {
      assert.deepEqual(memoryFolder({ memory: { dir, outside } }, r), want, `${JSON.stringify(dir)} ${JSON.stringify(outside)}`);
    }
  } finally { rmSync(top, { recursive: true, force: true }); }
});

test("loadLenient: a section that is not an object takes its default and is named; the strict load still throws", () => {
  const text = '{"owner":"Ana","packs":["semgrep"],"tokens":5,"roles":null,"memory":{"dir":"n"}}';
  const { config, replaced } = loadLenient("/r", () => text);
  assert.deepEqual(replaced, ["packs", "tokens", "roles"]);
  assert.deepEqual([config.packs, config.tokens, config.roles, config.owner, config.memory.dir], [DEFAULTS.packs, DEFAULTS.tokens, DEFAULTS.roles, "Ana", "n"]);
  assert.throws(() => load("/r", () => text), { message: ".xworkflows/config.json: packs must be an object" });
});

test("loadLenient: a healthy or absent file replaces nothing; a file that does not parse still throws", () => {
  assert.deepEqual(loadLenient("/r", () => '{"packs":{}}').replaced, []);
  assert.deepEqual(loadLenient("/r", () => null), { config: DEFAULTS, replaced: [] });
  assert.throws(() => loadLenient("/r", () => "{"), /does not parse/);
  assert.throws(() => loadLenient("/r", () => "null"), /does not parse: not a JSON object/);
});
