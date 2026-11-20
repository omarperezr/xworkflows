import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, chmodSync, existsSync, lstatSync, lutimesSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "../test-tmp.mjs";
import { dirname, join } from "node:path";
import { mkdtempSync, isoEnv, repo, git, cli, readJson, writeJson, WIRED, theirs, OLD_MATCHER, CURRENT, installedOld, KEPT_EDIT, adaptOf, config, BAD, commit, pushed, withRemote, marked, OLD, chained, tmp, doctor, outside, hasHook, HUSKY_SHIM, husky, NODE_HOOK, OLD_TEXT, oldInstall, ROOT_WRITES, files, shared } from "./shared.test.mjs";
const matcherOf = (r) => readJson(r, ".claude/settings.json").hooks.PreToolUse.find(adaptOf).matcher;
const STATES = [
  ["record lost, old text", (r) => { installedOld(r); rmSync(join(r, ".xworkflows/installed.json")); }, OLD_MATCHER, false],
  ["record present, old text", (r) => { installedOld(r); }, OLD_MATCHER, false],
  ["record lost, hand edit", (r) => { installedOld(r, "Write"); rmSync(join(r, ".xworkflows/installed.json")); }, "Write", true],
  ["record from the earlier version holds the hand edit", (r) => { installedOld(r, "Write"); const rec = readJson(r, ".xworkflows/installed.json"); rec.merged.find((m) => adaptOf(m.entry)).entry.matcher = "Write"; writeJson(r, ".xworkflows/installed.json", rec); }, "Write", true],
  ["record present, hand edit", (r) => { installedOld(r, "Write"); }, "Write", true],
];
const waitFor = (p) => { for (let i = 0; i < 100 && !existsSync(p); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); return existsSync(p); };
// the bodies a hook of the project may have: the line goes after the #! line, else first
const BODIES = [OLD, "#!/bin/sh", "echo no-hashbang\n", "#!/bin/bash\r\necho crlf\r\n", ""];
// what the check got on its standard input, and its exit code
const spyCheck = (r, code = 0) => writeFileSync(join(r, ".xworkflows/checks/run.mjs"), `import { readFileSync, writeFileSync } from "node:fs";\nwriteFileSync(".git/check-in", readFileSync(0));\nprocess.exit(${code});\n`);
// A mktemp first on PATH that makes its file only under $TMPDIR: from a template there, or with no template when `bare`, as GNU's does;
// any other call fails. So no test hook writes in a shared temp folder, and a file left behind is seen.
const MKTEMP = spawnSync("sh", ["-c", "command -v mktemp"], { encoding: "utf8" }).stdout.trim();
const mktempIn = (bare = false) => {
  const d = tmp("xwf-mk-");
  writeFileSync(join(d, "mktemp"), `#!/bin/sh\ncase "$#:$1" in 1:"$TMPDIR"/*) exec ${MKTEMP} "$1";;${bare ? ` 0:) exec ${MKTEMP} "$TMPDIR/tmp.XXXXXXXXXX";;` : ""} esac\necho "mktemp: not under TMPDIR: $*" >&2\nexit 1\n`, { mode: 0o755 });
  return `${d}:${process.env.PATH}`;
};
const pushIn = (r, t) => spawnSync("git", ["push", "-q", "origin", "main"], { cwd: r, encoding: "utf8", env: { ...isoEnv(), TMPDIR: t, PATH: mktempIn() } });
const REFS = "refs/heads/main 1 refs/heads/main 0\n";
const runHook = (r, t, env = {}) => spawnSync(join(r, ".git/hooks/pre-push"), ["origin", "x"], { cwd: r, input: REFS, env: { ...isoEnv(), TMPDIR: t, PATH: mktempIn(true), ...env } });
// a hook whose bytes are not the UTF-8 bytes of a text: one Latin-1 byte in a comment, and a copy of a small program
const LATIN1 = Buffer.concat([Buffer.from("#!/bin/sh\n# caf"), Buffer.from([0xe9]), Buffer.from("\necho ok\n")]);
const PROGRAM = readFileSync(existsSync("/usr/bin/true") ? "/usr/bin/true" : "/bin/true");
// the text of the post-merge and post-commit hooks that main's install wrote, before the graph hooks read the config
const MAIN_CMD = `node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(".xworkflows/config.json","utf8")).mainBranch||"main")}catch{process.stdout.write("main")}'`;
const mainHook = (name, chain) => `#!/bin/sh\nc=0\n${chain ? `old="$(dirname "$0")/${name}.before-xworkflows"\n[ -x "$old" ] && { "$old" "$@"; c=$?; }\n` : ""}cd "$(git rev-parse --show-toplevel)" || exit $c\nmain=$(${MAIN_CMD}) || main=main\n[ "$(git symbolic-ref --short -q HEAD)" = "$main" ] || exit $c\ncommand -v graphify >/dev/null 2>&1 || exit $c\nmkdir -p graphify-out\n{ graphify update . && touch -c graphify-out/graph.json; } > graphify-out/.update.log 2>&1 < /dev/null &\nexit $c\n`;
const GRAPH_HOOKS = ["post-merge", "post-commit"];
const hookFile = (r, n) => join(r, ".git/hooks", n);
const bytesOf = (r) => [".xworkflows/installed.json", ...GRAPH_HOOKS.map((n) => `.git/hooks/${n}`)].map((f) => readFileSync(join(r, f), "utf8"));

