// A whole dream run, end to end: the real scripts, started as the skill starts them, in a temp repository.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, rmSync, realpathSync, existsSync } from "node:fs";
import { tmpdir } from "../../test-tmp.mjs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const made = [];
after(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));
const tmp = (p) => { const d = realpathSync(mkdtempSync(join(tmpdir(), p))); made.push(d); return d; };
const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
const user = (text, n) => JSON.stringify({ type: "user", timestamp: `2030-01-0${n}T10:00:00.000Z`, message: { content: text } });
const note = (name, description) => `---\nname: ${name}\ndescription: ${description}\n---\nbody ${name}\n`;

// a repository with one note on main, and a sessions folder of its own
function world(config) {
  const root = tmp("dream-f-"), sessions = tmp("dream-f-s-");
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "T");
  mkdirSync(join(root, "docs/memory"), { recursive: true });
  writeFileSync(join(root, "docs/memory/a.md"), note("a", "first"));
  if (config) { mkdirSync(join(root, ".xworkflows")); writeFileSync(join(root, ".xworkflows/config.json"), JSON.stringify(config)); }
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "init");
  const home = tmp("dream-f-h-");
  const script = (name, ...args) => {
    const r = spawnSync(process.execPath, [join(here, name), ...args], { cwd: root, encoding: "utf8", env: { ...process.env, HOME: home, USERPROFILE: home } });
    assert.equal(r.status, 0, `${name} ${args[0]}: ${r.stdout}${r.stderr}`);
    return JSON.parse(r.stdout);
  };
  const extract = () => { const x = script("extract.mjs", "--sessions", sessions, "--current", "running"); if (x.out) made.push(x.out); return x; };
  const open = () => { const o = script("branch.mjs", "open"); made.push(o.worktree); return o; };
  const close = (o, x, ...more) => script("branch.mjs", "close", "--worktree", o.worktree, "--out", x.out, ...more);
  const drop = (o, x) => script("branch.mjs", "drop", "--worktree", o.worktree, "--out", x.out);
  const round = (x, edit = () => {}) => { const o = open(); edit(o.memory); return close(o, x); };
  const merge = (c) => git(root, "merge", "-q", "--no-ff", "-m", `adopt ${c.branch}`, c.branch);
  const put = (name, ...lines) => appendFileSync(join(sessions, `${name}.jsonl`), lines.map((l) => l + "\n").join(""));
  const state = () => JSON.parse(git(root, "show", "main:docs/memory/dream.json")).sessions;
  const read = (x) => x.sessions.map((s) => [s.name, s.lines, readFileSync(s.file, "utf8")]);
  put("running", user("the session that runs the dream", 9));
  return { root, home, script, extract, open, close, drop, round, merge, put, state, read };
}

test("two whole runs: each session is read once, and on from where the last merged run stopped", () => {
  const w = world();
  w.put("s1", user("one", 1), user("one more", 1));
  w.put("s2", user("two", 2));
  const x1 = w.extract();
  assert.deepEqual(w.read(x1), [["s1", 2, "user: one\nuser: one more"], ["s2", 1, "user: two"]]);
  const c1 = w.round(x1, (memory) => {
    writeFileSync(join(memory, "a.md"), note("a", "first, edited"));
    writeFileSync(join(memory, "b.md"), note("b", "second"));
  });
  assert.deepEqual([c1.added, c1.changed, c1.removed, c1.outside], [1, 1, 0, []]);
  w.merge(c1);
  assert.deepEqual(w.state(), { s1: 2, s2: 1 });
  assert.match(readFileSync(join(w.root, "docs/memory/MEMORY.md"), "utf8"), /first, edited[\s\S]*second/);

  const x2 = w.extract();
  assert.deepEqual([x2.sessions, x2.reason, x2.out], [[], "no new session", null]);

  w.put("s2", user("two again", 3), user("two last", 3));
  const x3 = w.extract();
  assert.deepEqual(w.read(x3), [["s2", 3, "user: two again\nuser: two last"]]);
  const c2 = w.round(x3, (memory) => writeFileSync(join(memory, "b.md"), note("b", "second, edited")));
  w.merge(c2);
  assert.deepEqual(w.state(), { s1: 2, s2: 3 });
  assert.equal(w.extract().reason, "no new session");
});

test("a run whose branch is deleted without a merge leaves main's dream.json as it was, and the next extract reads the same sessions again", () => {
  const w = world();
  w.put("s1", user("one", 1));
  w.merge(w.round(w.extract()));
  const before = git(w.root, "show", "main:docs/memory/dream.json"), head = git(w.root, "rev-parse", "main");
  w.put("s1", user("one more", 2));
  w.put("s2", user("two", 3));
  const x = w.extract(), taken = w.read(x);
  assert.deepEqual(taken, [["s1", 2, "user: one more"], ["s2", 1, "user: two"]]);
  const c = w.round(x, (memory) => writeFileSync(join(memory, "a.md"), note("a", "dropped")));
  git(w.root, "branch", "-q", "-D", c.branch);
  assert.equal(git(w.root, "rev-parse", "main"), head);
  assert.equal(git(w.root, "show", "main:docs/memory/dream.json"), before);
  assert.deepEqual(w.read(w.extract()), taken);
});

