import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, realpathSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, isAbsolute, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { run } from "./branch.mjs";
import { shared } from "./shared.mjs";

const { buildIndex } = await shared("hooks/core/memory-index.mjs");

const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
const d = new Date(), p = (n) => String(n).padStart(2, "0");
const today = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;

const made = [];
after(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

// a repository with one commit on main holding two notes
function repo() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dream-b-")));
  made.push(root);
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "T");
  mkdirSync(join(root, "docs/memory"), { recursive: true });
  writeFileSync(join(root, "docs/memory/a.md"), "---\nname: a\ndescription: first\n---\nbody a\n");
  writeFileSync(join(root, "docs/memory/b.md"), "---\nname: b\ndescription: second\n---\nbody b\n");
  const notes = ["a.md", "b.md"].map((file) => ({ file, text: readFileSync(join(root, "docs/memory", file), "utf8") }));
  writeFileSync(join(root, "docs/memory/MEMORY.md"), buildIndex(notes));
  writeFileSync(join(root, "other.txt"), "x\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "init");
  return root;
}
const json = (r) => JSON.parse(r.stdout);
// the folder of an extract, as extract.mjs leaves it
const extracted = (sessions = [{ file: "s.txt", name: "s", bytes: 1, masked: 0, lines: 1 }]) => {
  const out = realpathSync(mkdtempSync(join(tmpdir(), "dream-b-out-")));
  made.push(out);
  writeFileSync(join(out, "extract.json"), JSON.stringify({ out, sessions }));
  return out;
};
const opened = (root) => { const r = run(["open"], root); assert.equal(r.code, 0, r.stdout); made.push(json(r).worktree); return json(r); };

test("open makes the branch in a worktree outside the repository and leaves the main checkout alone", () => {
  const root = repo();
  const head = git(root, "rev-parse", "HEAD"), status = git(root, "status", "--porcelain");
  const o = opened(root);
  assert.equal(o.branch, `dream/${today}`);
  assert.equal(o.main, "main");
  assert.ok(isAbsolute(o.worktree) && relative(root, o.worktree).startsWith(".."));
  assert.equal(o.memory, join(o.worktree, "docs/memory"));
  assert.ok(existsSync(join(o.memory, "a.md")));
  assert.equal(git(root, "rev-parse", "HEAD"), head);
  assert.equal(git(root, "rev-parse", "--abbrev-ref", "HEAD"), "main");
  assert.equal(git(root, "status", "--porcelain"), status);
  assert.equal(git(root, "rev-parse", o.branch), head);
});

test("a second open the same day numbers the branch", () => {
  const root = repo();
  opened(root);
  assert.equal(opened(root).branch, `dream/${today}-2`);
  assert.equal(opened(root).branch, `dream/${today}-3`);
});

const pw = "pass" + "word=" + "hunter" + "2", bearer = "Authorization: " + "Bearer " + "abc.def" + "-1";
const ghp = "gh" + "p_" + "Ab1".repeat(8), sk = "s" + "k-" + "Zz9".repeat(8); // keys of a known form

