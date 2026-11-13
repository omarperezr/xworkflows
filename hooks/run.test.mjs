import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync as makeTmp, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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
