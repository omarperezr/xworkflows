import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "../test-tmp.mjs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdtempSync, GOOD, ISO, isoEnv, repo, git, cli, readJson, writeJson, PKG_ROOT, WIRED, PRE, packageCopy, SHARED, BIN, cliAt, packedCopy, theirs, OLD_MATCHER, CURRENT, installedOld, KEPT_EDIT, config, BAD, commit, marked, OLD, chained, tmp, doctor, outside, hasHook, OLD_TEXT, oldInstall, withRecord, files, at, ALL_KEYS, sha } from "./shared.test.mjs";
// the answers are typed at a terminal: a pty from python3, each line sent once the previous question is out; EOF sends end of input,
// INT sends Ctrl-C. It exits with the code of the command, 255 when a signal ended it
const PTY = `import os, pty, sys, time
pid, fd = pty.fork()
if pid == 0:
    os.execvp("node", ["node"] + sys.argv[2:])
for line in sys.argv[1].split(","):
    time.sleep(1)
    os.write(fd, b"\\x04" if line == "EOF" else b"\\x03" if line == "INT" else (line + "\\n").encode())
out = b""
try:
    while True:
        d = os.read(fd, 4096)
        if not d: break
        out += d
except OSError: pass
sys.stdout.write(out.decode())
c = os.waitstatus_to_exitcode(os.waitpid(pid, 0)[1])
sys.exit(c if c >= 0 else 255)
`;