test("close commits the changed, added and masked notes with the index and dream.json, and removes the worktree", () => {
  const root = repo();
  const main = git(root, "rev-parse", "main");
  const o = opened(root);
  writeFileSync(join(o.memory, "a.md"), "---\nname: a\ndescription: first, edited\n---\nbody a\n");
  writeFileSync(join(o.memory, "c.md"), "---\nname: c\ndescription: third\n---\nbody c\n");
  writeFileSync(join(o.memory, "b.md"), `---\nname: b\ndescription: second\n---\n${ghp}\ntoken: abcdef123456\n`);
  const out = extracted([{ file: "s1.txt", name: "sess-1", bytes: 10, masked: 0, lines: 40 }]);
  const r = run(["close", "--worktree", o.worktree, "--out", out], root);
  assert.equal(r.code, 0, r.stdout);
  const c = json(r);
  assert.deepEqual([c.branch, c.added, c.changed, c.removed, c.masked], [o.branch, 1, 2, 0, [{ file: "docs/memory/b.md", count: 1 }]]);
  assert.deepEqual(c.outside, []);
  assert.ok(Array.isArray(c.stale));
  assert.equal(c.see, `git diff main...${o.branch} -- docs/memory`);
  assert.equal(c.adopt, `git merge --no-ff ${o.branch}`);
  assert.equal(c.discard, `git branch -D ${o.branch}`);
  assert.deepEqual(c.look, [{ file: "docs/memory/b.md", line: 6 }]);
  assert.equal(git(root, "show", `${o.branch}:docs/memory/b.md`).includes(ghp), false);
  assert.equal(git(root, "show", `${o.branch}:docs/memory/b.md`).includes("token: abcdef123456"), true);
  assert.match(git(root, "show", `${o.branch}:docs/memory/MEMORY.md`), /\bc\b/);
  assert.deepEqual(JSON.parse(git(root, "show", `${o.branch}:docs/memory/dream.json`)), { sessions: { "sess-1": 40 } });
  assert.equal(git(root, "log", "-1", "--format=%s", o.branch), `dream: ${today}`);
  assert.equal(git(root, "rev-list", "--count", `main..${o.branch}`), "1");
  assert.equal(existsSync(o.worktree), false);
  assert.equal(existsSync(out), false);
  assert.deepEqual(c.left, []);
  assert.equal(git(root, "rev-parse", "main"), main);
  assert.equal(git(root, "status", "--porcelain"), "");
});

test("close masks the sure shapes in every file the commit takes, at any depth and of any name, names the lines the wide rule would touch, and leaves a binary file out", () => {
  const root = repo();
  const o = opened(root);
  mkdirSync(join(o.memory, "api"));
  writeFileSync(join(o.memory, "api/keys.md"), `---\nname: keys\ndescription: k\n---\n${ghp}\n${pw}\n`);
  writeFileSync(join(o.memory, "scratch.txt"), `${sk}\n${bearer}\n`);
  writeFileSync(join(o.memory, "pic.bin"), Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(pw)]));
  const r = run(["close", "--worktree", o.worktree, "--out", extracted()], root);
  assert.equal(r.code, 0, r.stdout);
  const c = json(r);
  assert.deepEqual(c.masked.map((m) => m.file).sort(), ["docs/memory/api/keys.md", "docs/memory/scratch.txt"]);
  assert.ok(c.masked.every((m) => m.count === 1));
  // line 3: "name: keys" ends on a credential word with no value, so the wide rule takes the next line
  assert.deepEqual(c.look, [{ file: "docs/memory/api/keys.md", line: 3 }, { file: "docs/memory/api/keys.md", line: 6 }, { file: "docs/memory/scratch.txt", line: 2 }]);
  assert.equal(git(root, "show", `${o.branch}:docs/memory/api/keys.md`), `---\nname: keys\ndescription: k\n---\n[masked]\n${pw}`);
  assert.equal(git(root, "show", `${o.branch}:docs/memory/scratch.txt`), `[masked]\n${bearer}`);
  assert.deepEqual(c.outside, ["docs/memory/pic.bin"]);
  assert.equal(git(root, "ls-tree", "--name-only", o.branch, "docs/memory/pic.bin"), "");
});

test("a note the run did not change is not read again nor rewritten", () => {
  const root = repo();
  const kept = `---\nname: k\ndescription: kept\n---\n${pw}\n`;
  writeFileSync(join(root, "docs/memory/k.md"), kept);
  git(root, "add", "-A"); git(root, "commit", "-q", "-m", "k");
  const o = opened(root);
  writeFileSync(join(o.memory, "a.md"), "---\nname: a\ndescription: first, edited\n---\nbody a\n");
  const c = json(run(["close", "--worktree", o.worktree, "--out", extracted()], root));
  assert.equal(git(root, "show", `${o.branch}:docs/memory/k.md`) + "\n", kept);
  assert.equal(c.masked.some((m) => m.file === "docs/memory/k.md"), false);
  assert.deepEqual(c.look, []);
});

test("look names only the lines the run added or changed, not an old line of the same note that the wide rule would touch", () => {
  const root = repo();
  writeFileSync(join(root, "docs/memory/k.md"), "---\nname: k\ndescription: kept\n---\nthe author passes the keyboard\nplain\n");
  git(root, "add", "-A"); git(root, "commit", "-q", "-m", "k");
  const o = opened(root);
  writeFileSync(join(o.memory, "k.md"), `---\nname: k\ndescription: kept\n---\nthe author passes the keyboard\nplain, edited\n${pw}\n`);
  const r = run(["close", "--worktree", o.worktree, "--out", extracted()], root);
  assert.equal(r.code, 0, r.stdout);
  assert.deepEqual(json(r).look, [{ file: "docs/memory/k.md", line: 7 }]);
});

