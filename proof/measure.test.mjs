import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, existsSync } from "node:fs";
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
function project(name) {
  const d = name ? join(tmp(), name) : tmp();
  if (name) mkdirSync(d);
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
  const code = measure(["--project", project, "--sessions", s, ...more], { out, env: { XWORKFLOWS_STATE_DIR: state }, log: (l) => lines.push(l), err: (l) => lines.push(l) });
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
  assert.equal(price("claude-fable-5-1", use({ input_tokens: 1e6, output_tokens: 1e6, cache_read_input_tokens: 1e6 })), 60.25);
  assert.equal(price("claude-fable-5-1", u(1e6, 1e6)), 32.5);
});

test("a window runs from the merge before to its own merge, with roles, review rounds and unpriced models", () => {
  const [p, s, out, state] = [project(), sessions(), join(tmp(), "out"), tmp()];
  const { code } = run(p, s, out, state);
  assert.equal(code, 0);
  const [r1, r2] = rows(out, p);
  assert.equal(r1.branch, "b1");
  assert.equal(r1.usd, null); // the oldest row is partial: its cost is not the whole cost
  assert.equal(r1.byModel["claude-sonnet-5-5"].usd + r1.byModel["claude-haiku-5-5"].usd, 2.5); // m1 once: 1M sonnet input = 2; haiku 1M output = 0.5
  assert.deepEqual(Object.keys(r1.byAgent).sort(), ["main", "risk-review"]);
  assert.equal(r1.riskReviewRuns, 1);
  assert.equal(r1.reviewRounds, 1);
  assert.equal(r2.byModel["claude-opus-5-5"].usd, 20); // opus 1M output, 13:00 on day 1 belongs to batch 2
  assert.equal(r2.reviewRounds, 1);
  assert.equal(r2.riskReviewRuns, 0);
  assert.deepEqual(r2.notes, ["unpriced: claude-mystery-1"]);
  assert.equal(r2.byModel["claude-mystery-1"].usd, null);
  assert.equal(r2.usd, null); // one unpriced model makes the whole row null
});

