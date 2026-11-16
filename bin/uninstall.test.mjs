import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "../test-tmp.mjs";
import { dirname, join, relative } from "node:path";
import { mkdtempSync, repo, git, cli, readJson, writeJson, PRE, theirs, withRemote, OLD, made, tmp, doctor, outside, hasHook, ROOT_WRITES, sha, withRecord, files, tree, lineOf, hookAt, yes, doLine, toScript } from "./shared.test.mjs";
const notOurs = (out, p) => assert.match(out.stdout, new RegExp(`^kept \\(not ours\\): ${p.replace(/[.\/]/g, "\\$&")}$`, "m"));
// a hook uninstall cannot write keeps its line, which is named in one line; the rest of uninstall is done
const readOnly = [
  ["added by hand, as doctor's line says, to a hook install could not write", (r, hook) => {
    hookAt(r, "#!/bin/sh\nexit 0\n"); chmodSync(hook, 0o555); yes(r);
    doLine(r, lineOf(doctor(r), /^fail +pre-push hook/), "by hand");
    // the config the test's doctor() wrote is the user's, which uninstall keeps
    rmSync(join(r, ".xworkflows/config.json"));
    chmodSync(hook, 0o555);
    assert.equal(cli(r, ["install"]).status, 0);
  }],
  ["install wrote, in a hook made read-only after", (r, hook) => { hookAt(r, OLD); yes(r); chmodSync(hook, 0o555); }],
];

// P-168, P-169: a file uninstall cannot read or write is named in one line, and the rest of uninstall is done
const noStack = (out) => { assert.equal(out.status, 0, out.stderr); assert.doesNotMatch(out.stdout + out.stderr, /Error|\n\s+at /); assert.match(out.stdout, /\nuninstalled\n$/); };


test("uninstall on a fresh project leaves nothing", () => {
  const r = repo({ "app.py": "" });
  cli(r, ["install"]);
  assert.equal(cli(r, ["uninstall"]).status, 0);
  assert.deepEqual(readdirSync(r).sort(), [".git", "app.py"]);
});
test("uninstall restores a pilot-shaped project", () => {
  const settings = { env: { A: "1" }, hooks: { PreToolUse: [theirs] } };
  const files = { "CLAUDE.md": "# Rules\n", "AGENTS.md": "# Mine\n", ".claude/settings.json": JSON.stringify(settings, null, 2) + "\n" };
  const r = repo(files);
  cli(r, ["install", "--yes"]);
  const s = readJson(r, ".claude/settings.json"); s.hooks.PreToolUse.push({ hooks: [{ type: "command", command: "/opt/later.sh" }] });
  writeJson(r, ".claude/settings.json", s);
  assert.equal(cli(r, ["uninstall"]).status, 0);
  assert.equal(readFileSync(join(r, "CLAUDE.md"), "utf8"), files["CLAUDE.md"]);
  assert.equal(readFileSync(join(r, "AGENTS.md"), "utf8"), files["AGENTS.md"]);
  assert.deepEqual(readJson(r, ".claude/settings.json"), { ...settings, hooks: { PreToolUse: [theirs, { hooks: [{ type: "command", command: "/opt/later.sh" }] }] } });
  assert.ok(!existsSync(join(r, ".xworkflows")));
});
test("uninstall keeps changed files and config.json", () => {
  const r = repo(); cli(r, ["install"]);
  appendFileSync(join(r, ".claude/agents/explore.md"), "mine\n");
  writeFileSync(join(r, ".xworkflows/config.json"), "{}\n");
  const out = cli(r, ["uninstall"]);
  assert.match(out.stdout, /kept \(changed locally\): \.claude\/agents\/explore\.md/);
  assert.ok(existsSync(join(r, ".xworkflows/config.json")));
  assert.match(readFileSync(join(r, ".claude/agents/explore.md"), "utf8"), /mine\n$/);
  assert.ok(!existsSync(join(r, ".xworkflows/installed.json")));
});
test("uninstall without a record exits 1", () => {
  assert.equal(cli(repo(), ["uninstall"]).status, 1);
});
test("uninstall keeps an edited merged entry and a settings file that does not parse", () => {
  const r = repo(); cli(r, ["install"]);
  const s = readJson(r, ".claude/settings.json");
  s.hooks.PreToolUse.find((e) => e.hooks[0].command.includes("claude design-first")).hooks[0].command += " --extra";
  writeJson(r, ".claude/settings.json", s);
  const out = cli(r, ["uninstall"]);
  assert.match(out.stdout, /kept \(changed locally\): \.claude\/settings\.json hooks\.PreToolUse/);
  assert.equal(readJson(r, ".claude/settings.json").hooks.PreToolUse.length, 1);
  const r2 = repo(); cli(r2, ["install"]);
  writeFileSync(join(r2, ".claude/settings.json"), "{ nope");
  assert.equal(cli(r2, ["uninstall"]).status, 0);
  assert.equal(readFileSync(join(r2, ".claude/settings.json"), "utf8"), "{ nope");
});
test("uninstall prunes a created key whichever record entry carries createdKey", () => {
  const r = repo(); cli(r, ["install"]);
  const rec = readJson(r, ".xworkflows/installed.json");
  const first = rec.merged.find((m) => m.createdKey && m.key[0] === "hooks");
  // the flag moves to a later record entry of the same key; the entry itself is one the manifest names
  rec.merged.push({ ...first, createdKey: true });
  first.createdKey = false;
  writeJson(r, ".xworkflows/installed.json", rec);
  assert.equal(cli(r, ["uninstall"]).status, 0);
  assert.ok(!existsSync(join(r, ".claude/settings.json")));
  assert.ok(!existsSync(join(r, ".claude")));
});
test("uninstall refuses record paths outside the repo", () => {
  const r = repo(); cli(r, ["install"]);
  const outside = join(r, "..", "outside-" + Date.now() + ".txt");
  writeFileSync(outside, "x\n");
  const rec = readJson(r, ".xworkflows/installed.json");
  rec.files["../" + outside.split("/").pop()] = { piece: "x", sha256: createHash("sha256").update("x\n").digest("hex") };
  writeJson(r, ".xworkflows/installed.json", rec);
  const out = cli(r, ["uninstall"]);
  assert.match(out.stdout, /kept \(not ours\): \.\.\/outside-/);
  assert.equal(readFileSync(outside, "utf8"), "x\n");
  rmSync(outside);
});

