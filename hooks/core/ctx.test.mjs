import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync as makeTmp, readFileSync, writeFileSync, mkdirSync, existsSync, symlinkSync, realpathSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { makeCtx, outsideLine } from "./ctx.mjs";
import { DEFAULTS } from "./config.mjs";
const madeTmp = [];
const mkdtempSync = (p) => { const d = makeTmp(p); madeTmp.push(d); return d; };
test.after(() => { for (const d of madeTmp) rmSync(d, { recursive: true, force: true }); });

const tmp = () => mkdtempSync(join(tmpdir(), "xwf-ctx-"));
const mk = (root = tmp(), stateDir = tmp(), session = "s1") => ({ root, stateDir, c: makeCtx({ root, session }, { env: {}, config: DEFAULTS, stateDir }) });

test("state and save keep a file per key and session", () => {
  const { c, stateDir } = mk();
  assert.equal(c.state("k"), null);
  c.save("k", 42);
  assert.equal(c.state("k"), "42");
  assert.equal(readFileSync(join(stateDir, "xwf-k-s1"), "utf8"), "42");
  assert.equal(makeCtx({ root: "/r", session: "s2" }, { env: {}, config: DEFAULTS, stateDir }).state("k"), null);
});

test("save to a missing folder is ignored", () => {
  const { c } = mk(tmp(), join(tmp(), "nope", "deeper"));
  c.save("k", 1);
  assert.equal(c.state("k"), null);
});

test("now and home", () => {
  const { c } = mk();
  assert.ok(Math.abs(c.now() - Date.now()) < 1000);
  assert.equal(c.home, homedir());
});

test("file helpers resolve a relative path against the root", () => {
  const { c, root } = mk();
  assert.equal(c.exists("a/b.txt"), false);
  assert.equal(c.mtime("a/b.txt"), null);
  assert.deepEqual(c.listDir("a"), []);
  c.writeFile("a/b.txt", "hi");
  assert.equal(readFileSync(join(root, "a", "b.txt"), "utf8"), "hi");
  assert.equal(c.exists("a/b.txt"), true);
  assert.equal(c.readFile(join(root, "a", "b.txt")), "hi");
  assert.ok(Math.abs(c.mtime(join(root, "a", "b.txt")) - Date.now()) < 5000);
  assert.deepEqual(c.listDir("a"), ["b.txt"]);
});

test("git runs in the root: trimmed stdout, null on failure", () => {
  const { c, root } = mk();
  assert.equal(c.git("rev-parse", "--git-dir"), null);
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
  spawnSync("git", ["init", "-q"], { cwd: root, env });
  writeFileSync(join(root, "f"), "x");
  spawnSync("git", ["add", "f"], { cwd: root, env });
  assert.equal(c.git("ls-files"), "f");
});

test("exec returns code, out and err; null code when it cannot run or times out", () => {
  const { c, root } = mk();
  const node = process.execPath;
  assert.deepEqual(c.exec(node, ["-e", "process.stdout.write(process.cwd()===require('fs').realpathSync(process.argv[1])?'ok':'no');process.stderr.write('e');process.exit(3)", root]), { code: 3, out: "ok", err: "e" });
  assert.equal(c.exec(node, ["-e", "process.stdout.write(require('fs').readFileSync(0,'utf8'))"], { input: "in" }).out, "in");
  assert.equal(c.exec("xwf-no-such-command", []).code, null);
  assert.equal(c.exec(node, ["-e", "setTimeout(()=>{},5000)"], { timeout: 100 }).code, null);
});

test("background starts a process and never throws", async () => {
  const { c, root } = mk();
  c.background(process.execPath, ["-e", "require('fs').writeFileSync('bg.txt','done')"]);
  for (let i = 0; i < 50 && !existsSync(join(root, "bg.txt")); i++) await new Promise((r) => setTimeout(r, 100));
  assert.equal(readFileSync(join(root, "bg.txt"), "utf8"), "done");
  assert.doesNotThrow(() => c.background("xwf-no-such-command", []));
});

test("config, marked, skillName and runCheck keep working", () => {
  const { c, root, stateDir } = mk();
  assert.equal(c.config.owner, "the owner");
  assert.equal(c.marked("grill"), false);
  writeFileSync(join(stateDir, "xwf-mark-grill-s1"), "");
  assert.equal(c.marked("grill"), true);
  assert.equal(c.skillName("adapt"), "adapt");
  mkdirSync(join(root, ".claude", "skills", "adapt"), { recursive: true });
  writeFileSync(join(root, ".claude", "skills", "adapt", "research.mjs"), "console.log('x');process.exit(0)");
  assert.deepEqual(c.runCheck([]), { code: 0, out: "x\n", err: "" });
});

