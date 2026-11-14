import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, cpSync, existsSync, lstatSync, lutimesSync, mkdtempSync as makeTmp, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const madeTmp = [];
const mkdtempSync = (p) => { const d = makeTmp(p); madeTmp.push(d); return d; };
test.after(() => { for (const d of madeTmp) rmSync(d, { recursive: true, force: true }); });

// the developer's own git config never reaches a test
const ISO = { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
const isoEnv = () => ({ ...process.env, ...ISO });

function repo(setup = {}) {
  const dir = mkdtempSync(join(tmpdir(), "xwf-"));
  const env = isoEnv();
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir, env });
  spawnSync("git", ["config", "user.name", "t"], { cwd: dir, env });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: dir, env });
  for (const [p, c] of Object.entries(setup)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), c);
  }
  return dir;
}

const git = (cwd, args) => spawnSync("git", args.split(" "), { cwd, encoding: "utf8", env: isoEnv() }).stdout.trim();

function cli(cwd, args, opts = {}) {
  const base = { ...process.env };
  delete base.XWORKFLOWS_FREE;
  delete base.XWORKFLOWS_RECORD;
  const env = { ...base, ...ISO, ...opts.env };
  const r = spawnSync("node", [BIN, ...args], { cwd, env, input: opts.input ?? "", encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

test("usage: no command or unknown command exits 2", () => {
  const r = repo();
  assert.equal(cli(r, []).status, 2);
  assert.equal(cli(r, ["fly"]).status, 2);
  assert.equal(cli(r, ["install", "--bogus"]).status, 2);
});
test("other tools are not supported yet", () => {
  const out = cli(repo(), ["install", "--tool", "codex"]);
  assert.equal(out.status, 2);
  assert.match(out.stderr, /not yet: codex comes in a later phase/);
});
test("outside a git repository every command exits 1", () => {
  const dir = mkdtempSync(join(tmpdir(), "xwf-nogit-"));
  for (const c of ["install", "doctor", "uninstall"]) assert.equal(cli(dir, [c]).status, 1, c);
});

const readJson = (r, p) => JSON.parse(readFileSync(join(r, p), "utf8"));
const writeJson = (r, p, v) => writeFileSync(join(r, p), JSON.stringify(v, null, 2) + "\n");

const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
// What install wires into settings.json comes from the manifest: counts follow it as hooks are added.
const WIRED = readJson(PKG_ROOT, "manifest.json").pieces.flatMap((p) => p.claude ?? []);
const PRE = WIRED.filter((c) => c.event === "PreToolUse").length;

function packageCopy() {
  const dir = mkdtempSync(join(tmpdir(), "xwf-pkg-"));
  for (const p of ["package.json", "manifest.json", "tiers.json", "templates", "bin", "skills", "agents", "hooks", "checks"]) {
    cpSync(join(PKG_ROOT, p), join(dir, p), { recursive: true });
  }
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir, env: isoEnv() });
  spawnSync("git", ["add", "-A"], { cwd: dir, env: isoEnv() });
  return dir;
}

// the tests install from one copy made per run, its manifest regenerated here: a changed piece never needs pack first
const SHARED = packageCopy();
process.on("exit", () => rmSync(SHARED, { recursive: true, force: true }));
const packed = spawnSync("node", [join(SHARED, "bin/xworkflows.mjs"), "pack"], { cwd: SHARED, env: { ...process.env, ...ISO }, encoding: "utf8" });
assert.equal(packed.status, 0, `pack of the shared copy failed, every install test depends on it:\n${packed.stdout}${packed.stderr}`);
const BIN = join(SHARED, "bin/xworkflows.mjs");

function cliAt(pkg, cwd, args) {
  const env = { ...process.env };
  delete env.XWORKFLOWS_FREE;
  delete env.XWORKFLOWS_RECORD;
  const r = spawnSync("node", [join(pkg, "bin/xworkflows.mjs"), ...args], { cwd, env: { ...env, ...ISO }, input: "", encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

test("pack --check passes on this repository", () => {
  assert.equal(cliAt(PKG_ROOT, PKG_ROOT, ["pack", "--check"]).status, 0);
});
test("pack fails on a piece without a license", () => {
  const copy = packageCopy();
  const m = JSON.parse(readFileSync(join(copy, "manifest.json"), "utf8"));
  delete m.pieces.find((p) => p.id === "grill").license;
  writeFileSync(join(copy, "manifest.json"), JSON.stringify(m, null, 2) + "\n");
  const out = cliAt(copy, copy, ["pack"]);
  assert.equal(out.status, 1);
  assert.match(out.stderr, /grill: no license/);
});
test("pack fails on an orphan file and --check fails on a stale hash", () => {
  const copy = packageCopy();
  writeFileSync(join(copy, "skills/grill/EXTRA.md"), "x");
  spawnSync("git", ["add", "-A"], { cwd: copy, env: isoEnv() });
  assert.match(cliAt(copy, copy, ["pack"]).stderr, /skills\/grill\/EXTRA\.md belongs to no piece/);
  rmSync(join(copy, "skills/grill/EXTRA.md"));
  spawnSync("git", ["add", "-A"], { cwd: copy, env: isoEnv() });
  appendFileSync(join(copy, "agents/explore.md"), "\n");
  assert.equal(cliAt(copy, copy, ["pack", "--check"]).status, 1);
  assert.equal(cliAt(copy, copy, ["pack"]).status, 0);
  assert.equal(cliAt(copy, copy, ["pack", "--check"]).status, 0);
});
test("hashes ignore CRLF", () => {
  const copy = packageCopy();
  const p = join(copy, "agents/explore.md");
  writeFileSync(p, readFileSync(p, "utf8").replaceAll("\n", "\r\n"));
  assert.equal(cliAt(copy, copy, ["pack", "--check"]).status, 0);
});

test("fresh install writes every piece and the record", () => {
  const r = repo();
  const out = cli(r, ["install"]);
  assert.equal(out.status, 0, out.stderr);
  for (const p of [".claude/skills/grill/SKILL.md", ".claude/agents/explore.md", ".xworkflows/mark.mjs",
    ".xworkflows/hooks/run.mjs", ".xworkflows/hooks/core/design-first.mjs", ".xworkflows/hooks/core/marks.mjs",
    ".xworkflows/hooks/adapters/claude.mjs", ".xworkflows/tiers.json", ".xworkflows/installed.json"])
    assert.ok(existsSync(join(r, p)), p);
  assert.ok(!existsSync(join(r, ".xworkflows/hooks/adapters/codex.mjs")));
  assert.match(readFileSync(join(r, ".claude/agents/explore.md"), "utf8"), /^model: haiku$/m);
  assert.doesNotMatch(readFileSync(join(r, ".claude/agents/explore.md"), "utf8"), /^tier:/m);
  const rec = JSON.parse(readFileSync(join(r, ".xworkflows/installed.json"), "utf8"));
  assert.deepEqual(Object.keys(rec), ["xworkflows", "tools", "pieces", "files", "merged", "blocks", "imports", "created", "dirs", "declined", "kept", "renamed", "scalars", "chained"]);
  assert.equal(out.stdout.trim().split("\n").at(-1), "Next: open Claude Code and type /adapt");
});
test("second install changes nothing", () => {
  const r = repo();
  cli(r, ["install"]);
  git(r, "add -A"); git(r, "commit -qm base");
  const out = cli(r, ["install"]);
  assert.equal(out.status, 0);
  assert.equal(git(r, "status --porcelain"), "");
  assert.match(out.stdout, /^nothing to do$/m);
});
test("--dry-run writes nothing", () => {
  const r = repo({ "README.md": "x\n" });
  const out = cli(r, ["install", "--dry-run"]);
  assert.equal(out.status, 0);
  assert.match(out.stdout, /^would write \.claude\/skills\/grill\/SKILL\.md$/m);
  assert.deepEqual(readdirSync(r).sort(), [".git", "README.md"]);
});
test("run from a subfolder installs at the top level", () => {
  const r = repo({ "src/a.py": "" });
  assert.equal(cli(join(r, "src"), ["install"]).status, 0);
  assert.ok(existsSync(join(r, ".xworkflows/installed.json")));
  assert.ok(!existsSync(join(r, "src/.xworkflows")));
});
test("a tampered package file stops install before any write", () => {
  const copy = packageCopy();
  appendFileSync(join(copy, "skills/grill/SKILL.md"), "tamper\n");
  const r = repo();
  const out = cliAt(copy, r, ["install"]);
  assert.equal(out.status, 1);
  assert.match(out.stderr, /skills\/grill\/SKILL\.md/);
  assert.deepEqual(readdirSync(r), [".git"]);
});
test("a corrupt installed.json stops install", () => {
  const r = repo({ ".xworkflows/installed.json": "{nope" });
  assert.equal(cli(r, ["install"]).status, 1);
  assert.deepEqual(readdirSync(join(r, ".xworkflows")), ["installed.json"]);
});

const theirs = { matcher: "Write|Edit|MultiEdit|Bash", hooks: [{ type: "command", command: "/opt/guard.sh" }] };
test("settings merge appends ours after theirs, same matcher included", () => {
  const before = { env: { A: "1" }, hooks: { PreToolUse: [theirs] } };
  const r = repo({ ".claude/settings.json": JSON.stringify(before) });
  assert.equal(cli(r, ["install"]).status, 0);
  const after = readJson(r, ".claude/settings.json");
  assert.deepEqual(after.env, before.env);
  assert.deepEqual(after.hooks.PreToolUse[0], theirs);
  assert.equal(after.hooks.PreToolUse.length, 1 + PRE);
  assert.match(after.hooks.PreToolUse[1].hooks[0].command, /\.xworkflows\/hooks\/run\.mjs" claude design-first$/);
  assert.deepEqual(after.permissions.allow, ["Bash(node .xworkflows/mark.mjs:*)"]);
});
test("install wires adapt hooks", () => {
  const r = repo();
  cli(r, ["install"]);
  const h = readJson(r, ".claude/settings.json").hooks;
  const pre = h.PreToolUse.filter((e) => e.matcher === "Write|Edit|MultiEdit|Workflow|Bash");
  const post = h.PostToolUse.filter((e) => e.matcher === "AskUserQuestion");
  assert.equal(pre.length, 1);
  assert.match(pre[0].hooks[0].command, /run\.mjs" claude adapt-gates$/);
  assert.equal(post.length, 1);
  assert.match(post[0].hooks[0].command, /run\.mjs" claude adapt-record$/);
});
test("adapt-gates denies a shell redirect into the summary, sent as the runner sends it", () => {
  const r = repo();
  cli(r, ["install"]);
  writeJson(r, ".xworkflows/adapt-run.json", { startedAt: Date.now() });
  const env = { ...process.env, CLAUDE_PROJECT_DIR: r, XWORKFLOWS_STATE_DIR: mkdtempSync(join(tmpdir(), "xwf-state-")) };
  for (const k of ["XWORKFLOWS_FREE", "XWORKFLOWS_RECORD"]) delete env[k];
  const send = (command) => JSON.parse(spawnSync("node", [join(r, ".xworkflows/hooks/run.mjs"), "claude", "adapt-gates"], { cwd: r, encoding: "utf8", env,
    input: JSON.stringify({ session_id: "s1", cwd: r, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } }) }).stdout || "{}");
  assert.equal(send("echo x > .xworkflows/summary.md").hookSpecificOutput.permissionDecision, "deny");
  assert.deepEqual(send("cat .xworkflows/summary.md"), {});
});
test("an edited entry of ours is not duplicated", () => {
  const r = repo();
  cli(r, ["install"]);
  const s = readJson(r, ".claude/settings.json");
  s.hooks.PreToolUse[0].matcher = "Write";
  writeJson(r, ".claude/settings.json", s);
  cli(r, ["install"]);
  assert.equal(readJson(r, ".claude/settings.json").hooks.PreToolUse.length, PRE);
});
// a project installed before the matcher changed: the entry and the record both hold the old one
const OLD_MATCHER = "Write|Edit|MultiEdit|Workflow";
function installedOld(r, onDisk = OLD_MATCHER) {
  cli(r, ["install"]);
  const adapt = (e) => e.hooks?.[0]?.command?.endsWith(" claude adapt-gates");
  const s = readJson(r, ".claude/settings.json");
  s.hooks.PreToolUse.find(adapt).matcher = onDisk;
  writeJson(r, ".claude/settings.json", s);
  const rec = readJson(r, ".xworkflows/installed.json");
  rec.merged.find((m) => adapt(m.entry)).entry.matcher = OLD_MATCHER;
  writeJson(r, ".xworkflows/installed.json", rec);
  return adapt;
}
test("an entry of ours with the old matcher, as the record holds it, is replaced and the record follows", () => {
  const r = repo();
  const adapt = installedOld(r);
  assert.match(cli(r, ["install", "--dry-run"]).stdout, /would merge \.claude\/settings\.json/);
  assert.equal(readJson(r, ".claude/settings.json").hooks.PreToolUse.find(adapt).matcher, OLD_MATCHER);
  cli(r, ["install"]);
  const pre = readJson(r, ".claude/settings.json").hooks.PreToolUse;
  assert.equal(pre.length, PRE);
  assert.equal(pre.find(adapt).matcher, "Write|Edit|MultiEdit|Workflow|Bash");
  const rec = readJson(r, ".xworkflows/installed.json").merged.filter((m) => adapt(m.entry));
  assert.deepEqual(rec.map((m) => m.entry.matcher), ["Write|Edit|MultiEdit|Workflow|Bash"]);
});
const KEPT_EDIT = /kept: \.claude\/settings\.json hook adapt-gates differs from every text the package published; to get the package's entry, delete it and run xworkflows install\n/;
test("an entry of ours edited by hand is kept and install says so", () => {
  const r = repo();
  const adapt = installedOld(r, "Write");
  const out = cli(r, ["install"]);
  assert.match(out.stdout, KEPT_EDIT);
  assert.equal(readJson(r, ".claude/settings.json").hooks.PreToolUse.find(adapt).matcher, "Write");
  assert.equal(readJson(r, ".xworkflows/installed.json").merged.find((m) => adapt(m.entry)).entry.matcher, OLD_MATCHER);
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
// the four states of an entry at the package's place, each with an unedited old text or a hand edit
const adaptOf = (e) => e.hooks?.[0]?.command?.endsWith(" claude adapt-gates");
const matcherOf = (r) => readJson(r, ".claude/settings.json").hooks.PreToolUse.find(adaptOf).matcher;
const STATES = [
  ["record lost, old text", (r) => { installedOld(r); rmSync(join(r, ".xworkflows/installed.json")); }, OLD_MATCHER, false],
  ["record present, old text", (r) => { installedOld(r); }, OLD_MATCHER, false],
  ["record lost, hand edit", (r) => { installedOld(r, "Write"); rmSync(join(r, ".xworkflows/installed.json")); }, "Write", true],
  ["record from the earlier version holds the hand edit", (r) => { installedOld(r, "Write"); const rec = readJson(r, ".xworkflows/installed.json"); rec.merged.find((m) => adaptOf(m.entry)).entry.matcher = "Write"; writeJson(r, ".xworkflows/installed.json", rec); }, "Write", true],
  ["record present, hand edit", (r) => { installedOld(r, "Write"); }, "Write", true],
];
for (const [name, setup, before, edited] of STATES) {
  test(`hook entry, ${name}: install replaces an old text and keeps an edit; a second install and uninstall follow`, () => {
    const r = repo();
    setup(r);
    assert.equal(matcherOf(r), before);
    const first = cli(r, ["install"]).stdout;
    assert.equal(KEPT_EDIT.test(first), edited, first);
    assert.equal(matcherOf(r), edited ? "Write" : "Write|Edit|MultiEdit|Workflow|Bash");
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
  assert.deepEqual(readJson(r, ".xworkflows/installed.json").merged.filter((m) => adaptOf(m.entry)).map((m) => m.entry.matcher), ["Write|Edit|MultiEdit|Workflow|Bash"]);
});
test("broken settings.json: exit 1, tree unchanged", () => {
  const r = repo({ ".claude/settings.json": "{oops" });
  assert.equal(cli(r, ["install"]).status, 1);
  assert.deepEqual(readdirSync(r).sort(), [".claude", ".git"]);
});
test("AGENTS.md: block appended once, outside text kept, no trailing newline handled", () => {
  const r = repo({ "AGENTS.md": "# Mine\nkeep this" });
  cli(r, ["install"]);
  const once = readFileSync(join(r, "AGENTS.md"), "utf8");
  assert.ok(once.startsWith("# Mine\nkeep this\n"));
  assert.equal(once.match(/xworkflows:start/g).length, 1);
  cli(r, ["install"]);
  assert.equal(readFileSync(join(r, "AGENTS.md"), "utf8"), once);
});
test("missing CLAUDE.md is created with the import", () => {
  const r = repo();
  cli(r, ["install"]);
  assert.equal(readFileSync(join(r, "CLAUDE.md"), "utf8"), "@AGENTS.md\n");
  assert.ok(readJson(r, ".xworkflows/installed.json").created.includes("CLAUDE.md"));
});
test("rerun: nothing to do, files byte-equal, record entries once", () => {
  const r = repo();
  cli(r, ["install"]);
  const snap = () => ["AGENTS.md", "CLAUDE.md", ".claude/settings.json", ".xworkflows/installed.json"].map((p) => readFileSync(join(r, p), "utf8"));
  const a = snap();
  assert.match(cli(r, ["install"]).stdout, /^nothing to do$/m);
  assert.deepEqual(snap(), a);
  const rec = readJson(r, ".xworkflows/installed.json");
  assert.equal(rec.merged.length, WIRED.length + 1); // plus the permission for the mark command
  assert.deepEqual(rec.merged[0].key, ["hooks", "PreToolUse"]);
  assert.equal(rec.merged[0].createdKey, true);
  assert.deepEqual(rec.blocks, [{ file: "AGENTS.md" }]);
  assert.deepEqual(rec.imports.filter((i) => i.file === "CLAUDE.md"), [{ file: "CLAUDE.md", line: "@AGENTS.md" }]);
  assert.deepEqual(rec.created.sort(), [".claude/settings.json", ".claude/settings.local.json", ".gitignore", ".graphifyignore", "AGENTS.md", "CLAUDE.md", "docs/memory"]);
});
test("AGENTS.md: a changed block is replaced in place, text outside kept; existing CLAUDE.md untouched", () => {
  const r = repo({ "AGENTS.md": "top\n<!-- xworkflows:start -->\nold\n<!-- xworkflows:end -->\nbottom\n", "CLAUDE.md": "mine\n" });
  cli(r, ["install"]);
  const t = readFileSync(join(r, "AGENTS.md"), "utf8");
  assert.ok(t.startsWith("top\n<!-- xworkflows:start -->\n## xworkflows"));
  assert.ok(t.endsWith("<!-- xworkflows:end -->\nbottom\n"));
  assert.equal(readFileSync(join(r, "CLAUDE.md"), "utf8"), "mine\n");
  assert.deepEqual(readJson(r, ".xworkflows/installed.json").created.sort(), [".claude/settings.json", ".claude/settings.local.json", ".gitignore", ".graphifyignore", "docs/memory"]);
});
test("dry-run lists merges and writes nothing", () => {
  const r = repo();
  const out = cli(r, ["install", "--dry-run"]);
  assert.match(out.stdout, /would merge AGENTS\.md/);
  assert.match(out.stdout, /would merge \.claude\/settings\.json/);
  assert.deepEqual(readdirSync(r), [".git"]);
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
test("installed.json deleted: found entries of ours are recorded again", () => {
  const r = repo();
  cli(r, ["install"]);
  rmSync(join(r, ".xworkflows/installed.json"));
  cli(r, ["install"]);
  const m = readJson(r, ".xworkflows/installed.json").merged;
  assert.equal(m.length, WIRED.length);
  assert.deepEqual(m[0].key, ["hooks", "PreToolUse"]);
  assert.equal(m[0].createdKey, false);
});

test("pilot-shaped project: nothing of theirs changes without --yes", () => {
  const settings = { env: { PYTHONPATH: "." }, hooks: { PreToolUse: [theirs, { ...theirs, matcher: "Read" }] } };
  const r = repo({ "CLAUDE.md": "# Rules\nno trailing newline", ".claude/settings.json": JSON.stringify(settings, null, 2), "app.py": "" });
  git(r, "add CLAUDE.md .claude/settings.json"); git(r, "commit -qm base");
  writeFileSync(join(r, "dirty.py"), "uncommitted");
  const out = cli(r, ["install"]);
  assert.equal(out.status, 0);
  assert.equal(readFileSync(join(r, "CLAUDE.md"), "utf8"), "# Rules\nno trailing newline");
  assert.match(out.stdout, /answered for you: Add @AGENTS\.md to CLAUDE\.md\? -> no/);
  const s = readJson(r, ".claude/settings.json");
  assert.deepEqual(s.hooks.PreToolUse.slice(0, 2), settings.hooks.PreToolUse);
  assert.deepEqual(readJson(r, ".xworkflows/installed.json").declined, [{ file: "CLAUDE.md", what: "import" }]);
});
test("--yes adds the import on its own line", () => {
  const r = repo({ "CLAUDE.md": "# Rules\nlast" });
  cli(r, ["install", "--yes"]);
  assert.equal(readFileSync(join(r, "CLAUDE.md"), "utf8"), "# Rules\nlast\n@AGENTS.md\n");
});
test("a stored 'no' is honored, even with --yes", () => {
  const r = repo({ "CLAUDE.md": "# Rules\n" });
  cli(r, ["install"]);
  cli(r, ["install", "--yes"]);
  assert.equal(readFileSync(join(r, "CLAUDE.md"), "utf8"), "# Rules\n");
});
test("skill collision: keep theirs by default, xwf- prefix with --yes", () => {
  const mine = { ".claude/skills/grill/SKILL.md": "---\nname: grill\n---\nmine\n" };
  const a = repo(mine);
  const out = cli(a, ["install"]);
  assert.match(out.stdout, /answered for you: A skill grill exists\. Keep theirs or install ours as xwf-grill\? -> keep theirs/);
  assert.equal(readFileSync(join(a, ".claude/skills/grill/SKILL.md"), "utf8"), mine[".claude/skills/grill/SKILL.md"]);
  const rec = readJson(a, ".xworkflows/installed.json");
  assert.deepEqual(rec.kept, [".claude/skills/grill"]);
  assert.ok(!Object.keys(rec.files).some((p) => p.startsWith(".claude/skills/grill/")));
  cli(a, ["install", "--yes"]);
  assert.ok(!existsSync(join(a, ".claude/skills/xwf-grill")));
  const b = repo(mine);
  cli(b, ["install", "--yes"]);
  assert.match(readFileSync(join(b, ".claude/skills/xwf-grill/SKILL.md"), "utf8"), /^name: xwf-grill$/m);
  assert.match(readFileSync(join(b, ".claude/skills/xwf-grill/SKILL.md"), "utf8"), /node \.xworkflows\/mark\.mjs grill/);
  assert.equal(readJson(b, ".xworkflows/installed.json").renamed[".claude/skills/xwf-grill"], "grill");
  assert.ok(readJson(b, ".xworkflows/installed.json").files[".claude/skills/xwf-grill/SKILL.md"]);
});
test("agent collision and dry-run", () => {
  const r = repo({ ".claude/agents/explore.md": "mine\n" });
  const d = cli(r, ["install", "--dry-run"]);
  assert.ok(!existsSync(join(r, ".xworkflows")));
  assert.match(d.stdout, /answered for you: An agent explore exists/);
  cli(r, ["install", "--yes"]);
  assert.match(readFileSync(join(r, ".claude/agents/xwf-explore.md"), "utf8"), /^name: xwf-explore$/m);
  assert.equal(readFileSync(join(r, ".claude/agents/explore.md"), "utf8"), "mine\n");
});
test("identical unrecorded file is adopted; a different one is asked about, and kept under --yes, no terminal and --dry-run", () => {
  const r = repo();
  cli(r, ["install"]);
  rmSync(join(r, ".xworkflows/installed.json"));
  assert.equal(cli(r, ["install"]).status, 0);
  rmSync(join(r, ".xworkflows/installed.json"));
  const f = join(r, ".xworkflows/hooks/run.mjs");
  appendFileSync(f, "// mine\n");
  const mine = readFileSync(f, "utf8");
  const dry = cli(r, ["install", "--dry-run"]);
  assert.match(dry.stdout, /answered for you: .*\.xworkflows\/hooks\/run\.mjs.* -> keep mine/);
  assert.equal(readFileSync(f, "utf8"), mine);
  assert.ok(!existsSync(join(r, ".xworkflows/installed.json")));
  for (const args of [["install"], ["install", "--yes"]]) {
    const out = cli(r, args);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /^kept \(not ours\): \.xworkflows\/hooks\/run\.mjs {2}new: hooks\/run\.mjs$/m);
    assert.equal(readFileSync(f, "utf8"), mine);
    assert.equal(readJson(r, ".xworkflows/installed.json").files[".xworkflows/hooks/run.mjs"], undefined);
  }
});
test("a recorded file changed locally is kept", () => {
  const r = repo();
  cli(r, ["install"]);
  appendFileSync(join(r, ".claude/agents/explore.md"), "local note\n");
  const out = cli(r, ["install"]);
  assert.match(out.stdout, /kept \(changed locally\): \.claude\/agents\/explore\.md {2}new: agents\/explore\.md/);
  assert.match(readFileSync(join(r, ".claude/agents/explore.md"), "utf8"), /local note/);
});

test("doctor passes on a fresh install, in a path with a space, inside a Claude session", () => {
  const r = repo();
  const spaced = join(r, "my project"); mkdirSync(spaced); git(spaced, "init -q -b main");
  cli(spaced, ["install"]);
  const out = doctor(spaced, { CLAUDE_PROJECT_DIR: "/elsewhere", XWORKFLOWS_FREE: "1" });
  assert.equal(out.status, 0, out.stdout);
  assert.match(out.stdout, /^ok +probe/m);
  assert.match(out.stdout, /always-loaded: \d+ bytes of 24000/);
  assert.match(out.stdout, /Claude Code: tested/);
});
test("doctor warns on a local change and still exits 0", () => {
  const r = repo(); cli(r, ["install"]);
  appendFileSync(join(r, ".claude/agents/explore.md"), "x\n");
  const out = doctor(r);
  assert.equal(out.status, 0);
  assert.match(out.stdout, /^warn changed locally: \.claude\/agents\/explore\.md/m);
});
test("doctor warns on a declined import", () => {
  const r = repo({ "CLAUDE.md": "# x\n" }); cli(r, ["install"]);
  const out = doctor(r);
  assert.equal(out.status, 0);
  assert.match(out.stdout, /^warn CLAUDE\.md does not import AGENTS\.md/m);
});
for (const [name, breakIt] of [
  ["missing file", (r) => rmSync(join(r, ".xworkflows/hooks/run.mjs"))],
  ["removed hook entry", (r) => writeJson(r, ".claude/settings.json", { permissions: { allow: ["Bash(node .xworkflows/mark.mjs:*)"] } })],
  ["missing import", (r) => writeFileSync(join(r, "CLAUDE.md"), "")],
  ["size over budget", (r) => writeFileSync(join(r, "AGENTS.md"), readFileSync(join(r, "AGENTS.md"), "utf8") + "x".repeat(30000))],
  ["probe allows", (r) => writeFileSync(join(r, ".xworkflows/hooks/core/design-first.mjs"), "export const SKILL='grill'; export const decide=()=>({decision:'allow'});\n")],
  ["corrupt record", (r) => writeFileSync(join(r, ".xworkflows/installed.json"), "{")],
]) test(`doctor fails: ${name}`, () => {
  const r = repo(); cli(r, ["install"]); breakIt(r);
  assert.equal(doctor(r).status, 1);
});
test("doctor skips an @import that is a folder", () => {
  const r = repo(); cli(r, ["install"]);
  mkdirSync(join(r, "docs"), { recursive: true });
  appendFileSync(join(r, "CLAUDE.md"), "@docs\n");
  const out = doctor(r);
  assert.equal(out.status, 0, out.stdout + out.stderr);
  assert.match(out.stdout, /^doctor: 0 fail/m);
});
test("doctor fails when the probe hangs", () => {
  const r = repo(); cli(r, ["install"]);
  writeFileSync(join(r, ".xworkflows/hooks/core/design-first.mjs"), "await new Promise(() => setInterval(() => {}, 1000));\n");
  const out = doctor(r, { XWORKFLOWS_PROBE_TIMEOUT_MS: "1500" });
  assert.equal(out.status, 1);
  assert.match(out.stdout, /^fail probe/m);
});

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
test("doctor fails when a kept grill never marks itself, warns when it does", () => {
  const bad = repo({ ".claude/skills/grill/SKILL.md": "---\nname: grill\n---\nmine\n" });
  cli(bad, ["install"]);
  const out = doctor(bad);
  assert.equal(out.status, 1);
  assert.match(out.stdout, /^fail kept grill never marks itself: spec writes will be denied\./m);
  const good = repo({ ".claude/skills/grill/SKILL.md": "---\nname: grill\n---\nnode .xworkflows/mark.mjs grill\n" });
  cli(good, ["install"]);
  const o2 = doctor(good);
  assert.match(o2.stdout, /^warn kept theirs: \.claude\/skills\/grill/m);
  assert.doesNotMatch(o2.stdout, /never marks itself/);
});

test("kept grill doctor message offers only the way that works", () => {
  const r = repo({ ".claude/skills/grill/SKILL.md": "---\nname: grill\n---\nmine\n" });
  cli(r, ["install"]);
  const out = doctor(r);
  assert.match(out.stdout, /^fail kept grill never marks itself/m);
  assert.doesNotMatch(out.stdout, /--yes/);
});

test("design-first deny names xwf-grill after a rename", () => {
  const r = repo({ ".claude/skills/grill/SKILL.md": "---\nname: grill\n---\nmine\n" });
  cli(r, ["install", "--yes"]);
  const ev = JSON.stringify({ session_id: "s1", cwd: r, hook_event_name: "PreToolUse", tool_name: "Write",
    tool_input: { file_path: join(r, "docs/superpowers/specs/x.md"), content: "# x\n" } });
  const env = { ...process.env, CLAUDE_PROJECT_DIR: r, XWORKFLOWS_STATE_DIR: mkdtempSync(join(tmpdir(), "xwf-state-")) };
  for (const k of ["XWORKFLOWS_FREE", "XWORKFLOWS_RECORD"]) delete env[k];
  const out = spawnSync("node", [join(r, ".xworkflows/hooks/run.mjs"), "claude", "design-first"], { input: ev, cwd: r, encoding: "utf8", env });
  assert.match(JSON.parse(out.stdout).hookSpecificOutput.permissionDecisionReason, /^Run \/xwf-grill/);
});

test("install maps tiers of zone-review and verify-finding", () => {
  const r = repo();
  assert.equal(cli(r, ["install"]).status, 0);
  assert.match(readFileSync(join(r, ".claude/agents/zone-review.md"), "utf8"), /^model: opus$/m);
  assert.match(readFileSync(join(r, ".claude/agents/verify-finding.md"), "utf8"), /^model: sonnet$/m);
});
test("fresh install writes the day-one skills and doctor passes", () => {
  const r = repo();
  assert.equal(cli(r, ["install"]).status, 0);
  for (const s of ["adapt", "full-review", "next-step", "thermo-nuclear-review", "thermo-nuclear-code-quality-review"])
    assert.ok(existsSync(join(r, `.claude/skills/${s}/SKILL.md`)), s);
  assert.equal(doctor(r).status, 0);
});

// brakes, git hooks, gitignore lines and scalar settings
const ALL_KEYS = { paths: { code: [], risk: [], heavyRead: [], codeAnyway: [] }, tests: { files: [], run: "true", notRunnable: [] }, checks: { project: [], patterns: [], ratchets: [] } };
const config = (r, patterns) => {
  mkdirSync(join(r, ".xworkflows"), { recursive: true });
  writeJson(r, ".xworkflows/config.json", { ...ALL_KEYS, checks: { ...ALL_KEYS.checks, patterns } });
};
const BAD = [{ name: "no-bad", regex: "BADWORD", why: "no bad words" }];
const commit = (r, file, text, env) => {
  file = `docs/${file}`; // under paths.nonCode: review-seal has nothing to say
  mkdirSync(join(r, "docs"), { recursive: true });
  writeFileSync(join(r, file), text);
  spawnSync("git", ["add", file], { cwd: r, env: isoEnv() });
  return spawnSync("git", ["commit", "-qm", `add ${file}`], { cwd: r, encoding: "utf8", env: { ...isoEnv(), ...env } });
};
const pushed = (r) => {
  const x = spawnSync("git", ["push", "-q", "origin", "main"], { cwd: r, encoding: "utf8", env: isoEnv() });
  return { status: x.status, stderr: x.stdout + x.stderr }; // a hook's standard output is shown on either stream
};
function withRemote() {
  const r = repo();
  const bare = mkdtempSync(join(tmpdir(), "xwf-bare-"));
  spawnSync("git", ["init", "-q", "--bare", bare], { env: isoEnv() });
  git(r, `remote add origin ${bare}`);
  return { r, bare };
}
const waitFor = (p) => { for (let i = 0; i < 100 && !existsSync(p); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); return existsSync(p); };

test("the brakes are installed and xworkflows check runs one", () => {
  const r = repo();
  cli(r, ["install"]);
  for (const f of ["run.mjs", "comment-lines.mjs", "signature.mjs", "project.mjs"]) assert.ok(existsSync(join(r, ".xworkflows/checks", f)), f);
  assert.ok(!existsSync(join(r, ".xworkflows/checks/run.test.mjs")));
  commit(r, "a.txt", "fine\n");
  config(r, BAD);
  assert.equal(cli(r, ["check", "--only", "signature"]).status, 0);
  assert.equal(cli(r, ["check", "--only", "nope"]).status, 2); // run.mjs's own exit code
  commit(r, "b.txt", "BADWORD\n");
  const out = cli(r, ["check", "--only", "patterns", "HEAD~1"]);
  assert.equal(out.status, 1);
  assert.match(out.stdout, /^patterns: /m);
});
test("check: not installed is one line and exit 2", () => {
  const out = cli(repo(), ["check"]);
  assert.equal(out.status, 2);
  assert.equal(out.stderr.trim().split("\n").length, 1);
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

const OLD = '#!/bin/sh\nd="$(dirname "$0")/.."\necho "$@" > "$d/old-args"\ncat > "$d/old-in"\n[ -e "$d/old-fail" ] && { echo OLD-FAILED >&2; exit 7; }\nexit 0\n';
function chained() {
  const { r, bare } = withRemote();
  mkdirSync(join(r, ".git/hooks"), { recursive: true });
  writeFileSync(join(r, ".git/hooks/pre-push"), OLD);
  chmodSync(join(r, ".git/hooks/pre-push"), 0o755);
  return { r, bare };
}
test("an existing pre-push hook is chained: first, same input, its failure stops the push", () => {
  const { r, bare } = chained();
  config(r, BAD);
  assert.equal(cli(r, ["install", "--yes"]).status, 0);
  assert.equal(readFileSync(join(r, ".git/hooks/pre-push.before-xworkflows"), "utf8"), OLD);
  commit(r, "a.txt", "fine\n");
  assert.equal(pushed(r).status, 0);
  assert.match(readFileSync(join(r, ".git/old-in"), "utf8"), /^refs\/heads\/main [0-9a-f]{40} refs\/heads\/main 0{40}$/m);
  assert.match(readFileSync(join(r, ".git/old-args"), "utf8"), /^origin /);
  commit(r, "b.txt", "BADWORD\n");
  writeFileSync(join(r, ".git/old-fail"), "");
  const no = pushed(r);
  assert.notEqual(no.status, 0);
  assert.match(no.stderr, /OLD-FAILED/);
  assert.doesNotMatch(no.stderr, /patterns: /); // the check never ran
  rmSync(join(r, ".git/old-fail"));
  assert.match(pushed(r).stderr, /patterns: /); // old passes, then the check refuses
  assert.equal(git(bare, "rev-list --count main"), "1");
  assert.ok(readFileSync(join(r, ".git/old-in"), "utf8").includes("refs/heads/main"));
});
test("uninstall puts a chained hook back byte for byte", () => {
  const { r } = chained();
  cli(r, ["install", "--yes"]);
  assert.match(cli(r, ["uninstall"]).stdout, /uninstalled/);
  assert.equal(readFileSync(join(r, ".git/hooks/pre-push"), "utf8"), OLD);
  assert.ok(statSync(join(r, ".git/hooks/pre-push")).mode & 0o100);
  assert.ok(!existsSync(join(r, ".git/hooks/pre-push.before-xworkflows")));
  assert.ok(!existsSync(join(r, ".git/hooks/post-commit")));
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
test("a hook the user changed after install stays on uninstall", () => {
  const { r } = chained();
  cli(r, ["install", "--yes"]);
  appendFileSync(join(r, ".git/hooks/pre-push"), "# mine\n");
  const out = cli(r, ["uninstall"]);
  assert.match(out.stdout, /kept \(changed locally\): \.git\/hooks\/pre-push/);
  assert.match(readFileSync(join(r, ".git/hooks/pre-push"), "utf8"), /# mine/);
  assert.ok(existsSync(join(r, ".git/hooks/pre-push.before-xworkflows")));
});
test("core.hooksPath is honored", () => {
  const { r, bare } = withRemote();
  git(r, "config core.hooksPath .githooks");
  mkdirSync(join(r, ".githooks"));
  writeFileSync(join(r, ".githooks/pre-push"), OLD);
  chmodSync(join(r, ".githooks/pre-push"), 0o755);
  cli(r, ["install", "--yes"]);
  assert.ok(existsSync(join(r, ".githooks/pre-push.before-xworkflows")));
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

test("gitignore lines and scalar settings: written once, left alone, removed by uninstall", () => {
  const r = repo({ ".gitignore": "node_modules" });
  cli(r, ["install"]);
  const gi = readFileSync(join(r, ".gitignore"), "utf8");
  assert.equal(gi, "node_modules\ngraphify-out/\n.claude/settings.local.json\n.qmd/\n");
  assert.deepEqual(readJson(r, ".claude/settings.json").attribution, { commit: "", pr: "" });
  assert.deepEqual(readJson(r, ".claude/settings.local.json"), { autoMemoryDirectory: join(realpathSync(r), "docs/memory") });
  assert.equal(git(r, "check-ignore .claude/settings.local.json"), ".claude/settings.local.json");
  assert.match(cli(r, ["install"]).stdout, /^nothing to do$/m);
  assert.equal(readFileSync(join(r, ".gitignore"), "utf8"), gi);
  cli(r, ["uninstall"]);
  assert.equal(readFileSync(join(r, ".gitignore"), "utf8"), "node_modules");
  assert.deepEqual(readdirSync(r).sort(), [".git", ".gitignore"]);
});
test("gitignore and settings already there are left alone; memory.dir is honored", () => {
  const mine = { attribution: { commit: "x" }, theme: "dark" };
  const r = repo({ ".gitignore": "graphify-out\n.claude/*.local.json\n", ".claude/settings.json": JSON.stringify(mine), ".claude/settings.local.json": JSON.stringify({ autoMemoryDirectory: "/mine" }) });
  cli(r, ["install"]);
  assert.equal(readFileSync(join(r, ".gitignore"), "utf8"), "graphify-out\n.claude/*.local.json\n.qmd/\n");
  assert.deepEqual(readJson(r, ".claude/settings.json").attribution, { commit: "x" });
  assert.deepEqual(readJson(r, ".claude/settings.local.json"), { autoMemoryDirectory: "/mine" });
  cli(r, ["uninstall"]);
  assert.deepEqual(readJson(r, ".claude/settings.json"), mine);
  assert.deepEqual(readJson(r, ".claude/settings.local.json"), { autoMemoryDirectory: "/mine" });
  const q = repo({ ".xworkflows/config.json": JSON.stringify({ memory: { dir: "notes" } }) });
  cli(q, ["install"]);
  assert.equal(readJson(q, ".claude/settings.local.json").autoMemoryDirectory, join(realpathSync(q), "notes"));
});
test("a scalar setting the user changed stays on uninstall", () => {
  const r = repo();
  cli(r, ["install"]);
  const s = readJson(r, ".claude/settings.json");
  s.attribution = { commit: "mine", pr: "" };
  writeJson(r, ".claude/settings.json", s);
  cli(r, ["uninstall"]);
  assert.deepEqual(readJson(r, ".claude/settings.json").attribution, { commit: "mine", pr: "" });
});
test("dry-run writes no hook, no ignore line and no setting", () => {
  const r = repo();
  cli(r, ["install", "--dry-run"]);
  assert.deepEqual(readdirSync(r), [".git"]);
  assert.ok(!existsSync(join(r, ".git/hooks/pre-push")));
});

// doctor: fakes first on a PATH of its own, so the real qmd, graphify, semgrep and trivy never run
const made = [];
process.on("exit", () => made.forEach((d) => rmSync(d, { recursive: true, force: true })));
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
function tools(fakes = {}) {
  const d = tmp("xwf-bin-");
  symlinkSync(process.execPath, join(d, "node"));
  symlinkSync(spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim(), join(d, "git"));
  for (const [n, body] of Object.entries(fakes)) { writeFileSync(join(d, n), `#!/bin/sh\n${body}\n`); chmodSync(join(d, n), 0o755); }
  return `${d}:/usr/bin:/bin`;
}
// a qmd whose one collection covers docs/memory of the folder it runs in
const COVERS = `case "$*" in *"collection list"*) printf 'memory (qmd://memory/)\\n';; *"collection show memory"*) printf '  Path:     %s/docs/memory\\n' "$(pwd -P)";; esac`;
const GOOD = tools({ qmd: COVERS, graphify: "exit 0" });
const EMPTY_HOME = tmp("xwf-home-");
function doctor(r, env = {}) {
  if (!existsSync(join(r, ".xworkflows/config.json"))) { mkdirSync(join(r, ".xworkflows"), { recursive: true }); writeJson(r, ".xworkflows/config.json", ALL_KEYS); }
  return cli(r, ["doctor"], { env: { PATH: GOOD, HOME: EMPTY_HOME, ...env } });
}
const withConfig = (r, c) => { mkdirSync(join(r, ".xworkflows"), { recursive: true }); writeJson(r, ".xworkflows/config.json", { ...ALL_KEYS, ...c }); };

test("doctor: a missing project key fails and names its brakes; the same key set to [] passes", () => {
  const r = repo(); cli(r, ["install"]);
  const { patterns, ...checks } = ALL_KEYS.checks;
  withConfig(r, { checks });
  const out = doctor(r);
  assert.equal(out.status, 1);
  assert.match(out.stdout, /^fail not configured: checks\.patterns \(needed by patterns\), run \/adapt$/m);
  withConfig(r, {});
  const ok = doctor(r);
  assert.equal(ok.status, 0, ok.stdout);
  assert.doesNotMatch(ok.stdout, /not configured/);
});
test("doctor: graphify is asked only of a project with code", () => {
  const r = repo(); cli(r, ["install"]);
  const bare = tools({ qmd: "exit 0" });
  assert.doesNotMatch(doctor(r, { PATH: bare }).stdout, /graphify/);
  withConfig(r, { paths: { ...ALL_KEYS.paths, code: ["src/"] } });
  const out = doctor(r, { PATH: bare });
  assert.equal(out.status, 1);
  assert.match(out.stdout, /^fail graphify command is missing: uv tool install graphifyy$/m);
  assert.match(out.stdout, /^fail graphify-out\/graph\.json is missing: graphify update \.$/m);
  mkdirSync(join(r, "graphify-out")); writeFileSync(join(r, "graphify-out/graph.json"), "{}");
  const some = doctor(r);
  assert.doesNotMatch(some.stdout, /^fail graphify/m);
  assert.match(some.stdout, /^ok +graphify/m);
});
test("doctor: qmd missing fails with its fix line; a collection must cover the memory folder", () => {
  const r = repo(); cli(r, ["install"]);
  const none = doctor(r, { PATH: tools({}) });
  assert.equal(none.status, 1);
  assert.match(none.stdout, /^fail qmd command is missing: npm install -g @tobilu\/qmd$/m);
  rmSync(join(r, "docs/memory"), { recursive: true });
  assert.match(doctor(r, { PATH: tools({ qmd: "exit 0" }) }).stdout, /^warn no memory folder yet: docs\/memory: /m);
  mkdirSync(join(r, "docs/memory"), { recursive: true });
  const out = doctor(r, { PATH: tools({ qmd: "exit 0" }) });
  assert.equal(out.status, 1);
  assert.match(out.stdout, /^fail no qmd collection covers docs\/memory: this qmd does not read \.qmd\/index\.yml, which names it: npm install -g @tobilu\/qmd@latest$/m);
  // the real formats: `list` names the collections, only `show <name>` prints the path
  const fake = (dir) => tools({ qmd: `case "$*" in *"collection list"*) printf 'Collections (1):\\n\\nmemory (qmd://memory/)\\n  Pattern:  **/*.md\\n  Files:    3\\n';; *"collection show memory"*) printf 'Collection: memory\\n  Path:     ${dir}\\n  Pattern:  **/*.md\\n';; esac` });
  const covers = fake(join(realpathSync(r), "docs"));
  const ok = doctor(r, { PATH: covers });
  assert.equal(ok.status, 0, ok.stdout);
  assert.match(ok.stdout, /^ok +qmd collection covers docs\/memory$/m);
  assert.match(doctor(r, { PATH: fake("/somewhere/else") }).stdout, /^fail no qmd collection covers docs\/memory/m);
});
test("doctor: a tool that hangs does not hang doctor", () => {
  const r = repo(); cli(r, ["install"]);
  mkdirSync(join(r, "docs/memory"), { recursive: true });
  withConfig(r, { packs: { semgrep: { configs: ["auto"] } } });
  const t0 = Date.now();
  const out = doctor(r, { PATH: tools({ qmd: "exec sleep 30", semgrep: "exec sleep 30" }), XWORKFLOWS_PROBE_TIMEOUT_MS: "400" });
  assert.ok(Date.now() - t0 < 15000);
  assert.match(out.stdout, /^warn qmd did not answer/m);
  assert.match(out.stdout, /^warn pack semgrep: version unknown/m);
});
test("doctor: the pre-push hook must be ours; a declined one warns", () => {
  const r = repo(); cli(r, ["install"]);
  assert.match(doctor(r).stdout, /^ok +pre-push hook is ours$/m);
  rmSync(join(r, ".git/hooks/pre-push"));
  assert.match(doctor(r).stdout, /^fail pre-push hook is missing or not ours: /m);
  const d = repo({ ".git/hooks/pre-push": "#!/bin/sh\nexit 0\n" }); chmodSync(join(d, ".git/hooks/pre-push"), 0o755);
  cli(d, ["install"]);
  const out = doctor(d);
  assert.match(out.stdout, /^warn pre-push hook is yours: chaining declined at install; /m);
});
test("doctor prints the session-start bytes and fails above the budget", () => {
  const r = repo(); cli(r, ["install"]);
  const home = tmp("xwf-home-");
  mkdirSync(join(home, ".xworkflows")); writeFileSync(join(home, ".xworkflows/owner.md"), "Replies: short and direct.\n");
  const out = doctor(r, { HOME: home });
  assert.equal(out.status, 0, out.stdout);
  assert.match(out.stdout, /^ok +session-start text: [1-9]\d* bytes of 2000$/m);
  withConfig(r, { tokens: { sessionStartBytes: 10 } });
  const over = doctor(r, { HOME: home });
  assert.equal(over.status, 1);
  assert.match(over.stdout, /^fail session-start text: [1-9]\d* bytes of 10: /m);
});
test("doctor warns on an attribution that shows an AI line and on a memory folder outside the repository", () => {
  const r = repo(); cli(r, ["install"]);
  assert.doesNotMatch(doctor(r).stdout, /^warn (attribution|autoMemoryDirectory)/m);
  const s = readJson(r, ".claude/settings.json");
  writeJson(r, ".claude/settings.json", { ...s, attribution: { commit: "Co-Authored-By: someone", pr: "" } });
  writeJson(r, ".claude/settings.local.json", { autoMemoryDirectory: "/elsewhere/memory" });
  const out = doctor(r);
  assert.equal(out.status, 0, out.stdout);
  assert.match(out.stdout, /^warn attribution in \.claude\/settings\.json shows an AI line: /m);
  assert.match(out.stdout, /^warn autoMemoryDirectory is not the memory folder docs\/memory: /m);
  rmSync(join(r, ".claude/settings.local.json"));
  assert.match(doctor(r).stdout, /^warn autoMemoryDirectory is not set in \.claude\/settings\.local\.json: /m);
});
test("doctor: a pack that is on needs its tool, at the version it was tested with", () => {
  const r = repo(); cli(r, ["install"]);
  withConfig(r, { packs: { semgrep: { configs: ["auto"] }, lint: { run: "true" } } });
  const out = doctor(r);
  assert.equal(out.status, 1);
  assert.match(out.stdout, /^fail pack semgrep: semgrep command is missing: /m);
  assert.doesNotMatch(out.stdout, /pack lint/);
  const old = doctor(r, { PATH: tools({ qmd: COVERS, semgrep: "echo 1.0.0" }) });
  assert.equal(old.status, 0, old.stdout);
  assert.match(old.stdout, /^warn pack semgrep: version 1\.0\.0, tested with 1\.179\.0: /m);
  assert.match(doctor(r, { PATH: tools({ qmd: COVERS, semgrep: "echo 1.179.0" }) }).stdout, /^ok +pack semgrep: 1\.179\.0$/m);
});
test("doctor prints the first-turn input tokens of the newest session, or says none is recorded", () => {
  const r = repo(); cli(r, ["install"]);
  const home = tmp("xwf-home-");
  assert.match(doctor(r, { HOME: home }).stdout, /^ok +first turn: no session recorded$/m);
  const dir = join(home, ".claude/projects", realpathSync(r).replace(/[^a-zA-Z0-9]/g, "-"));
  mkdirSync(dir, { recursive: true });
  const usage = { input_tokens: 3, cache_creation_input_tokens: 100, cache_read_input_tokens: 20 };
  writeFileSync(join(dir, "s.jsonl"), `${JSON.stringify({ type: "user" })}\n${JSON.stringify({ message: { usage } })}\n${JSON.stringify({ message: { usage: { input_tokens: 999 } } })}\n`);
  const out = doctor(r, { HOME: home });
  assert.equal(out.status, 0, out.stdout);
  assert.match(out.stdout, /^ok +first turn: 123 input tokens \(newest session\)$/m);
});

// review findings
const outside = (hooksPath) => {
  const cfg = join(tmp("xwf-g-"), "gitconfig");
  writeFileSync(cfg, `[core]\n\thooksPath = ${hooksPath}\n`);
  return cfg;
};
const hasHook = (d) => { const p = join(d, "pre-push"); writeFileSync(p, OLD); chmodSync(p, 0o755); };

test("the developer's global git config never reaches a test", () => {
  const g = tmp("xwf-ghooks-"); hasHook(g);
  const saved = process.env.GIT_CONFIG_GLOBAL;
  process.env.GIT_CONFIG_GLOBAL = outside(g);
  try { cli(repo(), ["install", "--yes"]); } finally { if (saved === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = saved; }
  assert.deepEqual(readdirSync(g), ["pre-push"]);
  assert.equal(readFileSync(join(g, "pre-push"), "utf8"), OLD);
});
test("a hooks folder outside the repository is left alone, with one line", () => {
  const g = tmp("xwf-ghooks-"); hasHook(g);
  const r = repo();
  const env = { GIT_CONFIG_GLOBAL: outside(g) };
  const out = cli(r, ["install", "--yes"], { env });
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(readdirSync(g), ["pre-push"]);
  assert.equal(readFileSync(join(g, "pre-push"), "utf8"), OLD);
  assert.equal(out.stdout.split("\n").filter((l) => /hooks folder .* outside/.test(l)).length, 1);
  assert.ok(!existsSync(join(r, ".git/hooks/pre-push")));
  assert.match(cli(r, ["uninstall"], { env }).stdout, /uninstalled/);
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

test("a chained hook found again after installed.json was lost is chained and restored", () => {
  const { r } = chained();
  cli(r, ["install", "--yes"]);
  rmSync(join(r, ".xworkflows/installed.json"));
  assert.equal(cli(r, ["install", "--yes"]).status, 0);
  assert.deepEqual(readJson(r, ".xworkflows/installed.json").chained, [{ file: ".git/hooks/pre-push", to: ".git/hooks/pre-push.before-xworkflows" }]);
  cli(r, ["uninstall"]);
  assert.equal(readFileSync(join(r, ".git/hooks/pre-push"), "utf8"), OLD);
  assert.ok(!existsSync(join(r, ".git/hooks/pre-push.before-xworkflows")));
});
test("an interrupted install that left the user's hook renamed still chains it", () => {
  const r = repo();
  mkdirSync(join(r, ".git/hooks"), { recursive: true });
  writeFileSync(join(r, ".git/hooks/pre-push.before-xworkflows"), OLD);
  chmodSync(join(r, ".git/hooks/pre-push.before-xworkflows"), 0o755);
  cli(r, ["install", "--yes"]);
  assert.match(readFileSync(join(r, ".git/hooks/pre-push"), "utf8"), /before-xworkflows/);
  cli(r, ["uninstall"]);
  assert.equal(readFileSync(join(r, ".git/hooks/pre-push"), "utf8"), OLD);
});

test("another clone's own pre-push is chained even when the record lists the path", () => {
  const a = repo(); cli(a, ["install"]);
  const b = repo({ ".git/hooks/pre-push": OLD }); chmodSync(join(b, ".git/hooks/pre-push"), 0o755);
  mkdirSync(join(b, ".xworkflows"));
  writeFileSync(join(b, ".xworkflows/installed.json"), readFileSync(join(a, ".xworkflows/installed.json")));
  cli(b, ["install", "--yes"]);
  assert.equal(readFileSync(join(b, ".git/hooks/pre-push.before-xworkflows"), "utf8"), OLD);
  assert.match(readFileSync(join(b, ".git/hooks/pre-push"), "utf8"), /before-xworkflows/);
});
test("doctor does not call a recorded hook ours when it no longer holds our text", () => {
  const r = repo(); cli(r, ["install"]);
  writeFileSync(join(r, ".git/hooks/pre-push"), "#!/bin/sh\nexit 0\n");
  const out = doctor(r);
  assert.doesNotMatch(out.stdout, /^ok +pre-push hook is ours$/m);
  assert.match(out.stdout, /^warn pre-push hook changed locally/m);
  assert.equal(out.status, 0, out.stdout);
});

test("installed.json holds no absolute path: the memory dir is recorded as configured", () => {
  const r = repo(); cli(r, ["install"]);
  const raw = readFileSync(join(r, ".xworkflows/installed.json"), "utf8");
  assert.ok(!raw.includes(realpathSync(r)) && !raw.includes(r), raw);
  assert.deepEqual(readJson(r, ".xworkflows/installed.json").scalars.find((x) => x.file.endsWith("local.json")), { file: ".claude/settings.local.json", key: ["autoMemoryDirectory"], dir: "docs/memory" });
});
test("a tracked settings.local.json is not written to; one line says so", () => {
  const r = repo({ ".claude/settings.local.json": '{"x":1}' });
  git(r, "add -A"); git(r, "commit -qm t");
  const out = cli(r, ["install", "--yes"]);
  assert.equal(readFileSync(join(r, ".claude/settings.local.json"), "utf8"), '{"x":1}');
  assert.equal(out.stdout.split("\n").filter((l) => /settings\.local\.json is tracked/.test(l)).length, 1);
  assert.equal(readJson(r, ".xworkflows/installed.json").scalars.filter((x) => x.file.endsWith("local.json")).length, 0);
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

test("the three pack modules install with the checks", () => {
  const r = repo(); cli(r, ["install"]);
  for (const n of ["lint", "semgrep", "trivy"]) assert.ok(existsSync(join(r, `.xworkflows/checks/packs/${n}.mjs`)), n);
  const m = readJson(PKG_ROOT, "manifest.json");
  assert.deepEqual(m.pieces.filter((p) => p.kind === "pack").map((p) => [p.id, p.origin]), [["lint", "own"], ["semgrep", "fetched"], ["trivy", "fetched"]]);
});
test("pack refuses a tracked pack module that belongs to no piece", () => {
  const copy = packageCopy();
  writeFileSync(join(copy, "checks/packs/extra.mjs"), "export const x = 1;\n");
  spawnSync("git", ["add", "-A"], { cwd: copy, env: isoEnv() });
  assert.match(cliAt(copy, copy, ["pack"]).stderr, /checks\/packs\/extra\.mjs belongs to no piece/);
});

test("doctor never runs the graph tool the session-start hook would start", () => {
  const r = repo({ "src/a.js": "x\n" });
  git(r, "add -A"); git(r, "commit -qm t");
  cli(r, ["install"]);
  withConfig(r, { paths: { ...ALL_KEYS.paths, code: ["src/"] } });
  mkdirSync(join(r, "graphify-out")); writeFileSync(join(r, "graphify-out/graph.json"), "{}");
  utimesSync(join(r, "graphify-out/graph.json"), new Date("2020-01-01"), new Date("2020-01-01"));
  const log = join(tmp("xwf-log-"), "calls");
  const out = doctor(r, { PATH: tools({ qmd: COVERS, graphify: `echo "$@" >> ${log}` }) });
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  assert.equal(out.status, 0, out.stdout);
  assert.ok(!existsSync(log), "graphify was run");
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

const sha = (t) => createHash("sha256").update(t).digest("hex");
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

// the record is the project's text, never the package's word: uninstall removes only what this package writes
const withRecord = (r, edit) => { const rec = readJson(r, ".xworkflows/installed.json"); edit(rec); writeJson(r, ".xworkflows/installed.json", rec); };
const notOurs = (out, p) => assert.match(out.stdout, new RegExp(`^kept \\(not ours\\): ${p.replace(/[.\/]/g, "\\$&")}$`, "m"));

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
  assert.doesNotMatch(out.stdout, /deleted .*pre-push/);
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

// J1-J4: install honors the same symlink test as uninstall
test("install writes nothing through a symlink; uninstall has nothing to undo there", () => {
  // (1) settings.json -> outside file
  const o1 = tmp("xwf-out-"); writeFileSync(join(o1, "settings.json"), '{"theme":"dark"}\n');
  const r1 = repo(); mkdirSync(join(r1, ".claude")); symlinkSync(join(o1, "settings.json"), join(r1, ".claude/settings.json"));
  const out1 = cli(r1, ["install", "--yes"]);
  assert.equal(out1.status, 0, out1.stderr);
  assert.equal(readFileSync(join(o1, "settings.json"), "utf8"), '{"theme":"dark"}\n');
  assert.match(out1.stdout, /^not written \(symlink\): \.claude\/settings\.json$/m);
  // (2) skills -> outside folder
  const o2 = tmp("xwf-out-");
  const r2 = repo(); mkdirSync(join(r2, ".claude")); symlinkSync(o2, join(r2, ".claude/skills"));
  assert.equal(cli(r2, ["install", "--yes"]).status, 0);
  assert.deepEqual(readdirSync(o2), []);
  assert.ok(!Object.keys(readJson(r2, ".xworkflows/installed.json").files).some((p) => p.startsWith(".claude/skills/")));
  // (3) CLAUDE.md -> AGENTS.md
  const r3 = repo({ "AGENTS.md": "# mine\n" }); symlinkSync("AGENTS.md", join(r3, "CLAUDE.md"));
  const out3 = cli(r3, ["install", "--yes"]);
  assert.match(out3.stdout, /^not written \(symlink\): CLAUDE\.md$/m);
  assert.ok(readFileSync(join(r3, "AGENTS.md"), "utf8").includes("xworkflows:start"));
  assert.doesNotMatch(readFileSync(join(r3, "AGENTS.md"), "utf8"), /^@AGENTS\.md$/m);
  const un = cli(r3, ["uninstall"]);
  assert.equal(un.status, 0, un.stderr);
  assert.equal(readFileSync(join(r3, "AGENTS.md"), "utf8"), "# mine\n");
  assert.doesNotMatch(un.stdout, /not ours/);
});
test("a skill of the same name under a linked .claude/skills is not asked about, not recorded as kept, and a later install asks nothing", () => {
  const o = tmp("xwf-out-"); mkdirSync(join(o, "grill")); writeFileSync(join(o, "grill/SKILL.md"), "---\nname: grill\n---\nmine\n");
  const r = repo(); mkdirSync(join(r, ".claude")); symlinkSync(o, join(r, ".claude/skills"));
  const out = cli(r, ["install"]);
  assert.equal(out.status, 0, out.stderr);
  assert.doesNotMatch(out.stdout, /answered for you/);
  assert.match(out.stdout, /^not written \(symlink\): \.claude\/skills\/grill\/SKILL\.md$/m);
  assert.deepEqual(readJson(r, ".xworkflows/installed.json").kept, []);
  assert.doesNotMatch(cli(r, ["install"]).stdout, /answered for you/);
  assert.doesNotMatch(doctor(r).stdout, /grill/);
  assert.equal(readFileSync(join(o, "grill/SKILL.md"), "utf8"), "---\nname: grill\n---\nmine\n");
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
// the answers are typed at a terminal: a pty from python3, each line sent once the previous question is out
const PTY = `import os, pty, sys, time
pid, fd = pty.fork()
if pid == 0:
    os.execvp("node", ["node"] + sys.argv[2:])
for line in sys.argv[1].split(","):
    time.sleep(1)
    os.write(fd, (line + "\\n").encode())
out = b""
try:
    while True:
        d = os.read(fd, 4096)
        if not d: break
        out += d
except OSError: pass
sys.stdout.write(out.decode())
`;
test("answers typed at a terminal decide each question: a prefix, an empty line and a file that is not ours", { skip: spawnSync("python3", ["-c", "import pty"]).status !== 0 && "needs python3 pty" }, () => {
  const r = repo({ ".claude/skills/grill/SKILL.md": "mine\n", "CLAUDE.md": "# x\n" });
  cli(r, ["install", "--yes"]);
  rmSync(join(r, ".xworkflows/installed.json"));
  rmSync(join(r, ".claude/skills/xwf-grill"), { recursive: true });
  writeFileSync(join(r, ".xworkflows/hooks/run.mjs"), "mine\n");
  writeFileSync(join(r, "CLAUDE.md"), "# x\n");
  const out = spawnSync("python3", ["-c", PTY, "xwf,o,y", BIN, "install"], { cwd: r, env: { ...process.env, ...ISO }, encoding: "utf8" });
  assert.match(out.stdout, /Keep theirs or install ours as xwf-grill\?/);
  assert.match(readFileSync(join(r, ".claude/skills/xwf-grill/SKILL.md"), "utf8"), /^name: xwf-grill$/m);
  assert.equal(readFileSync(join(r, ".claude/skills/grill/SKILL.md"), "utf8"), "mine\n");
  assert.notEqual(readFileSync(join(r, ".xworkflows/hooks/run.mjs"), "utf8"), "mine\n");
  assert.match(readFileSync(join(r, "CLAUDE.md"), "utf8"), /^@AGENTS\.md$/m);
  assert.doesNotMatch(out.stdout, /answered for you/);
});
test("a tracked settings.local.json: the ignore line is added once, not on every install", () => {
  const r = repo({ ".claude/settings.local.json": '{"x":1}' });
  git(r, "add -A"); git(r, "commit -qm t");
  cli(r, ["install", "--yes"]); cli(r, ["install", "--yes"]);
  assert.equal(readFileSync(join(r, ".gitignore"), "utf8").split("\n").filter((l) => l === ".claude/settings.local.json").length, 1);
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
test("install refuses, before any write, when its own folder or record is a symlink", () => {
  // (1) the record itself links to an outside file
  const o1 = tmp("xwf-out-"); writeFileSync(join(o1, "settings.json"), '{"theme":"dark"}\n');
  const r1 = repo(); mkdirSync(join(r1, ".xworkflows")); symlinkSync(join(o1, "settings.json"), join(r1, ".xworkflows/installed.json"));
  const out1 = cli(r1, ["install", "--yes"]);
  assert.equal(out1.status, 1);
  assert.match(out1.stderr, /^not written \(symlink\): \.xworkflows\/installed\.json$/m);
  assert.equal(readFileSync(join(o1, "settings.json"), "utf8"), '{"theme":"dark"}\n');
  assert.ok(!existsSync(join(r1, ".claude")));
  // (2) the whole folder links outside
  const o2 = tmp("xwf-out-");
  const r2 = repo(); symlinkSync(o2, join(r2, ".xworkflows"));
  assert.equal(cli(r2, ["install", "--yes"]).status, 1);
  assert.deepEqual(readdirSync(o2), []);
  // (3) a folder under it links outside: the hooks would be wired to files that were not written
  const o3 = tmp("xwf-out-");
  const r3 = repo(); mkdirSync(join(r3, ".xworkflows")); symlinkSync(o3, join(r3, ".xworkflows/checks"));
  const out3 = cli(r3, ["install", "--yes"]);
  assert.equal(out3.status, 1);
  assert.match(out3.stderr, /^not written \(symlink\): \.xworkflows\/checks\//m);
  assert.deepEqual(readdirSync(o3), []);
  assert.ok(!existsSync(join(r3, ".git/hooks/pre-push")));
  assert.ok(!existsSync(join(r3, ".claude")));
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

// install: the memory folder and the project-local qmd index (.qmd/index.yml); no qmd ever starts
const qmdLog = () => join(tmp("xwf-log-"), "qmd.log");
const spy = (log) => tools({ qmd: `echo "$@" >> ${log}` });
const inst = (r, args = [], log = qmdLog()) => ({ ...cli(r, ["install", ...args], { env: { PATH: spy(log), HOME: EMPTY_HOME } }), log });
const top = (r) => git(r, "rev-parse --show-toplevel");
const yml = (r, dir = "docs/memory") => `collections:\n  memory:\n    path: ${JSON.stringify(join(top(r), dir))}\n    pattern: "**/*.md"\n`;
const tree = (r) => spawnSync("find", [".", "-path", "./.git", "-prune", "-o", "-print"], { cwd: r, encoding: "utf8" }).stdout.split("\n").sort().join("\n");

test("install: a first install makes the memory folder, writes .qmd/index.yml and ignores .qmd/, with no qmd call", () => {
  const r = repo();
  const out = inst(r);
  assert.equal(out.status, 0, out.stderr);
  assert.ok(statSync(join(r, "docs/memory")).isDirectory());
  assert.equal(readFileSync(join(r, ".qmd/index.yml"), "utf8"), yml(r));
  assert.ok(readFileSync(join(r, ".gitignore"), "utf8").split("\n").includes(".qmd/"));
  assert.ok(!existsSync(out.log), "qmd was started");
  assert.ok(!existsSync(join(r, ".qmd/index.sqlite")));
});
test("install: a second install after the yml was edited by hand changes nothing", () => {
  const r = repo(); inst(r);
  writeFileSync(join(r, ".qmd/index.yml"), "mine: 1\n");
  const before = tree(r), rec = readFileSync(join(r, ".xworkflows/installed.json"), "utf8");
  const out = inst(r);
  assert.match(out.stdout, /^nothing to do$/m);
  assert.equal(readFileSync(join(r, ".qmd/index.yml"), "utf8"), "mine: 1\n");
  assert.equal(readFileSync(join(r, ".xworkflows/installed.json"), "utf8"), rec);
  assert.equal(tree(r), before);
  assert.ok(!existsSync(out.log));
});
test("install: a yml that existed before is left byte-identical and .qmd/ is not added to .gitignore", () => {
  const r = repo({ ".qmd/index.yml": "mine: 1\r\n" });
  assert.equal(inst(r).status, 0);
  assert.equal(readFileSync(join(r, ".qmd/index.yml"), "utf8"), "mine: 1\r\n");
  assert.ok(!readFileSync(join(r, ".gitignore"), "utf8").split("\n").includes(".qmd/"));
  assert.ok(statSync(join(r, "docs/memory")).isDirectory());
});
test("install: with memory.index set the folder is made and no .qmd", () => {
  const r = repo({ ".xworkflows/config.json": JSON.stringify({ memory: { index: "mine" } }) });
  assert.equal(inst(r).status, 0);
  assert.ok(statSync(join(r, "docs/memory")).isDirectory());
  assert.ok(!existsSync(join(r, ".qmd")));
  assert.ok(!readFileSync(join(r, ".gitignore"), "utf8").split("\n").includes(".qmd/"));
});
test("install --dry-run writes nothing and names the folder, the yml and the .gitignore", () => {
  const r = repo(), before = tree(r);
  const out = inst(r, ["--dry-run"]);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /^would create docs\/memory$/m);
  assert.match(out.stdout, /^would write \.qmd\/index\.yml$/m);
  assert.match(out.stdout, /^would merge \.gitignore$/m);
  assert.equal(tree(r), before);
});
test("install: a docs link that leaves the repo gets no folder", () => {
  const o = tmp("xwf-out-"), r = repo();
  symlinkSync(o, join(r, "docs"));
  const out = inst(r);
  assert.deepEqual(readdirSync(o), []);
  assert.match(out.stdout, /^not written \(symlink\): docs\/memory$/m);
});
test("install: a .qmd link that leaves the repo gets no yml and no .gitignore line", () => {
  const o = tmp("xwf-out-"), r = repo();
  symlinkSync(o, join(r, ".qmd"));
  const out = inst(r);
  assert.deepEqual(readdirSync(o), []);
  assert.match(out.stdout, /^not written \(symlink\): \.qmd\/index\.yml$/m);
  assert.ok(!readFileSync(join(r, ".gitignore"), "utf8").split("\n").includes(".qmd/"));
});
for (const [what, dir] of [["absolute", (o) => join(o, "mem")], ["climbing out with ..", (o) => `../${basename(o)}/mem`]]) {
  test(`install: a memory.dir that is ${what} creates nothing and says why`, () => {
    const o = tmp("xwf-out-"), r = repo({ ".xworkflows/config.json": JSON.stringify({ memory: { dir: dir(o) } }) });
    const out = inst(r);
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual(readdirSync(o), []);
    assert.ok(!existsSync(join(r, ".qmd")));
    assert.ok(out.stdout.split("\n").includes(`not written: memory.dir must be a folder inside the repository: ${dir(o)}`));
  });
}
test("install: a repository path with a space, # and : gives the JSON string of the folder", () => {
  const d = join(tmp("xwf-"), "a b#c:d");
  mkdirSync(d);
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: d, env: isoEnv() });
  assert.equal(inst(d).status, 0);
  const text = readFileSync(join(d, ".qmd/index.yml"), "utf8");
  assert.equal(text, yml(d));
  assert.match(text, /a b#c:d/);
});
test("doctor: the two qmd failures name the cause, a linked folder outside warns, an unresolvable path says nothing more", () => {
  const r = repo(); inst(r);
  const q = tools({ qmd: "exit 0" });
  rmSync(join(r, ".qmd"), { recursive: true });
  assert.match(doctor(r, { PATH: q }).stdout, /^fail no qmd collection covers docs\/memory: run xworkflows install$/m);
  mkdirSync(join(r, ".qmd")); writeFileSync(join(r, ".qmd/index.yml"), "collections: {}\n");
  const abs = join(top(r), "docs/memory");
  assert.ok(doctor(r, { PATH: q }).stdout.split("\n").includes(`fail no qmd collection covers docs/memory: .qmd/index.yml names no collection with the path ${abs}; add one, or delete .qmd and run install again`));
  assert.doesNotMatch(doctor(r, { PATH: q }).stdout, /outside the repository/);
  withConfig(r, { memory: { index: "mine" } });
  assert.match(doctor(r, { PATH: q }).stdout, /^fail no qmd collection covers docs\/memory: qmd --index mine collection add docs\/memory$/m);
  withConfig(r, {});
  const o = tmp("xwf-out-"); rmSync(join(r, "docs"), { recursive: true }); symlinkSync(o, join(r, "docs"));
  mkdirSync(join(o, "memory"));
  assert.match(doctor(r, { PATH: q }).stdout, /^warn the memory folder is outside the repository: qmd indexes it only after "qmd trust" is run here$/m);
  // a write there is refused unless memory.outside lists the real path: doctor says so with both ways out
  const real = realpathSync(join(o, "memory"));
  const refused = lineOf(doctor(r, { PATH: q }), /^warn docs\/memory\/MEMORY\.md is written outside the repository/);
  assert.ok(refused?.includes(`(${real})`) && refused.includes("put the notes inside the project") && refused.includes(`list ${real} under memory.outside in .xworkflows/config.json`), refused);
  withConfig(r, { memory: { outside: [real] } });
  assert.doesNotMatch(doctor(r, { PATH: q }).stdout, /is written outside the repository/);
  withConfig(r, {});
  rmSync(join(r, "docs")); writeFileSync(join(r, "docs"), "a file\n");
  const out = doctor(r, { PATH: q });
  assert.equal(out.stderr, "");
  assert.match(out.stdout, /^doctor: \d+ fail, \d+ warn$/m);
  assert.doesNotMatch(out.stdout, /outside the repository/);
});
test("uninstall: the yml, index.sqlite, .qmd and the .gitignore line go; a note stays; two installs change nothing", () => {
  const r = repo(); inst(r); inst(r);
  for (const f of ["", "-wal", "-shm"]) writeFileSync(join(r, `.qmd/index.sqlite${f}`), "x");
  writeFileSync(join(r, "docs/memory/note.md"), "# n\n");
  const out = cli(r, ["uninstall"], { env: { PATH: spy(qmdLog()), HOME: EMPTY_HOME } });
  assert.equal(out.status, 0, out.stderr);
  assert.ok(!existsSync(join(r, ".qmd")));
  assert.deepEqual(readdirSync(r).sort(), [".git", "docs"]);
  assert.match(out.stdout, /^left in place: docs\/memory$/m);
  assert.equal(readFileSync(join(r, "docs/memory/note.md"), "utf8"), "# n\n");
});
test("uninstall: a yml install did not create stays with its index.sqlite; the empty folder install made goes", () => {
  const r = repo({ ".qmd/index.yml": "mine: 1\n" }); inst(r);
  writeFileSync(join(r, ".qmd/index.sqlite"), "x");
  assert.equal(cli(r, ["uninstall"]).status, 0);
  assert.equal(readFileSync(join(r, ".qmd/index.yml"), "utf8"), "mine: 1\n");
  assert.ok(existsSync(join(r, ".qmd/index.sqlite")));
  assert.ok(!existsSync(join(r, "docs")));
});
test("uninstall: a memory folder install made and that holds a hidden file stays and is named; install, install, uninstall removes an empty one", () => {
  const r = repo(); inst(r); inst(r);
  writeFileSync(join(r, "docs/memory/.hidden"), "");
  assert.match(cli(r, ["uninstall"]).stdout, /^left in place: docs\/memory$/m);
  assert.ok(existsSync(join(r, "docs/memory/.hidden")));
  const q = repo(); inst(q); inst(q);
  cli(q, ["uninstall"]);
  assert.deepEqual(readdirSync(q), [".git"]);
});
test("uninstall: a memory folder that existed before the install is neither removed nor named", () => {
  const r = repo({ "docs/memory/.keep": "" }); mkdirSync(join(r, "empty"));
  inst(r);
  const out = cli(r, ["uninstall"]);
  assert.ok(existsSync(join(r, "docs/memory/.keep")));
  assert.doesNotMatch(out.stdout, /docs\/memory/);
  const q = repo(); mkdirSync(join(q, "docs/memory"), { recursive: true }); inst(q);
  assert.doesNotMatch(cli(q, ["uninstall"]).stdout, /docs\/memory/);
  assert.ok(statSync(join(q, "docs/memory")).isDirectory());
});
for (const dir of ["./docs/memory", "docs/memory/"]) {
  test(`install: memory.dir ${dir} is read as docs/memory, by install and by doctor`, () => {
    const r = repo({ ".xworkflows/config.json": JSON.stringify({ ...ALL_KEYS, memory: { dir } }) });
    assert.equal(inst(r).status, 0);
    assert.ok(statSync(join(r, "docs/memory")).isDirectory());
    assert.equal(readFileSync(join(r, ".qmd/index.yml"), "utf8"), yml(r));
    assert.match(doctor(r, { PATH: tools({ qmd: COVERS }) }).stdout, /^ok +qmd collection covers docs\/memory$/m);
  });
}

test("install: a user's own .qmd/index.yaml and index.sqlite are not shadowed by a new index.yml and survive uninstall", () => {
  const r = repo({ ".qmd/index.yaml": "mine: 1\n", ".qmd/index.sqlite": "SQLITE-user-data" });
  assert.equal(inst(r).status, 0);
  assert.ok(!existsSync(join(r, ".qmd/index.yml")), "install wrote .qmd/index.yml beside the user's index.yaml");
  assert.ok(!/^\.qmd\/$/m.test(readFileSync(join(r, ".gitignore"), "utf8")));
  assert.equal(cli(r, ["uninstall"]).status, 0);
  assert.equal(readFileSync(join(r, ".qmd/index.yaml"), "utf8"), "mine: 1\n");
  assert.equal(readFileSync(join(r, ".qmd/index.sqlite"), "utf8"), "SQLITE-user-data");
});

test("doctor: with a local .qmd/index.yaml that covers nothing, the text names that file", () => {
  const r = repo({ ".qmd/index.yaml": "mine: 1\n", "docs/memory/a.md": "x\n" });
  assert.equal(inst(r).status, 0);
  const out = doctor(r, { PATH: tools({ qmd: "exit 0" }) }).stdout;
  assert.match(out, /\.qmd\/index\.yaml names no collection/);
  assert.ok(!out.includes(".qmd/index.yml"));
});

test("install: a docs folder the user cannot write in does not leave a half install", { skip: process.getuid?.() === 0 }, () => {
  const r = repo({ "docs/readme.md": "x\n" });
  chmodSync(join(r, "docs"), 0o555);
  try {
    const out = inst(r);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /^not written: docs\/memory$/m);
    const rec = readJson(r, ".xworkflows/installed.json");
    assert.ok(!rec.created.includes("docs/memory"));
  } finally {
    chmodSync(join(r, "docs"), 0o755);
    rmSync(r, { recursive: true, force: true });
  }
});

test("install: a .qmd folder the user cannot write in leaves no yml, no record of it, and the install goes on", { skip: process.getuid?.() === 0 }, () => {
  const r = repo({ ".qmd/keep": "x\n" });
  chmodSync(join(r, ".qmd"), 0o555);
  try {
    const out = inst(r);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /^not written: \.qmd\/index\.yml$/m);
    assert.ok(!readJson(r, ".xworkflows/installed.json").created.includes(".qmd/index.yml"));
  } finally {
    chmodSync(join(r, ".qmd"), 0o755);
    rmSync(r, { recursive: true, force: true });
  }
});

const MARKER = "written by xworkflows install: uninstall removes index.yml and its database here only while this file exists\n";
test("install: a first install writes the marker beside the yml and records neither", () => {
  const r = repo();
  assert.equal(inst(r).status, 0);
  assert.equal(readFileSync(join(r, ".qmd/xworkflows"), "utf8"), MARKER);
  const rec = readJson(r, ".xworkflows/installed.json");
  assert.ok(!rec.created.some((p) => p.startsWith(".qmd/")));
});
test("uninstall: with the marker the yml, the three database files and the marker go, and .qmd with them", () => {
  const r = repo(); inst(r);
  for (const f of ["", "-wal", "-shm"]) writeFileSync(join(r, `.qmd/index.sqlite${f}`), "x");
  assert.equal(cli(r, ["uninstall"]).status, 0);
  assert.ok(!existsSync(join(r, ".qmd")));
});
test("uninstall: a checkout with its own yml and database keeps them even when the record names the yml", () => {
  const r = repo({ ".qmd/index.yml": "mine: 1\n", ".qmd/index.sqlite": "DB" }); inst(r);
  const rp = join(r, ".xworkflows/installed.json"), rec = readJson(r, ".xworkflows/installed.json");
  rec.created.push(".qmd/index.yml");
  writeFileSync(rp, JSON.stringify(rec));
  assert.equal(cli(r, ["uninstall"]).status, 0);
  assert.equal(readFileSync(join(r, ".qmd/index.yml"), "utf8"), "mine: 1\n");
  assert.equal(readFileSync(join(r, ".qmd/index.sqlite"), "utf8"), "DB");
});
test("install: a second install after the marker was written changes nothing", () => {
  const r = repo(); inst(r);
  const before = tree(r), rec = readFileSync(join(r, ".xworkflows/installed.json"), "utf8");
  assert.match(inst(r).stdout, /^nothing to do$/m);
  assert.equal(tree(r), before);
  assert.equal(readFileSync(join(r, ".xworkflows/installed.json"), "utf8"), rec);
});

test("install does not write the .qmd/xworkflows marker through a symlink", () => {
  const o = tmp("xwf-out-"); writeFileSync(join(o, "outside.txt"), "mine\n");
  const r = repo(); mkdirSync(join(r, ".qmd")); symlinkSync(join(o, "outside.txt"), join(r, ".qmd/xworkflows"));
  const out = cli(r, ["install", "--yes"]);
  assert.equal(readFileSync(join(o, "outside.txt"), "utf8"), "mine\n");
  assert.match(out.stdout, /^not written \(symlink\): \.qmd\/xworkflows$/m);
});
test("install: a plain .qmd/xworkflows the user already has is left byte for byte", () => {
  const r = repo({ ".qmd/xworkflows": "mine\r\n" });
  assert.equal(inst(r).status, 0);
  assert.equal(readFileSync(join(r, ".qmd/xworkflows"), "utf8"), "mine\r\n");
  assert.equal(cli(r, ["uninstall"]).status, 0);
  assert.equal(readFileSync(join(r, ".qmd/xworkflows"), "utf8"), "mine\r\n");
});
test("uninstall: a project's own .qmd/xworkflows, yml and database stay byte for byte", () => {
  const files = { ".qmd/xworkflows": "mine\n", ".qmd/index.yml": "mine: 1\n", ".qmd/index.sqlite": "DB" };
  const r = repo(files); inst(r);
  assert.equal(cli(r, ["uninstall"]).status, 0);
  for (const [f, t] of Object.entries(files)) assert.equal(readFileSync(join(r, f), "utf8"), t, f);
});
test("uninstall: a record naming the yml with the real marker removes it without a kept line", () => {
  const r = repo(); inst(r);
  const rp = join(r, ".xworkflows/installed.json"), rec = readJson(r, ".xworkflows/installed.json");
  rec.created.push(".qmd/index.yml");
  writeFileSync(rp, JSON.stringify(rec));
  const out = cli(r, ["uninstall"]);
  assert.equal(out.status, 0);
  assert.ok(!existsSync(join(r, ".qmd/index.yml")));
  assert.ok(!out.stdout.includes("kept (not ours): .qmd/index.yml"), out.stdout);
});
test("uninstall: a .qmd linked out of the repository keeps its marker, yml and database", () => {
  const o = tmp("xwf-out-");
  for (const f of ["xworkflows", "index.yml", "index.sqlite"]) writeFileSync(join(o, f), "x");
  const r = repo(); inst(r); rmSync(join(r, ".qmd"), { recursive: true }); symlinkSync(o, join(r, ".qmd"));
  assert.equal(cli(r, ["uninstall"]).status, 0);
  for (const f of ["xworkflows", "index.yml", "index.sqlite"]) assert.ok(existsSync(join(o, f)), f);
});
test("uninstall: with no marker an empty yml named by the record stays and is reported", () => {
  const r = repo(); inst(r);
  rmSync(join(r, ".qmd/xworkflows")); writeFileSync(join(r, ".qmd/index.yml"), "{}\n");
  const f = join(r, ".xworkflows/installed.json"), rec = JSON.parse(readFileSync(f, "utf8"));
  rec.created.push(".qmd/index.yml"); writeFileSync(f, JSON.stringify(rec));
  const out = cli(r, ["uninstall"]);
  assert.match(out.stdout, /^kept \(not ours\): \.qmd\/index\.yml$/m);
  assert.ok(existsSync(join(r, ".qmd/index.yml")));
});
test("uninstall: a plain file .qmd stops nothing and stays", () => {
  const r = repo({ ".xworkflows/config.json": JSON.stringify({ memory: { index: "mine" } }), ".qmd": "mine\n" });
  assert.equal(inst(r).status, 0);
  const out = cli(r, ["uninstall"]);
  assert.equal(out.status, 0, out.stderr);
  assert.ok(!existsSync(join(r, ".xworkflows/installed.json")));
  assert.equal(readFileSync(join(r, ".qmd"), "utf8"), "mine\n");
});

test("doctor: a CLAUDE.md that is a link to AGENTS.md is right", () => {
  const r = repo(); cli(r, ["install"]);
  rmSync(join(r, "CLAUDE.md")); symlinkSync("AGENTS.md", join(r, "CLAUDE.md"));
  const out = doctor(r);
  assert.match(out.stdout, /^ok +CLAUDE\.md imports AGENTS\.md$/m);
  assert.doesNotMatch(out.stdout, /does not import/);
  assert.equal(out.status, 0, out.stdout);
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

test("doctor: in a linked worktree the three git hooks are found in the common git dir", () => {
  const r = repo(); cli(r, ["install"]);
  git(r, "add -A"); git(r, "-c core.hooksPath=/dev/null commit -q -m init");
  const wt = join(tmp("xwf-wt-"), "wt");
  git(r, `worktree add -q ${wt}`);
  const out = doctor(realpathSync(wt));
  assert.doesNotMatch(out.stdout, /^fail missing or unreadable: \.git\/hooks/m);
  assert.match(out.stdout, /^ok +\.git\/hooks\/post-commit$/m);
  assert.match(out.stdout, /^ok +pre-push hook is ours$/m);
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

// every fail and warn line of doctor ends with the command or the action that fixes it
const FIX = "run xworkflows install";
const lineOf = (out, re) => out.stdout.split("\n").find((l) => re.test(l));
const old22 = () => { const f = join(tmp("xwf-ver-"), "ver.cjs"); writeFileSync(f, 'Object.defineProperty(process, "versions", { value: { ...process.versions, node: "20.1.0" } });\n'); return f; };
const noGitVersion = () => {
  const d = tools({}).split(":")[0], real = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
  rmSync(join(d, "git")); writeFileSync(join(d, "git"), `#!/bin/sh\n[ "$1" = --version ] && exit 1\nexec ${real} "$@"\n`); chmodSync(join(d, "git"), 0o755);
  return `${d}:/usr/bin:/bin`;
};
const settingsEdit = (r, f) => { const s = readJson(r, ".claude/settings.json"); f(s); writeJson(r, ".claude/settings.json", s); };
const DOCTOR_LINES = [
  ["not installed", () => repo(), {}, `fail not installed: ${FIX}`],
  ["installed.json does not parse", (r) => { cli(r, ["install"]); writeFileSync(join(r, ".xworkflows/installed.json"), "{"); }, {}, `fail installed.json does not parse: fix or remove .xworkflows/installed.json, then ${FIX}`],
  ["old node", (r) => cli(r, ["install"]), () => ({ NODE_OPTIONS: `--require ${old22()}` }), "fail node 20.1.0: install Node 22 or newer"],
  ["git does not answer", (r) => cli(r, ["install"]), () => ({ PATH: noGitVersion() }), "fail git does not answer: install git and put it on PATH"],
  ["file missing", (r) => { cli(r, ["install"]); rmSync(join(r, ".xworkflows/hooks/run.mjs")); }, {}, `fail missing or unreadable: .xworkflows/hooks/run.mjs: ${FIX}`],
  ["file changed", (r) => { cli(r, ["install"]); appendFileSync(join(r, ".claude/agents/explore.md"), "x\n"); }, {}, "warn changed locally: .claude/agents/explore.md; to put the package's copy back, delete it, then run xworkflows install (install keeps a changed file)"],
  ["file kept", (r) => cli(r, ["install"]), {}, null, { ".claude/agents/explore.md": "mine\n" }],
  ["merged entry changed", (r) => { cli(r, ["install"]); settingsEdit(r, (s) => { for (const e of s.hooks.PreToolUse) for (const h of e.hooks) h.timeout = 99; }); }, {}, "warn .claude/settings.json hooks.PreToolUse hook adapt-gates differs from every text the package published; to get the package's entry, delete it and run xworkflows install"],
  ["merged entry edited, record lost then install", (r) => { cli(r, ["install"]); settingsEdit(r, (s) => { s.hooks.PreToolUse.find(adaptOf).matcher = "Write"; }); rmSync(join(r, ".xworkflows/installed.json")); cli(r, ["install"]); }, {}, "warn .claude/settings.json hooks.PreToolUse hook adapt-gates differs from every text the package published; to get the package's entry, delete it and run xworkflows install"],
  ["merged entry missing", (r) => { cli(r, ["install"]); writeJson(r, ".claude/settings.json", { permissions: { allow: [] } }); }, {}, `fail merged entry missing: .claude/settings.json hooks.PreToolUse: ${FIX}`],
  ["block never written", (r) => { cli(r, ["install"]); const x = readJson(r, ".xworkflows/installed.json"); x.blocks = []; writeJson(r, ".xworkflows/installed.json", x); }, {}, `fail AGENTS.md block was never written: ${FIX}`],
  ["block differs", (r) => { cli(r, ["install"]); writeFileSync(join(r, "AGENTS.md"), readFileSync(join(r, "AGENTS.md"), "utf8").replace("<!-- xworkflows:start -->", "<!-- xworkflows:start -->\nedited")); }, {}, `fail AGENTS.md block differs from the template: ${FIX}`],
  ["import missing", (r) => { cli(r, ["install"]); writeFileSync(join(r, "CLAUDE.md"), ""); }, {}, "fail CLAUDE.md does not import AGENTS.md: add the line @AGENTS.md"],
  ["probe: no entry", (r) => { cli(r, ["install"]); settingsEdit(r, (s) => { s.hooks = {}; }); }, {}, `fail probe: no design-first hook entry: ${FIX}`],
  ["probe: allows", (r) => { cli(r, ["install"]); writeFileSync(join(r, ".xworkflows/hooks/core/design-first.mjs"), "export const SKILL='grill'; export const decide=()=>({decision:'allow'});\n"); }, {}, "fail probe: expected deny, got no valid output: delete the files named \"changed locally\" above, then run xworkflows install"],
  ["always-loaded over", (r) => { cli(r, ["install"]); writeFileSync(join(r, "AGENTS.md"), readFileSync(join(r, "AGENTS.md"), "utf8") + "x".repeat(30000)); }, {}, /^fail always-loaded: \d+ bytes of 24000: shorten CLAUDE\.md, AGENTS\.md and what they import, or raise tokens\.alwaysLoadedBytes in \.xworkflows\/config\.json$/],
  ["config does not parse", (r) => { cli(r, ["install"]); writeFileSync(join(r, ".xworkflows/config.json"), "{"); }, {}, /^fail config: \.xworkflows\/config\.json does not parse: .*: fix the JSON of \.xworkflows\/config\.json$/],
  ["config: a check file does not load", (r) => { cli(r, ["install"]); writeFileSync(join(r, ".xworkflows/checks/run.mjs"), "export const = ;\n"); }, {}, new RegExp(`^fail config: .*: if a file of the package is named "changed locally" above, delete it; then ${FIX}$`)],
  ["no memory folder", (r) => { cli(r, ["install"]); rmSync(join(r, "docs"), { recursive: true }); }, {}, `warn no memory folder yet: docs/memory: ${FIX}`],
  ["qmd does not answer a list", (r) => cli(r, ["install"]), () => ({ PATH: tools({ qmd: "case \"$*\" in *--version*) echo 'qmd 2.8.3 (facd35e)';; *) exec sleep 30;; esac" }), XWORKFLOWS_PROBE_TIMEOUT_MS: "400" }), "warn qmd did not answer: collections of docs/memory not checked: run qmd collection list to see why"],
  ["no collection, no yml", (r) => { cli(r, ["install"]); rmSync(join(r, ".qmd"), { recursive: true }); }, () => ({ PATH: tools({ qmd: "exit 0" }) }), `fail no qmd collection covers docs/memory: ${FIX}`],
  ["pre-push changed", (r) => { cli(r, ["install"]); appendFileSync(join(r, ".git/hooks/pre-push"), "echo hi\n"); }, {}, 'warn pre-push hook changed locally: it may no longer run the check; make it run: node "$(git rev-parse --show-toplevel)/.xworkflows/checks/run.mjs" --pre-push "$1"'],
  ["pre-push declined", (r) => cli(r, ["install"]), {}, 'warn pre-push hook is yours: chaining declined at install; add this line to it: node "$(git rev-parse --show-toplevel)/.xworkflows/checks/run.mjs" --pre-push "$1"', { ".git/hooks/pre-push": "#!/bin/sh\nexit 0\n" }],
  ["pre-push missing", (r) => { cli(r, ["install"]); rmSync(join(r, ".git/hooks/pre-push")); }, {}, `fail pre-push hook is missing or not ours: ${FIX}`],
  ["session-start over", (r) => { cli(r, ["install"]); withConfig(r, { tokens: { sessionStartBytes: 10 } }); }, () => { const home = tmp("xwf-home-"); mkdirSync(join(home, ".xworkflows")); writeFileSync(join(home, ".xworkflows/owner.md"), "Replies: short and direct.\n"); return { HOME: home }; }, /^fail session-start text: \d+ bytes of 10: raise tokens\.sessionStartBytes in \.xworkflows\/config\.json or cut what the hook prints$/],
  ["attribution", (r) => { cli(r, ["install"]); settingsEdit(r, (s) => { s.attribution = { commit: "Co-Authored-By: someone", pr: "" }; }); }, {}, 'warn attribution in .claude/settings.json shows an AI line: set "attribution" to {"commit": "", "pr": ""} there'],
  ["autoMemoryDirectory unset", (r) => { cli(r, ["install"]); rmSync(join(r, ".claude/settings.local.json")); }, {}, (r) => `warn autoMemoryDirectory is not set in .claude/settings.local.json: add "autoMemoryDirectory": "${join(top(r), "docs/memory")}" to it`],
  ["autoMemoryDirectory elsewhere", (r) => { cli(r, ["install"]); writeJson(r, ".claude/settings.local.json", { autoMemoryDirectory: "/elsewhere/memory" }); }, {}, (r) => `warn autoMemoryDirectory is not the memory folder docs/memory: set it to "${join(top(r), "docs/memory")}" in .claude/settings.local.json`],
  ["pack tool missing", (r) => { cli(r, ["install"]); withConfig(r, { packs: { semgrep: { configs: ["auto"] } } }); }, {}, 'fail pack semgrep: semgrep command is missing: install semgrep, or take "semgrep" out of packs in .xworkflows/config.json'],
  ["pack tool at another version", (r) => { cli(r, ["install"]); withConfig(r, { packs: { semgrep: { configs: ["auto"] } } }); }, () => ({ PATH: tools({ qmd: COVERS, semgrep: "echo 1.0.0" }) }), "warn pack semgrep: version 1.0.0, tested with 1.179.0: install semgrep 1.179.0"],
];
for (const [name, setup, env, want, files] of DOCTOR_LINES) test(`doctor line: ${name}`, () => {
  const r = repo(files ?? {});
  setup(r);
  const out = doctor(r, typeof env === "function" ? env() : env);
  if (name === "file kept") return assert.ok(lineOf(out, /^warn kept theirs: \.claude\/agents\/explore\.md/)?.endsWith(`; to use the package's copy, delete .claude/agents/explore.md, take it out of "kept" in .xworkflows/installed.json and ${FIX}`), out.stdout);
  const w = typeof want === "function" ? want(r) : want;
  assert.ok(out.stdout.split("\n").some((l) => (w instanceof RegExp ? w.test(l) : l === w)), `${w}\n${out.stdout}`);
});

const QMD_V = "qmd 2.8.3 (facd35e)";
test("doctor prints the version qmd answers; a qmd that does not answer it warns", () => {
  const r = repo(); cli(r, ["install"]);
  const ok = doctor(r, { PATH: tools({ qmd: `case "$*" in *--version*) echo '${QMD_V}';; *) ${COVERS};; esac` }) });
  assert.match(ok.stdout, /^ok +qmd 2\.8\.3 \(facd35e\)$/m);
  assert.equal(ok.status, 0, ok.stdout);
  for (const body of ["exit 1", "exit 0", "exec sleep 30"]) {
    const out = doctor(r, { PATH: tools({ qmd: `case "$*" in *--version*) ${body};; *) ${COVERS};; esac` }), XWORKFLOWS_PROBE_TIMEOUT_MS: "400" });
    assert.ok(out.stdout.split("\n").includes("warn qmd does not answer --version: run qmd --version to see why"), body);
    assert.equal(out.stderr, "");
    assert.equal(out.status, 0, out.stdout);
  }
});
test("doctor: a yml that names the memory folder while no collection covers it says this qmd does not read it", () => {
  const r = repo(); cli(r, ["install"]);
  const abs = join(top(r), "docs/memory");
  writeFileSync(join(r, ".qmd/index.yml"), `collections:\n  memory:\n    path: ${abs}\n`);
  const out = doctor(r, { PATH: tools({ qmd: `case "$*" in *--version*) echo '${QMD_V}';; esac` }) });
  assert.ok(out.stdout.split("\n").includes("fail no qmd collection covers docs/memory: this qmd does not read .qmd/index.yml, which names it: npm install -g @tobilu/qmd@latest"), out.stdout);
  assert.doesNotMatch(out.stdout, /names no collection/);
  writeFileSync(join(r, ".qmd/index.yml"), "collections: {}\n");
  assert.match(doctor(r, { PATH: tools({ qmd: "exit 0" }) }).stdout, /^fail no qmd collection covers docs\/memory: \.qmd\/index\.yml names no collection with the path /m);
});
test("doctor: with memory.index set, every qmd line names that index", () => {
  const r = repo(); cli(r, ["install"]);
  withConfig(r, { memory: { index: "mine" } });
  const none = doctor(r, { PATH: tools({ qmd: "exit 0" }) }).stdout.split("\n");
  assert.ok(none.includes("fail no qmd collection covers docs/memory: qmd --index mine collection add docs/memory"), none.join("\n"));
  const dead = doctor(r, { PATH: tools({ qmd: `case "$*" in *--version*) echo '${QMD_V}';; *) exec sleep 30;; esac` }), XWORKFLOWS_PROBE_TIMEOUT_MS: "400" }).stdout.split("\n");
  assert.ok(dead.includes("warn qmd did not answer: collections of docs/memory not checked: run qmd --index mine collection list to see why"), dead.join("\n"));
});

// what install records is what uninstall takes back
test("a linked worktree records the git hooks under .git/hooks, as a normal checkout does", () => {
  const main = repo(); git(main, "commit -q --allow-empty -m init");
  const wt = join(tmp("xwf-wt-"), "wt");
  git(main, `worktree add -q ${wt}`);
  cli(wt, ["install", "--yes"]);
  const text = readFileSync(join(wt, ".xworkflows/installed.json"), "utf8");
  assert.deepEqual(Object.keys(JSON.parse(text).files).filter((f) => /\.git\/hooks\//.test(f)).sort(), [".git/hooks/post-commit", ".git/hooks/post-merge", ".git/hooks/pre-push"]);
  assert.doesNotMatch(text, /\.\./);
  assert.match(cli(wt, ["install", "--yes"]).stdout, /nothing to do/);
  assert.equal(readFileSync(join(wt, ".xworkflows/installed.json"), "utf8"), text);
});
test("a linked worktree records a chained hook of the user under .git/hooks", () => {
  const main = repo(); git(main, "commit -q --allow-empty -m init");
  mkdirSync(join(main, ".git/hooks"), { recursive: true });
  writeFileSync(join(main, ".git/hooks/pre-push"), OLD); chmodSync(join(main, ".git/hooks/pre-push"), 0o755);
  const wt = join(tmp("xwf-wt-"), "wt");
  git(main, `worktree add -q ${wt}`);
  cli(wt, ["install", "--yes"]);
  assert.deepEqual(readJson(wt, ".xworkflows/installed.json").chained, [{ file: ".git/hooks/pre-push", to: ".git/hooks/pre-push.before-xworkflows" }]);
  cli(wt, ["uninstall"]);
  assert.equal(readFileSync(join(main, ".git/hooks/pre-push"), "utf8"), OLD);
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
test("a second install records the same folders and changes nothing", () => {
  const r = repo(); cli(r, ["install", "--yes"]);
  const rec = readFileSync(join(r, ".xworkflows/installed.json"), "utf8");
  assert.match(cli(r, ["install", "--yes"]).stdout, /nothing to do/);
  assert.equal(readFileSync(join(r, ".xworkflows/installed.json"), "utf8"), rec);
});

// install keeps the method's own files out of the code graph: a .graphifyignore with the folders it writes
const SKILLS = [...new Set(JSON.parse(readFileSync(join(PKG_ROOT, "manifest.json"), "utf8")).pieces.flatMap((p) => Object.keys(p.files)).map((f) => f.match(/^skills\/([^/]+)\//)?.[1]).filter(Boolean))];
const AGENTS = [...new Set(JSON.parse(readFileSync(join(PKG_ROOT, "manifest.json"), "utf8")).pieces.flatMap((p) => Object.keys(p.files)).map((f) => f.match(/^agents\/([^/]+)\.md$/)?.[1]).filter(Boolean))];
const GI = [".xworkflows/", ...SKILLS.map((n) => `.claude/skills/${n}/`), ...AGENTS.map((n) => `.claude/agents/${n}.md`)];
const sameLines = (a, b) => assert.deepEqual([...a].sort(), [...b].sort());
const lines = (r, p = ".graphifyignore") => readFileSync(join(r, p), "utf8").split("\n").filter(Boolean);
test(".graphifyignore: install names .xworkflows/, each skill folder and each agent file it writes, never .claude/ whole nor the project's own", () => {
  const r = repo({ ".claude/skills/mine/SKILL.md": "---\nname: mine\n---\n", ".claude/agents/mine.md": "---\nname: mine\n---\n" });
  assert.equal(inst(r).status, 0);
  sameLines(lines(r), GI);
  assert.ok(!lines(r).includes(".claude/") && !lines(r).includes(".claude/skills/mine/") && !lines(r).includes(".claude/agents/mine.md"));
  assert.ok(readJson(r, ".xworkflows/installed.json").imports.some((i) => i.file === ".graphifyignore" && i.line === ".xworkflows/"));
});
test(".graphifyignore: a skill kept as the project's is not named, one installed as xwf- is named by that folder", () => {
  const r = repo({ ".claude/skills/tdd/SKILL.md": "mine\n", ".claude/skills/grill/SKILL.md": "mine too\n" });
  const out = cli(r, ["install"], { env: { HOME: EMPTY_HOME } });
  assert.equal(out.status, 0, out.stderr);
  assert.ok(!lines(r).includes(".claude/skills/tdd/") && !lines(r).includes(".claude/skills/grill/"));
  const y = repo({ ".claude/skills/tdd/SKILL.md": "mine\n" });
  assert.equal(cli(y, ["install", "--yes"], { env: { HOME: EMPTY_HOME } }).status, 0);
  assert.ok(lines(y).includes(".claude/skills/xwf-tdd/") && !lines(y).includes(".claude/skills/tdd/"));
  cli(y, ["uninstall"]);
  assert.ok(!existsSync(join(y, ".graphifyignore")));
});
test(".graphifyignore: an agent kept as the project's is not named, one installed as xwf- is named by that file", () => {
  const r = repo({ ".claude/agents/explore.md": "mine\n" });
  const out = cli(r, ["install"], { env: { HOME: EMPTY_HOME } });
  assert.equal(out.status, 0, out.stderr);
  assert.ok(!lines(r).includes(".claude/agents/explore.md") && !lines(r).includes(".claude/agents/xwf-explore.md"));
  assert.ok(lines(r).includes(".claude/agents/review.md"));
  const y = repo({ ".claude/agents/explore.md": "mine\n" });
  assert.equal(cli(y, ["install", "--yes"], { env: { HOME: EMPTY_HOME } }).status, 0);
  assert.ok(lines(y).includes(".claude/agents/xwf-explore.md") && !lines(y).includes(".claude/agents/explore.md"));
  cli(y, ["uninstall"]);
  assert.ok(!existsSync(join(y, ".graphifyignore")));
});
test(".graphifyignore: uninstall takes back exactly the recorded lines, the project's lines and its missing newline stay", () => {
  const r = repo({ ".graphifyignore": "vendor/\n.xworkflows/\nbuild" });
  inst(r);
  assert.deepEqual(lines(r).slice(0, 3), ["vendor/", ".xworkflows/", "build"]);
  sameLines(lines(r).slice(3), GI.slice(1));
  cli(r, ["uninstall"]);
  assert.equal(readFileSync(join(r, ".graphifyignore"), "utf8"), "vendor/\n.xworkflows/\nbuild");
});
test(".graphifyignore: a file install created that ends empty is removed, a second install changes nothing", () => {
  const r = repo(), before = tree(r);
  inst(r);
  const gi = readFileSync(join(r, ".graphifyignore"), "utf8"), rec = readFileSync(join(r, ".xworkflows/installed.json"), "utf8");
  assert.match(inst(r).stdout, /^nothing to do$/m);
  assert.equal(readFileSync(join(r, ".graphifyignore"), "utf8"), gi);
  assert.equal(readFileSync(join(r, ".xworkflows/installed.json"), "utf8"), rec);
  cli(r, ["uninstall"]);
  assert.ok(!existsSync(join(r, ".graphifyignore")));
  assert.equal(tree(r), before);
});
test(".graphifyignore: --dry-run writes nothing and names the file", () => {
  const r = repo(), before = tree(r);
  const out = inst(r, ["--dry-run"]);
  assert.match(out.stdout, /^would merge \.graphifyignore$/m);
  assert.equal(tree(r), before);
});
test(".graphifyignore: a link that leaves the repository is not written through", () => {
  const o = tmp("xwf-out-"), r = repo();
  writeFileSync(join(o, "target"), "outside\n");
  symlinkSync(join(o, "target"), join(r, ".graphifyignore"));
  const out = inst(r);
  assert.equal(readFileSync(join(o, "target"), "utf8"), "outside\n");
  assert.match(out.stdout, /^not written \(symlink\): \.graphifyignore$/m);
  cli(r, ["uninstall"]);
  assert.equal(readFileSync(join(o, "target"), "utf8"), "outside\n");
});

test("uninstall leaves nothing when the record has no dirs, and an empty folder is no skill", () => {
  const r = repo({ "a.txt": "x\n" });
  const before = tree(r);
  const env = { PATH: spy(qmdLog()), HOME: EMPTY_HOME };
  assert.equal(cli(r, ["install"], { env }).status, 0);
  withRecord(r, (rec) => { delete rec.dirs; });
  assert.equal(cli(r, ["uninstall"], { env }).status, 0);
  assert.equal(tree(r), before);
  const again = cli(r, ["install"], { env });
  assert.doesNotMatch(again.stdout, /A skill grill exists/);
});

test("doctor: doing what the changed-file line says makes the line go away", () => {
  const r = repo(); cli(r, ["install"]);
  const f = ".xworkflows/hooks/core/design-first.mjs";
  appendFileSync(join(r, f), "// local edit\n");
  const re = new RegExp(`^warn changed locally: ${f.replace(/\./g, "\\.")}`);
  const line = lineOf(doctor(r), re);
  assert.ok(line, "the line shows after the edit");
  assert.ok(line.includes(FIX) && line.includes("delete it"), line);
  rmSync(join(r, f));
  cli(r, ["install"]);
  assert.equal(lineOf(doctor(r), re), undefined, "the line is still there after install");
});

test("doctor: a git hook changed by hand comes back when the line's action is done", () => {
  const r = repo(); cli(r, ["install"]);
  const re = /^warn changed locally: \.git\/hooks\/pre-push/;
  appendFileSync(join(r, ".git/hooks/pre-push"), "echo hi\n");
  assert.ok(lineOf(doctor(r), re));
  rmSync(join(r, ".git/hooks/pre-push"));
  cli(r, ["install"]);
  assert.equal(lineOf(doctor(r), re), undefined);
});

// the text of the post-merge and post-commit hooks that main's install wrote, before the graph hooks read the config
const MAIN_CMD = `node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(".xworkflows/config.json","utf8")).mainBranch||"main")}catch{process.stdout.write("main")}'`;
const mainHook = (name, chain) => `#!/bin/sh\nc=0\n${chain ? `old="$(dirname "$0")/${name}.before-xworkflows"\n[ -x "$old" ] && { "$old" "$@"; c=$?; }\n` : ""}cd "$(git rev-parse --show-toplevel)" || exit $c\nmain=$(${MAIN_CMD}) || main=main\n[ "$(git symbolic-ref --short -q HEAD)" = "$main" ] || exit $c\ncommand -v graphify >/dev/null 2>&1 || exit $c\nmkdir -p graphify-out\n{ graphify update . && touch -c graphify-out/graph.json; } > graphify-out/.update.log 2>&1 < /dev/null &\nexit $c\n`;
const GRAPH_HOOKS = ["post-merge", "post-commit"];
const hookFile = (r, n) => join(r, ".git/hooks", n);
const bytesOf = (r) => [".xworkflows/installed.json", ...GRAPH_HOOKS.map((n) => `.git/hooks/${n}`)].map((f) => readFileSync(join(r, f), "utf8"));
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
  for (const [i, n] of GRAPH_HOOKS.entries()) {
    assert.ok(now[i].includes('touch -c -h -- "$folder/graph.json"'), n);
    writeFileSync(hookFile(r, n), now[i].replace('touch -c -h -- "$folder/graph.json"', 'touch -c "$folder/graph.json"'));
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

// a command doctor prints can be pasted: a value of the config is quoted unless it is plain
test("doctor: memory.dir and memory.index are shell-quoted in the commands it prints, and a plain one is not", () => {
  const r = repo(); cli(r, ["install"]);
  mkdirSync(join(r, "my docs/memory"), { recursive: true });
  const q = tools({ qmd: "exit 0" });
  withConfig(r, { memory: { dir: "my docs/memory", index: "team idx" } });
  const out = doctor(r, { PATH: q }).stdout;
  assert.match(out, /^fail no qmd collection covers my docs\/memory: qmd --index 'team idx' collection add 'my docs\/memory'$/m);
  withConfig(r, { memory: { dir: "my docs/memory", index: "a;b'c" } });
  assert.match(doctor(r, { PATH: q }).stdout, /collection add 'my docs\/memory'$/m);
  assert.match(doctor(r, { PATH: q }).stdout, /qmd --index 'a;b'\\''c' collection add /);
  withConfig(r, { memory: { index: "mine" } });
  assert.match(doctor(r, { PATH: q }).stdout, /^fail no qmd collection covers docs\/memory: qmd --index mine collection add docs\/memory$/m);
  const down = tools({ qmd: 'case "$*" in *"collection list"*) echo boom >&2; exit 1;; esac' });
  withConfig(r, { memory: { index: "team idx" } });
  assert.match(doctor(r, { PATH: down }).stdout, /^warn qmd did not answer: collections of docs\/memory not checked: run qmd --index 'team idx' collection list to see why$/m);
});
test("doctor: the code index advice names the tool of lookup.index.command, and the install command only for graphify", () => {
  const r = repo(); cli(r, ["install"]);
  const bare = tools({ qmd: "exit 0" });
  withConfig(r, { paths: { ...ALL_KEYS.paths, code: ["src/"] }, lookup: { index: { command: "mytool query", folder: "idx-out" } } });
  const out = doctor(r, { PATH: bare }).stdout;
  assert.match(out, /^fail mytool command is missing$/m);
  assert.match(out, /^fail idx-out\/graph\.json is missing: mytool update \.$/m);
  assert.doesNotMatch(out, /graphify/);
  const fake = tools({ qmd: "exit 0", mytool: "exit 0" });
  mkdirSync(join(r, "idx-out")); writeFileSync(join(r, "idx-out/graph.json"), "{}");
  assert.match(doctor(r, { PATH: fake }).stdout, /^ok +mytool command$/m);
  withConfig(r, { paths: { ...ALL_KEYS.paths, code: ["src/"] } });
  assert.match(doctor(r, { PATH: bare }).stdout, /^fail graphify command is missing: uv tool install graphifyy$/m);
});
test("doctor: the qmd upgrade advice is printed only when the collection list answered and covers nothing", () => {
  const r = repo(); cli(r, ["install"]);
  const failing = tools({ qmd: 'case "$*" in *"collection list"*) echo boom >&2; exit 1;; esac' });
  const out = doctor(r, { PATH: failing }).stdout;
  assert.match(out, /^warn qmd did not answer: collections of docs\/memory not checked: run qmd collection list to see why$/m);
  assert.doesNotMatch(out, /this qmd does not read/);
  assert.match(doctor(r, { PATH: tools({ qmd: "exit 0" }) }).stdout, /^fail no qmd collection covers docs\/memory: this qmd does not read \.qmd\/index\.yml, which names it: npm install -g @tobilu\/qmd@latest$/m);
});

// P-26: a file of the package's that a newer version no longer ships
// the package's copy, its manifest listing retired files: { "skills/x/f.md": [hashes earlier versions wrote] }
function retiringCopy(retired) {
  const copy = packageCopy();
  const m = JSON.parse(readFileSync(join(copy, "manifest.json"), "utf8"));
  m.pieces.find((p) => p.id === "adapt").retired = retired;
  writeFileSync(join(copy, "manifest.json"), JSON.stringify(m, null, 2) + "\n");
  return copy;
}
test("install removes only a file the manifest lists as retired with a listed hash; the record never decides", () => {
  const copy = retiringCopy({ "skills/adapt/old.md": [sha("v1\n"), sha("v2\n")], "skills/adapt/edited.md": [sha("v1\n")] });
  const r = repo(); assert.equal(cliAt(copy, r, ["install", "--yes"]).status, 0);
  const mine = ".claude/skills/mine/SKILL.md", conf = ".xworkflows/config.json", gone = ".claude/skills/adapt/old.md", edited = ".claude/skills/adapt/edited.md";
  mkdirSync(join(r, ".claude/skills/mine"), { recursive: true });
  writeFileSync(join(r, mine), "mine\n"); writeFileSync(join(r, conf), "{}\n");
  writeFileSync(join(r, gone), "v2\n"); writeFileSync(join(r, edited), "v1\nmine\n");
  // a hand-edited record names the user's files with their own hashes; the retired file is not in it at all
  withRecord(r, (rec) => { rec.files[mine] = { piece: "adapt", sha256: sha("mine\n") }; rec.files[conf] = { piece: "adapt", sha256: sha("{}\n") }; });
  const dry = cliAt(copy, r, ["install", "--yes", "--dry-run"]);
  assert.match(dry.stdout, new RegExp(`^would remove ${gone.replaceAll(".", "\\.")}$`, "m"));
  assert.ok(existsSync(join(r, gone)), "dry-run removes nothing");
  const out = cliAt(copy, r, ["install", "--yes"]);
  assert.equal(out.status, 0, out.stderr);
  assert.ok(!existsSync(join(r, gone)));
  assert.equal(readFileSync(join(r, mine), "utf8"), "mine\n");
  assert.equal(readFileSync(join(r, conf), "utf8"), "{}\n");
  assert.equal(readFileSync(join(r, edited), "utf8"), "v1\nmine\n");
  assert.match(out.stdout, new RegExp(`^kept \\(no longer shipped, changed locally\\): ${edited.replaceAll(".", "\\.")}$`, "m"));
  const files = readJson(r, ".xworkflows/installed.json").files;
  assert.ok(!(gone in files) && !(edited in files) && !(mine in files) && !(conf in files));
  assert.match(cliAt(copy, r, ["install", "--yes"]).stdout, /nothing to do/);
});
test("install does not throw on a null entry of the record's files: it counts as not recorded", () => {
  const r = repo(); cli(r, ["install", "--yes"]);
  const p = ".xworkflows/hooks/core/stray.mjs";
  writeFileSync(join(r, p), "mine\n");
  withRecord(r, (rec) => { rec.files[p] = null; });
  const out = cli(r, ["install", "--yes"]);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(readFileSync(join(r, p), "utf8"), "mine\n");
});
test("install: the real manifest lists skills/adapt/topics.md as retired with the hash of each text earlier versions shipped", () => {
  const list = readJson(PKG_ROOT, "manifest.json").pieces.find((p) => p.id === "adapt").retired?.["skills/adapt/topics.md"];
  assert.equal(list?.length, 6);
  assert.ok(list.every((h) => /^[0-9a-f]{64}$/.test(h)));
});

// a retired file alone in its folder takes the folder, and a retired unit takes its line of .graphifyignore and its entry of the record
test("install: a retired file alone in a folder of the package takes the folder; a whole retired skill takes its .graphifyignore line and record entry", () => {
  const copy = retiringCopy({ "skills/gone/SKILL.md": [sha("g\n")], "hooks/core/oldsub/x.mjs": [sha("x\n")] });
  const r = repo(); assert.equal(cliAt(copy, r, ["install", "--yes"]).status, 0);
  const unit = ".claude/skills/gone", sub = ".xworkflows/hooks/core/oldsub";
  mkdirSync(join(r, unit), { recursive: true }); writeFileSync(join(r, unit, "SKILL.md"), "g\n");
  mkdirSync(join(r, sub), { recursive: true }); writeFileSync(join(r, sub, "x.mjs"), "x\n");
  appendFileSync(join(r, ".graphifyignore"), `${unit}/\n`);
  withRecord(r, (rec) => { rec.imports.push({ file: ".graphifyignore", line: `${unit}/` }); });
  const out = cliAt(copy, r, ["install", "--yes"]);
  assert.equal(out.status, 0, out.stderr);
  assert.ok(!existsSync(join(r, unit)) && !existsSync(join(r, sub)), "both folders are gone");
  assert.ok(existsSync(join(r, ".xworkflows/hooks/core")), "the shared parent stays");
  assert.ok(!lines(r).includes(`${unit}/`) && lines(r).includes(".xworkflows/"));
  assert.ok(!readJson(r, ".xworkflows/installed.json").imports.some((i) => i.line === `${unit}/`));
  const un = cliAt(copy, r, ["uninstall"]);
  assert.doesNotMatch(un.stdout, /kept \(not ours\)/);
});

// P-46: until the chaining is designed apart, install says what a chained hook cannot do
test("install: chaining a hook of the project prints one line that a hook which depends on its own file name will not work chained", () => {
  const { r } = chained();
  const out = cli(r, ["install", "--yes"]);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout.split("\n").filter((l) => /depends on its own file name will not work chained/.test(l)).length, 1);
  assert.doesNotMatch(cli(repo(), ["install", "--yes"]).stdout, /will not work chained/);
});

// P-50: a link made between plan() and apply() is never written through
test("apply writes nothing through a symlink put in place after plan() read the tree", async () => {
  const { plan, apply } = await import(pathToFileURL(BIN).href);
  const m = JSON.parse(readFileSync(join(SHARED, "manifest.json"), "utf8"));
  const empty = { xworkflows: "", tools: ["claude"], pieces: {}, files: {}, merged: [], blocks: [], imports: [], created: [], dirs: [], declined: [], kept: [], renamed: {}, scalars: [], chained: [] };
  const saved = { ...process.env };
  Object.assign(process.env, ISO);
  try {
    for (const [what, link, target] of [["a folder the package writes into", ".xworkflows", "dir"], ["a file the install merges into", "AGENTS.md", "file"], [".claude/skills", ".claude/skills", "dir"]]) {
      const r = repo(), o = tmp("xwf-out-");
      const pl = plan(m, r, empty);
      if (target === "file") writeFileSync(join(o, "x"), "theirs\n");
      mkdirSync(dirname(join(r, link)), { recursive: true });
      symlinkSync(target === "file" ? join(o, "x") : o, join(r, link));
      try { apply(pl, r, m, empty); } catch {}
      assert.deepEqual(readdirSync(o), target === "file" ? ["x"] : [], what);
      if (target === "file") assert.equal(readFileSync(join(o, "x"), "utf8"), "theirs\n", what);
    }
  } finally { process.env = saved; }
});

// P-116 (a): a line of doctor names what really fixes it, and doing it makes the line go
const FAILS = (o) => o.stdout.split("\n").filter((l) => /^fail /.test(l));
test("doctor: with core.hooksPath outside the repository the pre-push line names a command that puts the hooks inside, and after it install writes the hook", () => {
  const g = tmp("xwf-ghooks-"), r = repo();
  const env = { GIT_CONFIG_GLOBAL: outside(g) };
  assert.equal(cli(r, ["install", "--yes"], { env }).status, 0);
  const line = lineOf(doctor(r, env), /^fail pre-push hook/);
  assert.ok(line, "doctor fails on it");
  assert.doesNotMatch(line, /: run xworkflows install$/);
  // both ways out, each with what it costs
  assert.ok(line.includes('if [ -f "$f" ]; then node "$f" --pre-push "$1" || exit $?; fi'), line);
  assert.match(line, /add this line to the pre-push hook of that folder/);
  assert.match(line, /runs it in every repository that uses the folder/);
  assert.match(line, /after which the hooks of the other folder no longer run here/);
  const cmd = line.match(/run: (git config .+?); then run xworkflows install$/)?.[1];
  assert.ok(cmd, line);
  assert.equal(spawnSync("sh", ["-c", cmd], { cwd: r, env: { ...process.env, ...ISO, ...env } }).status, 0);
  assert.equal(cli(r, ["install", "--yes"], { env }).status, 0);
  assert.deepEqual(FAILS(doctor(r, env)), []);
  assert.deepEqual(readdirSync(g), []);
});
test("doctor: a memory.dir outside the repository, existing or not, says to name a folder inside it, and doing so makes the lines go", () => {
  const o = tmp("xwf-out-"), r = repo(); cli(r, ["install", "--yes"]);
  const ours = (extra = {}) => doctor(r, { PATH: GOOD, ...extra });
  for (const dir of [o, join(o, "not-there"), relative(r, o)]) {
    withConfig(r, { memory: { dir } });
    const out = ours();
    const bad = out.stdout.split("\n").filter((l) => /^(fail|warn) (no qmd collection covers|no memory folder yet)/.test(l));
    assert.equal(bad.length, 1, out.stdout);
    assert.match(bad[0], /set memory\.dir in \.xworkflows\/config\.json to a folder inside the repository, then run xworkflows install$/);
  }
  withConfig(r, { memory: { dir: "docs/memory" } });
  assert.equal(cli(r, ["install", "--yes"], { env: { PATH: GOOD, HOME: EMPTY_HOME } }).status, 0);
  assert.doesNotMatch(ours().stdout, /no qmd collection covers|no memory folder yet/);
});

// P-116 (b): the first word of lookup.index.command reaches a shell only quoted
test("doctor: a lookup.index.command whose first word holds ; and a second command runs nothing", () => {
  const r = repo(); cli(r, ["install"]);
  withConfig(r, { paths: { ...ALL_KEYS.paths, code: ["src/"] }, lookup: { index: { command: "mytool;touch${IFS}PWNED query", folder: "idx-out" } } });
  const out = doctor(r, { PATH: tools({ qmd: "exit 0" }) });
  assert.ok(!existsSync(join(r, "PWNED")), "the second command ran");
  assert.match(out.stdout, /^fail mytool;touch\$\{IFS\}PWNED command is missing$/m);
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
test("install: an empty folder at a skill's place is no skill of the project: no question, ours goes in", () => {
  const r = repo();
  mkdirSync(join(r, ".claude/skills/grill"), { recursive: true });
  const out = cli(r, ["install", "--yes"]);
  assert.equal(out.status, 0, out.stderr);
  assert.doesNotMatch(out.stdout, /A skill grill exists/);
  assert.ok(existsSync(join(r, ".claude/skills/grill/SKILL.md")));
  assert.ok(!existsSync(join(r, ".claude/skills/xwf-grill")));
});
test("install by this version on a record without dirs, written by the version on main, leaves the record without dirs", () => {
  const r = repo(); cli(r, ["install", "--yes"]);
  withRecord(r, (rec) => { delete rec.dirs; });
  assert.equal(cli(r, ["install", "--yes"]).status, 0);
  assert.ok(!("dirs" in readJson(r, ".xworkflows/installed.json")));
});

// P-116 (d): doctor never throws on a value of the wrong type
test("doctor: a lookup.index.command or memory.index that is not text gives a fail line naming the key, and an empty command is the default", () => {
  const r = repo(); cli(r, ["install"]);
  const code = { ...ALL_KEYS.paths, code: ["src/"] };
  for (const command of [["graphify", "query"], 5, true]) {
    withConfig(r, { paths: code, lookup: { index: { command } } });
    const out = doctor(r, { PATH: tools({ qmd: COVERS }) });
    assert.equal(out.stderr, "", JSON.stringify(command));
    assert.match(out.stdout, /^fail lookup\.index\.command must be text: .*\.xworkflows\/config\.json/m);
    assert.match(out.stdout, /^doctor: \d+ fail/m);
  }
  withConfig(r, { paths: code, lookup: { index: { command: "" } } });
  const empty = doctor(r, { PATH: tools({ qmd: COVERS }) });
  assert.equal(empty.stderr, "");
  assert.match(empty.stdout, /^fail graphify command is missing: uv tool install graphifyy$/m);
  for (const index of [["a"], 5, true, { a: 1 }]) {
    withConfig(r, { memory: { index } });
    const out = doctor(r, { PATH: tools({ qmd: COVERS }) });
    assert.equal(out.stderr, "", JSON.stringify(index));
    assert.match(out.stdout, /^fail memory\.index must be text: .*\.xworkflows\/config\.json/m);
    assert.match(out.stdout, /^doctor: \d+ fail/m);
  }
});

test("install --yes: a retired file is looked for only under the xwf- name of a unit that install renames", () => {
  const published = spawnSync("git", ["show", "f467f65~1:skills/adapt/topics.md"], { cwd: PKG_ROOT, encoding: "utf8" }).stdout;
  const mine = ".claude/skills/adapt/topics.md", ours = ".claude/skills/xwf-adapt/topics.md";
  const r = repo({ ".claude/skills/adapt/SKILL.md": "mine\n", [mine]: published, [ours]: published });
  const out = cli(r, ["install", "--yes"]);
  assert.equal(out.status, 0, out.stderr);
  assert.ok(existsSync(join(r, mine)), "the user's file is still there");
  assert.ok(!existsSync(join(r, ours)), "the retired file of the package's skill is removed");
  assert.ok(!out.stdout.includes(".claude/skills/adapt/topics.md"), out.stdout);
});
test("install: the user's own skill with a topics.md of other content is untouched and not named", () => {
  const mine = ".claude/skills/adapt/topics.md";
  const r = repo({ ".claude/skills/adapt/SKILL.md": "mine\n", [mine]: "my own topics\n" });
  for (const args of [["install"], ["install", "--yes"]]) {
    const out = cli(r, args);
    assert.equal(out.status, 0, out.stderr);
    assert.equal(readFileSync(join(r, mine), "utf8"), "my own topics\n");
    assert.ok(!out.stdout.includes(".claude/skills/adapt/topics.md"), out.stdout);
  }
});


test("install: a retired file inside the user's own skill that install keeps is neither removed nor named", () => {
  // a text the package once published, taken from git; the hash is in the manifest's retired list
  const published = spawnSync("git", ["show", "f467f65~1:skills/adapt/topics.md"], { cwd: PKG_ROOT, encoding: "utf8" }).stdout;
  assert.ok(readJson(PKG_ROOT, "manifest.json").pieces.find((p) => p.id === "adapt").retired["skills/adapt/topics.md"].includes(sha(published)));
  const topics = ".claude/skills/adapt/topics.md";
  const r = repo({ ".claude/skills/adapt/SKILL.md": "mine\n", [topics]: published });
  const out = cli(r, ["install"]);
  assert.equal(out.status, 0, out.stderr);
  assert.ok(existsSync(join(r, topics)), "the user's file is still there");
  assert.ok(!out.stdout.includes("adapt/topics.md"), out.stdout);
});

test("install: a retired entry naming a file this tool's adapter never installs is skipped", () => {
  const copy = retiringCopy({ "hooks/adapters/other.mjs": [sha("old\n")] });
  const out = cliAt(copy, repo(), ["install", "--yes"]);
  assert.equal(out.status, 0, out.stderr);
});

test("doctor: for a hooks folder outside the repository the line it prints runs the check only where the file is, and then doctor says ok", () => {
  const g = tmp("xwf-ghooks-");
  const env = { GIT_CONFIG_GLOBAL: outside(g) };
  const r = repo();
  assert.equal(cli(r, ["install", "--yes"], { env }).status, 0);
  const first = doctor(r, env).stdout;
  const line = first.match(/^fail pre-push hook: core\.hooksPath points outside.*file is: (.+?) ; or point/m)?.[1];
  assert.ok(line, first);
  writeFileSync(join(g, "pre-push"), `#!/bin/sh\n${line}\n`, { mode: 0o755 });
  assert.doesNotMatch(doctor(r, env).stdout, /^fail pre-push hook/m);
  // a repository that uses the folder and has no xworkflows: the push goes on
  const other = repo();
  const run = (cwd) => spawnSync(join(g, "pre-push"), ["origin"], { cwd, env: { ...process.env, ...ISO }, encoding: "utf8" });
  assert.equal(run(other).status, 0);
  // where the check is, its exit code stops the push
  mkdirSync(join(other, ".xworkflows/checks"), { recursive: true });
  writeFileSync(join(other, ".xworkflows/checks/run.mjs"), "process.exit(3);\n");
  assert.equal(run(other).status, 3);
});