test("uninstall refuses --dry-run and --yes and removes nothing", () => {
  const r = repo(); cli(r, ["install"]);
  for (const f of ["--dry-run", "--yes"]) {
    const out = cli(r, ["uninstall", f]);
    assert.equal(out.status, 2);
    assert.match(out.stderr, /--dry-run and --yes are for install only/);
  }
  assert.ok(existsSync(join(r, ".xworkflows/installed.json")));
  assert.ok(existsSync(join(r, ".claude/agents/explore.md")));
});
test("uninstall does not follow a symlink out of the repo", () => {
  const r = repo(); cli(r, ["install"]);
  const outside = mkdtempSync(join(tmpdir(), "xwf-out-"));
  writeFileSync(join(outside, "rc"), "x\nkeep\n");
  writeFileSync(join(outside, "f.txt"), "f\n");
  symlinkSync(outside, join(r, "link"));
  const rec = readJson(r, ".xworkflows/installed.json");
  rec.files["link/f.txt"] = { piece: "x", sha256: createHash("sha256").update("f\n").digest("hex") };
  rec.imports.push({ file: "link/rc", line: "x" });
  writeJson(r, ".xworkflows/installed.json", rec);
  const out = cli(r, ["uninstall"]);
  assert.match(out.stdout, /kept \(not ours\): link\/f\.txt/);
  assert.match(out.stdout, /kept \(not ours\): link\/rc/);
  assert.equal(readFileSync(join(outside, "rc"), "utf8"), "x\nkeep\n");
  assert.equal(readFileSync(join(outside, "f.txt"), "utf8"), "f\n");
});
test("uninstall is byte-identical when AGENTS.md and CLAUDE.md had no trailing newline", () => {
  const files = { "AGENTS.md": "# Mine\nkeep", "CLAUDE.md": "# R\nlast" };
  const r = repo(files);
  cli(r, ["install", "--yes"]);
  cli(r, ["install", "--yes"]);
  const rec = readJson(r, ".xworkflows/installed.json");
  assert.equal(rec.blocks.length, 1);
  assert.equal(rec.imports.filter((i) => i.file === "CLAUDE.md").length, 1);
  assert.equal(cli(r, ["uninstall"]).status, 0);
  for (const [p, c] of Object.entries(files)) assert.equal(readFileSync(join(r, p), "utf8"), c, p);
});
test("uninstall never rewrites a hook whose bytes are no longer text: the line stays and is named", () => {
  const r = repo({ ".git/hooks/pre-push": "#!/bin/sh\necho ok\n" }), hook = join(r, ".git/hooks/pre-push");
  chmodSync(hook, 0o755);
  cli(r, ["install", "--yes"]);
  appendFileSync(hook, Buffer.from([0x23, 0xe9, 0x0a]));
  const was = readFileSync(hook);
  assert.match(cli(r, ["uninstall"]).stdout, /^kept \(not text\): \.git\/hooks\/pre-push$/m);
  assert.ok(readFileSync(hook).equals(was));
});
test("uninstall gives settings.local.json back byte for byte", () => {
  for (const before of ['{"x":1}', '{\r\n  "x": 1\r\n}\r\n', "{}", "{\n}\n", "{ }", '{\n  "x": 1\n}']) {
    const r = repo({ ".claude/settings.local.json": before });
    cli(r, ["install", "--yes"]);
    assert.equal(readJson(r, ".claude/settings.local.json").autoMemoryDirectory, join(realpathSync(r), "docs/memory"), before);
    assert.equal(readJson(r, ".claude/settings.local.json").x ?? 1, 1);
    cli(r, ["uninstall"]);
    assert.equal(readFileSync(join(r, ".claude/settings.local.json"), "utf8"), before, JSON.stringify(before));
  }
});