test("install wires adapt hooks", () => {
  const r = repo();
  cli(r, ["install"]);
  const h = readJson(r, ".claude/settings.json").hooks;
  const pre = h.PreToolUse.filter((e) => e.matcher === "Write|Edit|MultiEdit|Workflow");
  const post = h.PostToolUse.filter((e) => e.matcher === "AskUserQuestion");
  assert.equal(pre.length, 1);
  assert.match(pre[0].hooks[0].command, /run\.mjs" claude adapt-gates$/);
  assert.equal(post.length, 1);
  assert.match(post[0].hooks[0].command, /run\.mjs" claude adapt-record$/);
});
test("a second install after the replacement changes nothing, and uninstall leaves no entry of the hook", () => {
  const r = repo();
  const adapt = installedOld(r);
  cli(r, ["install"]);
  const files = [".claude/settings.json", ".xworkflows/installed.json"].map((f) => readFileSync(join(r, f), "utf8"));
  assert.match(cli(r, ["install"]).stdout, /nothing to do/);
  assert.deepEqual([".claude/settings.json", ".xworkflows/installed.json"].map((f) => readFileSync(join(r, f), "utf8")), files);
  cli(r, ["uninstall"]);
  assert.equal(existsSync(join(r, ".claude/settings.json")) && readFileSync(join(r, ".claude/settings.json"), "utf8").includes("adapt-gates"), false);
});
test("the record of a merged hook entry only holds text the package wrote: a hand-edited entry stays edited when the record is lost and install runs twice", () => {
  const r = repo();
  cli(r, ["install"]);
  const adapt = (e) => e.hooks?.[0]?.command?.endsWith(" claude adapt-gates");
  const s = readJson(r, ".claude/settings.json");
  s.hooks.PreToolUse.find(adapt).matcher = "Write";
  writeJson(r, ".claude/settings.json", s);
  rmSync(join(r, ".xworkflows/installed.json"));
  cli(r, ["install"]);
  cli(r, ["install"]);
  assert.equal(readJson(r, ".claude/settings.json").hooks.PreToolUse.find(adapt).matcher, "Write");
});
for (const [name, setup, before, edited] of STATES) {
  test(`hook entry, ${name}: install replaces an old text and keeps an edit; a second install and uninstall follow`, () => {
    const r = repo();
    setup(r);
    assert.equal(matcherOf(r), before);
    const first = cli(r, ["install"]).stdout;
    assert.equal(KEPT_EDIT.test(first), edited, first);
    assert.equal(matcherOf(r), edited ? "Write" : CURRENT);
    const files = [".claude/settings.json", ".xworkflows/installed.json"].map((f) => existsSync(join(r, f)) ? readFileSync(join(r, f), "utf8") : null);
    assert.equal(KEPT_EDIT.test(cli(r, ["install"]).stdout), edited);
    assert.deepEqual([".claude/settings.json", ".xworkflows/installed.json"].map((f) => existsSync(join(r, f)) ? readFileSync(join(r, f), "utf8") : null), files);
    const s = readJson(r, ".claude/settings.json");
    s.hooks.PreToolUse.push(theirs);
    writeJson(r, ".claude/settings.json", s);
    assert.equal(cli(r, ["uninstall"]).status, 0);
    const left = readJson(r, ".claude/settings.json").hooks.PreToolUse;
    assert.deepEqual(left.filter((e) => !adaptOf(e)), [theirs]);
    assert.equal(left.some((e) => adaptOf(e) && !edited), false);
    assert.equal(left.filter(adaptOf).length, edited ? 1 : 0);
  });
}
test("hook entry, record present: uninstall removes the settings file install created when only the package's entries are left", () => {
  const r = repo();
  installedOld(r);
  cli(r, ["install"]);
  assert.equal(cli(r, ["uninstall"]).status, 0);
  assert.ok(!existsSync(join(r, ".claude/settings.json")));
});
test("a hook entry holding an old text is replaced when the record is lost, and the record holds the package's text", () => {
  const r = repo();
  installedOld(r);
  rmSync(join(r, ".xworkflows/installed.json"));
  cli(r, ["install"]);
  assert.deepEqual(readJson(r, ".xworkflows/installed.json").merged.filter((m) => adaptOf(m.entry)).map((m) => m.entry.matcher), [CURRENT]);
});

test("hook removed by the user then reinstalled: merged stays one entry, createdKey kept", () => {
  const r = repo();
  cli(r, ["install"]);
  const s = readJson(r, ".claude/settings.json");
  s.hooks.PreToolUse = [];
  writeJson(r, ".claude/settings.json", s);
  cli(r, ["install"]);
  const m = readJson(r, ".xworkflows/installed.json").merged.filter((x) => x.key[0] === "hooks");
  assert.equal(m.length, WIRED.length);
  assert.equal(m[0].createdKey, true);
});
test("a record that is replaced passes its flags on: hook removed by the user then reinstalled, uninstall still removes the settings file this install created", () => {
  const r = repo();
  cli(r, ["install"]);
  const s = readJson(r, ".claude/settings.json");
  s.hooks.PreToolUse = [];
  writeJson(r, ".claude/settings.json", s);
  cli(r, ["install"]);
  assert.equal(cli(r, ["uninstall"]).status, 0);
  assert.ok(!existsSync(join(r, ".claude/settings.json")));
});

test("a real push goes through the installed pre-push hook", () => {
  const { r, bare } = withRemote();
  cli(r, ["install"]);
  config(r, BAD);
  assert.equal(commit(r, "a.txt", "fine\n").status, 0);
  assert.equal(pushed(r).status, 0); // first push: nothing to compare against
  commit(r, "b.txt", "BADWORD\n");
  const no = pushed(r);
  assert.notEqual(no.status, 0);
  assert.match(no.stderr, /patterns: /);
  assert.equal(git(bare, "rev-list --count main"), "1");
  config(r, []);
  assert.equal(pushed(r).status, 0);
  assert.equal(git(bare, "rev-list --count main"), "2");
  assert.ok(statSync(join(r, ".git/hooks/pre-push")).mode & 0o100);
});
test("install's own git hook is the #! line and one marked line that runs its file under .xworkflows/git; without that file it refuses the push where the checks are, and is silent where .xworkflows is not", () => {
  const { r, bare } = withRemote();
  cli(r, ["install"]);
  const rec = readJson(r, ".xworkflows/installed.json");
  for (const n of ["pre-push", "post-merge", "post-commit"]) {
    const t = readFileSync(join(r, ".git/hooks", n), "utf8");
    assert.equal(t, `#!/bin/sh\n${marked(t)[0]}\n`, n);
    assert.ok(marked(t)[0].includes(`/.xworkflows/git/${n}"`), n);
    assert.ok(rec.files[`.xworkflows/git/${n}`] && existsSync(join(r, `.xworkflows/git/${n}`)), n);
  }
  config(r, BAD);
  commit(r, "a.txt", "fine\n");
  assert.equal(pushed(r).status, 0);
  commit(r, "b.txt", "BADWORD\n");
  assert.match(pushed(r).stderr, /patterns: /);
  // a branch made before the install was committed: the checks are there, install's file for the hook is not
  config(r, []);
  rmSync(join(r, ".xworkflows/git/pre-push"));
  const no = pushed(r);
  assert.equal(no.status, 1);
  assert.match(no.stderr, /^xworkflows: \.xworkflows\/git\/pre-push is missing: run xworkflows install$/m);
  assert.equal(git(bare, "rev-list --count main"), "1");
  // a clone with no .xworkflows at all
  rmSync(join(r, ".xworkflows"), { recursive: true });
  assert.deepEqual(pushed(r), { status: 0, stderr: "" });
  assert.equal(git(bare, "rev-list --count main"), "2");
});
test("the line of a post hook whose file under .xworkflows/git is missing says so in one line and never fails the commit; with no .xworkflows it is silent", () => {
  const r = repo();
  cli(r, ["install"]);
  rmSync(join(r, ".xworkflows/git/post-commit"));
  const c = commit(r, "a.txt", "x\n");
  assert.equal(c.status, 0);
  assert.equal(c.stderr, "xworkflows: .xworkflows/git/post-commit is missing: run xworkflows install\n");
  rmSync(join(r, ".xworkflows"), { recursive: true });
  assert.deepEqual([commit(r, "b.txt", "x\n")].map((x) => [x.status, x.stderr]), [[0, ""]]);
});
test("an existing pre-push hook gets the line: the check runs first, then the hook, whose failure still stops the push", () => {
  const { r, bare } = chained();
  config(r, BAD);
  assert.equal(cli(r, ["install", "--yes"]).status, 0);
  assert.ok(!existsSync(join(r, ".git/hooks/pre-push.before-xworkflows")));
  commit(r, "a.txt", "fine\n");
  assert.equal(pushed(r).status, 0);
  assert.match(readFileSync(join(r, ".git/old-in"), "utf8"), /^refs\/heads\/main [0-9a-f]{40} refs\/heads\/main 0{40}$/m);
  commit(r, "b.txt", "BADWORD\n");
  rmSync(join(r, ".git/old-in"));
  assert.match(pushed(r).stderr, /patterns: /);
  assert.ok(!existsSync(join(r, ".git/old-in")), "the hook ran after a failed check");
  config(r, []);
  writeFileSync(join(r, ".git/old-fail"), "");
  const no = pushed(r);
  assert.notEqual(no.status, 0);
  assert.match(no.stderr, /OLD-FAILED/);
  assert.equal(git(bare, "rev-list --count main"), "1");
  rmSync(join(r, ".git/old-fail"));
  assert.equal(pushed(r).status, 0);
  assert.equal(git(bare, "rev-list --count main"), "2");
});
test("install twice adds one line to a user's hook, after its #! line, and uninstall gives the hook back byte for byte", () => {
  for (const body of BODIES) {
    const r = repo({ ".git/hooks/pre-push": body });
    const hook = join(r, ".git/hooks/pre-push");
    chmodSync(hook, 0o755);
    cli(r, ["install", "--yes"]);
    assert.match(cli(r, ["install", "--yes"]).stdout, /^nothing to do$/m, JSON.stringify(body));
    const t = readFileSync(hook, "utf8"), line = marked(t)[0];
    assert.equal(marked(t).length, 1, JSON.stringify(body));
    assert.equal(t.split("\n").indexOf(line), body.startsWith("#!") ? 1 : 0, JSON.stringify(body));
    assert.match(cli(r, ["uninstall"]).stdout, /uninstalled/);
    assert.equal(readFileSync(hook, "utf8"), body, JSON.stringify(body));
    assert.ok(statSync(hook).mode & 0o100);
    assert.ok(!existsSync(join(r, ".git/hooks/post-commit")));
  }
});
test("a declined chain installs nothing for that hook and is not asked again", () => {
  const { r } = chained();
  const out = cli(r, ["install"]);
  assert.match(out.stdout, /answered for you: A pre-push hook exists\..* -> no/);
  assert.equal(readFileSync(join(r, ".git/hooks/pre-push"), "utf8"), OLD);
  assert.ok(existsSync(join(r, ".git/hooks/post-commit")));
  const again = cli(r, ["install", "--yes"]);
  assert.equal(readFileSync(join(r, ".git/hooks/pre-push"), "utf8"), OLD);
  assert.match(again.stdout, /^nothing to do$/m);
  assert.deepEqual(readJson(r, ".xworkflows/installed.json").declined.filter((d) => d.what === "chain").length, 1);
});
test("a line the user added by hand to a declined hook is recorded by the next install, and uninstall takes it out: a shell hook and husky's file", () => {
  const NODE_HUSKY = "#!/usr/bin/env node\nconsole.log(1)\n";
  for (const [x, file, body] of [[chained(), ".git/hooks/pre-push", OLD], [husky({ "pre-push": NODE_HUSKY }), ".husky/pre-push", NODE_HUSKY]]) {
    const { r } = x, hook = join(r, file);
    const line = cli(r, ["install"]).stdout.match(/call this line from it as its first command: (.+ # xworkflows)$|add this line to it as its first command: (.+ # xworkflows)$/m)?.slice(1).find(Boolean);
    assert.ok(line, file);
    assert.equal(readFileSync(hook, "utf8"), body, file);
    writeFileSync(hook, body.replace("\n", `\n${line}\n`));
    assert.equal(cli(r, ["install", "--yes"]).status, 0);
    assert.ok(readJson(r, ".xworkflows/installed.json").imports.some((i) => i.file === file && i.line === line), file);
    assert.match(cli(r, ["uninstall"]).stdout, /uninstalled/);
    assert.equal(readFileSync(hook, "utf8"), body, file);
  }
});
test("a hook the user changed after install keeps the change on uninstall, which takes out the line alone", () => {
  const { r } = chained();
  cli(r, ["install", "--yes"]);
  appendFileSync(join(r, ".git/hooks/pre-push"), "# mine\n");
  assert.match(cli(r, ["uninstall"]).stdout, /uninstalled/);
  assert.equal(readFileSync(join(r, ".git/hooks/pre-push"), "utf8"), OLD + "# mine\n");
});
test("core.hooksPath is honored", () => {
  const { r, bare } = withRemote();
  git(r, "config core.hooksPath .githooks");
  mkdirSync(join(r, ".githooks"));
  writeFileSync(join(r, ".githooks/pre-push"), OLD);
  chmodSync(join(r, ".githooks/pre-push"), 0o755);
  cli(r, ["install", "--yes"]);
  assert.equal(marked(readFileSync(join(r, ".githooks/pre-push"), "utf8")).length, 1);
  assert.ok(existsSync(join(r, ".githooks/post-merge")));
  assert.ok(!existsSync(join(r, ".git/hooks/post-merge")));
  config(r, BAD);
  commit(r, "a.txt", "fine\n");
  pushed(r);
  commit(r, "b.txt", "BADWORD\n");
  assert.match(pushed(r).stderr, /patterns: /);
  assert.equal(git(bare, "rev-list --count main"), "1");
  cli(r, ["uninstall"]);
  assert.equal(readFileSync(join(r, ".githooks/pre-push"), "utf8"), OLD);
});

test("the graph hooks run only on mainBranch and never fail a commit", () => {
  const r = repo();
  const bin = mkdtempSync(join(tmpdir(), "xwf-bin-"));
  const mark = join(bin, "mark");
  writeFileSync(join(bin, "graphify"), `#!/bin/sh\necho "$@" > "${mark}"\n`);
  chmodSync(join(bin, "graphify"), 0o755);
  const withG = { PATH: `${bin}:${process.env.PATH}` };
  const without = { PATH: `${dirname(process.execPath)}:/usr/bin:/bin` };
  cli(r, ["install"]);
  assert.equal(commit(r, "a.txt", "x\n", without).status, 0); // graphify missing
  git(r, "checkout -q -b batch");
  assert.equal(commit(r, "b.txt", "x\n", withG).status, 0);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
  assert.ok(!existsSync(mark), "another branch does not rebuild");
  git(r, "checkout -q main");
  assert.equal(commit(r, "c.txt", "x\n", withG).status, 0);
  assert.ok(waitFor(mark));
  assert.equal(readFileSync(mark, "utf8").trim(), "update .");
  assert.ok(waitFor(join(r, "graphify-out/.update.log")));
  rmSync(mark);
  writeJson(r, ".xworkflows/config.json", { mainBranch: "batch" });
  git(r, "checkout -q batch");
  commit(r, "d.txt", "x\n", withG);
  assert.ok(waitFor(mark), "mainBranch is read from the config at hook time");
});
test("dry-run writes no hook, no ignore line and no setting", () => {
  const r = repo();
  cli(r, ["install", "--dry-run"]);
  assert.deepEqual(readdirSync(r), [".git"]);
  assert.ok(!existsSync(join(r, ".git/hooks/pre-push")));
});
test("a hooks folder outside the repository is left alone, with one line; install's files the line runs are written in the repository, and uninstall takes them out", () => {
  const g = tmp("xwf-ghooks-"); hasHook(g);
  const r = repo();
  const env = { GIT_CONFIG_GLOBAL: outside(g) };
  const out = cli(r, ["install", "--yes"], { env });
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(readdirSync(g), ["pre-push"]);
  assert.equal(readFileSync(join(g, "pre-push"), "utf8"), OLD);
  assert.equal(out.stdout.split("\n").filter((l) => /hooks folder .* outside/.test(l)).length, 1);
  assert.ok(!existsSync(join(r, ".git/hooks/pre-push")));
  for (const n of ["pre-push", "post-merge", "post-commit"]) assert.ok(existsSync(join(r, ".xworkflows/git", n)), n);
  assert.match(cli(r, ["uninstall"], { env }).stdout, /uninstalled/);
  assert.ok(!existsSync(join(r, ".xworkflows/git")));
  assert.deepEqual(readdirSync(g), ["pre-push"]);
  assert.equal(readFileSync(join(g, "pre-push"), "utf8"), OLD);
});
test("a linked worktree installs into the shared hooks folder and uninstall removes them", () => {
  const main = repo();
  git(main, "commit -q --allow-empty -m init");
  const wt = join(tmp("xwf-wt-"), "wt");
  git(main, `worktree add -q ${wt}`);
  assert.equal(cli(wt, ["install", "--yes"]).status, 0);
  const shared = join(main, ".git/hooks");
  for (const h of ["pre-push", "post-merge", "post-commit"]) assert.ok(existsSync(join(shared, h)), h);
  const out = cli(wt, ["uninstall"]);
  assert.doesNotMatch(out.stdout, /not ours/);
  for (const h of ["pre-push", "post-merge", "post-commit"]) assert.ok(!existsSync(join(shared, h)), h);
});
test("an interrupted install that left the user's hook renamed gives it its name back, with the line", () => {
  const r = repo();
  mkdirSync(join(r, ".git/hooks"), { recursive: true });
  writeFileSync(join(r, ".git/hooks/pre-push.before-xworkflows"), OLD);
  chmodSync(join(r, ".git/hooks/pre-push.before-xworkflows"), 0o755);
  cli(r, ["install", "--yes"]);
  const t = readFileSync(join(r, ".git/hooks/pre-push"), "utf8");
  assert.equal(t.replace(`${marked(t)[0]}\n`, ""), OLD);
  assert.ok(!existsSync(join(r, ".git/hooks/pre-push.before-xworkflows")));
  cli(r, ["uninstall"]);
  assert.equal(readFileSync(join(r, ".git/hooks/pre-push"), "utf8"), OLD);
});
test("an install chained the old way is migrated with no question: the user's hook has its name back and holds the line, the check runs first, and uninstall gives the hook back byte for byte", () => {
  const { r } = chained();
  oldInstall(r);
  const hook = join(r, ".git/hooks/pre-push");
  assert.equal(readFileSync(`${hook}.before-xworkflows`, "utf8"), OLD);
  assert.match(doctor(r).stdout, /^warn pre-push hook holds an earlier text of the package: run xworkflows install replaces it$/m);
  const out = cli(r, ["install"]);
  assert.equal(out.status, 0, out.stderr);
  assert.doesNotMatch(out.stdout, /answered for you/);
  assert.equal(out.stdout.split("\n").filter((l) => l.startsWith("migrated ")).length, 1, out.stdout);
  const t = readFileSync(hook, "utf8");
  assert.equal(marked(t).length, 1);
  assert.equal(t.replace(`${marked(t)[0]}\n`, ""), OLD);
  assert.ok(!existsSync(`${hook}.before-xworkflows`));
  assert.ok(statSync(hook).mode & 0o100);
  assert.deepEqual(readJson(r, ".xworkflows/installed.json").chained, []);
  assert.match(doctor(r).stdout, /^ok +pre-push hook runs the check$/m);
  config(r, BAD);
  commit(r, "a.txt", "fine\n");
  assert.equal(pushed(r).status, 0);
  assert.equal(readFileSync(join(r, ".git/old-name"), "utf8"), "pre-push\n");
  commit(r, "b.txt", "BADWORD\n");
  assert.match(pushed(r).stderr, /patterns: /);
  assert.match(cli(r, ["install"]).stdout, /^nothing to do$/m);
  cli(r, ["uninstall"]);
  assert.equal(readFileSync(hook, "utf8"), OLD);
});

test("another clone's own pre-push gets the line even when the record lists the path", () => {
  const a = repo(); cli(a, ["install"]);
  const b = repo({ ".git/hooks/pre-push": OLD }); chmodSync(join(b, ".git/hooks/pre-push"), 0o755);
  mkdirSync(join(b, ".xworkflows"));
  writeFileSync(join(b, ".xworkflows/installed.json"), readFileSync(join(a, ".xworkflows/installed.json")));
  cli(b, ["install", "--yes"]);
  const t = readFileSync(join(b, ".git/hooks/pre-push"), "utf8");
  assert.equal(marked(t).length, 1);
  assert.equal(t.replace(`${marked(t)[0]}\n`, ""), OLD);
});
test("a user's pre-push keeps its name and gets the pushed refs on standard input, the same the check got, and nothing is left in the temp folder", () => {
  const { r } = chained();
  cli(r, ["install", "--yes"]);
  spyCheck(r);
  commit(r, "a.txt", "fine\n");
  const t = tmp("xwf-hooktmp-");
  assert.equal(pushIn(r, t).status, 0);
  const got = readFileSync(join(r, ".git/old-in"), "utf8");
  assert.match(got, /^refs\/heads\/main [0-9a-f]{40} refs\/heads\/main 0{40}$/m);
  assert.equal(readFileSync(join(r, ".git/check-in"), "utf8"), got);
  assert.equal(readFileSync(join(r, ".git/old-name"), "utf8"), "pre-push\n");
  assert.match(readFileSync(join(r, ".git/old-args"), "utf8"), /^origin /);
  assert.deepEqual(readdirSync(t), []);
});
test("a failed check ends the push with its code before the user's hook runs", () => {
  const { r } = chained();
  cli(r, ["install", "--yes"]);
  spyCheck(r, 3);
  const t = tmp("xwf-hooktmp-");
  const run = spawnSync(join(r, ".git/hooks/pre-push"), ["origin", "x"], { cwd: r, input: "refs/heads/main 1 refs/heads/main 0\n", env: { ...isoEnv(), TMPDIR: t, PATH: mktempIn() } });
  assert.equal(run.status, 3);
  commit(r, "a.txt", "fine\n");
  assert.notEqual(pushIn(r, t).status, 0);
  assert.ok(!existsSync(join(r, ".git/old-in")), "the user's hook ran");
  assert.deepEqual(readdirSync(t), []);
});
// awk reads an operand of the form name=value as an assignment: the hook's own path must reach it as a file whatever its name
test("in a hooks folder whose name holds =, the check and the user's hook still get the pushed refs", () => {
  for (const body of [OLD, null]) {
    const { r } = withRemote();
    git(r, "config core.hooksPath h=1");
    if (body) { mkdirSync(join(r, "h=1")); writeFileSync(join(r, "h=1/pre-push"), body, { mode: 0o755 }); }
    cli(r, ["install", "--yes"]);
    spyCheck(r);
    commit(r, "a.txt", "fine\n");
    assert.equal(pushIn(r, tmp("xwf-hooktmp-")).status, 0);
    const got = readFileSync(join(r, ".git/check-in"), "utf8");
    assert.match(got, /^refs\/heads\/main [0-9a-f]{40} refs\/heads\/main 0{40}$/m, String(body));
    if (body) assert.equal(readFileSync(join(r, "old-in"), "utf8"), got);
  }
});
test("a push cut by a signal while the check runs leaves no temp file", () => {
  const { r } = chained();
  cli(r, ["install", "--yes"]);
  // Ctrl-C reaches the whole process group: the hook's shell and the check
  writeFileSync(join(r, ".xworkflows/checks/run.mjs"), 'process.kill(process.ppid, "SIGINT");\nprocess.kill(process.pid, "SIGINT");\n');
  const t = tmp("xwf-hooktmp-");
  assert.notEqual(runHook(r, t).status, 0);
  assert.ok(!existsSync(join(r, ".git/old-in")), "the user's hook ran");
  assert.deepEqual(readdirSync(t), []);
});
test("install's own pre-push hook, with nothing after the line, makes no temp file: the check reads the refs itself", () => {
  const r = repo();
  cli(r, ["install"]);
  writeFileSync(join(r, ".xworkflows/checks/run.mjs"), 'import { readdirSync, readFileSync, writeFileSync } from "node:fs";\nwriteFileSync(".git/check-tmp", readdirSync(process.env.TMPDIR).join("\\n"));\nwriteFileSync(".git/check-in", readFileSync(0));\n');
  const t = tmp("xwf-hooktmp-");
  assert.equal(runHook(r, t).status, 0);
  assert.equal(readFileSync(join(r, ".git/check-tmp"), "utf8"), "");
  assert.equal(readFileSync(join(r, ".git/check-in"), "utf8"), REFS);
});
test("husky: after install a real push runs the user's hook, found by the hook's own file name, and the check runs first", () => {
  const mine = 'echo "$@" > "$(git rev-parse --git-dir)/husky-ran"\n';
  const { r, bare } = husky({ "pre-push": mine });
  const out = cli(r, ["install", "--yes"]);
  assert.equal(out.status, 0, out.stderr);
  for (const n of ["pre-push", "post-merge", "post-commit"]) assert.equal(readFileSync(join(r, ".husky/_", n), "utf8"), HUSKY_SHIM, n);
  const t = readFileSync(join(r, ".husky/pre-push"), "utf8");
  assert.equal(t, `${marked(t)[0]}\n${mine}`);
  config(r, BAD);
  commit(r, "a.txt", "fine\n");
  assert.equal(pushed(r).status, 0);
  assert.match(readFileSync(join(r, ".git/husky-ran"), "utf8"), /^origin /);
  commit(r, "b.txt", "BADWORD\n");
  rmSync(join(r, ".git/husky-ran"));
  assert.match(pushed(r).stderr, /patterns: /);
  assert.ok(!existsSync(join(r, ".git/husky-ran")));
  assert.equal(git(bare, "rev-list --count main"), "1");
  cli(r, ["uninstall"]);
  assert.equal(readFileSync(join(r, ".husky/pre-push"), "utf8"), mine);
});
test("husky: a hook with no file of its own gets one holding the line alone, and uninstall removes it", () => {
  const { r } = husky();
  cli(r, ["install", "--yes"]);
  for (const n of ["pre-push", "post-merge", "post-commit"]) {
    const t = readFileSync(join(r, ".husky", n), "utf8");
    assert.equal(t, `${marked(t)[0]}\n`, n);
  }
  assert.match(cli(r, ["install", "--yes"]).stdout, /^nothing to do$/m);
  cli(r, ["uninstall"]);
  assert.deepEqual(readdirSync(join(r, ".husky")), ["_"]);
});
test("a user's hook that ends with exit 0 still runs the check", () => {
  const body = "#!/bin/sh\nexit 0\n";
  const { r, bare } = withRemote();
  const hook = join(r, ".git/hooks/pre-push");
  mkdirSync(dirname(hook), { recursive: true });
  writeFileSync(hook, body); chmodSync(hook, 0o755);
  cli(r, ["install", "--yes"]);
  const t = readFileSync(hook, "utf8");
  assert.equal(t, `#!/bin/sh\n${marked(t)[0]}\nexit 0\n`);
  config(r, BAD);
  commit(r, "a.txt", "fine\n");
  assert.equal(pushed(r).status, 0);
  commit(r, "b.txt", "BADWORD\n");
  assert.match(pushed(r).stderr, /patterns: /);
  assert.equal(git(bare, "rev-list --count main"), "1");
});
test("a hook that is not a shell script stays chained as before the line: it runs first with the pushed refs, the check after it, and uninstall gives it back", () => {
  const { r, bare } = withRemote(), hook = join(r, ".git/hooks/pre-push");
  writeFileSync(hook, NODE_HOOK); chmodSync(hook, 0o755);
  const out = cli(r, ["install", "--yes"]);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(readFileSync(`${hook}.before-xworkflows`, "utf8"), NODE_HOOK);
  assert.equal(readFileSync(hook, "utf8"), OLD_TEXT("chained", "pre-push"));
  assert.deepEqual(marked(out.stdout), [], out.stdout);
  config(r, BAD);
  commit(r, "a.txt", "fine\n");
  assert.equal(pushed(r).status, 0);
  assert.match(readFileSync(join(r, ".git/node-in"), "utf8"), /^refs\/heads\/main [0-9a-f]{40} refs\/heads\/main 0{40}$/m);
  commit(r, "b.txt", "BADWORD\n");
  assert.match(pushed(r).stderr, /patterns: /);
  assert.equal(git(bare, "rev-list --count main"), "1");
  cli(r, ["uninstall"]);
  assert.equal(readFileSync(hook, "utf8"), NODE_HOOK);
  assert.ok(!existsSync(`${hook}.before-xworkflows`));
});
test("a hook that is a link stays chained as before the line: the link is renamed, runs first, and uninstall puts it back", () => {
  const { r } = withRemote(), hook = join(r, ".git/hooks/pre-push");
  mkdirSync(join(r, "scripts"));
  writeFileSync(join(r, "scripts/pre-push.sh"), OLD); chmodSync(join(r, "scripts/pre-push.sh"), 0o755);
  symlinkSync("../../scripts/pre-push.sh", hook);
  assert.equal(cli(r, ["install", "--yes"]).status, 0);
  assert.ok(lstatSync(`${hook}.before-xworkflows`).isSymbolicLink());
  assert.equal(readFileSync(join(r, "scripts/pre-push.sh"), "utf8"), OLD);
  config(r, []);
  commit(r, "a.txt", "fine\n");
  const p = pushed(r);
  assert.equal(p.status, 0, p.stderr);
  assert.match(readFileSync(join(r, ".git/old-in"), "utf8"), /^refs\/heads\/main /m);
  cli(r, ["uninstall"]);
  assert.ok(lstatSync(hook).isSymbolicLink());
  assert.equal(readFileSync(hook, "utf8"), OLD);
  assert.ok(!existsSync(`${hook}.before-xworkflows`));
});
test("a migration that cannot write the user's hook leaves the old pair whole, says so in one line, and goes on", { skip: ROOT_WRITES }, () => {
  const { r, bare } = chained(), hook = join(r, ".git/hooks/pre-push");
  oldInstall(r);
  chmodSync(`${hook}.before-xworkflows`, 0o555);
  const out = cli(r, ["install"]);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stderr, "");
  assert.match(out.stdout, /^not migrated \(EACCES\): \.git\/hooks\/pre-push stays chained the old way$/m);
  assert.doesNotMatch(out.stdout, /^migrated /m);
  assert.equal(readFileSync(hook, "utf8"), OLD_TEXT("chained", "pre-push"));
  assert.equal(readFileSync(`${hook}.before-xworkflows`, "utf8"), OLD);
  assert.deepEqual(readJson(r, ".xworkflows/installed.json").chained, [{ file: ".git/hooks/pre-push", to: ".git/hooks/pre-push.before-xworkflows" }]);
  config(r, BAD);
  commit(r, "a.txt", "fine\n");
  assert.equal(pushed(r).status, 0);
  commit(r, "b.txt", "BADWORD\n");
  assert.match(pushed(r).stderr, /patterns: /);
  assert.equal(git(bare, "rev-list --count main"), "1");
});
test("a migration that cannot read the user's renamed hook leaves the old pair whole, says so in one line, and goes on", { skip: ROOT_WRITES }, () => {
  const { r, bare } = chained(), hook = join(r, ".git/hooks/pre-push");
  oldInstall(r);
  chmodSync(`${hook}.before-xworkflows`, 0o000);
  const out = cli(r, ["install"]), doc = doctor(r);
  chmodSync(`${hook}.before-xworkflows`, 0o755);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stderr, "");
  assert.match(out.stdout, /^not migrated \(EACCES\): \.git\/hooks\/pre-push stays chained the old way$/m);
  assert.match(doc.stdout, /^ok +pre-push hook is ours$/m);
  assert.equal(readFileSync(hook, "utf8"), OLD_TEXT("chained", "pre-push"));
  assert.equal(readFileSync(`${hook}.before-xworkflows`, "utf8"), OLD);
  config(r, BAD);
  commit(r, "a.txt", "fine\n");
  assert.equal(pushed(r).status, 0);
  commit(r, "b.txt", "BADWORD\n");
  assert.match(pushed(r).stderr, /patterns: /);
  assert.equal(git(bare, "rev-list --count main"), "1");
});
test("a first install over a hook it cannot write says so in one line for that hook, writes the rest, and records the hook as declined", { skip: ROOT_WRITES }, () => {
  const { r } = chained(), hook = join(r, ".git/hooks/pre-push");
  chmodSync(hook, 0o555);
  const out = cli(r, ["install", "--yes"]);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stderr, "");
  assert.match(out.stdout, /^not written \(EACCES\): \.git\/hooks\/pre-push$/m);
  assert.equal(readFileSync(hook, "utf8"), OLD);
  assert.ok(existsSync(join(r, ".git/hooks/post-commit")));
  const rec = readJson(r, ".xworkflows/installed.json");
  assert.deepEqual([rec.declined, rec.imports.filter((i) => i.file.startsWith(".git/"))], [[{ file: ".git/hooks/pre-push", what: "chain" }], []]);
  assert.match(cli(r, ["uninstall"]).stdout, /uninstalled/);
  assert.equal(readFileSync(hook, "utf8"), OLD);
});
test("an install chained the old way for a hook that cannot take the line keeps its pair, says nothing of it, and the check still runs", () => {
  const { r, bare } = withRemote(), hook = join(r, ".git/hooks/pre-push");
  writeFileSync(hook, NODE_HOOK); chmodSync(hook, 0o755);
  oldInstall(r);
  const out = cli(r, ["install"]);
  assert.equal(out.status, 0, out.stderr);
  assert.doesNotMatch(out.stdout, /\.git\/hooks\/pre-push|migrated|answered for you/);
  assert.equal(readFileSync(hook, "utf8"), OLD_TEXT("chained", "pre-push"));
  assert.equal(readFileSync(`${hook}.before-xworkflows`, "utf8"), NODE_HOOK);
  assert.deepEqual(readJson(r, ".xworkflows/installed.json").chained, [{ file: ".git/hooks/pre-push", to: ".git/hooks/pre-push.before-xworkflows" }]);
  assert.match(doctor(r).stdout, /^ok +pre-push hook is ours$/m);
  config(r, BAD);
  commit(r, "a.txt", "fine\n");
  assert.equal(pushed(r).status, 0);
  commit(r, "b.txt", "BADWORD\n");
  assert.match(pushed(r).stderr, /patterns: /);
  assert.equal(git(bare, "rev-list --count main"), "1");
  cli(r, ["uninstall"]);
  assert.equal(readFileSync(hook, "utf8"), NODE_HOOK);
  assert.ok(!existsSync(`${hook}.before-xworkflows`));
});
test("a hook whose bytes are not text is not a shell script: after install and after uninstall it is byte for byte what it was", () => {
  for (const body of [LATIN1, PROGRAM]) {
    const r = repo(), hook = join(r, ".git/hooks/pre-push");
    mkdirSync(dirname(hook), { recursive: true });
    writeFileSync(hook, body); chmodSync(hook, 0o755);
    assert.equal(cli(r, ["install", "--yes"]).status, 0);
    assert.ok(readFileSync(`${hook}.before-xworkflows`).equals(body), `${body.length} bytes after install`);
    assert.equal(cli(r, ["uninstall"]).status, 0);
    assert.ok(readFileSync(hook).equals(body), `${body.length} bytes after uninstall`);
  }
});
test("a hooks folder that is a dangling symlink out of the repository counts as outside", () => {
  const r = repo();
  git(r, "config core.hooksPath .githooks");
  symlinkSync(join(tmp("xwf-out-"), "nope/hooks"), join(r, ".githooks"));
  const out = cli(r, ["install", "--yes"]);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /hooks folder .* outside/);
  assert.ok(existsSync(join(r, ".xworkflows/installed.json")));
});
test("a hooks folder that is a dangling symlink inside the repository counts as outside too", () => {
  const r = repo();
  git(r, "config core.hooksPath hk");
  symlinkSync("myhooks", join(r, "hk"));
  const out = cli(r, ["install", "--yes"]);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /hooks folder .* outside/);
  assert.ok(existsSync(join(r, ".xworkflows/installed.json")));
  assert.ok(!existsSync(join(r, "myhooks")));
});
test("the graph hook sets the graph file's time after an update that rewrote nothing, not after a failed one", () => {
  // graphify leaves graph.json untouched when the code's shape did not change, and graph-current judges that file's time
  const r = repo();
  const tool = (code) => { const d = mkdtempSync(join(tmpdir(), "xwf-bin-")); writeFileSync(join(d, "graphify"), `#!/bin/sh\nexit ${code}\n`); chmodSync(join(d, "graphify"), 0o755); return { PATH: `${d}:${process.env.PATH}` }; };
  cli(r, ["install"]);
  mkdirSync(join(r, "graphify-out"), { recursive: true });
  const g = join(r, "graphify-out/graph.json"), old = new Date("2020-01-01T00:00:00Z");
  const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  writeFileSync(g, "{}"); utimesSync(g, old, old);
  assert.equal(commit(r, "a.txt", "x\n", tool(1)).status, 0);
  pause(400);
  assert.equal(statSync(g).mtimeMs, old.getTime(), "a failed update leaves the time alone");
  assert.equal(commit(r, "b.txt", "x\n", tool(0)).status, 0);
  for (let i = 0; i < 100 && statSync(g).mtimeMs === old.getTime(); i++) pause(50);
  assert.ok(statSync(g).mtimeMs > old.getTime());
});

