import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "../test-tmp.mjs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { measure, price, readSessions } from "./measure.mjs";

const made = [];
after(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "measure-")); made.push(d); return d; };
const git = (cwd, date, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
const msg = (id, model, ts, usage) => JSON.stringify({ timestamp: ts, gitBranch: "b", message: { id, model, usage } });
const use = (o = {}) => ({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 }, ...o });

// batch 1 (b1): feat, fix x, fix y (repairs fix x); merged 11-01 12:00. batch 2 (b2): fix z (changes a line of the feat commit); merged 11-02 12:00.
function project() {
  const d = tmp();
  const day = (n, h) => `2026-11-0${n}T${h}:00:00Z`;
  git(d, day(1, "08"), "init", "-q", "-b", "main");
  git(d, day(1, "08"), "config", "user.email", "t@example.com");
  git(d, day(1, "08"), "config", "user.name", "t");
  const edit = (date, text, subject) => { writeFileSync(join(d, "f.txt"), text); git(d, date, "add", "f.txt"); git(d, date, "commit", "-q", "-m", subject); };
  edit(day(1, "07"), "base\n", "chore: base");
  git(d, day(1, "08"), "checkout", "-q", "-b", "b1");
  edit(day(1, "09"), "one\ntwo\n", "feat: a");
  edit(day(1, "10"), "one\ntwo2\n", "fix: x");
  edit(day(1, "11"), "one\ntwo3\n", "fix: y");
  git(d, day(1, "12"), "checkout", "-q", "main");
  git(d, day(1, "12"), "merge", "-q", "--no-ff", "b1", "-m", "Merge branch 'b1'");
  git(d, day(2, "08"), "checkout", "-q", "-b", "b2");
  edit(day(2, "10"), "uno\ntwo3\n", "fix: z");
  git(d, day(2, "12"), "checkout", "-q", "main");
  git(d, day(2, "12"), "merge", "-q", "--no-ff", "b2", "-m", "Merge branch 'b2'");
  return d;
}
function sessions() {
  const s = tmp();
  writeFileSync(join(s, "main.jsonl"), [
    msg("m1", "claude-sonnet-5-5", "2026-11-01T10:00:00Z", use({ input_tokens: 1e6 })),
    msg("m1", "claude-sonnet-5-5", "2026-11-01T10:00:01Z", use({ input_tokens: 1e6 })), // the same message again
    "not json",
    JSON.stringify({ timestamp: "2026-11-01T10:30:00Z", message: { model: "claude-sonnet-5-5", usage: use() } }), // no id
    msg("m2", "claude-mystery-1", "2026-11-02T10:00:00Z", use({ output_tokens: 5 })),
    msg("m3", "claude-opus-5-5", "2026-11-01T13:00:00Z", use({ output_tokens: 1e6 })), // after merge 1: batch 2
  ].join("\n") + "\n");
  mkdirSync(join(s, "main", "subagents"), { recursive: true });
  writeFileSync(join(s, "main", "subagents", "a1.jsonl"), msg("s1", "claude-haiku-5-5", "2026-11-01T09:30:00Z", use({ output_tokens: 1e6 })) + "\n");
  writeFileSync(join(s, "main", "subagents", "a1.meta.json"), JSON.stringify({ agentType: "risk-review", model: "claude-haiku-5-5" }));
  writeFileSync(join(s, "main", "subagents", "a2.jsonl"), msg("s2", "claude-haiku-5-5", "2026-11-02T09:30:00Z", use()) + "\n");
  writeFileSync(join(s, "main", "subagents", "a2.meta.json"), JSON.stringify({ agentType: "review" }));
  return s;
}
const run = (project, s, out, state, ...more) => {
  const lines = [];
  const code = measure(["--project", project, "--sessions", s, "--out", out, ...more], { env: { XWORKFLOWS_STATE_DIR: state }, log: (l) => lines.push(l), err: (l) => lines.push(l) });
  return { code, lines };
};
const rows = (out, project) => readFileSync(join(out, project.split("/").pop() + ".jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const hookLog = (state, ...lines) => writeFileSync(join(state, "xwf-hooks.log"), lines.join("\n") + "\n");

test("a message id seen twice counts once, a non-JSON line and a message with no id are skipped", () => {
  const { records } = readSessions(sessions());
  assert.equal(records.filter((r) => r.id === "m1").length, 1);
  assert.equal(records.length, 5);
});

test("cache writes of 5 minutes and of 1 hour are priced apart, an unknown model has no price", () => {
  const u = (w5, w1) => use({ cache_creation: { ephemeral_5m_input_tokens: w5, ephemeral_1h_input_tokens: w1 } });
  assert.equal(price("claude-sonnet-5-5", u(1e6, 0)), 2.5);
  assert.equal(price("claude-sonnet-5-5", u(0, 1e6)), 4);
  assert.equal(price("claude-fable-5-2", use({ input_tokens: 1e6, output_tokens: 1e6, cache_read_input_tokens: 1e6 })), 48.2);
  assert.equal(price("claude-mystery-1", use()), null);
});

test("a window runs from the merge before to its own merge, with roles, review rounds and unpriced models", () => {
  const [p, s, out, state] = [project(), sessions(), join(tmp(), "out"), tmp()];
  const { code } = run(p, s, out, state);
  assert.equal(code, 0);
  const [r1, r2] = rows(out, p);
  assert.equal(r1.branch, "b1");
  assert.equal(r1.usd, 2.5); // m1 once: 1M sonnet input = 2; haiku 1M output = 0.5
  assert.deepEqual(Object.keys(r1.byAgent).sort(), ["main", "risk-review"]);
  assert.equal(r1.riskReviewRuns, 1);
  assert.equal(r1.reviewRounds, 1);
  assert.equal(r2.usd, 20); // opus 1M output, 13:00 on day 1 belongs to batch 2
  assert.equal(r2.reviewRounds, 1);
  assert.equal(r2.riskReviewRuns, 0);
  assert.deepEqual(r2.notes, ["unpriced: claude-mystery-1"]);
  assert.equal(r2.byModel["claude-mystery-1"].usd, null);
});

test("a fix that repairs a fix of the same batch is counted, one that repairs an earlier batch is a failure after the seal against it", () => {
  const [p, s, out, state] = [project(), sessions(), join(tmp(), "out"), tmp()];
  run(p, s, out, state);
  const [r1, r2] = rows(out, p);
  assert.equal(r1.fixCommits, 2);
  assert.equal(r1.fixOfFix, 1);
  assert.equal(r2.fixOfFix, 0);
  assert.equal(r1.failuresAfterSeal.length, 1);
  assert.equal(r1.failuresAfterSeal[0].fixBatch, "b2");
  assert.equal(r1.failuresAfterSeal[0].fix, git(p, "2026-11-03T00:00:00Z", "rev-parse", "b2").trim());
  assert.equal(r2.failuresAfterSeal.length, 0);
  assert.equal(r1.changedLines > 0, true);
});

test("a denial judged false is counted, a second run writes the same file, a missing log is said", () => {
  const [p, s, out, state] = [project(), sessions(), join(tmp(), "out"), tmp()];
  run(p, s, out, state);
  assert.equal(rows(out, p)[0].denials, "log missing");
  hookLog(state, "2026-11-01T10:15:00.000Z sess pre deny no writes", "2026-11-01T10:16:00.000Z sess pre free x", "2026-11-02T10:15:00.000Z sess pre deny other");
  assert.equal(run(p, s, out, state, "--false", "2026-11-01T10:15:00.000Z", "wrong").code, 0);
  run(p, s, out, state);
  const first = readFileSync(join(out, p.split("/").pop() + ".jsonl"), "utf8");
  const [r1, r2] = first.trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual([r1.denials, r1.falseDenials, r2.denials, r2.falseDenials], [1, 1, 1, 0]);
  run(p, s, out, state);
  assert.equal(readFileSync(join(out, p.split("/").pop() + ".jsonl"), "utf8"), first);
  run(p, s, out, state, "--false", "2026-11-01T10:15:00.000Z", "wrong");
  assert.equal(readFileSync(join(out, "judged.jsonl"), "utf8").trim().split("\n").length, 1);
});

test("a number worse than the baseline median prints its line, a number not worse does not", () => {
  const [p, s, out, state] = [project(), sessions(), join(tmp(), "out"), tmp()];
  mkdirSync(out, { recursive: true });
  const base = { usd: 1000, changedLines: 100, fixOfFix: 0, reviewRounds: 3, failuresAfterSeal: [] };
  writeFileSync(join(out, "ref.jsonl"), [base, base, base].map((r) => JSON.stringify(r)).join("\n") + "\n");
  const lines = run(p, s, out, state, "--baseline", "/somewhere/ref").lines.join("\n");
  assert.match(lines, /b1.*fixOfFix.*1.*0/);
  assert.match(lines, /b1.*failuresAfterSeal/);
  assert.doesNotMatch(lines, /reviewRounds/);
  assert.doesNotMatch(lines, /usdPer100/);
});

test("nothing is written inside the measured project, and an --out inside it is refused", () => {
  const [p, s, state] = [project(), sessions(), tmp()];
  const before = git(p, "2026-11-03T00:00:00Z", "status", "--porcelain");
  run(p, s, join(tmp(), "out"), state);
  assert.equal(git(p, "2026-11-03T00:00:00Z", "status", "--porcelain"), before);
  assert.equal(run(p, s, join(p, "out"), state).code, 2);
  assert.equal(existsSync(join(p, "out")), false);
});