test("a note of type user or feedback that the run added or changed is not committed, nor in the index, and is named in outside", () => {
  const root = repo();
  const main = git(root, "show", "main:docs/memory/MEMORY.md");
  const o = opened(root);
  writeFileSync(join(o.memory, "f.md"), "---\nname: f\ndescription: the owner wants short answers\ntype: feedback\n---\nbody\n");
  writeFileSync(join(o.memory, "a.md"), "---\nname: a\ndescription: first, now about the owner\nmetadata:\n  type: user\n---\nbody a\n");
  const r = run(["close", "--worktree", o.worktree, "--out", extracted()], root);
  assert.equal(r.code, 0, r.stdout);
  const c = json(r);
  assert.deepEqual(c.outside.sort(), ["docs/memory/a.md", "docs/memory/f.md"]);
  assert.deepEqual([c.added, c.changed], [0, 0]);
  assert.equal(git(root, "ls-tree", "--name-only", o.branch, "docs/memory/f.md"), "");
  assert.equal(git(root, "show", `${o.branch}:docs/memory/a.md`), git(root, "show", "main:docs/memory/a.md"));
  assert.equal(git(root, "show", `${o.branch}:docs/memory/MEMORY.md`), main);
});

test("a file changed outside the memory folder is named and not committed", () => {
  const root = repo();
  const o = opened(root);
  writeFileSync(join(o.worktree, "other.txt"), "changed\n");
  const c = json(run(["close", "--worktree", o.worktree, "--out", extracted()], root));
  assert.deepEqual(c.outside, ["other.txt"]);
  assert.equal(git(root, "show", `${o.branch}:other.txt`), "x");
});

test("a note whose name has a letter outside ASCII is counted", () => {
  const root = repo();
  const o = opened(root);
  writeFileSync(join(o.memory, "a\u00f1o.md"), "---\nname: year\ndescription: a year\n---\nbody\n");
  rmSync(join(o.memory, "b.md"));
  const c = json(run(["close", "--worktree", o.worktree, "--out", extracted()], root));
  assert.deepEqual([c.added, c.changed, c.removed], [1, 0, 1]);
});

test("close with only dream.json new commits that file and counts nothing", () => {
  const root = repo();
  const o = opened(root);
  const c = json(run(["close", "--worktree", o.worktree, "--out", extracted()], root));
  assert.deepEqual([c.added, c.changed, c.removed, c.masked], [0, 0, 0, []]);
  assert.equal(git(root, "rev-list", "--count", `main..${o.branch}`), "1");
  assert.equal(git(root, "diff", "--name-only", `main...${o.branch}`), "docs/memory/dream.json");
});

test("close with nothing at all to commit makes no commit", () => {
  const root = repo();
  const o = opened(root);
  run(["close", "--worktree", o.worktree, "--out", extracted()], root); // first run adds dream.json
  const again = opened(root);
  writeFileSync(join(again.memory, "dream.json"), JSON.stringify({ sessions: { "s": 1 } }, null, 2) + "\n");
  git(again.worktree, "add", "-A"); git(again.worktree, "commit", "-q", "-m", "x");
  const c = json(run(["close", "--worktree", again.worktree, "--out", extracted()], root));
  assert.equal(git(root, "rev-list", "--count", `main..${again.branch}`), "1"); // only the setup commit
  assert.deepEqual([c.added, c.changed, c.removed], [0, 0, 0]);
});

test("a worktree that is not a dream worktree of this repository is refused", () => {
  const root = repo();
  const other = mkdtempSync(join(tmpdir(), "dream-b-other-"));
  made.push(other);
  for (const w of [other, root, join(root, "nope")]) {
    const r = run(["close", "--worktree", w, "--out", extracted()], root);
    assert.equal(r.code, 2);
    assert.equal(r.stdout.trim().split("\n").length, 1);
  }
});