test("the graph hook sets the time of a linked graph file itself, never the file behind it, in a folder named with a leading dash", () => {
  const r = repo();
  cli(r, ["install"]);
  writeJson(r, ".xworkflows/config.json", { lookup: { index: { command: "graphify query", folder: "-out", minutes: 30 } } });
  const d = mkdtempSync(join(tmpdir(), "xwf-bin-")); writeFileSync(join(d, "graphify"), "#!/bin/sh\nexit 0\n"); chmodSync(join(d, "graphify"), 0o755);
  mkdirSync(join(r, "-out"), { recursive: true });
  const out = join(d, "elsewhere.json"), old = new Date("2020-01-01T00:00:00Z");
  writeFileSync(out, "{}"); utimesSync(out, old, old);
  symlinkSync(out, join(r, "-out/graph.json")); lutimesSync(join(r, "-out/graph.json"), old, old);
  const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  assert.equal(commit(r, "a.txt", "x\n", { PATH: `${d}:${process.env.PATH}` }).status, 0);
  for (let i = 0; i < 100 && lstatSync(join(r, "-out/graph.json")).mtimeMs === old.getTime(); i++) pause(50);
  assert.ok(lstatSync(join(r, "-out/graph.json")).mtimeMs > old.getTime(), "the link's own time was not set");
  assert.equal(statSync(out).mtimeMs, old.getTime(), "the file behind the link was touched");
});

