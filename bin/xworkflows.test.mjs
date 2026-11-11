import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BIN = join(dirname(fileURLToPath(import.meta.url)), "xworkflows.mjs");

function repo(setup = {}) {
  const dir = mkdtempSync(join(tmpdir(), "xwf-"));
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "t"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: dir });
  for (const [p, c] of Object.entries(setup)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), c);
  }
  return dir;
}

const git = (cwd, args) => spawnSync("git", args.split(" "), { cwd, encoding: "utf8" }).stdout.trim();

function cli(cwd, args, opts = {}) {
  const env = { ...process.env, ...opts.env };
  delete env.XWORKFLOWS_FREE;
  delete env.XWORKFLOWS_RECORD;
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

function packageCopy() {
  const dir = mkdtempSync(join(tmpdir(), "xwf-pkg-"));
  for (const p of ["package.json", "manifest.json", "tiers.json", "templates", "bin", "skills", "agents", "hooks"]) {
    cpSync(join(PKG_ROOT, p), join(dir, p), { recursive: true });
  }
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  return dir;
}

function cliAt(pkg, cwd, args) {
  const env = { ...process.env };
  delete env.XWORKFLOWS_FREE;
  delete env.XWORKFLOWS_RECORD;
  const r = spawnSync("node", [join(pkg, "bin/xworkflows.mjs"), ...args], { cwd, env, input: "", encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

test("pack --check passes on this repository", () => {
  assert.equal(cli(PKG_ROOT, ["pack", "--check"]).status, 0);
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
  spawnSync("git", ["add", "-A"], { cwd: copy });
  assert.match(cliAt(copy, copy, ["pack"]).stderr, /skills\/grill\/EXTRA\.md belongs to no piece/);
  rmSync(join(copy, "skills/grill/EXTRA.md"));
  spawnSync("git", ["add", "-A"], { cwd: copy });
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
  assert.deepEqual(Object.keys(rec), ["xworkflows", "tools", "pieces", "files", "merged", "blocks", "imports", "created", "declined", "kept", "renamed"]);
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
  assert.equal(after.hooks.PreToolUse.length, 2);
  assert.match(after.hooks.PreToolUse[1].hooks[0].command, /\.xworkflows\/hooks\/run\.mjs" claude design-first$/);
  assert.deepEqual(after.permissions.allow, ["Bash(node .xworkflows/mark.mjs:*)"]);
});
test("an edited entry of ours is not duplicated", () => {
  const r = repo();
  cli(r, ["install"]);
  const s = readJson(r, ".claude/settings.json");
  s.hooks.PreToolUse[0].matcher = "Write";
  writeJson(r, ".claude/settings.json", s);
  cli(r, ["install"]);
  assert.equal(readJson(r, ".claude/settings.json").hooks.PreToolUse.length, 1);
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
  assert.equal(rec.merged.length, 2);
  assert.deepEqual(rec.merged[0].key, ["hooks", "PreToolUse"]);
  assert.equal(rec.merged[0].createdKey, true);
  assert.deepEqual(rec.blocks, [{ file: "AGENTS.md" }]);
  assert.deepEqual(rec.imports, [{ file: "CLAUDE.md", line: "@AGENTS.md" }]);
  assert.deepEqual(rec.created.sort(), [".claude/settings.json", "AGENTS.md", "CLAUDE.md"]);
});
test("AGENTS.md: a changed block is replaced in place, text outside kept; existing CLAUDE.md untouched", () => {
  const r = repo({ "AGENTS.md": "top\n<!-- xworkflows:start -->\nold\n<!-- xworkflows:end -->\nbottom\n", "CLAUDE.md": "mine\n" });
  cli(r, ["install"]);
  const t = readFileSync(join(r, "AGENTS.md"), "utf8");
  assert.ok(t.startsWith("top\n<!-- xworkflows:start -->\n## xworkflows"));
  assert.ok(t.endsWith("<!-- xworkflows:end -->\nbottom\n"));
  assert.equal(readFileSync(join(r, "CLAUDE.md"), "utf8"), "mine\n");
  assert.deepEqual(readJson(r, ".xworkflows/installed.json").created, [".claude/settings.json"]);
});
test("dry-run lists merges and writes nothing", () => {
  const r = repo();
  const out = cli(r, ["install", "--dry-run"]);
  assert.match(out.stdout, /would merge AGENTS\.md/);
  assert.match(out.stdout, /would merge \.claude\/settings\.json/);
  assert.deepEqual(readdirSync(r), [".git"]);
});