test("uninstall keeps settings.local.json parseable when a key was written after ours", () => {
  const r = repo({ ".claude/settings.local.json": "{\n}\n" });
  cli(r, ["install", "--yes"]);
  const mine = readJson(r, ".claude/settings.local.json");
  writeJson(r, ".claude/settings.local.json", { ...mine, permissions: { allow: ["Bash(ls)"] } });
  cli(r, ["uninstall"]);
  assert.deepEqual(readJson(r, ".claude/settings.local.json"), { permissions: { allow: ["Bash(ls)"] } });
});
test("uninstall never moves a path outside the hook that installed.json names as chained", () => {
  const r = repo(); cli(r, ["install"]);
  const victim = join(r, "../victim-key"); writeFileSync(victim, "secret"); made.push(victim);
  const rec = readJson(r, ".xworkflows/installed.json");
  rec.chained = [{ file: ".git/hooks/pre-push", to: "../victim-key" }];
  writeJson(r, ".xworkflows/installed.json", rec);
  rmSync(join(r, ".git/hooks/pre-push"), { force: true });
  const out = cli(r, ["uninstall"]);
  assert.equal(readFileSync(victim, "utf8"), "secret");
  assert.ok(!existsSync(join(r, ".git/hooks/pre-push")));
  assert.match(out.stdout, /kept \(not ours\):/);
});
test("uninstall never touches a global hooks folder a record names", () => {
  const g = tmp("xwf-ghooks-"); hasHook(g);
  writeFileSync(join(g, "post-merge.before-xworkflows"), "#!/bin/sh\nexit 0\n");
  const r = repo();
  const env = { GIT_CONFIG_GLOBAL: outside(g) };
  cli(r, ["install", "--yes"], { env });
  const rel = relative(realpathSync(r), g);
  const rec = readJson(r, ".xworkflows/installed.json");
  rec.files[`${rel}/pre-push`] = { piece: "checks", sha256: sha(OLD) };
  rec.chained = [{ file: `${rel}/post-merge`, to: `${rel}/post-merge.before-xworkflows` }];
  writeJson(r, ".xworkflows/installed.json", rec);
  const out = cli(r, ["uninstall"], { env });
  assert.equal(out.status, 0, out.stderr);
  assert.equal(readFileSync(join(g, "pre-push"), "utf8"), OLD);
  assert.ok(existsSync(join(g, "post-merge.before-xworkflows")));
  assert.ok(!existsSync(join(g, "post-merge")));
  assert.match(out.stdout, /kept \(not ours\): .*pre-push/);
});
test("uninstall acts only on paths the installer can write", () => {
  const r = repo({ "src/main.js": "code\n", "pkg.json": '{"a":1}\n', "a.js": "x\nkeep\n", "a.js.before-xworkflows": "old\n", "empty.txt": "" });
  cli(r, ["install"]);
  const rec = readJson(r, ".xworkflows/installed.json");
  rec.files["src/main.js"] = { piece: "x", sha256: sha("code\n") };
  rec.scalars.push({ file: "pkg.json", key: ["a"], value: 1 });
  rec.imports.push({ file: "a.js", line: "x" });
  rec.created.push("empty.txt");
  rec.chained.push({ file: "a.js", to: "a.js.before-xworkflows" });
  writeJson(r, ".xworkflows/installed.json", rec);
  const out = cli(r, ["uninstall"]);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(readFileSync(join(r, "src/main.js"), "utf8"), "code\n");
  assert.equal(readFileSync(join(r, "pkg.json"), "utf8"), '{"a":1}\n');
  assert.equal(readFileSync(join(r, "a.js"), "utf8"), "x\nkeep\n");
  assert.ok(existsSync(join(r, "a.js.before-xworkflows")));
  assert.ok(existsSync(join(r, "empty.txt")));
  for (const p of ["src/main.js", "pkg.json", "a.js", "empty.txt"]) assert.match(out.stdout, new RegExp(`kept \\(not ours\\): ${p.replace(".", "\\.")}$`, "m"));
  assert.ok(!existsSync(join(r, ".xworkflows")));
});
test("uninstall goes on when a settings file parses to a string or a number", () => {
  for (const body of ['"hello"', "5"]) {
    const r = repo(); cli(r, ["install"]);
    writeFileSync(join(r, ".claude/settings.json"), body);
    const out = cli(r, ["uninstall"]);
    assert.equal(out.status, 0, body + out.stderr);
    assert.ok(!existsSync(join(r, ".xworkflows/installed.json")), body);
  }
});