test("a hooks folder under a dangling symlink counts as outside, whatever depth the link is at", () => {
  const r = repo();
  git(r, "config core.hooksPath hk/sub/hooks");
  symlinkSync("myhooks", join(r, "hk"));
  const out = cli(r, ["install", "--yes"]);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /hooks folder .* outside/);
  assert.ok(existsSync(join(r, ".xworkflows/installed.json")));
  assert.ok(!existsSync(join(r, "myhooks")));
});

test("the graph hooks run the index command and folder of the config, not graphify's", () => {
  const r = repo(); cli(r, ["install"]);
  writeJson(r, ".xworkflows/config.json", { lookup: { index: { command: "mytool query", folder: "idx-out" } } });
  const bin = tmp("xwf-bin-"), mine = join(bin, "mine"), theirs = join(bin, "theirs");
  writeFileSync(join(bin, "mytool"), `#!/bin/sh\necho "$@" > "${mine}"\n`);
  writeFileSync(join(bin, "graphify"), `#!/bin/sh\necho "$@" > "${theirs}"\n`);
  chmodSync(join(bin, "mytool"), 0o755); chmodSync(join(bin, "graphify"), 0o755);
  assert.equal(commit(r, "a.txt", "x\n", { PATH: `${bin}:${process.env.PATH}` }).status, 0);
  assert.ok(waitFor(mine));
  assert.equal(readFileSync(mine, "utf8").trim(), "update .");
  assert.ok(waitFor(join(r, "idx-out/.update.log")));
  assert.ok(!existsSync(theirs) && !existsSync(join(r, "graphify-out")));
});