test("close keeps the earlier entries of dream.json and sets the lines read of each session taken", () => {
  const root = repo();
  writeFileSync(join(root, "docs/memory/dream.json"), JSON.stringify({ sessions: { "old": 5, "s1": 3 } }));
  git(root, "add", "-A"); git(root, "commit", "-q", "-m", "state");
  const o = opened(root);
  const r = run(["close", "--worktree", o.worktree, "--out", extracted([
    { file: "1.txt", name: "s1", bytes: 1, masked: 0, lines: 10 },
    { file: "2.txt", name: "s2", bytes: 1, masked: 0, lines: 7 }])], root);
  assert.equal(r.code, 0, r.stdout);
  assert.deepEqual(JSON.parse(git(root, "show", `${o.branch}:docs/memory/dream.json`)).sessions, { "old": 5, "s1": 10, "s2": 7 });
});

test("close moves the sessions with no kept text on too, and a session named in --not-read keeps the position it had", () => {
  const root = repo();
  writeFileSync(join(root, "docs/memory/dream.json"), JSON.stringify({ sessions: { "s2": 3, "s3": 1 } }));
  git(root, "add", "-A"); git(root, "commit", "-q", "-m", "state");
  const o = opened(root), out = extracted([
    { file: "1.txt", name: "s1", bytes: 1, masked: 0, lines: 10 },
    { file: "2.txt", name: "s2", bytes: 1, masked: 0, lines: 7 },
    { file: "3.txt", name: "s3", bytes: 1, masked: 0, lines: 5 }]);
  const x = JSON.parse(readFileSync(join(out, "extract.json"), "utf8"));
  writeFileSync(join(out, "extract.json"), JSON.stringify({ ...x, empty: [{ name: "e1", lines: 4 }] }));
  const r = run(["close", "--worktree", o.worktree, "--out", out, "--not-read", "s2,s3"], root);
  assert.equal(r.code, 0, r.stdout);
  assert.deepEqual(JSON.parse(git(root, "show", `${o.branch}:docs/memory/dream.json`)).sessions, { "s1": 10, "s2": 3, "s3": 1, "e1": 4 });
});

test("a missing or broken extract.json is refused with one line before anything changes", () => {
  const root = repo();
  const o = opened(root);
  writeFileSync(join(o.memory, "a.md"), "---\nname: a\ndescription: edited\n---\nbody a\n");
  const broken = extracted();
  writeFileSync(join(broken, "extract.json"), "{ not json");
  const empty = realpathSync(mkdtempSync(join(tmpdir(), "dream-b-out-")));
  made.push(empty);
  for (const out of [empty, broken, join(empty, "nope")]) {
    const r = run(["close", "--worktree", o.worktree, "--out", out], root);
    assert.equal(r.code, 2, r.stdout);
    assert.equal(r.stdout.trim().split("\n").length, 1);
  }
  assert.equal(run(["close", "--worktree", o.worktree], root).code, 2);
  assert.equal(git(o.worktree, "status", "--porcelain"), "M docs/memory/a.md");
  assert.equal(git(root, "rev-parse", o.branch), git(root, "rev-parse", "main"));
  assert.ok(existsSync(broken));
});

test("a worktree on a dream/ branch that open did not make is refused and left alone", () => {
  const root = repo();
  const wt = realpathSync(mkdtempSync(join(tmpdir(), "dream-")));
  made.push(wt);
  git(root, "worktree", "add", "-q", "-b", "dream/2030-01-01", wt, "main");
  writeFileSync(join(wt, "mine.txt"), "keep\n");
  const r = run(["close", "--worktree", wt, "--out", extracted()], root);
  assert.equal(r.code, 2, r.stdout);
  assert.equal(r.stdout.trim().split("\n").length, 1);
  assert.equal(readFileSync(join(wt, "mine.txt"), "utf8"), "keep\n");
});

test("the script runs when started through a path that holds a symbolic link", () => {
  const root = repo();
  const link = join(realpathSync(mkdtempSync(join(tmpdir(), "dream-b-link-"))), "dream");
  made.push(dirname(link));
  symlinkSync(dirname(fileURLToPath(import.meta.url)), link);
  const r = spawnSync(process.execPath, [join(link, "branch.mjs")], { cwd: root, encoding: "utf8" });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stdout, /^usage: /);
});

