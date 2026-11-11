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

test("hook removed by the user then reinstalled: merged stays one entry, createdKey kept", () => {
  const r = repo();
  cli(r, ["install"]);
  const s = readJson(r, ".claude/settings.json");
  s.hooks.PreToolUse = [];
  writeJson(r, ".claude/settings.json", s);
  cli(r, ["install"]);
  const m = readJson(r, ".xworkflows/installed.json").merged.filter((x) => x.key[0] === "hooks");
  assert.equal(m.length, 1);
  assert.equal(m[0].createdKey, true);
});
test("installed.json deleted: found entries of ours are recorded again", () => {
  const r = repo();
  cli(r, ["install"]);
  rmSync(join(r, ".xworkflows/installed.json"));
  cli(r, ["install"]);
  const m = readJson(r, ".xworkflows/installed.json").merged;
  assert.equal(m.length, 1);
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
test("identical unrecorded file is adopted; a different one stops install", () => {
  const r = repo();
  cli(r, ["install"]);
  rmSync(join(r, ".xworkflows/installed.json"));
  assert.equal(cli(r, ["install"]).status, 0);
  rmSync(join(r, ".xworkflows/installed.json"));
  appendFileSync(join(r, ".xworkflows/hooks/run.mjs"), "// mine\n");
  const out = cli(r, ["install"]);
  assert.equal(out.status, 1);
  assert.match(out.stderr, /exists and is not ours: \.xworkflows\/hooks\/run\.mjs/);
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
  const out = cli(spaced, ["doctor"], { env: { CLAUDE_PROJECT_DIR: "/elsewhere", XWORKFLOWS_FREE: "1" } });
  assert.equal(out.status, 0, out.stdout);
  assert.match(out.stdout, /^ok +probe/m);
  assert.match(out.stdout, /always-loaded: \d+ bytes of 24000/);
  assert.match(out.stdout, /Claude Code: tested/);
});
test("doctor warns on a local change and still exits 0", () => {
  const r = repo(); cli(r, ["install"]);
  appendFileSync(join(r, ".claude/agents/explore.md"), "x\n");
  const out = cli(r, ["doctor"]);
  assert.equal(out.status, 0);
  assert.match(out.stdout, /^warn changed locally: \.claude\/agents\/explore\.md/m);
});
test("doctor warns on a declined import", () => {
  const r = repo({ "CLAUDE.md": "# x\n" }); cli(r, ["install"]);
  const out = cli(r, ["doctor"]);
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
  assert.equal(cli(r, ["doctor"]).status, 1);
});
test("doctor skips an @import that is a folder", () => {
  const r = repo(); cli(r, ["install"]);
  mkdirSync(join(r, "docs"));
  appendFileSync(join(r, "CLAUDE.md"), "@docs\n");
  const out = cli(r, ["doctor"]);
  assert.equal(out.status, 0, out.stdout + out.stderr);
  assert.match(out.stdout, /^doctor: 0 fail/m);
});
test("doctor fails when the probe hangs", () => {
  const r = repo(); cli(r, ["install"]);
  writeFileSync(join(r, ".xworkflows/hooks/core/design-first.mjs"), "await new Promise(() => setInterval(() => {}, 1000));\n");
  const out = cli(r, ["doctor"], { env: { XWORKFLOWS_PROBE_TIMEOUT_MS: "1500" } });
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