test("a review-small run counts as a review round, never as a risk review run", () => {
  const [p, s, out, state] = [project(), sessions(), join(tmp(), "out"), tmp()];
  writeFileSync(join(s, "main", "subagents", "a3.jsonl"), msg("s3", "claude-haiku-5-5", "2026-11-02T09:31:00Z", use()) + "\n");
  writeFileSync(join(s, "main", "subagents", "a3.meta.json"), JSON.stringify({ agentType: "review-small" }));
  run(p, s, out, state);
  const [, r2] = rows(out, p);
  assert.equal(r2.reviewRounds, 2);
  assert.equal(r2.riskReviewRuns, 0);
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

test("each row lists its denials, a denial judged false is counted, a second run writes the same file, a missing log is said", () => {
  const [p, s, out, state] = [project(), sessions(), join(tmp(), "out"), tmp()];
  run(p, s, out, state);
  assert.equal(rows(out, p)[0].denials, "log missing");
  hookLog(state, "2026-11-01T09:00:00.000Z main pre free first", "2026-11-02T10:15:00.000Z main pre deny no writes", "2026-11-02T10:16:00.000Z main pre free x", "2026-11-02T10:17:00.000Z elsewhere pre deny other project", "2026-11-02T10:18:00.000Z main post deny other");
  run(p, s, out, state);
  assert.equal(run(p, s, out, state, "--false", "2026-11-02T10:15:00.000Z", "wrong").code, 0);
  run(p, s, out, state);
  const first = readFileSync(join(out, p.split("/").pop() + ".jsonl"), "utf8");
  const [r1, r2] = first.trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(r1.denials, "no data"); // the first window starts before everything
  assert.deepEqual(r2.denials, [{ time: "2026-11-02T10:15:00.000Z", hook: "pre" }, { time: "2026-11-02T10:18:00.000Z", hook: "post" }]);
  assert.deepEqual([r1.falseDenials, r2.falseDenials], [0, 1]);
  run(p, s, out, state);
  assert.equal(readFileSync(join(out, p.split("/").pop() + ".jsonl"), "utf8"), first);
  run(p, s, out, state, "--false", "2026-11-02T10:15:00.000Z", "wrong");
  assert.equal(readFileSync(join(out, "judged.jsonl"), "utf8").trim().split("\n").length, 1);
});

test("--false refuses a time that is not a denial of a measured row", () => {
  const [p, s, out, state] = [project(), sessions(), join(tmp(), "out"), tmp()];
  hookLog(state, "2026-11-01T09:00:00.000Z main pre free first", "2026-11-02T10:15:00.000Z main pre deny no writes");
  run(p, s, out, state);
  const r = run(p, s, out, state, "--false", "2026-11-02T10:16:00.000Z", "wrong");
  assert.equal(r.code, 2);
  assert.equal(r.lines.length, 1);
  assert.equal(existsSync(join(out, "judged.jsonl")), false);
});

test("a window that starts before the first line of the hook log says no data, not 0", () => {
  const [p, s, out, state] = [project(), sessions(), join(tmp(), "out"), tmp()];
  hookLog(state, "2026-11-01T18:00:00.000Z main pre free first", "2026-11-02T10:15:00.000Z main pre deny no writes"); // inside window 2, which starts at 12:00 of day 1
  run(p, s, out, state);
  const [r1, r2] = rows(out, p);
  assert.equal(r1.denials, "no data");
  assert.equal(r2.denials, "no data");
  assert.equal(r2.falseDenials, 0);
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

test("baseline rows with no USD or no changed line stay out of the medians", () => {
  const [p, s, out, state] = [project(), sessions(), join(tmp(), "out"), tmp()];
  mkdirSync(out, { recursive: true });
  const good = { usd: 1000, changedLines: 100, fixOfFix: 0, reviewRounds: 3, failuresAfterSeal: [] };
  const rowsOf = [good, good, { ...good, usd: null, fixOfFix: 9 }, { ...good, usd: 0, fixOfFix: 9 }, { ...good, changedLines: 0, fixOfFix: 9 }];
  writeFileSync(join(out, "ref.jsonl"), rowsOf.map((r) => JSON.stringify(r)).join("\n") + "\n");
  assert.match(run(p, s, out, state, "--baseline", "/somewhere/ref").lines.join("\n"), /b1: fixOfFix 1 is worse than the baseline median 0/);
});

test("the oldest row whose window starts before the first saved session is marked partial", () => {
  const [p, s, out, state] = [project(), sessions(), join(tmp(), "out"), tmp()];
  run(p, s, out, state);
  assert.deepEqual(rows(out, p).map((r) => r.partial), [true, false]);
});

test("a message with no timestamp or a usage with a missing field stops the tool with one line", () => {
  for (const o of [{ message: { id: "x", model: "m", usage: use() } }, { timestamp: "2026-11-01T10:00:00Z", message: { id: "x", model: "m", usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 5 } } }]) {
    const [p, out, state] = [project(), join(tmp(), "out"), tmp()];
    const s = tmp();
    writeFileSync(join(s, "main.jsonl"), JSON.stringify(o) + "\n");
    const r = run(p, s, out, state);
    assert.equal(r.code, 2);
    assert.equal(r.lines.length, 1);
    assert.equal(existsSync(out), false);
  }
});

test("the session folder name replaces every character that is not a letter or a digit, as Claude Code does", () => {
  const p = project("my_proj.v2");
  const home = tmp();
  const folder = join(home, ".claude", "projects", p.replace(/[^a-zA-Z0-9]/g, "-"));
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "main.jsonl"), msg("m1", "claude-sonnet-5-5", "2026-11-01T10:00:00Z", use({ input_tokens: 1e6 })) + "\n");
  const [out, lines] = [join(tmp(), "out"), []];
  const code = measure(["--project", p], { out, env: { XWORKFLOWS_STATE_DIR: tmp() }, home, log: (l) => lines.push(l), err: (l) => lines.push(l) });
  assert.equal(code, 0, lines.join("\n"));
});

test("the main branch comes from the lenient config: a config that does not parse stops the tool, a trunk is read", () => {
  const p = project();
  mkdirSync(join(p, ".xworkflows"));
  const [s, out, state] = [sessions(), join(tmp(), "out"), tmp()];
  writeFileSync(join(p, ".xworkflows", "config.json"), "{");
  assert.equal(run(p, s, out, state).code, 2);
  git(p, "2026-11-03T00:00:00Z", "branch", "-m", "main", "trunk");
  writeFileSync(join(p, ".xworkflows", "config.json"), JSON.stringify({ mainBranch: "trunk", paths: 3 }));
  assert.equal(run(p, s, out, state).code, 0);
  assert.equal(rows(out, p).length, 2);
});

test("no record list is spread into Math.min: 150000 records in a main file and in an agent file", () => {
  const [p, state, out] = [project(), tmp(), join(tmp(), "out")];
  const s = tmp();
  const line = (i) => `{"timestamp":"2026-11-01T10:00:00Z","message":{"id":"m${i}","model":"x","usage":{"input_tokens":0,"output_tokens":0,"cache_read_input_tokens":0,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":0}}}}`;
  const body = (pre) => Array.from({ length: 150000 }, (_, i) => line(pre + i)).join("\n") + "\n";
  writeFileSync(join(s, "main.jsonl"), body("a"));
  mkdirSync(join(s, "main", "subagents"), { recursive: true });
  writeFileSync(join(s, "main", "subagents", "a.jsonl"), body("b"));
  const r = run(p, s, out, state);
  assert.equal(r.code, 0, r.lines.join("\n"));
});

test("nothing is written inside the measured project", () => {
  const [p, s, state] = [project(), sessions(), tmp()];
  const before = git(p, "2026-11-03T00:00:00Z", "status", "--porcelain");
  run(p, s, join(tmp(), "out"), state);
  assert.equal(git(p, "2026-11-03T00:00:00Z", "status", "--porcelain"), before);
});

test("a typed --out is refused as an unknown option with one line and exit 2, and nothing is written", () => {
  const [p, s, state, typed, out] = [project(), sessions(), tmp(), join(tmp(), "typed"), join(tmp(), "out")];
  const r = run(p, s, out, state, "--out", typed);
  assert.equal(r.code, 2);
  assert.equal(r.lines.length, 1);
  assert.match(r.lines[0], /--out/);
  assert.equal(existsSync(typed), false);
  assert.equal(existsSync(out), false);
});
// Fixtures built from a list of batches: each batch is a branch merged with --no-ff at 12:00 of its day.
const day = (n, h) => `2026-11-0${n}T${h}:00:00Z`;
function repo(build) {
  const d = tmp();
  git(d, day(1, "08"), "init", "-q", "-b", "main");
  git(d, day(1, "08"), "config", "user.email", "t@example.com");
  git(d, day(1, "08"), "config", "user.name", "t");
  git(d, day(1, "08"), "config", "commit.gpgsign", "false");
  const commit = (date, files, subject) => { for (const [f, text] of Object.entries(files)) writeFileSync(join(d, f), text); git(d, date, "add", "-A"); git(d, date, "commit", "-q", "-m", subject); };
  const batch = (n, name, fn) => { git(d, day(n, "08"), "checkout", "-q", "-b", name); fn(); git(d, day(n, "12"), "checkout", "-q", "main"); git(d, day(n, "12"), "merge", "-q", "--no-ff", name, "-m", `Merge branch '${name}'`); };
  build({ d, commit, batch, git: (date, ...a) => git(d, date, ...a) });
  return d;
}
function sess(lines) { const s = tmp(); writeFileSync(join(s, "main.jsonl"), lines.join("\n") + "\n"); return s; }
function runOf(p, s) {
  const out = join(tmp(), "out");
  const { code, lines } = run(p, s, out, tmp());
  return { code, lines, rows: existsSync(join(out, p.split("/").pop() + ".jsonl")) ? rows(out, p) : [] };
}
const allS = () => sess([msg("m1", "claude-sonnet-5-5", day(1, "09"), use({ input_tokens: 1e6 }))]);

test("readSessions reads agent files under subagents/workflows/<run>/", () => {
  const s = sess([msg("m1", "claude-sonnet-5-5", day(1, "09"), use({ input_tokens: 1 }))]);
  const dir = join(s, "main", "subagents", "workflows", "run1");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "agent-a.jsonl"), msg("w1", "claude-sonnet-5-5", day(1, "10"), use({ input_tokens: 1e6 })) + "\n");
  writeFileSync(join(dir, "agent-a.meta.json"), JSON.stringify({ agentType: "risk-review" }));
  const r = readSessions(s);
  assert.ok(r.records.some((x) => x.id === "w1"), "workflow agent message is missing");
  assert.ok(r.runs.some((x) => x.agent === "risk-review"), "workflow risk-review run is missing");
});