test("a commit refused by the project's hook leaves the worktree, the staged notes and the extract's folder, and says how to finish", () => {
  const root = repo();
  const hooks = join(root, ".git/hooks");
  mkdirSync(hooks, { recursive: true });
  writeFileSync(join(hooks, "pre-commit"), "#!/bin/sh\necho 'lint says no' >&2\nexit 1\n", { mode: 0o755 });
  git(root, "config", "core.hooksPath", hooks);
  const o = opened(root), out = extracted();
  writeFileSync(join(o.memory, "a.md"), "---\nname: a\ndescription: edited\n---\nbody a\n");
  const r = run(["close", "--worktree", o.worktree, "--out", out], root);
  assert.equal(r.code, 1, r.stdout);
  assert.match(r.stdout, /lint says no/);
  assert.ok(r.stdout.includes(o.worktree));
  assert.match(r.stdout, /git worktree remove/);
  assert.ok(r.stdout.includes(out));
  assert.equal(git(o.worktree, "diff", "--cached", "--name-only"), "docs/memory/MEMORY.md\ndocs/memory/a.md\ndocs/memory/dream.json");
  assert.ok(existsSync(out));
  assert.equal(git(root, "rev-parse", o.branch), git(root, "rev-parse", "main"));
});

test("a commit refused by the project's hook still names what close found: masked, look and outside, beside the hook's text", () => {
  const root = repo();
  const hooks = join(root, ".git/hooks");
  mkdirSync(hooks, { recursive: true });
  writeFileSync(join(hooks, "pre-commit"), "#!/bin/sh\necho 'lint says no' >&2\nexit 1\n", { mode: 0o755 });
  git(root, "config", "core.hooksPath", hooks);
  const o = opened(root), out = extracted();
  writeFileSync(join(o.memory, "a.md"), `---\nname: a\ndescription: first\n---\nbody a\n${ghp}\n${pw}\n`);
  writeFileSync(join(o.memory, "f.md"), "---\nname: f\ndescription: short answers\ntype: feedback\n---\nbody\n");
  const r = run(["close", "--worktree", o.worktree, "--out", out], root);
  assert.equal(r.code, 1, r.stdout);
  const c = json(r);
  assert.match(c.refused, /lint says no/);
  assert.equal(c.worktree, o.worktree);
  assert.deepEqual(c.masked, [{ file: "docs/memory/a.md", count: 1 }]);
  assert.deepEqual(c.look, [{ file: "docs/memory/a.md", line: 7 }]);
  assert.deepEqual(c.outside, ["docs/memory/f.md"]);
  assert.ok(c.finish.includes(`git worktree remove --force ${o.worktree}`) && c.finish.includes(out), c.finish);
  assert.ok(existsSync(join(o.memory, "f.md")) && existsSync(out));
});

test("unseen names the notes of the working folder that main does not hold as they are", () => {
  const root = repo();
  assert.deepEqual(json(run(["unseen"], root)).notes, []);
  writeFileSync(join(root, "docs/memory/a.md"), "---\nname: a\ndescription: first, not committed\n---\nbody a\n");
  writeFileSync(join(root, "docs/memory/new.md"), "---\nname: new\ndescription: not added\n---\nbody\n");
  const r = run(["unseen"], root);
  assert.equal(r.code, 0, r.stdout);
  assert.deepEqual(json(r).notes.sort(), ["docs/memory/a.md", "docs/memory/new.md"]);
});

test("unseen names a note committed on another branch than main", () => {
  const root = repo();
  git(root, "checkout", "-q", "-b", "work");
  writeFileSync(join(root, "docs/memory/w.md"), "---\nname: w\ndescription: on work\n---\nbody\n");
  git(root, "add", "-A"); git(root, "commit", "-q", "-m", "w");
  assert.deepEqual(json(run(["unseen"], root)).notes, ["docs/memory/w.md"]);
});

test("unseen does not name a note that main holds newer than a branch left behind", () => {
  const root = repo();
  git(root, "branch", "work");
  writeFileSync(join(root, "docs/memory/a.md"), "---\nname: a\ndescription: first, newer on main\n---\nbody a\n");
  git(root, "add", "-A"); git(root, "commit", "-q", "-m", "a on main");
  git(root, "checkout", "-q", "work");
  assert.deepEqual(json(run(["unseen"], root)).notes, []);
});

