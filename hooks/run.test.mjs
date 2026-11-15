import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync as makeTmp, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "../test-tmp.mjs";
import { join } from "node:path";
const madeTmp = [];
const mkdtempSync = (p) => { const d = makeTmp(p); madeTmp.push(d); return d; };
test.after(() => { for (const d of madeTmp) rmSync(d, { recursive: true, force: true }); });

const run = join(import.meta.dirname, "run.mjs");
const state = mkdtempSync(join(tmpdir(), "xwf-state-")); // the hooks log goes here, not into the system temp folder
const project = (config) => {
  const home = mkdtempSync(join(tmpdir(), "xwf-home-"));
  const root = join(home, "client-work", "proj");
  mkdirSync(join(root, ".xworkflows"), { recursive: true });
  if (config !== undefined) writeFileSync(join(root, ".xworkflows/config.json"), config);
  return { home, root };
};
const input = (root) => ({ session_id: "s", cwd: root, hook_event_name: "PostToolUse", tool_name: "AskUserQuestion", tool_input: { questions: [] } });
const go = (hook, root, env) => spawnSync("node", [run, "claude", hook], { input: JSON.stringify(input(root)), encoding: "utf8", env: { ...process.env, XWORKFLOWS_FREE: "", XWORKFLOWS_STATE_DIR: state, ...env } });

test("answers are not recorded: the escape on says so", () => {
  const { root } = project();
  assert.match(go("adapt-record", root, { XWORKFLOWS_FREE: "1" }).stderr, /answers are not being recorded/);
});
test("answers are not recorded: a config that does not parse says so", () => {
  const { root } = project("{");
  const r = go("adapt-record", root, {});
  assert.match(r.stderr, /answers are not being recorded/);
  assert.equal(r.stdout, "");
});
test("another hook does not talk about answers", () => {
  const { root } = project("{");
  assert.doesNotMatch(go("handback", root, {}).stderr, /answers/);
});
test("a recorded payload carries neither the home folder nor the folders between it and the project", () => {
  const { home, root } = project();
  const rec = mkdtempSync(join(tmpdir(), "xwf-rec-"));
  go("adapt-record", root, { HOME: home, XWORKFLOWS_RECORD: rec });
  const text = readFileSync(join(rec, readdirSync(rec)[0]), "utf8");
  assert.doesNotMatch(text, /client-work/);
  assert.doesNotMatch(text, new RegExp(home.replace(/[\\/]/g, "[\\\\/-]")));
  assert.match(text, /\/home\/user\/proj/);
});
const recordCommand = (cmd) => {
  const { home, root } = project();
  const rec = mkdtempSync(join(tmpdir(), "xwf-rec-"));
  const payload = { ...input(root), tool_name: "Bash", tool_input: { command: cmd(home) } };
  spawnSync("node", [run, "claude", "adapt-record"], { input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, XWORKFLOWS_FREE: "", HOME: home, XWORKFLOWS_RECORD: rec, XWORKFLOWS_STATE_DIR: state } });
  return JSON.parse(readFileSync(join(rec, readdirSync(rec)[0]), "utf8")).input.tool_input.command;
};
for (const [form, spelling] of [["~", "~"], ["$HOME", "$HOME"], ["${HOME}", "${HOME}"]]) {
  test(`a recorded command hides the folders written as ${form}`, () => {
    const c = recordCommand(() => `ls ${spelling}/client-work/proj && cat '${spelling}/client-work/proj/a'`);
    assert.doesNotMatch(c, /client-work/);
    assert.equal(c, "ls /home/user/proj && cat '/home/user/proj/a'");
  });
}
test("a recorded command keeps a path that only starts like the folders", () => {
  const c = recordCommand((h) => `cat ${h}/client-workshop/other/a.txt ${h}/client-work-old/x`);
  assert.equal(c, "cat /home/user/client-workshop/other/a.txt /home/user/client-work-old/x");
});
for (const next of ["ñ", "é", "7", "+", "@", "~", "%"]) {
  test(`a recorded command keeps a path whose name goes on with ${next}`, () => {
    const c = recordCommand((h) => `cat ${h}/client-work${next}/a`);
    assert.equal(c, `cat /home/user/client-work${next}/a`);
  });
}
const spellings = [
  ["~", () => "~/client-work", "/home/user"],
  ["$HOME", () => "$HOME/client-work", "/home/user"],
  ["${HOME}", () => "${HOME}/client-work", "/home/user"],
  ["absolute", (h) => `${h}/client-work`, "/home/user"],
  ["home", (h) => h, "/home/user"],
  ["dashed", (h) => `${h.replace(/[\\/]/g, "-")}-client-work`, "-home-user"],
];
for (const [form, write, to] of spellings) {
  for (const sep of [";", ":", ")", ",", "|", "&", ">", "\n"]) {
    test(`a recorded command hides the folder written as ${form} before ${JSON.stringify(sep)}`, () => {
      const c = recordCommand((h) => `cd ${write(h)}${sep}ls`);
      assert.equal(c, `cd ${to}${sep}ls`);
    });
  }
}

const specWrite = (root) => ({ session_id: "s", cwd: root, hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: join(root, "docs/superpowers/specs/x.md"), content: "# x" } });
const goSpec = (root) => spawnSync("node", [run, "claude", "design-first"], { input: JSON.stringify(specWrite(root)), encoding: "utf8", env: { ...process.env, XWORKFLOWS_FREE: "", XWORKFLOWS_STATE_DIR: state } });

for (const [section, value] of [["packs", '["semgrep","trivy"]'], ["tokens", "5"], ["roles", "null"]]) {
  test(`a config whose ${section} is not an object: the hook still judges, with the default, and says so once`, () => {
    const { root } = project(`{"${section}":${value}}`);
    const r = goSpec(root);
    assert.match(r.stdout, /deny/);
    assert.equal(r.stderr, `xworkflows: .xworkflows/config.json: ${section} must be an object; using its default\n`);
  });
}
test("a config that does not parse still lets the spec write through, with today's warning", () => {
  const { root } = project("{");
  const r = goSpec(root);
  assert.doesNotMatch(r.stdout, /deny/);
  assert.match(r.stderr, /design-first let the call through: .xworkflows\/config.json does not parse/);
});
test("a healthy config prints nothing to stderr", () => {
  const { root } = project('{"packs":{}}');
  const r = goSpec(root);
  assert.match(r.stdout, /deny/);
  assert.equal(r.stderr, "");
});