test("a fix of a fix in a batch older than the first saved session does not crash", () => {
  const p = repo(({ commit, batch }) => {
    commit(day(1, "07"), { "f.txt": "base\n" }, "chore: base");
    batch(1, "b1", () => { commit(day(1, "09"), { "f.txt": "one\n" }, "feat: a"); commit(day(1, "10"), { "f.txt": "one2\n" }, "fix: x"); commit(day(1, "11"), { "f.txt": "one3\n" }, "fix: y"); });
    batch(2, "b2", () => { commit(day(2, "10"), { "g.txt": "new\n" }, "feat: b"); });
  });
  const r = runOf(p, sess([msg("m1", "claude-sonnet-5-5", day(2, "09"), use({ input_tokens: 1e6 }))]));
  assert.equal(r.code, 0, r.lines.join("\n"));
});

for (const [order, ids] of [["synthetic id first", ["0b2f-synthetic", "msg_01"]], ["synthetic id last", ["msg_01", "zz-synthetic"]]]) {
  test(`a zero-token <synthetic> message does not hide or silently shrink the agent USD (${order})`, () => {
    const p = repo(({ commit, batch }) => { commit(day(1, "07"), { "f.txt": "base\n" }, "chore: base"); batch(1, "b1", () => { commit(day(1, "09"), { "f.txt": "one\n" }, "feat: a"); }); });
    const lines = ids.map((id) => id.includes("synthetic") ? msg(id, "<synthetic>", day(1, "10"), use()) : msg(id, "claude-sonnet-5-5", day(1, "09"), use({ input_tokens: 1e6 })));
    const row = runOf(p, sess(lines)).rows[0];
    assert.equal(row.byAgent.main.usd, 2, `main usd is ${row.byAgent.main.usd}, notes ${JSON.stringify(row.notes)}`);
    assert.deepEqual(row.notes, []);
  });
  test(`a real unpriced model with tokens makes the agent USD null and is named, whatever the order (${order})`, () => {
    const p = repo(({ commit, batch }) => { commit(day(1, "07"), { "f.txt": "base\n" }, "chore: base"); batch(1, "b1", () => { commit(day(1, "09"), { "f.txt": "one\n" }, "feat: a"); }); });
    const lines = ids.map((id) => id.includes("synthetic") ? msg(id, "claude-mystery-1", day(1, "10"), use({ output_tokens: 7 })) : msg(id, "claude-sonnet-5-5", day(1, "09"), use({ input_tokens: 1e6 })));
    const row = runOf(p, sess(lines)).rows[0];
    assert.equal(row.byAgent.main.usd, null);
    assert.equal(row.usd, null);
    assert.deepEqual(row.notes, ["unpriced: claude-mystery-1"]);
  });
}

