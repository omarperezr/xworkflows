import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = join(import.meta.dirname, "run.mjs");
const project = (config) => {
  const home = mkdtempSync(join(tmpdir(), "xwf-home-"));
  const root = join(home, "client-work", "proj");
  mkdirSync(join(root, ".xworkflows"), { recursive: true });
  if (config !== undefined) writeFileSync(join(root, ".xworkflows/config.json"), config);
  return { home, root };
};
const input = (root) => ({ session_id: "s", cwd: root, hook_event_name: "PostToolUse", tool_name: "AskUserQuestion", tool_input: { questions: [] } });
const go = (hook, root, env) => spawnSync("node", [run, "claude", hook], { input: JSON.stringify(input(root)), encoding: "utf8", env: { ...process.env, XWORKFLOWS_FREE: "", ...env } });

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