// an installed folder made a file, or one that cannot be read: install and uninstall answer with one line and go on
const FOLDER_BLOCKS = [
  ["made a file", (d) => { rmSync(d, { recursive: true }); writeFileSync(d, "x\n"); }, false, "not a folder"],
  ["of mode 000", (d) => chmodSync(d, 0o000), process.getuid?.() === 0 && "root reads a folder of mode 000", "not readable"],
];


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
  const copy = packedCopy();
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
  assert.match(readFileSync(join(r, ".claude/agents/explore.md"), "utf8"), /^effort: low$/m);
  assert.match(readFileSync(join(r, ".claude/agents/review.md"), "utf8"), /^effort: high$/m);
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
  const copy = packedCopy();
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
test("adapt-gates denies a Write of a file the adapt scripts write, sent as the runner sends it", () => {
  const r = repo();
  cli(r, ["install"]);
  writeJson(r, ".xworkflows/adapt-run.json", { startedAt: Date.now() });
  const env = { ...process.env, CLAUDE_PROJECT_DIR: r, XWORKFLOWS_STATE_DIR: mkdtempSync(join(tmpdir(), "xwf-state-")) };
  for (const k of ["XWORKFLOWS_FREE", "XWORKFLOWS_RECORD"]) delete env[k];
  const send = (tool_name, tool_input) => JSON.parse(spawnSync("node", [join(r, ".xworkflows/hooks/run.mjs"), "claude", "adapt-gates"], { cwd: r, encoding: "utf8", env,
    input: JSON.stringify({ session_id: "s1", cwd: r, hook_event_name: "PreToolUse", tool_name, tool_input }) }).stdout || "{}");
  assert.equal(send("Write", { file_path: join(r, ".xworkflows/rules.json"), content: "{}\n" }).hookSpecificOutput?.permissionDecision, "deny");
  assert.deepEqual(send("Bash", { command: "cat .xworkflows/summary.md" }), {});
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
test("an entry of ours with the old matcher, as the record holds it, is replaced and the record follows", () => {
  const r = repo();
  const adapt = installedOld(r);
  assert.match(cli(r, ["install", "--dry-run"]).stdout, /would merge \.claude\/settings\.json/);
  assert.equal(readJson(r, ".claude/settings.json").hooks.PreToolUse.find(adapt).matcher, OLD_MATCHER);
  cli(r, ["install"]);
  const pre = readJson(r, ".claude/settings.json").hooks.PreToolUse;
  assert.equal(pre.length, PRE);
  assert.equal(pre.find(adapt).matcher, CURRENT);
  assert.equal(pre.filter((e) => e.matcher === OLD_MATCHER).length, 0);
  const rec = readJson(r, ".xworkflows/installed.json").merged.filter((m) => adapt(m.entry));
  assert.deepEqual(rec.map((m) => m.entry.matcher), [CURRENT]);
});
test("an entry of ours edited by hand is kept and install says so", () => {
  const r = repo();
  const adapt = installedOld(r, "Write");
  const out = cli(r, ["install"]);
  assert.match(out.stdout, KEPT_EDIT);
  assert.equal(readJson(r, ".claude/settings.json").hooks.PreToolUse.find(adapt).matcher, "Write");
  assert.equal(readJson(r, ".xworkflows/installed.json").merged.find((m) => adapt(m.entry)).entry.matcher, OLD_MATCHER);
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
test("a line of install's that the user changed stays: install adds no second one, uninstall leaves it, and both name the file", () => {
  const { r } = chained();
  cli(r, ["install", "--yes"]);
  const hook = join(r, ".git/hooks/pre-push"), line = marked(readFileSync(hook, "utf8"))[0];
  const edited = OLD.replace("\n", `\n${line.replace("then", "then echo mine;")}\n`);
  writeFileSync(hook, edited);
  assert.match(cli(r, ["install", "--yes"]).stdout, /^kept \(changed locally\): \.git\/hooks\/pre-push$/m);
  assert.equal(readFileSync(hook, "utf8"), edited);
  assert.match(cli(r, ["uninstall"]).stdout, /^kept \(changed locally\): \.git\/hooks\/pre-push$/m);
  assert.equal(readFileSync(hook, "utf8"), edited);
});

test("gitignore lines and scalar settings: written once, left alone, removed by uninstall", () => {
  const r = repo({ ".gitignore": "node_modules" });
  cli(r, ["install"]);
  const gi = readFileSync(join(r, ".gitignore"), "utf8");
  assert.equal(gi, "node_modules\ngraphify-out/\n.claude/settings.local.json\n.qmd/\n.xworkflows/handoff.md\n");
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
  assert.equal(readFileSync(join(r, ".gitignore"), "utf8"), "graphify-out\n.claude/*.local.json\n.qmd/\n.xworkflows/handoff.md\n");
  assert.deepEqual(readJson(r, ".claude/settings.json").attribution, { commit: "x" });
  assert.deepEqual(readJson(r, ".claude/settings.local.json"), { autoMemoryDirectory: "/mine" });
  cli(r, ["uninstall"]);
  assert.deepEqual(readJson(r, ".claude/settings.json"), mine);
  assert.deepEqual(readJson(r, ".claude/settings.local.json"), { autoMemoryDirectory: "/mine" });
  const q = repo({ ".xworkflows/config.json": JSON.stringify({ memory: { dir: "notes" } }) });
  cli(q, ["install"]);
  assert.equal(readJson(q, ".claude/settings.local.json").autoMemoryDirectory, join(realpathSync(q), "notes"));
});
test("uninstall deletes the hand-off file and says so", () => {
  const r = repo();
  cli(r, ["install"]);
  writeFileSync(join(r, ".xworkflows/handoff.md"), "main: x\n");
  assert.match(cli(r, ["uninstall"]).stdout, /^deleted \.xworkflows\/handoff\.md$/m);
  assert.deepEqual(readdirSync(r).sort(), [".git"]);
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
test("the developer's global git config never reaches a test", () => {
  const g = tmp("xwf-ghooks-"); hasHook(g);
  const saved = process.env.GIT_CONFIG_GLOBAL;
  process.env.GIT_CONFIG_GLOBAL = outside(g);
  try { cli(repo(), ["install", "--yes"]); } finally { if (saved === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = saved; }
  assert.deepEqual(readdirSync(g), ["pre-push"]);
  assert.equal(readFileSync(join(g, "pre-push"), "utf8"), OLD);
});

// with the record lost, the hooks of an install made the old way are known by the earlier texts the manifest lists
for (const [what, theirs] of [["the user's three hooks chained", true], ["its own hooks only", false]]) {
  test(`an install made the old way, ${what}, whose installed.json was lost, ends in the new form, and uninstall leaves the user's hooks as they were`, () => {
    const { r } = chained();
    const names = ["pre-push", "post-merge", "post-commit"], at = (n) => join(r, ".git/hooks", n);
    if (theirs) for (const n of names.slice(1)) { writeFileSync(at(n), OLD); chmodSync(at(n), 0o755); }
    else rmSync(at("pre-push"));
    oldInstall(r);
    rmSync(join(r, ".xworkflows/installed.json"));
    const out = cli(r, ["install"]);
    assert.equal(out.status, 0, out.stderr);
    assert.doesNotMatch(out.stdout, /answered for you/);
    for (const n of names) {
      const t = readFileSync(at(n), "utf8");
      assert.equal(marked(t).length, 1, n);
      assert.equal(t.replace(`${marked(t)[0]}\n`, ""), theirs ? OLD : "#!/bin/sh\n", n);
      assert.ok(!existsSync(`${at(n)}.before-xworkflows`), n);
    }
    assert.equal(cli(r, ["uninstall"]).status, 0);
    for (const n of names) assert.equal(existsSync(at(n)) && readFileSync(at(n), "utf8"), theirs && OLD, n);
  });
}
test("--dry-run says what it would migrate and where it would add the line, never that it migrated, and writes nothing", () => {
  const { r } = chained(), hook = join(r, ".git/hooks/pre-push");
  oldInstall(r);
  const out = cli(r, ["install", "--dry-run"]);
  assert.equal(out.status, 0, out.stderr);
  assert.doesNotMatch(out.stdout, /^migrated /m);
  assert.match(out.stdout, /^would migrate pre-push: \.git\/hooks\/pre-push gets its name back; would add the line to \.git\/hooks\/pre-push$/m);
  assert.equal(readFileSync(hook, "utf8"), OLD_TEXT("chained", "pre-push"));
  assert.equal(readFileSync(`${hook}.before-xworkflows`, "utf8"), OLD);
  const fresh = chained().r;
  assert.match(cli(fresh, ["install", "--dry-run", "--yes"]).stdout, /^would add the line to \.git\/hooks\/pre-push$/m);
  assert.equal(readFileSync(join(fresh, ".git/hooks/pre-push"), "utf8"), OLD);
});
for (const [tool, body] of [["lefthook", '#!/bin/sh\nif [ "$LEFTHOOK" = "0" ]; then\n  exit 0\nfi\nlefthook run "pre-push" "$@"\n'], ["pre-commit", '#!/usr/bin/env bash\n# File generated by pre-commit: https://pre-commit.com\nexec python3 -mpre_commit hook-impl --hook-type=pre-push -- "$@"\n']]) {
  test(`${tool}: its hook stays chained as before the line: renamed, run first from install's hook, no line to add printed, and given back by uninstall`, () => {
    const r = repo({ ".git/hooks/pre-push": body }), hook = join(r, ".git/hooks/pre-push");
    chmodSync(hook, 0o755);
    const out = cli(r, ["install", "--yes"]);
    assert.equal(out.status, 0, out.stderr);
    assert.equal(readFileSync(`${hook}.before-xworkflows`, "utf8"), body);
    assert.equal(readFileSync(hook, "utf8"), OLD_TEXT("chained", "pre-push"));
    assert.deepEqual(marked(out.stdout), [], out.stdout);
    assert.deepEqual(readJson(r, ".xworkflows/installed.json").chained, [{ file: ".git/hooks/pre-push", to: ".git/hooks/pre-push.before-xworkflows" }]);
    assert.match(doctor(r).stdout, /^ok +pre-push hook is ours$/m);
    assert.match(cli(r, ["install", "--yes"]).stdout, /^nothing to do$/m);
    cli(r, ["uninstall"]);
    assert.equal(readFileSync(hook, "utf8"), body);
    assert.ok(!existsSync(`${hook}.before-xworkflows`));
  });
}

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
test("end of input at a question of install is an empty answer, the first label, for it and the questions after it: no stack, and install ends as it does for that answer", { skip: spawnSync("python3", ["-c", "import pty"]).status !== 0 && "needs python3 pty" }, () => {
  const { r } = chained();
  writeFileSync(join(r, "CLAUDE.md"), "# x\n");
  const out = spawnSync("python3", ["-c", PTY, "EOF", BIN, "install"], { cwd: r, env: { ...process.env, ...ISO }, encoding: "utf8" });
  assert.match(out.stdout, /Add the xworkflows line to/);
  assert.doesNotMatch(out.stdout, /AbortError|Error:|\n\s+at /);
  assert.match(out.stdout, /left as it is; to run the check, add this line to it as its first command/);
  // P-162: a question after the end of input is never shown, so it is listed; the first note is on a line of its own
  assert.match(out.stdout, /^answered for you: Add @AGENTS\.md to CLAUDE\.md\? -> no\r?$/m);
  assert.match(out.stdout, /^\.git\/hooks\/pre-push left as it is/m);
  assert.match(out.stdout, /Next: open Claude Code/);
  assert.equal(readFileSync(join(r, ".git/hooks/pre-push"), "utf8"), OLD);
  assert.equal(readFileSync(join(r, "CLAUDE.md"), "utf8"), "# x\n");
  assert.deepEqual(readJson(r, ".xworkflows/installed.json").declined.map((d) => d.what).sort(), ["chain", "import"]);
});
for (const [at, keys] of [["the first question", "INT"], ["the second question, after Enter at the first", ",INT"]]) {
  test(`Ctrl-C at ${at} of install stops it with nothing written, no record, an exit code that is not zero and no stack`, { skip: spawnSync("python3", ["-c", "import pty"]).status !== 0 && "needs python3 pty" }, () => {
    const { r } = chained();
    writeFileSync(join(r, "CLAUDE.md"), "# x\n");
    const before = files(r);
    const out = spawnSync("python3", ["-c", PTY, keys, BIN, "install"], { cwd: r, env: { ...process.env, ...ISO }, encoding: "utf8" });
    assert.match(out.stdout, keys === "INT" ? /Add the xworkflows line to/ : /CLAUDE\.md/);
    assert.notEqual(out.status, 0, out.stdout);
    assert.doesNotMatch(out.stdout, /AbortError|Error:|\n\s+at /);
    assert.ok(!existsSync(join(r, ".xworkflows/installed.json")), out.stdout);
    assert.equal(files(r), before);
  });
}
test("a tracked settings.local.json: the ignore line is added once, not on every install", () => {
  const r = repo({ ".claude/settings.local.json": '{"x":1}' });
  git(r, "add -A"); git(r, "commit -qm t");
  cli(r, ["install", "--yes"]); cli(r, ["install", "--yes"]);
  assert.equal(readFileSync(join(r, ".gitignore"), "utf8").split("\n").filter((l) => l === ".claude/settings.local.json").length, 1);
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
test("a second install records the same folders and changes nothing", () => {
  const r = repo(); cli(r, ["install", "--yes"]);
  const rec = readFileSync(join(r, ".xworkflows/installed.json"), "utf8");
  assert.match(cli(r, ["install", "--yes"]).stdout, /nothing to do/);
  assert.equal(readFileSync(join(r, ".xworkflows/installed.json"), "utf8"), rec);
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
for (const [name, block, skip, why] of FOLDER_BLOCKS) {
  const run = (go) => {
    const r = repo(), d = join(r, ".claude/skills/tdd");
    try {
      assert.equal(cli(r, ["install"]).status, 0);
      block(d);
      go(r, d);
    } finally { try { chmodSync(d, 0o755); } catch {} rmSync(r, { recursive: true, force: true }); }
  };
  const said = (o, rel) => { const all = o.stdout + o.stderr; assert.ok(!/\n\s+at /.test(all) && !/ENOTDIR|EACCES/.test(all.replace(/^.*\.claude\/skills\/tdd.*$/gm, "")), all); assert.equal(all.split("\n").filter((l) => l.includes(rel)).length, 1, all); };
  test(`install: an installed folder ${name} gets one line and the install goes on`, { skip }, () => run((r, d) => {
    const o = cli(r, ["install"]);
    said(o, ".claude/skills/tdd");
    assert.match(o.stdout + o.stderr, new RegExp(why));
    assert.equal(o.status, 0, o.stderr);
    assert.ok(existsSync(join(r, ".claude/skills/grill/SKILL.md")));
    if (name === "made a file") assert.equal(readFileSync(d, "utf8"), "x\n");
  }));
  test(`install: an installed folder ${name} leaves its files in the record`, { skip }, () => run((r, d) => {
    const rec = () => readFileSync(join(r, ".xworkflows/installed.json"), "utf8");
    const keys = (t) => Object.keys(JSON.parse(t).files).filter((k) => k.startsWith(".claude/skills/tdd/"));
    const before = keys(rec());
    assert.ok(before.length > 0, rec());
    assert.equal(cli(r, ["install"]).status, 0);
    assert.deepEqual(keys(rec()), before);
  }));
  test(`uninstall: an installed folder ${name} gets one line, the rest goes and the thing in the way stays`, { skip }, () => run((r, d) => {
    const o = cli(r, ["uninstall"]);
    said(o, ".claude/skills/tdd");
    assert.ok(!existsSync(join(r, ".claude/skills/grill/SKILL.md")));
    assert.equal(o.status, 0, o.stderr);
    assert.ok(existsSync(d), o.stdout);
    if (name === "made a file") assert.equal(readFileSync(d, "utf8"), "x\n");
  }));
}
test("install: a skill folder replaced by a link leaves no key of the record under it and doctor says nothing of it", () => {
  const r = repo(), d = join(r, ".claude/skills/tdd"), out = join(r, "outside");
  cli(r, ["install"]); mkdirSync(out); rmSync(d, { recursive: true }); symlinkSync(out, d);
  assert.equal(cli(r, ["install"]).status, 0);
  const keys = Object.keys(JSON.parse(readFileSync(join(r, ".xworkflows/installed.json"), "utf8")).files);
  assert.deepEqual(keys.filter((k) => k.startsWith(".claude/skills/tdd/")), []);
  assert.doesNotMatch(doctor(r).stdout, /skills\/tdd/);
  rmSync(r, { recursive: true, force: true });
});
test("install: a folder under .xworkflows made a file stops install with one line and leaves it as it is", () => {
  const r = repo(); mkdirSync(join(r, ".xworkflows")); writeFileSync(join(r, ".xworkflows/hooks"), "x\n");
  const o = cli(r, ["install"]), all = o.stdout + o.stderr;
  assert.equal(o.status, 1, all);
  assert.equal(all.split("\n").filter((l) => l.includes(".xworkflows")).length, 1, all);
  assert.ok(!/\n\s+at /.test(all), all);
  assert.equal(readFileSync(join(r, ".xworkflows/hooks"), "utf8"), "x\n");
  assert.ok(!existsSync(join(r, ".claude/skills/grill/SKILL.md")), all);
  rmSync(r, { recursive: true, force: true });
});

// plugins the manifest declares: merged per sub-key into .claude/settings.json
const PONY = { extraKnownMarketplaces: { ponytail: { source: { source: "github", repo: "DietrichGebert/ponytail" } } }, enabledPlugins: { "ponytail@ponytail": true } };
const track = (r, ...paths) => { for (const p of paths) { mkdirSync(dirname(join(r, p)), { recursive: true }); writeFileSync(join(r, p), "x\n"); } git(r, `add ${paths.join(" ")}`); };
const codeIn = (r, ...paths) => { mkdirSync(join(r, ".xworkflows"), { recursive: true }); writeFileSync(join(r, ".xworkflows/config.json"), JSON.stringify({ paths: { code: paths } })); };
const plug = (r) => { const s = readJson(r, ".claude/settings.json"); return { m: Object.keys(s.extraKnownMarketplaces ?? {}).sort(), p: Object.keys(s.enabledPlugins ?? {}).sort() }; };

test("plugins: ponytail always; sql and front plugins only when the project tracks such files under paths.code", () => {
  const plain = repo();
  cli(plain, ["install"]);
  const s = readJson(plain, ".claude/settings.json");
  assert.deepEqual(s.extraKnownMarketplaces, PONY.extraKnownMarketplaces);
  assert.deepEqual(s.enabledPlugins, PONY.enabledPlugins);
  const sql = repo(); codeIn(sql, "db/", "ui/"); track(sql, "db/a.sql"); cli(sql, ["install"]);
  assert.deepEqual(plug(sql), { m: ["ponytail"], p: ["ponytail@ponytail", "supabase@claude-plugins-official"] });
  for (const ext of ["tsx", "jsx", "vue", "svelte", "astro", "html", "css", "scss"]) {
    const front = repo(); codeIn(front, "db/", "ui/"); track(front, `ui/a.${ext}`); cli(front, ["install"]);
    assert.deepEqual(plug(front), { m: ["impeccable", "ponytail"], p: ["frontend-design@claude-plugins-official", "impeccable@impeccable", "ponytail@ponytail"] }, ext);
    assert.deepEqual(readJson(front, ".claude/settings.json").extraKnownMarketplaces.impeccable, { source: { source: "github", repo: "pbakaus/impeccable" } });
  }
  const untracked = repo({ "a.sql": "x\n", "b.tsx": "x\n" }); cli(untracked, ["install"]);
  assert.deepEqual(plug(untracked).p, ["ponytail@ponytail"]);
  const outside = repo(); codeIn(outside, "db/"); track(outside, "vendor/a.sql", "vendor/b.tsx"); cli(outside, ["install"]);
  assert.deepEqual(plug(outside).p, ["ponytail@ponytail"]);
  const none = repo(); track(none, "db/a.sql", "ui/b.tsx"); cli(none, ["install"]);
  assert.deepEqual(plug(none).p, ["ponytail@ponytail"]);
});
test("plugins: a sub-key the user set stays, any value; install twice changes nothing; uninstall leaves the user's keys", () => {
  const mine = { extraKnownMarketplaces: { ponytail: { source: { source: "github", repo: "me/fork" } }, other: { source: { source: "github", repo: "a/b" } } }, enabledPlugins: { "ponytail@ponytail": false, "x@y": true } };
  const r = repo({ ".claude/settings.json": JSON.stringify(mine) });
  codeIn(r, "db/"); track(r, "db/a.sql");
  cli(r, ["install"]);
  const s = readJson(r, ".claude/settings.json");
  assert.deepEqual(s.extraKnownMarketplaces, mine.extraKnownMarketplaces);
  assert.deepEqual(s.enabledPlugins, { ...mine.enabledPlugins, "supabase@claude-plugins-official": true });
  assert.match(cli(r, ["install"]).stdout, /^nothing to do$/m);
  cli(r, ["uninstall"]);
  const u = readJson(r, ".claude/settings.json");
  assert.deepEqual(u.extraKnownMarketplaces, mine.extraKnownMarketplaces);
  assert.deepEqual(u.enabledPlugins, mine.enabledPlugins);
});
test("plugins: uninstall removes its own sub-keys and the maps it made, keeps one the user changed since", () => {
  const r = repo(); codeIn(r, "db/"); track(r, "db/a.sql");
  cli(r, ["install"]);
  const s = readJson(r, ".claude/settings.json");
  s.enabledPlugins["supabase@claude-plugins-official"] = false;
  writeJson(r, ".claude/settings.json", s);
  cli(r, ["uninstall"]);
  assert.deepEqual(readJson(r, ".claude/settings.json"), { enabledPlugins: { "supabase@claude-plugins-official": false } });
  const q = repo();
  cli(q, ["install"]);
  cli(q, ["uninstall"]);
  assert.ok(!existsSync(join(q, ".claude/settings.json")));
});
test("plugins: doctor reports a declared sub-key that is missing", () => {
  const r = repo();
  cli(r, ["install"]);
  assert.doesNotMatch(doctor(r).stdout, /^fail .*enabledPlugins/m);
  const s = readJson(r, ".claude/settings.json");
  delete s.enabledPlugins;
  writeJson(r, ".claude/settings.json", s);
  assert.match(doctor(r).stdout, /^fail merged entry missing: \.claude\/settings\.json enabledPlugins\.ponytail@ponytail: /m);
});

// P-206: a list that grows with the repository is read with a big buffer; a failed read warns
const fakeGit = (lsFiles) => {
  const d = tmp("xwf-fakegit-");
  const real = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
  writeFileSync(join(d, "git"), `#!/bin/sh\ncase "$1" in ls-files) if [ "$2" = -z ]; then ${lsFiles}; fi;; *) exec ${real} "$@";; esac\n`);
  chmodSync(join(d, "git"), 0o755);
  return `${d}:${process.env.PATH}`;
};
test("plugins: a file list of more than 1 MiB is read whole", () => {
  const r = repo(); codeIn(r, "db/");
  cli(r, ["install"], { env: { PATH: fakeGit("head -c 2097152 /dev/zero; printf 'db/a.sql\\0'") } });
  assert.ok(plug(r).p.includes("supabase@claude-plugins-official"));
});
test("plugins: a file list git cannot give is said, and the install goes on", () => {
  const r = repo(); codeIn(r, "db/");
  const out = cli(r, ["install"], { env: { PATH: fakeGit("exit 1") } });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stderr, /^warn: git ls-files /m);
  assert.deepEqual(plug(r).p, ["ponytail@ponytail"]);
});
test("plugins: doctor counts a file list git cannot give as a warn", () => {
  const r = repo(); codeIn(r, "db/");
  cli(r, ["install"]);
  const warns = (o) => Number(o.stdout.match(/^doctor: \d+ fail, (\d+) warn$/m)[1]);
  const base = doctor(r);
  const out = doctor(r, { PATH: `${fakeGit("exit 1").split(":")[0]}:${GOOD}` });
  assert.match(out.stdout, /^warn git ls-files /m);
  assert.equal(warns(out), warns(base) + 1);
  assert.doesNotMatch(out.stderr, /^warn: /m);
});

// the agents block of the config and the lite risk reviewer: install renders them from one source, the package's agent files and the project's risk reviewer
const withKeys = (r, extra) => { mkdirSync(join(r, ".xworkflows"), { recursive: true }); writeJson(r, ".xworkflows/config.json", { ...ALL_KEYS, ...extra }); };
const RISK = "---\nname: risk-review\ndescription: The project's risk reviewer.\nmodel: fable\ntools: Read, Grep, Glob, Bash\neffort: xhigh\n---\n\nCheck the money paths.\n";
test("a clean install passes skills-travel: no plugin skill is named for a plugin install did not turn on", () => {
  const r = repo();
  assert.equal(cli(r, ["install", "--yes"]).status, 0);
  git(r, "add -A");
  assert.equal(spawnSync("git", ["commit", "-q", "-n", "-m", "base"], { cwd: r, env: isoEnv() }).status, 0);
  const out = spawnSync("node", [".xworkflows/checks/run.mjs", "--only", "skills-travel"], { cwd: r, encoding: "utf8", env: isoEnv() });
  assert.equal(out.status, 0, out.stdout + out.stderr);
  assert.ok(!/supabase|impeccable|frontend-design/.test(readFileSync(join(r, ".claude/agents/implement-sql.md"), "utf8").split("\n---\n")[0]));
});
test("a plugin skill stays in an agent when the project's settings already turn the plugin on", () => {
  const r = repo({ ".claude/settings.json": JSON.stringify({ enabledPlugins: { "supabase@claude-plugins-official": true } }) });
  assert.equal(cli(r, ["install", "--yes"]).status, 0);
  assert.match(readFileSync(join(r, ".claude/agents/implement-sql.md"), "utf8"), /^  - supabase:supabase-postgres-best-practices$/m);
});
test("agents.<id>: effort, skills and append are rendered into the agent file; a second install changes nothing and uninstall takes the file", () => {
  const r = repo();
  withKeys(r, { agents: { implement: { effort: "low", skills: ["tdd"], append: "Extra rule of the project." } } });
  assert.equal(cli(r, ["install", "--yes"]).status, 0);
  const f = join(r, ".claude/agents/implement.md"), t = readFileSync(f, "utf8");
  assert.match(t, /^effort: low$/m);
  assert.match(t, /^skills:\n  - tdd\n---/m);
  assert.ok(!/ponytail:ponytail/.test(t.split("\n---\n")[0]));
  assert.match(t, /Extra rule of the project\.\n$/);
  assert.match(cli(r, ["install", "--yes"]).stdout, /^nothing to do$/m);
  assert.equal(readFileSync(f, "utf8"), t);
  const rec = readJson(r, ".xworkflows/installed.json");
  assert.equal(rec.files[".claude/agents/implement.md"].sha256, sha(t));
  assert.equal(cli(r, ["uninstall"]).status, 0);
  assert.ok(!existsSync(f));
});
test("agents.<id>: a hand edit outside the config is kept, and a changed config rewrites an unedited file", () => {
  const r = repo();
  withKeys(r, { agents: { implement: { effort: "low" } } });
  cli(r, ["install", "--yes"]);
  withKeys(r, { agents: { implement: { effort: "high" } } });
  cli(r, ["install", "--yes"]);
  const f = join(r, ".claude/agents/implement.md");
  assert.match(readFileSync(f, "utf8"), /^effort: high$/m);
  writeFileSync(f, readFileSync(f, "utf8") + "mine\n");
  withKeys(r, { agents: { implement: { effort: "medium" } } });
  assert.match(cli(r, ["install", "--yes"]).stdout, /kept \(changed locally\): \.claude\/agents\/implement\.md/);
  assert.match(readFileSync(f, "utf8"), /^effort: high$/m);
});
test("agents.<id>: broken values are ignored and the package's agent is written", () => {
  const r = repo();
  withKeys(r, { agents: { implement: { effort: 3, skills: "tdd", append: [] }, review: "x" } });
  assert.equal(cli(r, ["install", "--yes"]).status, 0);
  assert.match(readFileSync(join(r, ".claude/agents/implement.md"), "utf8"), /^effort: medium$/m);
});
test("paths.riskLite empty: no lite reviewer file; not empty: a copy of the risk reviewer named for the lite role, on the top model, taken out by uninstall", () => {
  const r = repo({ ".claude/agents/risk-review.md": RISK });
  withKeys(r, { paths: { ...ALL_KEYS.paths, risk: ["db/"], riskLite: [] } });
  cli(r, ["install", "--yes"]);
  assert.ok(!existsSync(join(r, ".claude/agents/risk-review-lite.md")));
  withKeys(r, { paths: { ...ALL_KEYS.paths, risk: ["db/", "ui/"], riskLite: ["ui/"] } });
  assert.equal(cli(r, ["install", "--yes"]).status, 0);
  const lite = readFileSync(join(r, ".claude/agents/risk-review-lite.md"), "utf8");
  assert.equal(lite, RISK.replace("name: risk-review", "name: risk-review-lite").replace("model: fable", "model: opus"));
  assert.match(cli(r, ["install", "--yes"]).stdout, /^nothing to do$/m);
  assert.equal(readFileSync(join(r, ".claude/agents/risk-review.md"), "utf8"), RISK);
  cli(r, ["uninstall"]);
  assert.ok(!existsSync(join(r, ".claude/agents/risk-review-lite.md")));
  assert.equal(readFileSync(join(r, ".claude/agents/risk-review.md"), "utf8"), RISK);
});
test("the lite reviewer follows roles.riskReviewerLite and waits for a risk reviewer file", () => {
  const r = repo();
  withKeys(r, { paths: { ...ALL_KEYS.paths, riskLite: ["ui/"] }, roles: { riskReviewerLite: "cheap-risk" } });
  assert.equal(cli(r, ["install", "--yes"]).status, 0);
  assert.ok(!existsSync(join(r, ".claude/agents/cheap-risk.md")));
  writeFileSync(join(r, ".claude/agents/risk-review.md"), RISK);
  cli(r, ["install", "--yes"]);
  assert.match(readFileSync(join(r, ".claude/agents/cheap-risk.md"), "utf8"), /^name: cheap-risk$/m);
});
const skillsOf = (r, agent) => readFileSync(join(r, `.claude/agents/${agent}.md`), "utf8").split("\n---\n")[0];
test("a plugin counts as on only as <plugin>@<marketplace>: true: a bare key keeps no plugin skill in an agent", () => {
  const r = repo({ ".claude/settings.json": JSON.stringify({ enabledPlugins: { impeccable: true, "frontend-design": true } }) });
  assert.equal(cli(r, ["install", "--yes"]).status, 0);
  assert.ok(!/impeccable:|frontend-design:/.test(skillsOf(r, "implement-front")));
  assert.equal(readJson(r, ".claude/settings.json").enabledPlugins.impeccable, true);
});
test("a settings file that is a link counts nothing as on: install writes none of it, and no plugin skill stays", () => {
  const r = repo();
  mkdirSync(join(r, ".claude"), { recursive: true });
  const elsewhere = join(tmp("xwf-link-"), "settings.json");
  writeFileSync(elsewhere, JSON.stringify({ enabledPlugins: { "ponytail@ponytail": true } }));
  symlinkSync(elsewhere, join(r, ".claude/settings.json"));
  assert.equal(cli(r, ["install", "--yes"]).status, 0);
  assert.ok(!/ponytail:ponytail/.test(skillsOf(r, "implement")));
});
test("a lite file that install wrote and is no longer wanted goes with its ignore line when unchanged, and is kept and named when edited", () => {
  const r = repo({ ".claude/agents/risk-review.md": RISK });
  const lite = join(r, ".claude/agents/risk-review-lite.md");
  withKeys(r, { paths: { ...ALL_KEYS.paths, risk: ["ui/"], riskLite: ["ui/"] } });
  cli(r, ["install", "--yes"]);
  assert.match(readFileSync(join(r, ".graphifyignore"), "utf8"), /^\.claude\/agents\/risk-review-lite\.md$/m);
  withKeys(r, { paths: { ...ALL_KEYS.paths, risk: ["ui/"], riskLite: [] } });
  const out = cli(r, ["install", "--yes"]);
  assert.match(out.stdout, /^removed \.claude\/agents\/risk-review-lite\.md$/m);
  assert.ok(!existsSync(lite));
  assert.doesNotMatch(readFileSync(join(r, ".graphifyignore"), "utf8"), /risk-review-lite/);
  withKeys(r, { paths: { ...ALL_KEYS.paths, risk: ["ui/"], riskLite: ["ui/"] } });
  cli(r, ["install", "--yes"]);
  writeFileSync(lite, readFileSync(lite, "utf8") + "mine\n");
  withKeys(r, { paths: { ...ALL_KEYS.paths, risk: ["ui/"], riskLite: [] } });
  assert.match(cli(r, ["install", "--yes"]).stdout, /^kept \(no longer shipped, changed locally\): \.claude\/agents\/risk-review-lite\.md$/m);
  assert.match(readFileSync(lite, "utf8"), /mine\n$/);
});
test("uninstall takes the lite file install wrote even when paths.riskLite was emptied since", () => {
  const r = repo({ ".claude/agents/risk-review.md": RISK });
  withKeys(r, { paths: { ...ALL_KEYS.paths, risk: ["ui/"], riskLite: ["ui/"] } });
  cli(r, ["install", "--yes"]);
  withKeys(r, { paths: { ...ALL_KEYS.paths, risk: ["ui/"], riskLite: [] } });
  cli(r, ["uninstall"]);
  assert.ok(!existsSync(join(r, ".claude/agents/risk-review-lite.md")));
  assert.ok(!existsSync(join(r, ".graphifyignore")) || !/risk-review-lite/.test(readFileSync(join(r, ".graphifyignore"), "utf8")));
});