test("agentName and skillName read only their own folder of renamed", () => {
  const { c, root } = mk();
  mkdirSync(join(root, ".xworkflows"));
  writeFileSync(join(root, ".xworkflows", "installed.json"), JSON.stringify({ renamed: { ".claude/agents/xwf-review.md": "review", ".claude/skills/xwf-grill": "grill", ".claude/skills/xwf-review": "review" } }));
  assert.equal(c.agentName("review"), "xwf-review");
  assert.equal(c.agentName("grill"), "grill");
  assert.equal(c.skillName("review"), "xwf-review");
  assert.equal(c.skillName("grill"), "xwf-grill");
  assert.equal(mk().c.agentName("review"), "review");
});

test("writeFile refuses a symlink and says so", () => {
  const { c, root } = mk();
  const out = join(tmp(), "outside.txt");
  writeFileSync(out, "keep");
  symlinkSync(out, join(root, "idx.md"));
  assert.equal(c.writeFile("idx.md", "new"), false);
  assert.equal(readFileSync(out, "utf8"), "keep");
  assert.equal(c.writeFile("plain.md", "x"), true);
  assert.equal(readFileSync(join(root, "plain.md"), "utf8"), "x");
});

test("background starts nothing while the dry flag is set", () => {
  const dir = tmp();
  const ran = (env) => {
    const f = join(dir, env.XWORKFLOWS_DRY ? "dry" : "wet");
    makeCtx({ root: dir, session: "s1" }, { env, config: DEFAULTS, stateDir: dir }).background("touch", [f]);
    for (let i = 0; i < 40 && !existsSync(f); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    return existsSync(f);
  };
  assert.equal(ran({ PATH: process.env.PATH, XWORKFLOWS_DRY: "1" }), false);
  assert.equal(ran({ PATH: process.env.PATH }), true);
});

const linked = (outside = []) => {
  const root = tmp(), real = realpathSync(tmp());
  mkdirSync(join(real, "notes"), { recursive: true });
  mkdirSync(join(root, "docs"));
  symlinkSync(real, join(root, "docs", "memory"));
  const config = { ...DEFAULTS, memory: { ...DEFAULTS.memory, outside: outside.map((f) => f(real)) } };
  return { root, real, c: makeCtx({ root, session: "s1" }, { env: {}, config, stateDir: tmp() }) };
};

test("writeFile: a folder linked out of the repository is refused with the line that says to ask the owner", () => {
  const { c, real, root } = linked();
  assert.equal(c.writeFile("docs/memory/a.md", "x"), false);
  assert.equal(existsSync(join(real, "a.md")), false);
  assert.match(outsideLine(root, "docs/memory/a.md", []), /ask the owner.*inside the project.*replace the link with a folder.*memory\.outside in \.xworkflows\/config\.json/);
});

test("writeFile: the same folder listed under memory.outside is written; a longer sibling name is not opened", () => {
  const { c, real } = linked([(r) => r]);
  assert.equal(c.writeFile("docs/memory/a.md", "x"), true);
  assert.equal(readFileSync(join(real, "a.md"), "utf8"), "x");
  const sib = linked([(r) => r.slice(0, -1)]);
  assert.equal(sib.c.writeFile("docs/memory/a.md", "x"), false);
  const under = linked([(r) => join(r, "..")]);
  assert.equal(under.c.writeFile("docs/memory/notes/a.md", "x"), true);
});

test("writeFile: a link in the middle of the path that leaves the repository is refused", () => {
  const { c, real } = linked();
  assert.equal(c.writeFile("docs/memory/notes/a.md", "x"), false);
  assert.equal(existsSync(join(real, "notes", "a.md")), false);
});

test("writeFile: a folder inside the repository is written as before, also when it does not exist yet", () => {
  const { c, root } = mk();
  assert.equal(c.writeFile("docs/memory/a.md", "x"), true);
  assert.equal(readFileSync(join(root, "docs/memory/a.md"), "utf8"), "x");
});

test("writeFile: a memory.outside that is not a list of texts counts as empty, the write is refused and the line names the key", () => {
  for (const bad of [null, "x", 5, [5], ["ok", 5]]) {
    const { root, real } = linked();
    const config = { ...DEFAULTS, memory: { ...DEFAULTS.memory, outside: bad === "x" ? real : Array.isArray(bad) && bad[0] === "ok" ? [real, 5] : Array.isArray(bad) ? bad : bad } };
    const c = makeCtx({ root, session: "s1" }, { env: {}, config, stateDir: tmp() });
    assert.equal(c.writeFile("docs/memory/a.md", "x"), false, JSON.stringify(bad));
    assert.equal(existsSync(join(real, "a.md")), false);
    assert.match(outsideLine(root, "docs/memory/a.md", bad), /memory\.outside/);
  }
});
