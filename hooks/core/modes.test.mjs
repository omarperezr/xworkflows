import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decide } from "./modes.mjs";

const OWNER = join("/h", ".xworkflows", "owner.md");
const ctx = (files, extra = {}) => ({ home: "/h", readFile: (p) => files[p] ?? null, ...extra });
const start = { event: "sessionStart", source: "startup" };

test("the file's text comes back as context after the lead line", () => {
  const d = decide(start, ctx({ [OWNER]: "Prefers short answers.\n" }));
  assert.equal(d.decision, "allow");
  assert.equal(d.context, "About the owner (from ~/.xworkflows/owner.md):\nPrefers short answers.\n");
});

test("a missing file gives no context", () => {
  assert.deepEqual(decide(start, ctx({})), { decision: "allow" });
});

test("a blank file gives no context", () => {
  assert.deepEqual(decide(start, ctx({ [OWNER]: " \n\t\n" })), { decision: "allow" });
});

test("an unreadable file gives no context", () => {
  const c = ctx({}, { readFile: () => { throw new Error("EACCES"); } });
  assert.deepEqual(decide(start, c), { decision: "allow" });
});

test("another event gives no context", () => {
  for (const event of ["prompt", "preTool", "postTool", "preCompact", "sessionEnd", "unknown"])
    assert.deepEqual(decide({ event }, ctx({ [OWNER]: "x" })), { decision: "allow" });
});

test("through the runner, a SessionStart prints additionalContext", () => {
  const home = mkdtempSync(join(tmpdir(), "xwf-home-"));
  mkdirSync(join(home, ".xworkflows"));
  writeFileSync(join(home, ".xworkflows", "owner.md"), "Likes tests first.\n");
  const env = { ...process.env, HOME: home, USERPROFILE: home, XWORKFLOWS_STATE_DIR: mkdtempSync(join(tmpdir(), "xwf-test-")) };
  for (const k of ["CLAUDE_PROJECT_DIR", "XWORKFLOWS_FREE", "XWORKFLOWS_RECORD"]) delete env[k];
  const r = spawnSync("node", [join(import.meta.dirname, "..", "run.mjs"), "claude", "modes"], {
    input: JSON.stringify({ hook_event_name: "SessionStart", session_id: "s1", cwd: home, source: "startup" }),
    env, encoding: "utf8",
  });
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.match(out.additionalContext, /^About the owner \(from ~\/\.xworkflows\/owner\.md\):\nLikes tests first\./);
  assert.equal(out.hookEventName, "SessionStart");
});
