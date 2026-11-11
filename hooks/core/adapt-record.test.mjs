import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
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
