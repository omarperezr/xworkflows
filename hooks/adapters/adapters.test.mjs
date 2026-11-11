import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

const run = join(import.meta.dirname, "..", "run.mjs");
const fixtures = join(import.meta.dirname, "..", "fixtures");
const tools = {
  claude: { denied: (o) => JSON.parse(o).hookSpecificOutput.permissionDecision === "deny", allow: "" },
  codex: { denied: (o) => JSON.parse(o).hookSpecificOutput.permissionDecision === "deny", allow: "" },
  cursor: { denied: (o) => JSON.parse(o).permission === "deny", allow: '{"permission":"allow"}' },
  gemini: { denied: (o) => JSON.parse(o).decision === "deny", allow: "{}" },
};
const load = (tool, name) => existsSync(join(fixtures, tool, name + ".json")) ? JSON.parse(readFileSync(join(fixtures, tool, name + ".json"), "utf8")) : null;
const sessionKey = (tool) => (tool === "cursor" ? "conversation_id" : "session_id");

function spawn(tool, stdin, extra = {}) {
  const env = { ...process.env, ...extra };
  for (const k of ["CLAUDE_PROJECT_DIR", "XWORKFLOWS_FREE", "XWORKFLOWS_RECORD"]) if (!(k in extra)) delete env[k];
  const r = spawnSync("node", [run, tool, "design-first"], { input: typeof stdin === "string" ? stdin : JSON.stringify(stdin), env, encoding: "utf8" });
  return { stdout: r.stdout, stderr: r.stderr, exitCode: r.status };
}

for (const tool of readdirSync(fixtures)) {
  const t = tools[tool];
  const [write, shell, after] = ["write-spec", "shell-mark", "write-spec-after"].map((n) => load(tool, n));
  const state = () => ({ XWORKFLOWS_STATE_DIR: mkdtempSync(join(tmpdir(), "xwf-test-")) });

  test(`${tool}: deny, mark, allow`, () => {
    const env = state();
    const replay = (f, r) => { if (f.output) assert.deepEqual({ stdout: r.stdout, exitCode: r.exitCode }, f.output); };
    const r1 = spawn(tool, write.input, env);
    assert.ok(t.denied(r1.stdout));
    assert.match(r1.stdout, /grill/);
    replay(write, r1);
    const r2 = spawn(tool, shell.input, env);
    assert.equal(r2.stdout, t.allow);
    assert.ok(readdirSync(env.XWORKFLOWS_STATE_DIR).some((f) => f.startsWith("xwf-mark-grill-")));
    replay(shell, r2);
    const r3 = spawn(tool, (after ?? write).input, env);
    assert.equal(r3.stdout, t.allow);
    if (after) replay(after, r3);
  });

  test(`${tool}: a mark from another session does not count`, () => {
    const env = state();
    spawn(tool, shell.input, env);
    const other = { ...write.input, [sessionKey(tool)]: "another-session" };
    assert.ok(t.denied(spawn(tool, other, env).stdout));
  });

  test(`${tool}: broken input lets the call through`, () => {
    const r = spawn(tool, "not json", state());
    assert.equal(r.stdout, t.allow);
    assert.equal(r.exitCode, 0);
    assert.match(r.stderr, /xworkflows/);
  });

  test(`${tool}: XWORKFLOWS_FREE lets the call through and says so`, () => {
    const r = spawn(tool, write.input, { ...state(), XWORKFLOWS_FREE: "1" });
    assert.equal(r.stdout, t.allow);
    assert.match(r.stderr, /XWORKFLOWS_FREE/);
  });

  test(`${tool}: labels`, () => {
    for (const f of [write, shell, after].filter(Boolean)) {
      assert.ok(["recorded", "documented", "not confirmed"].includes(f.label));
      if (f.label !== "recorded") assert.match(f.source, /^https:\/\//), assert.ok(f.read);
    }
  });

  test(`${tool}: no private path`, () => {
    for (const n of readdirSync(join(fixtures, tool))) {
      const text = readFileSync(join(fixtures, tool, n), "utf8");
      for (const bad of ["/Users/", "-Users-", homedir()]) assert.ok(!text.includes(bad), `${n} has ${bad}`);
    }
  });
}

test("recording replaces the home folder", () => {
  const rec = mkdtempSync(join(tmpdir(), "xwf-rec-"));
  const input = { session_id: "s1", cwd: "/home/fakeuser/proj", transcript_path: "/home/fakeuser/.claude/projects/-home-fakeuser-proj/s.jsonl",
    tool_name: "Write", tool_input: { file_path: "/home/fakeuser/proj/a.txt", content: "x" } };
  spawn("claude", input, { HOME: "/home/fakeuser", XWORKFLOWS_RECORD: rec, XWORKFLOWS_STATE_DIR: mkdtempSync(join(tmpdir(), "xwf-test-")) });
  const files = readdirSync(rec);
  assert.equal(files.length, 1);
  const text = readFileSync(join(rec, files[0]), "utf8");
  assert.ok(!text.includes("/home/fakeuser") && !text.includes("-home-fakeuser"));
  const j = JSON.parse(text);
  assert.equal(j.label, "recorded");
  assert.ok(j.input && j.output);
});

test("recorder drops cursor user_email", () => {
  const rec = mkdtempSync(join(tmpdir(), "xwf-rec-"));
  const input = { conversation_id: "c1", cwd: "/project", user_email: "someone@example.com", tool_name: "Read", tool_input: {} };
  spawn("cursor", input, { XWORKFLOWS_RECORD: rec, XWORKFLOWS_STATE_DIR: mkdtempSync(join(tmpdir(), "xwf-test-")) });
  const files = readdirSync(rec);
  assert.equal(files.length, 1);
  assert.ok(!readFileSync(join(rec, files[0]), "utf8").includes("someone@example.com"));
});
