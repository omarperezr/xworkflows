import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decide } from "./adapt-record.mjs";
import { normalize } from "../adapters/claude.mjs";

const raw = JSON.parse(readFileSync(join(import.meta.dirname, "..", "fixtures/claude/ask-post-real.json"), "utf8")).input;
const setup = (run) => {
  const root = mkdtempSync(join(tmpdir(), "xwf-rec-"));
  mkdirSync(join(root, ".xworkflows"));
  if (run) writeFileSync(join(root, ".xworkflows/adapt-run.json"), JSON.stringify({ run, startedAt: Date.now() }));
  const ev = { ...normalize(raw, { CLAUDE_PROJECT_DIR: root }) };
  return { root, ev, ctx: { readFile: (p) => (existsSync(p) ? readFileSync(p, "utf8") : null) } };
};
const log = (root) => join(root, ".xworkflows/interview.log.jsonl");

test("one log line per question, matched by header", () => {
  const { root, ev, ctx } = setup("run-7");
  assert.equal(ev.event, "postTool");
  assert.equal(decide(ev, ctx).decision, "allow");
  const lines = readFileSync(log(root), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(lines, [
    { run: "run-7", id: "T0-q", question: "Is this a test?", options: ["Yes", "No"], answer: "Yes" },
    { run: "run-7", id: "T0-r", question: "Say something.", options: ["A", "B"], answer: "typed answer" },
  ]);
});
test("nothing written without the run file", () => {
  const { root, ev, ctx } = setup(null);
  assert.equal(decide(ev, ctx).decision, "allow");
  assert.ok(!existsSync(log(root)));
});
test("a stale run file records nothing", () => {
  const { root, ev, ctx } = setup("run-7");
  writeFileSync(join(root, ".xworkflows/adapt-run.json"), JSON.stringify({ run: "run-7", startedAt: Date.now() - 13 * 3600e3 }));
  decide(ev, ctx);
  assert.ok(!existsSync(log(root)));
});
const quiet = (f) => { const w = process.stderr.write; let t = ""; process.stderr.write = (x) => ((t += x), true); try { f(); } finally { process.stderr.write = w; } return t; };
test("an expired run says so and how to start again", () => {
  const { root, ev, ctx } = setup("run-7");
  writeFileSync(join(root, ".xworkflows/adapt-run.json"), JSON.stringify({ run: "run-7", startedAt: Date.now() - 13 * 3600e3 }));
  const t = quiet(() => decide(ev, { ...ctx, skillName: () => "adapt" }));
  assert.match(t, /expired.*research\.mjs start/);
  assert.ok(!existsSync(log(root)));
});
test("a run with no file says nothing", () => {
  const { ev, ctx } = setup(null);
  assert.equal(quiet(() => decide(ev, ctx)), "");
});
test("a start time in the future records nothing", () => {
  const { root, ev, ctx } = setup("run-7");
  writeFileSync(join(root, ".xworkflows/adapt-run.json"), JSON.stringify({ run: "run-7", startedAt: Date.now() + 3600e3 }));
  decide(ev, ctx);
  assert.ok(!existsSync(log(root)));
});
test("a log that is a link is not appended to", () => {
  const { root, ev, ctx } = setup("run-7");
  const target = join(root, "elsewhere.txt");
  writeFileSync(target, "keep\n");
  symlinkSync(target, log(root));
  decide(ev, ctx);
  assert.equal(readFileSync(target, "utf8"), "keep\n");
});
test("a .xworkflows folder that is a link is not written through", () => {
  const { root, ev, ctx } = setup("run-7");
  const real = join(root, "real");
  renameSync(join(root, ".xworkflows"), real);
  symlinkSync(real, join(root, ".xworkflows"));
  decide(ev, ctx);
  assert.ok(!existsSync(join(real, "interview.log.jsonl")));
});