test("uninstall: a symlinked folder or file under a path the package writes never reaches the target", () => {
  const code = { "src/main.js": "code\n", "pkg.json": '{"a":1}\n' };
  for (const link of [".xworkflows/ln", ".claude/skills/ln"]) {
    const r = repo(code); cli(r, ["install"]);
    symlinkSync(link === ".xworkflows/ln" ? "../src" : "../../src", join(r, link));
    withRecord(r, (rec) => { rec.files[`${link}/main.js`] = { piece: "x", sha256: sha("code\n") }; });
    const out = cli(r, ["uninstall"]);
    assert.equal(readFileSync(join(r, "src/main.js"), "utf8"), "code\n", link);
    notOurs(out, `${link}/main.js`);
  }
  const s = repo(code); cli(s, ["install"]);
  rmSync(join(s, ".claude/settings.json")); symlinkSync("../pkg.json", join(s, ".claude/settings.json"));
  withRecord(s, (rec) => { rec.scalars.push({ file: ".claude/settings.json", key: ["a"], value: 1 }); });
  notOurs(cli(s, ["uninstall"]), ".claude/settings.json");
  assert.equal(readFileSync(join(s, "pkg.json"), "utf8"), '{"a":1}\n');
  const g = repo(code); cli(g, ["install"]);
  rmSync(join(g, ".gitignore")); symlinkSync("src/main.js", join(g, ".gitignore"));
  withRecord(g, (rec) => { rec.imports.push({ file: ".gitignore", line: "code" }); });
  notOurs(cli(g, ["uninstall"]), ".gitignore");
  assert.equal(readFileSync(join(g, "src/main.js"), "utf8"), "code\n");
});
test("uninstall: a hooks folder that is a symlink out of the repository gets no hook and loses none", () => {
  const o = tmp("xwf-ghooks-"); hasHook(o);
  const r = repo();
  git(r, "config core.hooksPath .githooks");
  symlinkSync(o, join(r, ".githooks"));
  assert.equal(cli(r, ["install", "--yes"]).status, 0);
  assert.deepEqual(readdirSync(o), ["pre-push"]);
  withRecord(r, (rec) => { rec.files[".githooks/pre-push"] = { piece: "checks", sha256: sha(OLD) }; });
  const out = cli(r, ["uninstall"]);
  assert.equal(readFileSync(join(o, "pre-push"), "utf8"), OLD);
  notOurs(out, ".githooks/pre-push");
});
test("uninstall: a record that names content the installer never adds removes nothing of the user's", () => {
  const r = repo({ ".gitignore": ".env\n", "CLAUDE.md": "never push to main\n", ".claude/settings.json": JSON.stringify({ permissions: { deny: ["Read(.env)"] } }), ".claude/settings.local.json": JSON.stringify({ model: "opus" }) });
  cli(r, ["install", "--yes"]);
  withRecord(r, (rec) => {
    rec.imports.push({ file: ".gitignore", line: ".env" }, { file: "CLAUDE.md", line: "never push to main" });
    rec.merged.push({ file: ".claude/settings.json", key: ["permissions", "deny"], entry: "Read(.env)", createdKey: false });
    rec.scalars.push({ file: ".claude/settings.local.json", key: ["model"], value: "opus" });
  });
  const out = cli(r, ["uninstall"]);
  assert.equal(readFileSync(join(r, ".gitignore"), "utf8"), ".env\n");
  assert.equal(readFileSync(join(r, "CLAUDE.md"), "utf8"), "never push to main\n");
  assert.deepEqual(readJson(r, ".claude/settings.json"), { permissions: { deny: ["Read(.env)"] } });
  assert.deepEqual(readJson(r, ".claude/settings.local.json"), { model: "opus" });
  for (const p of [".gitignore", "CLAUDE.md", ".claude/settings.json", ".claude/settings.local.json"]) notOurs(out, p);
});
test("uninstall: an absolute path in files is never used", () => {
  const r = repo(); cli(r, ["install"]);
  const rr = realpathSync(r), abs = join(rr, ".xworkflows/x.js"), nested = join(rr, abs);
  mkdirSync(dirname(nested), { recursive: true }); writeFileSync(nested, "x\n");
  withRecord(r, (rec) => { rec.files[abs] = { piece: "x", sha256: sha("x\n") }; });
  const out = cli(r, ["uninstall"]);
  assert.equal(readFileSync(nested, "utf8"), "x\n");
  notOurs(out, abs);
});
test("uninstall: the user's own pre-push stays whatever hash the record holds", () => {
  const r = repo({ ".git/hooks/pre-push": OLD }); chmodSync(join(r, ".git/hooks/pre-push"), 0o755);
  cli(r, ["install"]);
  withRecord(r, (rec) => { rec.files[".git/hooks/pre-push"] = { piece: "checks", sha256: sha(OLD) }; });
  const out = cli(r, ["uninstall"]);
  assert.equal(readFileSync(join(r, ".git/hooks/pre-push"), "utf8"), OLD);
  assert.ok(!existsSync(join(r, ".git/hooks/post-merge")));
  assert.doesNotMatch(out.stdout, /deleted \.git\/hooks\/pre-push/);
  notOurs(out, ".git/hooks/pre-push");
  assert.doesNotMatch(out.stdout, /changed locally.*pre-push/);
});
test("uninstall: a user's file under .claude/skills or .xworkflows stays unless it is what the package installs there", () => {
  const r = repo(); cli(r, ["install"]);
  const mine = { ".claude/skills/mine/SKILL.md": "mine\n", ".xworkflows/own.js": "own\n" };
  for (const [p, c] of Object.entries(mine)) { mkdirSync(dirname(join(r, p)), { recursive: true }); writeFileSync(join(r, p), c); }
  withRecord(r, (rec) => { for (const [p, c] of Object.entries(mine)) rec.files[p] = { piece: "x", sha256: sha(c) }; });
  const out = cli(r, ["uninstall"]);
  for (const [p, c] of Object.entries(mine)) { assert.equal(readFileSync(join(r, p), "utf8"), c, p); notOurs(out, p); }
  assert.ok(!existsSync(join(r, ".claude/agents/explore.md")));
});
test("uninstall: a record written by another version says so, and an honest uninstall says nothing of 'not ours'", () => {
  const r = repo(); cli(r, ["install"]);
  withRecord(r, (rec) => { rec.xworkflows = "0.0.1"; });
  const out = cli(r, ["uninstall"]);
  assert.match(out.stdout, /record .*0\.0\.1/);
  assert.doesNotMatch(out.stdout, /not ours/);
});
test("uninstall writes settings.json back with the indent the file had", () => {
  for (const indent of ["    ", "\t", 1]) {
    const r = repo(); mkdirSync(join(r, ".claude"));
    const mine = JSON.stringify({ theme: "dark", permissions: { deny: ["x"] } }, null, indent) + "\n";
    writeFileSync(join(r, ".claude/settings.json"), mine);
    cli(r, ["install", "--yes"]);
    assert.equal(JSON.parse(readFileSync(join(r, ".claude/settings.json"), "utf8")).hooks.PreToolUse.length, PRE);
    assert.equal(cli(r, ["uninstall"]).status, 0);
    const back = readFileSync(join(r, ".claude/settings.json"), "utf8");
    assert.deepEqual(JSON.parse(back), { theme: "dark", permissions: { deny: ["x"] } });
    assert.equal(back, mine, JSON.stringify(indent));
  }
});
for (const [how, make] of readOnly) test(`uninstall, the line of pre-push ${how}: one line names the hook and says the line stays, and uninstall ends as it does otherwise`, { skip: ROOT_WRITES }, () => {
  const { r } = withRemote(), hook = join(r, ".git/hooks/pre-push");
  make(r, hook);
  assert.ok(readJson(r, ".xworkflows/installed.json").imports.some((i) => i.file === ".git/hooks/pre-push"));
  const bytes = readFileSync(hook);
  const out = cli(r, ["uninstall"]);
  assert.equal(out.status, 0, out.stderr);
  assert.doesNotMatch(out.stdout + out.stderr, /Error|\n\s+at /);
  assert.match(out.stdout, /^not written \(EACCES\): \.git\/hooks\/pre-push: the xworkflows line stays in it; take it out yourself$/m);
  assert.match(out.stdout, /\nuninstalled\n$/);
  assert.deepEqual(readdirSync(r), [".git"]);
  assert.deepEqual(readFileSync(hook), bytes);
});
// P-161: uninstall writes through no link, so a line behind one stays: install's line is named, and the sentence that offers one says it
test("uninstall: install's line in a hook that is a link now stays, and one line names it", () => {
  const { r } = withRemote(); hookAt(r, OLD); yes(r);
  toScript(r, ".git/hooks/pre-push", "../../scripts/pre-push.sh");
  const out = cli(r, ["uninstall"]);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /^not written \(symlink\): \.git\/hooks\/pre-push: the xworkflows line stays in it; take it out yourself$/m);
  assert.match(readFileSync(join(r, "scripts/pre-push.sh"), "utf8"), / # xworkflows$/m);
});
test("uninstall: a recorded line in a read-only CLAUDE.md, and a hook holding the line it cannot read, are named in one line each", { skip: ROOT_WRITES }, () => {
  const { r } = withRemote(); hookAt(r, OLD); yes(r);
  const hook = join(r, ".git/hooks/pre-push");
  chmodSync(join(r, "CLAUDE.md"), 0o444); chmodSync(hook, 0o000);
  const out = cli(r, ["uninstall"]);
  chmodSync(hook, 0o755);
  noStack(out);
  assert.match(out.stdout, /^not written \(EACCES\): CLAUDE\.md: the line @AGENTS\.md stays in it; take it out yourself$/m);
  assert.match(out.stdout, /^not written \(EACCES\): \.git\/hooks\/pre-push: the xworkflows line stays in it; take it out yourself$/m);
  assert.ok(!existsSync(join(r, ".xworkflows")));
});
test("uninstall: install's own hooks in a hooks folder it cannot write stay, one line names each, and uninstall goes on", { skip: ROOT_WRITES }, () => {
  const r = repo(); cli(r, ["install"]);
  const dir = join(r, ".git/hooks");
  chmodSync(dir, 0o555);
  const out = cli(r, ["uninstall"]);
  chmodSync(dir, 0o755);
  noStack(out);
  for (const n of ["pre-push", "post-merge", "post-commit"]) assert.match(out.stdout, new RegExp(`^not deleted \\(EACCES\\): \\.git/hooks/${n}$`, "m"));
  assert.ok(!existsSync(join(r, ".xworkflows")));
});
test("uninstall keeps the empty hooks and permissions objects the project had before install", () => {
  const r = repo({ ".claude/settings.json": JSON.stringify({ hooks: {}, permissions: {} }) });
  cli(r, ["install", "--yes"]);
  assert.match(cli(r, ["uninstall"]).stdout, /uninstalled/);
  assert.deepEqual(readJson(r, ".claude/settings.json"), { hooks: {}, permissions: {} });
});
test("uninstall removes the objects install created in a settings file that had other keys", () => {
  const r = repo({ ".claude/settings.json": JSON.stringify({ model: "x" }) });
  cli(r, ["install", "--yes"]);
  cli(r, ["uninstall"]);
  assert.deepEqual(readJson(r, ".claude/settings.json"), { model: "x" });
});
test("uninstall keeps a folder that was there before install, and removes the ones install made", () => {
  const r = repo(); mkdirSync(join(r, "docs"));
  const before = tree(r);
  cli(r, ["install", "--yes"]);
  assert.ok(!readJson(r, ".xworkflows/installed.json").dirs.includes("docs"));
  const out = cli(r, ["uninstall"]);
  assert.doesNotMatch(out.stdout, /^deleted docs\/$/m);
  assert.equal(tree(r), before);
  const f = repo(), none = tree(f);
  cli(f, ["install", "--yes"]); cli(f, ["uninstall"]);
  assert.equal(tree(f), none);
});