test("one fix that changes lines of two earlier fixes counts once in fixOfFix", () => {
  const p = repo(({ commit, batch }) => {
    commit(day(1, "07"), { "f.txt": "base\n" }, "chore: base");
    batch(1, "b1", () => { commit(day(1, "09"), { "f.txt": "a\nb\nc\nd\n" }, "feat: a"); commit(day(1, "09"), { "f.txt": "a\nb\nc\nd\ne\n" }, "feat: a2"); commit(day(1, "10"), { "f.txt": "a1\nb\nc\nd\ne\n" }, "fix: x1"); commit(day(1, "10"), { "f.txt": "a1\nb\nc1\nd\ne\n" }, "fix: x2"); commit(day(1, "11"), { "f.txt": "a2\nb\nc2\nd\ne\n" }, "fix: y"); });
  });
  const r = runOf(p, allS());
  assert.equal(r.code, 0, r.lines.join("\n"));
  assert.equal(r.rows[0].fixOfFix, 1);
});

test("one fix that changes lines of two commits of an earlier batch is one failure after the seal", () => {
  const p = repo(({ commit, batch }) => {
    commit(day(1, "07"), { "f.txt": "base\n" }, "chore: base");
    batch(1, "b1", () => { commit(day(1, "09"), { "f.txt": "a\nb\nc\n" }, "feat: a"); commit(day(1, "10"), { "f.txt": "a\nb\nc\nd\n" }, "feat: a2"); });
    batch(2, "b2", () => { commit(day(2, "10"), { "f.txt": "a1\nb\nc\nd1\n" }, "fix: both"); });
  });
  const r = runOf(p, allS());
  assert.equal(r.code, 0, r.lines.join("\n"));
  assert.equal(r.rows[0].failuresAfterSeal.length, 1);
  assert.equal(r.rows[0].failuresAfterSeal[0].fixBatch, "b2");
});