test("a session cut by the cap is read on from the cut at the next run", () => {
  const w = world({ dream: { maxExtractBytes: 250 } });
  const [a, b, c] = ["a", "b", "c"].map((ch) => ch.repeat(94)); // "user: " + 94 = 100 bytes a line
  w.put("s1", user(a, 1), user(b, 1), user(c, 1));
  const x1 = w.extract();
  assert.deepEqual(w.read(x1), [["s1", 2, `user: ${a}\nuser: ${b}`]]);
  assert.equal(x1.cut, true);
  w.merge(w.round(x1));
  assert.deepEqual(w.read(w.extract()), [["s1", 3, `user: ${c}`]]);
});

test("a run stopped after open, through drop, leaves no folder, worktree or branch of the run", () => {
  const w = world();
  w.put("s1", user("one", 1));
  const x = w.extract(), o = w.open();
  assert.deepEqual(w.drop(o, x), { left: [], deleted: o.branch });
  assert.equal(existsSync(x.out) || existsSync(o.worktree), false);
  assert.equal(git(w.root, "branch", "--list", "dream/*"), "");
  assert.equal(git(w.root, "worktree", "list").split("\n").length, 1);
  assert.deepEqual(w.read(w.extract()), [["s1", 1, "user: one"]]);
});

test("a run whose branch waits unmerged is named in waiting, and the next extract reads the same lines again", () => {
  const w = world();
  w.put("s1", user("one", 1));
  const x = w.extract(), taken = w.read(x);
  assert.deepEqual(x.waiting, []);
  const c = w.round(x, (memory) => writeFileSync(join(memory, "a.md"), note("a", "waits")));
  const again = w.extract();
  assert.deepEqual(again.waiting, [c.branch]);
  assert.deepEqual(w.read(again), taken);
});

test("look names the line the run wrote and not the old line of the same note that the wide rule would touch", () => {
  const w = world();
  const old = "---\nname: k\ndescription: kept\n---\nthe author passes the keyboard\n";
  writeFileSync(join(w.root, "docs/memory/k.md"), old);
  git(w.root, "add", "-A"); git(w.root, "commit", "-q", "-m", "k");
  w.put("s1", user("one", 1));
  const c = w.round(w.extract(), (memory) => writeFileSync(join(memory, "k.md"), `${old}${"pass" + "word=" + "hunter" + "2"}\n`));
  assert.deepEqual(c.look, [{ file: "docs/memory/k.md", line: 6 }]);
});

test("a session named in --not-read, whose analyzer returned nothing, is read again by the next run", () => {
  const w = world();
  w.put("s1", user("one", 1));
  w.put("s2", user("two", 2));
  const x = w.extract();
  w.merge(w.close(w.open(), x, "--not-read", "s2"));
  assert.deepEqual(w.state(), { s1: 1 });
  assert.deepEqual(w.read(w.extract()), [["s2", 1, "user: two"]]);
});

test("an outside note is brought, a named note removed, and the next unseen lists the original that forget deletes", () => {
  const w = world();
  const folder = join(w.home, ".claude", "projects", w.root.replace(/[^a-zA-Z0-9]/g, "-"), "memory");
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "o.md"), note("o", "outside"));
  w.put("s1", user("one", 1));
  const x = w.extract();
  assert.deepEqual(x.outside.map((f) => [f.kind, f.files]), [["default", ["o.md"]]]);
  const o = w.script("branch.mjs", "open", "--out", x.out);
  made.push(o.worktree);
  assert.deepEqual(o.brought, ["o.md"]);
  const c = w.close(o, x, "--remove", "a.md");
  assert.equal(c.removed, 1);
  w.merge(c);
  const u = w.script("branch.mjs", "unseen");
  assert.deepEqual(u.originals, [{ n: 1, kind: "default", name: "o.md" }]);
  assert.deepEqual(w.script("branch.mjs", "forget", "--keep", "1"), { deleted: [], changed: [] });
  assert.deepEqual(w.script("branch.mjs", "forget"), { deleted: ["o.md"], changed: [] });
  assert.equal(existsSync(join(folder, "o.md")), false);
});

test("SKILL.md passes the outside data: forget before open, open --out, brought, --remove, the fates and the owner text", () => {
  const t = readFileSync(join(here, "SKILL.md"), "utf8");
  for (const s of ["outside", "originals", "branch.mjs forget", "--keep", "open --out", "brought", "--remove", "fates", "owner", "owner.md", "Run the dream?", "Yes, run it", "No, not now"])
    assert.ok(t.includes(s), s);
  assert.ok(t.indexOf("branch.mjs forget") < t.indexOf("branch.mjs open"));
});
