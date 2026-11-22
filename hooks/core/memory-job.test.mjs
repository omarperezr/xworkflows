import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, utimesSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "../../test-tmp.mjs";
import { join } from "node:path";
import { runJob, modelsIn, runnable } from "./memory-job.mjs";

const dirs = () => {
  const state = mkdtempSync(join(tmpdir(), "xwf-job-"));
  const models = join(state, "models"); mkdirSync(models);
  writeFileSync(join(models, "hf_x_embeddinggemma-300M-Q8_0.gguf"), "");
  const root = join(state, "root"); mkdirSync(join(root, ".qmd"), { recursive: true }); // the project's own index
  writeFileSync(join(root, ".qmd", "index.yml"), "");
  return { state, models, root };
};
const cfg = (memory = {}) => ({ memory: { before: [], ...memory } });
const recorder = (codes = {}) => {
  const calls = [];
  return { calls, run: (cmd, args, o) => { calls.push([cmd, ...args]); return { code: codes[args.at(-1)] ?? codes[cmd] ?? 0, timedOut: false }; } };
};
const logOf = (state) => readFileSync(join(state, fs.readdirSync(state).find((f) => f.endsWith(".log"))), "utf8");

test("the steps run in series: the project's step, update, embed, cleanup", () => {
  const { state, models, root } = dirs(); const { calls, run } = recorder();
  const r = runJob({ root, config: cfg({ before: ["node", "scripts/export.mjs"] }), stateDir: state, modelsDir: models, run });
  assert.equal(r.ran, true);
  assert.deepEqual(calls, [["node", "scripts/export.mjs"], ["qmd", "update"], ["qmd", "embed"], ["qmd", "cleanup"]]);
});

test("with no memory.before the job starts at update", () => {
  const { state, models, root } = dirs(); const { calls, run } = recorder();
  runJob({ root, config: cfg(), stateDir: state, modelsDir: models, run });
  assert.deepEqual(calls, [["qmd", "update"], ["qmd", "embed"], ["qmd", "cleanup"]]);
});

test("on a shared index only update runs: memory.index names it, or the project has no index of its own", () => {
  const { state, models, root } = dirs();
  const a = recorder();
  runJob({ root, config: cfg({ index: "proj" }), stateDir: state, modelsDir: models, run: a.run });
  assert.deepEqual(a.calls, [["qmd", "--index", "proj", "update"]]);
  const b = recorder();
  runJob({ root: join(state, "bare"), config: cfg(), stateDir: state, modelsDir: models, run: b.run });
  assert.deepEqual(b.calls, [["qmd", "update"]]);
});

test("a second job finds the lock and exits without running anything", () => {
  const { state, models, root } = dirs(); const { calls, run } = recorder();
  const inner = () => runJob({ root, config: cfg(), stateDir: state, modelsDir: models, run: (...a) => { if (!inner.done) { inner.done = true; inner.second = runJob({ root, config: cfg(), stateDir: state, modelsDir: models, run }); } return { code: 0 }; } });
  assert.equal(inner().ran, true);
  assert.equal(inner.second.ran, false);
  assert.deepEqual(calls, []);
});

test("the lock is released at the end: a later job runs", () => {
  const { state, models, root } = dirs(); const a = recorder(), b = recorder();
  runJob({ root, config: cfg(), stateDir: state, modelsDir: models, run: a.run });
  assert.equal(runJob({ root, config: cfg(), stateDir: state, modelsDir: models, run: b.run }).ran, true);
  assert.equal(b.calls.length, 3);
});

test("a lock held by a dead pid is stale and is taken; one held by a live pid is not, however old", () => {
  const { state, models, root } = dirs(); const { run } = recorder();
  const o = { root, config: cfg(), stateDir: state, modelsDir: models, beforeMs: 1000 };
  let held;
  runJob({ ...o, run: () => { held = join(state, fs.readdirSync(state).find((f) => f.endsWith(".lock"))); return { code: 0 }; } });
  const dead = spawnSync(process.execPath, ["-e", ""]).pid;
  writeFileSync(held, String(dead));
  assert.equal(runJob({ ...o, run }).ran, true);
  writeFileSync(held, String(process.ppid)); // alive, and old
  const old = new Date(Date.now() - 5000); utimesSync(held, old, old);
  assert.equal(runJob({ ...o, run }).ran, false);
});