test("a deleted line starting with '-- ' is not read as a file header", () => {
  const p = repo(({ commit, batch }) => {
    commit(day(1, "07"), { "f.txt": "base\n" }, "chore: base");
    batch(1, "b1", () => { commit(day(1, "09"), { "q.sql": "-- old comment\nselect 1;\nselect 2;\nselect 3;\n" }, "feat: a"); });
    batch(2, "b2", () => { commit(day(2, "10"), { "q.sql": "select 1;\nselect 2;\nselect 4;\n" }, "fix: the query"); });
  });
  const r = runOf(p, allS());
  assert.equal(r.code, 0, r.lines.join("\n"));
  assert.equal(r.rows[0].failuresAfterSeal.length, 1);
});

test("a file name with a space or a double quote is blamed", () => {
  const p = repo(({ commit, batch }) => {
    commit(day(1, "07"), { "f.txt": "base\n" }, "chore: base");
    batch(1, "b1", () => { commit(day(1, "09"), { "a b.txt": "one\ntwo\n", 'we"ird.txt': "one\ntwo\n" }, "feat: a"); });
    batch(2, "b2", () => { commit(day(2, "09"), { "a b.txt": "one\n2\n" }, "fix: space"); commit(day(2, "10"), { 'we"ird.txt': "one\n2\n" }, "fix: quote"); });
  });
  const r = runOf(p, allS());
  assert.equal(r.code, 0, r.lines.join("\n"));
  assert.equal(r.rows[0].failuresAfterSeal.length, 2);
});

