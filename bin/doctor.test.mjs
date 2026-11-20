import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { repo, git, cli, readJson, writeJson, adaptOf, ALL_KEYS, tmp, tools, COVERS, GOOD, EMPTY_HOME, doctor, withConfig, outside, files, top, FIX, lineOf, doLine, lines, ENDS } from "./shared.test.mjs";
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
  ["file made a link with no target", (r) => { cli(r, ["install"]); rmSync(join(r, ".xworkflows/hooks/run.mjs")); symlinkSync("nowhere", join(r, ".xworkflows/hooks/run.mjs")); }, {}, `fail missing or unreadable: .xworkflows/hooks/run.mjs: delete .xworkflows/hooks/run.mjs, then ${FIX}`],
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
  ["pre-push changed", (r) => { cli(r, ["install"]); writeFileSync(join(r, ".git/hooks/pre-push"), "#!/bin/sh\necho hi\n"); }, {}, /^fail pre-push hook does not run the check: add this line to \S+\/\.git\/hooks\/pre-push as its first command: if \[ -f .+ # xworkflows$/],
  ["pre-push declined", (r) => cli(r, ["install"]), {}, /^fail pre-push hook does not run the check: its line or its chain was declined at install; to be asked again, take the entry of \.git\/hooks\/pre-push out of "declined" in \.xworkflows\/installed\.json, then run xworkflows install and answer yes; or add this line to \S+\/\.git\/hooks\/pre-push as its first command: if \[ -f .+ # xworkflows$/, { ".git/hooks/pre-push": "#!/bin/sh\nexit 0\n" }],
  ["pre-push missing", (r) => { cli(r, ["install"]); rmSync(join(r, ".git/hooks/pre-push")); }, {}, `fail pre-push hook is missing or not ours: ${FIX}`],
  ["session-start over", (r) => { cli(r, ["install"]); withConfig(r, { tokens: { sessionStartBytes: 10 } }); }, () => { const home = tmp("xwf-home-"); mkdirSync(join(home, ".xworkflows")); writeFileSync(join(home, ".xworkflows/owner.md"), "Replies: short and direct.\n"); return { HOME: home }; }, /^fail session-start text: \d+ bytes of 10: raise tokens\.sessionStartBytes in \.xworkflows\/config\.json or cut what the hook prints$/],
  ["attribution", (r) => { cli(r, ["install"]); settingsEdit(r, (s) => { s.attribution = { commit: "Co-Authored-By: someone", pr: "" }; }); }, {}, 'warn attribution in .claude/settings.json shows an AI line: set "attribution" to {"commit": "", "pr": ""} there'],
  ["autoMemoryDirectory unset", (r) => { cli(r, ["install"]); rmSync(join(r, ".claude/settings.local.json")); }, {}, (r) => `warn autoMemoryDirectory is not set in .claude/settings.local.json: add "autoMemoryDirectory": "${join(top(r), "docs/memory")}" to it`],
  ["autoMemoryDirectory elsewhere", (r) => { cli(r, ["install"]); writeJson(r, ".claude/settings.local.json", { autoMemoryDirectory: "/elsewhere/memory" }); }, {}, (r) => `warn autoMemoryDirectory is not the memory folder docs/memory: set it to "${join(top(r), "docs/memory")}" in .claude/settings.local.json`],
  ["pack tool missing", (r) => { cli(r, ["install"]); withConfig(r, { packs: { semgrep: { configs: ["auto"] } } }); }, {}, 'fail pack semgrep: semgrep command is missing: install semgrep, or take "semgrep" out of packs in .xworkflows/config.json'],
  ["pack tool at another version", (r) => { cli(r, ["install"]); withConfig(r, { packs: { semgrep: { configs: ["auto"] } } }); }, () => ({ PATH: tools({ qmd: COVERS, semgrep: "echo 1.0.0" }) }), "warn pack semgrep: version 1.0.0, tested with 1.179.0: install semgrep 1.179.0"],
];


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
test("doctor goes on when a recorded file cannot be read for a reason other than a missing path", { skip: process.getuid?.() === 0 && "root reads a file of mode 000" }, () => {
  const r = repo(); cli(r, ["install", "--yes"]);
  const dir = join(r, ".claude/skills/tdd");
  chmodSync(dir, 0o000);
  let out;
  try { out = doctor(r); } finally { chmodSync(dir, 0o755); }
  assert.doesNotMatch(out.stdout, /doctor stopped/);
  assert.match(out.stdout, /missing or unreadable: \.claude\/skills\/tdd\/SKILL\.md: delete .*, then /);
  assert.match(out.stdout, /installed\.json parses/);
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
test("doctor does not count the hand-off in the session-start bytes and warns on one over the cap", () => {
  const r = repo(); cli(r, ["install"]);
  git(r, "-c user.name=t -c user.email=t@t commit --allow-empty -m c");
  const base = doctor(r, { HOME: EMPTY_HOME }).stdout.match(/session-start text: (\d+) bytes/)[1];
  writeFileSync(join(r, ".xworkflows/handoff.md"), `main: ${git(r, "rev-parse main")}\nNext: x\n`);
  const hook = readJson(r, ".claude/settings.json").hooks.SessionStart.flatMap((e) => e.hooks).find((h) => `${h.command} `.includes(" claude handoff-load "));
  const fired = spawnSync("sh", ["-c", hook.command], { cwd: r, encoding: "utf8", input: JSON.stringify({ session_id: "s", cwd: r, hook_event_name: "SessionStart", source: "startup" }) });
  assert.match(fired.stdout, /Next: x/); // the hook really prints it, so the measure has something to leave out
  const out = doctor(r, { HOME: EMPTY_HOME }).stdout;
  assert.match(out, new RegExp(`^ok +session-start text: ${base} bytes of 2000$`, "m"));
  assert.doesNotMatch(out, /^warn .*handoff/m);
  const over = (sha) => writeFileSync(join(r, ".xworkflows/handoff.md"), `main: ${sha}\n${"x".repeat(1500)}`);
  over("b".repeat(40)); // stale: silent at any size
  assert.doesNotMatch(doctor(r, { HOME: EMPTY_HOME }).stdout, /^warn .*handoff/m);
  over(git(r, "rev-parse main"));
  assert.match(doctor(r, { HOME: EMPTY_HOME }).stdout, /^warn \.xworkflows\/handoff\.md was not loaded: /m);
  git(r, "checkout -q -b topic");
  git(r, "-c user.name=t -c user.email=t@t commit --allow-empty -m ahead");
  assert.doesNotMatch(doctor(r, { HOME: EMPTY_HOME }).stdout, /^warn .*handoff/m); // HEAD ahead of main: not loaded at any size, so no warning
});
test("doctor and the hand-off hook agree on a config with one bad section and another main branch", () => {
  const r = repo(); cli(r, ["install"]);
  git(r, "-c user.name=t -c user.email=t@t commit --allow-empty -m c");
  git(r, "branch -m trunk");
  withConfig(r, { memory: 5, mainBranch: "trunk", tokens: { handoffBytes: 100 } });
  writeFileSync(join(r, ".xworkflows/handoff.md"), `main: ${git(r, "rev-parse trunk")}\n${"x".repeat(200)}`);
  assert.match(doctor(r, { HOME: EMPTY_HOME }).stdout, /^warn \.xworkflows\/handoff\.md was not loaded: /m);
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

test("doctor: a CLAUDE.md that is a link to AGENTS.md is right", () => {
  const r = repo(); cli(r, ["install"]);
  rmSync(join(r, "CLAUDE.md")); symlinkSync("AGENTS.md", join(r, "CLAUDE.md"));
  const out = doctor(r);
  assert.match(out.stdout, /^ok +CLAUDE\.md imports AGENTS\.md$/m);
  assert.doesNotMatch(out.stdout, /does not import/);
  assert.equal(out.status, 0, out.stdout);
});
for (const [name, setup, env, want, files] of DOCTOR_LINES) test(`doctor line: ${name}`, () => {
  const r = repo(files ?? {});
  setup(r);
  const out = doctor(r, typeof env === "function" ? env() : env);
  if (name === "file kept") return assert.ok(lineOf(out, /^warn kept theirs: \.claude\/agents\/explore\.md/)?.endsWith(`; to use the package's copy, delete .claude/agents/explore.md, take it out of "kept" in .xworkflows/installed.json and ${FIX}`), out.stdout);
  const w = typeof want === "function" ? want(r) : want;
  assert.ok(out.stdout.split("\n").some((l) => (w instanceof RegExp ? w.test(l) : l === w)), `${w}\n${out.stdout}`);
});

// P-164: install cannot write over a folder or a file it cannot read, so each line for one says to delete it first
test("doctor: a file of the record made a folder gets lines that say to delete it, then install", () => {
  const r = repo(); cli(r, ["install"]);
  const f = join(r, ".xworkflows/git/pre-push"); rmSync(f); mkdirSync(f);
  const out = doctor(r);
  const lines = out.stdout.split("\n").filter((l) => l.startsWith("fail") && l.includes(".xworkflows/git/pre-push"));
  assert.ok(lines.length, out.stdout);
  for (const l of lines) assert.match(l, /: delete \.xworkflows\/git\/pre-push, then run xworkflows install$/, l);
  doLine(r, lines[0]);
  assert.equal(doctor(r).status, 0);
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
// P-128: a folder outside is refused by the hooks even when memory.outside lists it: doctor names only the way out they accept
test("doctor: a memory.dir outside the repository, existing or not, listed or not, gives one fail line that says to name a folder inside it, and doing so makes it go", () => {
  const o = tmp("xwf-out-"), r = repo(); cli(r, ["install", "--yes"]);
  const ours = (extra = {}) => doctor(r, { PATH: GOOD, ...extra });
  for (const dir of [o, join(o, "not-there"), relative(r, o)]) for (const outside of [[], [o, realpathSync(o)]]) {
    withConfig(r, { memory: { dir, outside } });
    const out = ours();
    const bad = out.stdout.split("\n").filter((l) => /memory\.dir|memory folder|autoMemoryDirectory|qmd collection|qmd trust/.test(l));
    assert.deepEqual(bad, [`fail memory.dir ${JSON.stringify(dir)} must be a folder inside the repository: set memory.dir in .xworkflows/config.json to a folder inside the repository, then run xworkflows install`], out.stdout);
    assert.doesNotMatch(out.stdout, /memory\.outside/);
  }
  withConfig(r, { memory: { dir: "docs/memory" } });
  assert.equal(cli(r, ["install", "--yes"], { env: { PATH: GOOD, HOME: EMPTY_HOME } }).status, 0);
  assert.doesNotMatch(ours().stdout, /memory\.dir|no qmd collection covers|no memory folder yet|autoMemoryDirectory/);
});

// P-116 (b): the first word of lookup.index.command reaches a shell only quoted
test("doctor: a lookup.index.command whose first word holds ; and a second command runs nothing", () => {
  const r = repo(); cli(r, ["install"]);
  withConfig(r, { paths: { ...ALL_KEYS.paths, code: ["src/"] }, lookup: { index: { command: "mytool;touch${IFS}PWNED query", folder: "idx-out" } } });
  const out = doctor(r, { PATH: tools({ qmd: "exit 0" }) });
  assert.ok(!existsSync(join(r, "PWNED")), "the second command ran");
  assert.match(out.stdout, /^fail mytool;touch\$\{IFS\}PWNED command is missing$/m);
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

test("doctor: a memory.dir that is not text gives one fail line naming the key and its fix, and doctor goes on", () => {
  const r = repo(); cli(r, ["install"]);
  for (const dir of [5, null, ["docs/memory"]]) {
    withConfig(r, { memory: { dir } });
    const out = doctor(r, { PATH: tools({ qmd: COVERS }) });
    assert.equal(out.stderr, "", JSON.stringify(dir));
    assert.equal(out.stdout.split("\n").filter((l) => /^fail memory\.dir must be text: .*\.xworkflows\/config\.json/.test(l)).length, 1, out.stdout);
    assert.match(out.stdout, /^ok +qmd collection covers docs\/memory$/m);
    assert.match(out.stdout, /^doctor: \d+ fail/m);
  }
});
// P-131: the loader names the section; doctor's line for the config gives the fix, and the last catch is not reached
test("doctor: a config section that is not an object, or a config file holding null, gives a line naming the file, the section and the fix, and doctor ends with its count", () => {
  const r = repo(); cli(r, ["install"]);
  const section = (k) => `fail config: .xworkflows/config.json: ${k} must be an object: make it an object, or take it out of .xworkflows/config.json`;
  for (const [text, line] of [['{"memory":null}', section("memory")], ['{"paths":null}', section("paths")], ['{"tokens":5}', section("tokens")], ['{"packs":[]}', section("packs")], ['{"tests":"x"}', section("tests")],
    ["null", "fail config: .xworkflows/config.json does not parse: not a JSON object: fix the JSON of .xworkflows/config.json"]]) {
    writeFileSync(join(r, ".xworkflows/config.json"), text);
    const out = doctor(r);
    assert.equal(out.stderr, "", text);
    assert.equal(out.status, 1, text);
    assert.ok(out.stdout.split("\n").includes(line), out.stdout);
    assert.doesNotMatch(out.stdout, /doctor stopped/, text);
    assert.match(out.stdout, ENDS, text);
  }
});
// P-133: a value one level down whose default is an object stops the checks that read it: doctor names it and does not say 0 fail
test("doctor: a value one level down in a section that is not an object gives a line naming it and the fix", () => {
  const r = repo(); cli(r, ["install"]);
  for (const [c, k] of [[{ lookup: { index: null } }, "lookup.index"], [{ brakes: { fixHasTest: 5 } }, "brakes.fixHasTest"]]) {
    withConfig(r, c);
    const out = doctor(r);
    assert.equal(out.status, 1, out.stdout);
    assert.ok(out.stdout.split("\n").includes(`fail config: .xworkflows/config.json: ${k} must be an object: make it an object, or take it out of .xworkflows/config.json`), out.stdout);
  }
});
test("doctor: for a config that does not parse, the probe's fail line names the fix of the config", () => {
  const r = repo(); cli(r, ["install"]);
  for (const text of ["{", "null"]) {
    writeFileSync(join(r, ".xworkflows/config.json"), text);
    const out = doctor(r);
    assert.ok(out.stdout.split("\n").includes("fail probe: expected deny, got no valid output: fix the JSON of .xworkflows/config.json"), `${text}\n${out.stdout}`);
    assert.doesNotMatch(out.stdout, /changed locally/, text);
  }
});
test("doctor: an installed folder made a file gives its line and doctor does not stop", () => {
  const r = repo(), d = join(r, ".claude/skills/tdd");
  cli(r, ["install"]); rmSync(d, { recursive: true }); writeFileSync(d, "x\n");
  const o = doctor(r);
  assert.ok(!/\n\s+at /.test(o.stdout + o.stderr), o.stderr);
  assert.doesNotMatch(o.stdout, /^fail doctor stopped/m);
  assert.match(o.stdout, /^fail missing or unreadable: \.claude\/skills\/tdd\/SKILL\.md: .*$/m);
  assert.equal(o.status, 1);
  assert.equal(readFileSync(d, "utf8"), "x\n");
  rmSync(r, { recursive: true, force: true });
});
test("doctor: warns with qmd pull when qmd's models are not in its cache; says nothing when they are", () => {
  const r = repo(); cli(r, ["install"]);
  const env = { PATH: tools({ qmd: COVERS }) };
  const cache = join(tmp("xwf-models-"), "qmd/models"); mkdirSync(cache, { recursive: true });
  const miss = doctor(r, { ...env, XDG_CACHE_HOME: join(cache, "../..") });
  assert.match(miss.stdout, /^warn qmd models are missing from .*models: run qmd pull$/m);
  assert.equal(miss.status, 0, miss.stdout);
  for (const f of ["embeddinggemma-300M-Q8_0", "qwen3-reranker-0.6b-q8_0", "qmd-query-expansion-1.7B-q4_k_m"]) writeFileSync(join(cache, `hf_x_${f}.gguf`), "");
  assert.doesNotMatch(doctor(r, { ...env, XDG_CACHE_HOME: join(cache, "../..") }).stdout, /models/);
});