// what install records is what uninstall takes back
test("a linked worktree records the git hooks under .git/hooks, as a normal checkout does", () => {
  const main = repo(); git(main, "commit -q --allow-empty -m init");
  const wt = join(tmp("xwf-wt-"), "wt");
  git(main, `worktree add -q ${wt}`);
  cli(wt, ["install", "--yes"]);
  const text = readFileSync(join(wt, ".xworkflows/installed.json"), "utf8");
  assert.deepEqual(Object.keys(JSON.parse(text).files).filter((f) => /\.git\/hooks\//.test(f)).sort(), [".git/hooks/post-commit", ".git/hooks/post-merge", ".git/hooks/pre-commit", ".git/hooks/pre-push"]);
  assert.doesNotMatch(text, /\.\./);
  assert.match(cli(wt, ["install", "--yes"]).stdout, /nothing to do/);
  assert.equal(readFileSync(join(wt, ".xworkflows/installed.json"), "utf8"), text);
});
test("a linked worktree records the line in a hook of the user under .git/hooks", () => {
  const main = repo(); git(main, "commit -q --allow-empty -m init");
  mkdirSync(join(main, ".git/hooks"), { recursive: true });
  writeFileSync(join(main, ".git/hooks/pre-push"), OLD); chmodSync(join(main, ".git/hooks/pre-push"), 0o755);
  const wt = join(tmp("xwf-wt-"), "wt");
  git(main, `worktree add -q ${wt}`);
  cli(wt, ["install", "--yes"]);
  const line = marked(readFileSync(join(main, ".git/hooks/pre-push"), "utf8"))[0];
  assert.deepEqual(readJson(wt, ".xworkflows/installed.json").imports.filter((i) => i.line === line), [{ file: ".git/hooks/pre-push", line }]);
  cli(wt, ["uninstall"]);
  assert.equal(readFileSync(join(main, ".git/hooks/pre-push"), "utf8"), OLD);
});
for (const [state, lost] of [["record holds the new hashes", false], ["record lost", true]]) {
  for (const args of [["install"], ["install", "--yes"]]) {
    test(`git hooks, ${state}, ${args.join(" ")}: the earlier text of the package's own hook is replaced with no question, and uninstall leaves none`, () => {
      const r = repo();
      cli(r, ["install"]);
      const now = GRAPH_HOOKS.map((n) => readFileSync(hookFile(r, n), "utf8"));
      for (const n of GRAPH_HOOKS) writeFileSync(hookFile(r, n), mainHook(n, false));
      if (lost) rmSync(join(r, ".xworkflows/installed.json"));
      const out = cli(r, args);
      assert.doesNotMatch(out.stdout, /Chain it|answered for you/);
      assert.deepEqual(GRAPH_HOOKS.map((n) => readFileSync(hookFile(r, n), "utf8")), now);
      for (const n of GRAPH_HOOKS) assert.ok(!existsSync(`${hookFile(r, n)}.before-xworkflows`));
      const rec = readJson(r, ".xworkflows/installed.json");
      assert.deepEqual([rec.declined, rec.chained], [[], []]);
      const first = bytesOf(r);
      assert.match(cli(r, args).stdout, /^nothing to do$/m);
      assert.deepEqual(bytesOf(r), first);
      assert.equal(cli(r, ["uninstall"]).status, 0);
      for (const n of GRAPH_HOOKS) assert.ok(!existsSync(hookFile(r, n)), n);
    });
  }
}
test("git hooks: the text that followed the config and followed the link is replaced with no question", () => {
  const r = repo();
  cli(r, ["install"]);
  const now = GRAPH_HOOKS.map((n) => readFileSync(hookFile(r, n), "utf8"));
  // the graph script was the hook's whole text until it moved under .xworkflows/git
  for (const n of GRAPH_HOOKS) {
    const graph = readFileSync(join(r, ".xworkflows/git", n), "utf8");
    assert.ok(graph.includes('touch -c -h -- "$folder/graph.json"'), n);
    writeFileSync(hookFile(r, n), graph.replace('touch -c -h -- "$folder/graph.json"', 'touch -c "$folder/graph.json"'));
  }
  const out = cli(r, ["install"]);
  assert.doesNotMatch(out.stdout, /Chain it|answered for you/);
  assert.deepEqual(GRAPH_HOOKS.map((n) => readFileSync(hookFile(r, n), "utf8")), now);
});
test("git hooks: uninstall removes an earlier text of the package's hook, chained or not, and puts the user's hook back", () => {
  const r = repo();
  cli(r, ["install"]);
  writeFileSync(hookFile(r, "post-merge"), mainHook("post-merge", false));
  writeFileSync(hookFile(r, "post-commit"), mainHook("post-commit", true));
  writeFileSync(`${hookFile(r, "post-commit")}.before-xworkflows`, "#!/bin/sh\necho mine\n");
  const out = cli(r, ["uninstall"]).stdout;
  assert.doesNotMatch(out, /kept/);
  assert.ok(!existsSync(hookFile(r, "post-merge")));
  assert.equal(readFileSync(hookFile(r, "post-commit"), "utf8"), "#!/bin/sh\necho mine\n");
});
test("git hooks: a hook the user changed, on an earlier text or on the present one, is kept, and uninstall names the one it recorded", () => {
  const r = repo();
  cli(r, ["install"]);
  const mine = mainHook("post-commit", false) + "echo mine\n";
  writeFileSync(hookFile(r, "post-commit"), mine);
  assert.match(cli(r, ["install"]).stdout, /answered for you: A post-commit hook exists\..* -> no/);
  appendFileSync(hookFile(r, "post-merge"), "echo mine\n");
  const out = cli(r, ["uninstall"]).stdout;
  assert.match(out, /kept \(changed locally\): \.git\/hooks\/post-merge/);
  assert.equal(readFileSync(hookFile(r, "post-commit"), "utf8"), mine);
});
test("hook entry, record present: uninstall removes an entry holding an earlier text, as it removes the present one", () => {
  const r = repo();
  installedOld(r);
  const s = readJson(r, ".claude/settings.json");
  s.hooks.PreToolUse.push(theirs);
  writeJson(r, ".claude/settings.json", s);
  assert.doesNotMatch(cli(r, ["uninstall"]).stdout, /kept \(changed locally\): \.claude\/settings\.json/);
  assert.deepEqual(readJson(r, ".claude/settings.json").hooks.PreToolUse, [theirs]);
});
test("hook entry: uninstall keeps and names an entry the user changed", () => {
  const r = repo();
  installedOld(r, "Write");
  const out = cli(r, ["uninstall"]).stdout;
  assert.match(out, /kept \(changed locally\): \.claude\/settings\.json hooks\.PreToolUse/);
  assert.equal(matcherOf(r), "Write");
});

// P-46: a hook of the project keeps its name and its place, so install has nothing to say about a hook that depends on them
test("install: a hook of the project is neither renamed nor moved, and no line says a hook will not work", () => {
  const { r } = chained();
  const out = cli(r, ["install", "--yes"]);
  assert.equal(out.status, 0, out.stderr);
  assert.doesNotMatch(out.stdout, /will not work/);
  assert.deepEqual(readdirSync(join(r, ".git/hooks")).filter((f) => f.includes("xworkflows")), []);
});

// rule 3 of the pending brake at commit time: install's pre-commit line runs the check with --pre-commit, before the user's hook
test("pre-commit: install writes the hook and its file, the check runs with --pre-commit, and a failed check stops the commit", () => {
  const r = repo();
  assert.equal(cli(r, ["install", "--yes"]).status, 0);
  const hook = join(r, ".git/hooks/pre-commit");
  assert.equal(marked(readFileSync(hook, "utf8")).length, 1);
  assert.ok(statSync(hook).mode & 0o100);
  assert.ok(existsSync(join(r, ".xworkflows/git/pre-commit")));
  writeFileSync(join(r, ".xworkflows/checks/run.mjs"), `// knows --pre-commit\nimport { writeFileSync, existsSync } from "node:fs";\nwriteFileSync(".git/check-args", process.argv.slice(2).join(" "));\nprocess.exit(existsSync(".git/fail") ? 1 : 0);\n`);
  writeFileSync(join(r, "a.txt"), "a\n");
  git(r, "add a.txt");
  assert.equal(spawnSync("git", ["commit", "-q", "-m", "a"], { cwd: r, env: isoEnv() }).status, 0);
  assert.equal(readFileSync(join(r, ".git/check-args"), "utf8"), "--pre-commit");
  writeFileSync(join(r, ".git/fail"), "");
  writeFileSync(join(r, "b.txt"), "b\n");
  git(r, "add b.txt");
  assert.notEqual(spawnSync("git", ["commit", "-q", "-m", "b"], { cwd: r, env: isoEnv() }).status, 0);
  assert.equal(git(r, "rev-list --count HEAD"), "1");
});
test("pre-commit: an existing hook of the project gets the line first and runs after it; a second install adds nothing and uninstall gives the hook back byte for byte", () => {
  const r = repo({ ".git/hooks/pre-commit": OLD });
  chmodSync(join(r, ".git/hooks/pre-commit"), 0o755);
  cli(r, ["install", "--yes"]);
  assert.match(cli(r, ["install", "--yes"]).stdout, /^nothing to do$/m);
  const t = readFileSync(join(r, ".git/hooks/pre-commit"), "utf8");
  assert.equal(marked(t).length, 1);
  assert.equal(t.split("\n")[1], marked(t)[0]);
  assert.match(cli(r, ["uninstall"]).stdout, /uninstalled/);
  assert.equal(readFileSync(join(r, ".git/hooks/pre-commit"), "utf8"), OLD);
  assert.ok(!existsSync(join(r, ".xworkflows/git/pre-commit")));
});
test("pre-commit: a hook that is not a shell script is chained, runs first, and uninstall puts it back", () => {
  const r = repo({ ".git/hooks/pre-commit": NODE_HOOK });
  chmodSync(join(r, ".git/hooks/pre-commit"), 0o755);
  cli(r, ["install", "--yes"]);
  assert.ok(existsSync(join(r, ".git/hooks/pre-commit.before-xworkflows")));
  cli(r, ["uninstall"]);
  assert.equal(readFileSync(join(r, ".git/hooks/pre-commit"), "utf8"), NODE_HOOK);
  assert.ok(!existsSync(join(r, ".git/hooks/pre-commit.before-xworkflows")));
});
// .git/hooks is shared by every branch: a branch made before the upgrade has a run.mjs that does not know --pre-commit
const OLD_RUN = `if (process.argv.slice(2).some((a) => a.startsWith("-") && a !== "--pre-push")) { console.error("unknown flag"); process.exit(2); }\n`;
test("pre-commit: a chained hook does not call a run.mjs that lacks --pre-commit, and still runs the first one that has it", () => {
  const r = repo({ ".git/hooks/pre-commit": NODE_HOOK });
  chmodSync(join(r, ".git/hooks/pre-commit"), 0o755);
  cli(r, ["install", "--yes"]);
  assert.ok(existsSync(join(r, ".git/hooks/pre-commit.before-xworkflows")));
  const run = join(r, ".xworkflows/checks/run.mjs");
  writeFileSync(run, OLD_RUN);
  writeFileSync(join(r, "a.txt"), "a\n");
  git(r, "add a.txt");
  const c = spawnSync("git", ["commit", "-q", "-m", "a"], { cwd: r, encoding: "utf8", env: isoEnv() });
  assert.equal(c.status, 0, c.stderr);
  writeFileSync(run, `// --pre-commit\nprocess.exit(1);\n`);
  writeFileSync(join(r, "b.txt"), "b\n");
  git(r, "add b.txt");
  assert.notEqual(spawnSync("git", ["commit", "-q", "-m", "b"], { cwd: r, env: isoEnv() }).status, 0);
});
test("pre-commit: install's own hook does not call a run.mjs that lacks --pre-commit", () => {
  const r = repo();
  cli(r, ["install", "--yes"]);
  writeFileSync(join(r, ".xworkflows/checks/run.mjs"), OLD_RUN);
  writeFileSync(join(r, "a.txt"), "a\n");
  git(r, "add a.txt");
  const c = spawnSync("git", ["commit", "-q", "-m", "a"], { cwd: r, encoding: "utf8", env: isoEnv() });
  assert.equal(c.status, 0, c.stderr);
});