test("unseen names the worktrees that open made and close did not finish, with their branches", () => {
  const root = repo();
  assert.deepEqual(json(run(["unseen"], root)).unfinished, []);
  const hooks = join(root, ".git/hooks");
  mkdirSync(hooks, { recursive: true });
  writeFileSync(join(hooks, "pre-commit"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  git(root, "config", "core.hooksPath", hooks);
  const o = opened(root);
  writeFileSync(join(o.memory, "a.md"), "---\nname: a\ndescription: edited\n---\nbody a\n");
  assert.equal(run(["close", "--worktree", o.worktree, "--out", extracted()], root).code, 1);
  assert.deepEqual(json(run(["unseen"], root)).unfinished, [{ branch: o.branch, worktree: o.worktree }]);
});

test("close never reads or writes through a link under the memory folder, and names each link in outside", () => {
  const root = repo();
  const o = opened(root);
  const away = realpathSync(mkdtempSync(join(tmpdir(), "dream-b-away-")));
  made.push(away);
  const links = ["leak.md", "MEMORY.md", "dream.json"];
  for (const name of links) {
    writeFileSync(join(away, name), `---\nname: away\ndescription: away\n---\n${pw}\n`);
    rmSync(join(o.memory, name), { force: true });
    symlinkSync(join(away, name), join(o.memory, name));
  }
  const before = links.map((name) => readFileSync(join(away, name)));
  const r = run(["close", "--worktree", o.worktree, "--out", extracted()], root);
  assert.equal(r.code, 0, r.stdout);
  assert.deepEqual(links.map((name) => readFileSync(join(away, name))), before);
  assert.deepEqual(json(r).outside.sort(), links.map((name) => `docs/memory/${name}`).sort());
  assert.equal(git(root, "ls-tree", "--name-only", o.branch, "docs/memory/leak.md"), "");
});

// runs f with a temp folder of its own, so the folders open makes can be counted
const ownTmp = (f) => {
  const t = realpathSync(mkdtempSync(join(tmpdir(), "dream-b-tmp-"))), was = process.env.TMPDIR;
  made.push(t);
  process.env.TMPDIR = t;
  try { return [f(), readdirSync(t)]; } finally { process.env.TMPDIR = was; }
};
const snapshot = (dir) => readdirSync(dir).sort().map((f) => [f, readFileSync(join(dir, f), "utf8")]);

test("a memory folder that is a link to a folder outside cannot run: unseen, open and close refuse with one line and write nothing there", () => {
  const root = repo();
  const o = opened(root); // a run opened before the link came
  const away = realpathSync(mkdtempSync(join(tmpdir(), "dream-b-away-")));
  made.push(away);
  writeFileSync(join(away, "a.md"), "---\nname: a\ndescription: away\n---\nbody\n");
  rmSync(join(root, "docs/memory"), { recursive: true });
  symlinkSync(away, join(root, "docs/memory"));
  mkdirSync(join(root, ".xworkflows"));
  writeFileSync(join(root, ".xworkflows/config.json"), JSON.stringify({ memory: { dir: "docs/memory", outside: [away] } }));
  git(root, "add", "-A"); git(root, "commit", "-q", "-m", "notes outside");
  const before = snapshot(away), branches = git(root, "branch", "--list", "dream/*");
  for (const cmd of ["unseen", "open"]) {
    const [r, folders] = ownTmp(() => run([cmd], root));
    assert.equal(r.code, 2, r.stdout);
    assert.match(r.stdout, /^the memory folder docs\/memory is a link: \/dream cannot run here/);
    assert.equal(r.stdout.trim().split("\n").length, 1);
    assert.deepEqual(folders, []);
  }
  assert.equal(git(root, "branch", "--list", "dream/*"), branches);
  rmSync(join(o.worktree, "docs/memory"), { recursive: true });
  symlinkSync(away, join(o.worktree, "docs/memory"));
  writeFileSync(join(away, "b.md"), "---\nname: b\ndescription: new\n---\nbody\n");
  const now = snapshot(away), out = extracted();
  const r = run(["close", "--worktree", o.worktree, "--out", out], root);
  assert.equal(r.code, 2, r.stdout);
  assert.match(r.stdout, /^the memory folder docs\/memory is a link: \/dream cannot run here/);
  assert.equal(r.stdout.trim().split("\n").length, 1);
  assert.deepEqual(snapshot(away), now);
  assert.notDeepEqual(now, before);
  assert.equal(git(root, "rev-parse", o.branch), git(root, "rev-parse", "main~1"));
  assert.ok(existsSync(out));
});

// an extract's folder with one listed text file, made where the test says
const extractAt = (out) => {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "s.txt"), "user: one\n");
  writeFileSync(join(out, "extract.json"), JSON.stringify({ out, sessions: [{ file: join(out, "s.txt"), name: "s", bytes: 10, masked: 0, lines: 1 }] }));
  return out;
};