test("a job removes only the lock that holds its own pid", () => {
  const { state, models, root } = dirs();
  runJob({ root, config: cfg(), stateDir: state, modelsDir: models, run: () => { writeFileSync(join(state, fs.readdirSync(state).find((f) => f.endsWith(".lock"))), String(process.ppid)); return { code: 0 }; } });
  assert.ok(fs.readdirSync(state).some((f) => f.endsWith(".lock")));
});

test("a failing step is logged and does not stop the next one", () => {
  const { state, models, root } = dirs(); const { calls, run } = recorder({ update: 3 });
  runJob({ root, config: cfg(), stateDir: state, modelsDir: models, run });
  assert.deepEqual(calls.map((c) => c.at(-1)), ["update", "embed", "cleanup"]);
  assert.match(logOf(state), /update exit 3/);
  assert.match(logOf(state), /cleanup exit 0/);
});

test("embed is skipped when qmd's models are missing; update and cleanup still run", () => {
  const { state, root } = dirs(); const { calls, run } = recorder();
  runJob({ root, config: cfg(), stateDir: state, modelsDir: join(state, "nowhere"), run });
  assert.deepEqual(calls.map((c) => c.at(-1)), ["update", "cleanup"]);
  assert.match(logOf(state), /embed skipped: models missing/);
});

test("a hung memory.before step is killed at its limit and logged; the qmd steps still run (the real runner)", () => {
  const { state, models, root } = dirs();
  const oldPath = process.env.PATH; process.env.PATH = join(state, "nobin"); // no qmd: its steps exit without a code
  const t = Date.now();
  try { runJob({ root, config: cfg({ before: [process.execPath, "-e", "setTimeout(()=>{},60000)"] }), stateDir: state, modelsDir: models, beforeMs: 300 }); } finally { process.env.PATH = oldPath; }
  assert.ok(Date.now() - t < 10000);
  const log = logOf(state);
  assert.match(log, /before timed out after 300 ms/);
  assert.match(log, /update exit/);
  assert.match(log, /cleanup exit/);
});

test("memory.before that is not a list of texts is skipped and logged; the qmd steps still run", () => {
  for (const before of ["node x", [1], [""], {}]) {
    const { state, models, root } = dirs(); const { calls, run } = recorder();
    runJob({ root, config: cfg({ before }), stateDir: state, modelsDir: models, run });
    assert.equal(calls.length, 3, JSON.stringify(before));
    assert.match(logOf(state), /before skipped: memory\.before must be a list of texts/, JSON.stringify(before));
  }
});

test("an empty or absent memory.before is the default: nothing logged", () => {
  for (const before of [[], undefined]) {
    const { state, models, root } = dirs();
    runJob({ root, config: cfg({ before }), stateDir: state, modelsDir: models, run: recorder().run });
    assert.doesNotMatch(logOf(state), /before/);
  }
});

test("modelsIn tells the embed model from the others, and a missing folder from a full one", () => {
  const { state, models } = dirs();
  assert.equal(modelsIn(models), true);
  assert.equal(modelsIn(join(state, "nowhere")), false);
  const other = join(state, "other"); mkdirSync(other); writeFileSync(join(other, "hf_x_reranker-Q8_0.gguf"), "");
  assert.equal(modelsIn(other), false);
});

test("run as a script with a project root it does the steps and exits 0 even without qmd", () => {
  const { state } = dirs();
  const root = mkdtempSync(join(tmpdir(), "xwf-root-"));
  mkdirSync(join(root, ".xworkflows"));
  writeFileSync(join(root, ".xworkflows", "config.json"), JSON.stringify({ memory: { before: [process.execPath, "-e", "require('fs').writeFileSync('ran','1')"] } }));
  const r = spawnSync(process.execPath, [join(import.meta.dirname, "memory-job.mjs"), root], { env: { PATH: "/nonexistent", XWORKFLOWS_STATE_DIR: state, XDG_CACHE_HOME: join(state, "c") } });
  assert.equal(r.status, 0, String(r.stderr));
  assert.equal(readFileSync(join(root, "ran"), "utf8"), "1");
  assert.match(logOf(state), /update exit/);
});

test("runnable: only a non-empty list of non-empty texts", () => {
  for (const ok of [["node"], ["node", "x.mjs"]]) assert.equal(runnable(ok), true, JSON.stringify(ok));
  for (const bad of [undefined, null, "node x.mjs", [], [""], [1], ["node", 3], ["node", ""], {}]) assert.equal(runnable(bad), false, JSON.stringify(bad));
});