// P-116 (c): the three parts of the fix for a record with no dirs
test("uninstall: with a record whose dirs is empty, the package's own folders still go, and the shared parents stay", () => {
  const r = repo(); cli(r, ["install", "--yes"]);
  withRecord(r, (rec) => { rec.dirs = []; });
  assert.equal(cli(r, ["uninstall"]).status, 0);
  assert.ok(!existsSync(join(r, ".xworkflows")), "the package's .xworkflows is left");
  assert.ok(!existsSync(join(r, ".claude/skills/grill")), "the package's skill folder is left");
  assert.ok(existsSync(join(r, ".claude")), "a shared parent the record does not list is removed");
});
test("uninstall: with a section of the config that is not an object, install's autoMemoryDirectory and memory folder still go", () => {
  const r = repo(); cli(r, ["install"]);
  writeFileSync(join(r, ".xworkflows/config.json"), '{"tokens":5}\n');
  const out = cli(r, ["uninstall"]);
  assert.equal(out.status, 0, out.stderr);
  assert.doesNotMatch(out.stdout, /kept/);
  assert.ok(!existsSync(join(r, ".claude/settings.local.json")));
  assert.ok(!existsSync(join(r, "docs/memory")));
});

test("uninstall: with docs/memory made a link out of the repository and no memory.dir, autoMemoryDirectory and the file still go", () => {
  const r = repo(); cli(r, ["install", "--yes"]);
  rmSync(join(r, "docs/memory"), { recursive: true });
  symlinkSync(tmp("xwf-out-"), join(r, "docs/memory"));
  const out = cli(r, ["uninstall"]);
  assert.equal(out.status, 0, out.stderr);
  assert.doesNotMatch(out.stdout, /kept \(changed locally\): \.claude\/settings\.local\.json autoMemoryDirectory/);
  assert.ok(!existsSync(join(r, ".claude/settings.local.json")));
});