test("a fix that only renames a file is not a failure after the seal", () => {
  const p = repo(({ d, commit, batch, git }) => {
    commit(day(1, "07"), { "f.txt": "base\n" }, "chore: base");
    batch(1, "b1", () => { commit(day(1, "09"), { "old.txt": "one\ntwo\nthree\n" }, "feat: a"); commit(day(1, "10"), { "other.txt": "x\n" }, "feat: a2"); });
    batch(2, "b2", () => { renameSync(join(d, "old.txt"), join(d, "new.txt")); git(day(2, "10"), "add", "-A"); git(day(2, "10"), "commit", "-q", "-m", "fix: the file has the right name"); });
  });
  const r = runOf(p, allS());
  assert.equal(r.rows.find((x) => x.branch === "b1").failuresAfterSeal.length, 0);
});

test("a pure rename is not a failure after the seal when the user's git has diff.renames=false", () => {
  const cfg = join(tmp(), "gitconfig");
  writeFileSync(cfg, "[diff]\n\trenames = false\n");
  const p = repo(({ d, commit, batch, git }) => {
    commit(day(1, "07"), { "f.txt": "base\n" }, "chore: base");
    batch(1, "b1", () => { commit(day(1, "09"), { "old.txt": "one\ntwo\nthree\n" }, "feat: a"); commit(day(1, "10"), { "other.txt": "x\n" }, "feat: a2"); });
    batch(2, "b2", () => { renameSync(join(d, "old.txt"), join(d, "new.txt")); git(day(2, "10"), "add", "-A"); git(day(2, "10"), "commit", "-q", "-m", "fix: the file has the right name"); });
  });
  const saved = process.env.GIT_CONFIG_GLOBAL;
  process.env.GIT_CONFIG_GLOBAL = cfg;
  try {
    const r = runOf(p, allS());
    assert.equal(r.code, 0, r.lines.join("\n"));
    assert.equal(r.rows.find((x) => x.branch === "b1").failuresAfterSeal.length, 0);
  } finally {
    if (saved === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = saved;
  }
});

test("a file header that does not parse stops the tool with one line that names the parse, not a git failure", () => {
  const p = repo(({ commit, batch }) => {
    commit(day(1, "07"), { "f.txt": "base\n" }, "chore: base");
    batch(1, "b1", () => { commit(day(1, "09"), { "we\x01ird.txt": "one\ntwo\n" }, "feat: a"); });
    batch(2, "b2", () => { commit(day(2, "10"), { "we\x01ird.txt": "one\n2\n" }, "fix: control"); });
  });
  const r = runOf(p, allS());
  assert.equal(r.code, 2);
  assert.equal(r.lines.length, 1);
  assert.doesNotMatch(r.lines[0], /\n|Command failed/);
});

test("a baseline with no row that has a cost and changed lines stops the tool with one line, exit 2", () => {
  const [p, s, out, state] = [project(), sessions(), join(tmp(), "out"), tmp()];
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "ref.jsonl"), JSON.stringify({ usd: null, changedLines: 100, fixOfFix: 0, reviewRounds: 3, failuresAfterSeal: [] }) + "\n");
  const r = run(p, s, out, state, "--baseline", "/somewhere/ref");
  assert.equal(r.code, 2);
  assert.equal(r.lines.filter((l) => /^measure: .*baseline/.test(l)).length, 1); // the failure-after-seal lines print before
});

test("a measured row with no cost gets one line saying it was not compared", () => {
  const [p, s, out, state] = [project(), sessions(), join(tmp(), "out"), tmp()];
  mkdirSync(out, { recursive: true });
  const base = { usd: 1000, changedLines: 100, fixOfFix: 0, reviewRounds: 3, failuresAfterSeal: [] };
  writeFileSync(join(out, "ref.jsonl"), JSON.stringify(base) + "\n");
  const { lines } = run(p, s, out, state, "--baseline", "/somewhere/ref"); // both rows have usd null
  assert.equal(lines.filter((l) => /^b1: not compared/.test(l)).length, 1);
  assert.equal(lines.filter((l) => /^b2: not compared/.test(l)).length, 1);
});