test("close removes the extract's folder only when it holds nothing but extract.json and the text files it lists, and names any other in left", () => {
  const root = repo();
  const mixed = extracted();
  writeFileSync(join(mixed, "mine.txt"), "keep\n");
  const inRepo = extractAt(join(root, "data"));
  for (const out of [mixed, inRepo]) {
    const r = run(["close", "--worktree", opened(root).worktree, "--out", out], root);
    assert.equal(r.code, 0, r.stdout);
    assert.deepEqual(json(r).left, [out]);
    assert.ok(existsSync(join(out, "extract.json")));
  }
  assert.equal(readFileSync(join(mixed, "mine.txt"), "utf8"), "keep\n");
  const clean = extractAt(join(realpathSync(mkdtempSync(join(tmpdir(), "dream-b-out-"))), "x"));
  made.push(dirname(clean));
  const r = json(run(["close", "--worktree", opened(root).worktree, "--out", clean], root));
  assert.deepEqual(r.left, []);
  assert.equal(existsSync(clean), false);
});

test("drop removes the extract's folder by the same rule and nothing else", () => {
  const root = repo();
  const head = git(root, "rev-parse", "HEAD");
  const clean = extracted(), mixed = extracted(), inRepo = extractAt(join(root, "data"));
  writeFileSync(join(mixed, "mine.txt"), "keep\n");
  assert.deepEqual(json(run(["drop", "--out", clean], root)), { left: [], deleted: null });
  assert.equal(existsSync(clean), false);
  for (const out of [mixed, inRepo]) {
    assert.deepEqual(json(run(["drop", "--out", out], root)), { left: [out], deleted: null });
    assert.ok(existsSync(join(out, "extract.json")));
  }
  assert.equal(git(root, "rev-parse", "HEAD"), head);
  assert.equal(run(["drop"], root).code, 2);
});

test("drop --worktree removes a worktree that open made, and its branch only when the branch has no commit of its own", () => {
  const root = repo();
  const bare = opened(root), kept = opened(root);
  writeFileSync(join(kept.memory, "a.md"), "---\nname: a\ndescription: committed by hand\n---\nbody a\n");
  git(kept.worktree, "commit", "-q", "-am", "by hand");
  const foreign = realpathSync(mkdtempSync(join(tmpdir(), "dream-")));
  made.push(foreign);
  git(root, "worktree", "add", "-q", "-b", "dream/2030-01-01", foreign, "main");
  assert.deepEqual(json(run(["drop", "--worktree", bare.worktree], root)), { left: [], deleted: bare.branch });
  assert.deepEqual(json(run(["drop", "--worktree", kept.worktree], root)), { left: [], deleted: null });
  assert.deepEqual(json(run(["drop", "--worktree", foreign], root)), { left: [foreign], deleted: null });
  assert.equal(existsSync(bare.worktree) || existsSync(kept.worktree), false);
  assert.ok(existsSync(foreign));
  assert.equal(git(root, "branch", "--list", bare.branch), "");
  assert.notEqual(git(root, "branch", "--list", kept.branch), "");
});

test("an open that fails leaves no folder behind", () => {
  const root = repo();
  mkdirSync(join(root, ".xworkflows"));
  writeFileSync(join(root, ".xworkflows/config.json"), JSON.stringify({ mainBranch: "nope" }));
  const [r, folders] = ownTmp(() => run(["open"], root));
  assert.equal(r.code, 1, r.stdout);
  assert.deepEqual(folders, []);
});
