import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, utimesSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "../../test-tmp.mjs";
import { join } from "node:path";
import { runJob } from "./memory-job.mjs";

const dirs = () => {
  const state = mkdtempSync(join(tmpdir(), "xwf-job-"));
  const models = join(state, "models"); mkdirSync(models);
  writeFileSync(join(models, "hf_x_embeddinggemma-300M-Q8_0.gguf"), "");
  return { state, models };
};
const cfg = (memory = {}) => ({ memory: { before: [], ...memory } });
const recorder = (codes = {}) => {
  const calls = [];
  return { calls, run: (cmd, args, o) => { calls.push([cmd, ...args]); return { code: codes[args.at(-1)] ?? codes[cmd] ?? 0, timedOut: false }; } };
};
const logOf = (state) => readFileSync(join(state, fs.readdirSync(state).find((f) => f.endsWith(".log"))), "utf8");

test("the steps run in series: the project's step, update, embed, cleanup", () => {
  const { state, models } = dirs(); const { calls, run } = recorder();
  const r = runJob({ root: "/r", config: cfg({ before: ["node", "scripts/export.mjs"] }), stateDir: state, modelsDir: models, run });
  assert.equal(r.ran, true);
  assert.deepEqual(calls, [["node", "scripts/export.mjs"], ["qmd", "update"], ["qmd", "embed"], ["qmd", "cleanup"]]);
});

test("with no memory.before the job starts at update; memory.index goes in front of each qmd step", () => {
  const { state, models } = dirs(); const { calls, run } = recorder();
  runJob({ root: "/r", config: cfg({ index: "proj" }), stateDir: state, modelsDir: models, run });
  assert.deepEqual(calls, [["qmd", "--index", "proj", "update"], ["qmd", "--index", "proj", "embed"], ["qmd", "--index", "proj", "cleanup"]]);
});

test("a second job finds the lock and exits without running anything", () => {
  const { state, models } = dirs(); const { calls, run } = recorder();
  const inner = () => runJob({ root: "/r", config: cfg(), stateDir: state, modelsDir: models, run: (...a) => { if (!inner.done) { inner.done = true; inner.second = runJob({ root: "/r", config: cfg(), stateDir: state, modelsDir: models, run }); } return { code: 0 }; } });
  assert.equal(inner().ran, true);
  assert.equal(inner.second.ran, false);
  assert.deepEqual(calls, []);
});

test("the lock is released at the end: a later job runs", () => {
  const { state, models } = dirs(); const a = recorder(), b = recorder();
  runJob({ root: "/r", config: cfg(), stateDir: state, modelsDir: models, run: a.run });
  assert.equal(runJob({ root: "/r", config: cfg(), stateDir: state, modelsDir: models, run: b.run }).ran, true);
  assert.equal(b.calls.length, 3);
});

test("a lock older than the step limit is stale and is taken", () => {
  const { state, models } = dirs(); const { calls, run } = recorder();
  const o = { root: "/r", config: cfg(), stateDir: state, modelsDir: models, beforeMs: 1000 };
  let held;
  runJob({ ...o, run: () => { held = fs.readdirSync(state).find((f) => f.endsWith(".lock")); return { code: 0 }; } });
  writeFileSync(join(state, held), "1");
  const old = new Date(Date.now() - 5000); utimesSync(join(state, held), old, old);
  assert.equal(runJob({ ...o, run }).ran, true);
  writeFileSync(join(state, held), "1"); // fresh: not stale
  assert.equal(runJob({ ...o, run }).ran, false);
});

test("a failing step is logged and does not stop the next one", () => {
  const { state, models } = dirs(); const { calls, run } = recorder({ update: 3 });
  runJob({ root: "/r", config: cfg(), stateDir: state, modelsDir: models, run });
  assert.deepEqual(calls.map((c) => c.at(-1)), ["update", "embed", "cleanup"]);
  assert.match(logOf(state), /update exit 3/);
  assert.match(logOf(state), /cleanup exit 0/);
});

test("embed is skipped when qmd's models are missing; update and cleanup still run", () => {
  const { state } = dirs(); const { calls, run } = recorder();
  runJob({ root: "/r", config: cfg(), stateDir: state, modelsDir: join(state, "nowhere"), run });
  assert.deepEqual(calls.map((c) => c.at(-1)), ["update", "cleanup"]);
  assert.match(logOf(state), /embed skipped: models missing/);
});

test("a hung memory.before step is killed at its limit and logged; the qmd steps still run", () => {
  const { state, models } = dirs(); const { calls, run: fake } = recorder();
  const run = (cmd, args, o) => cmd === "qmd" ? fake(cmd, args, o) : (() => { const r = spawnSync(cmd, args, { ...o, killSignal: "SIGKILL" }); return { code: r.status, timedOut: r.error?.code === "ETIMEDOUT" }; })();
  const t = Date.now();
  runJob({ root: process.cwd(), config: cfg({ before: [process.execPath, "-e", "setTimeout(()=>{},60000)"] }), stateDir: state, modelsDir: models, beforeMs: 300, run });
  assert.ok(Date.now() - t < 10000);
  assert.match(logOf(state), /before timed out after 300 ms/);
  assert.deepEqual(calls.map((c) => c.at(-1)), ["update", "embed", "cleanup"]);
});

test("memory.before that is not a list of texts is ignored", () => {
  const { state, models } = dirs();
  for (const before of ["node x", [1], [""], {}]) {
    const { calls, run } = recorder();
    runJob({ root: "/r", config: cfg({ before }), stateDir: state, modelsDir: models, run });
    assert.equal(calls.length, 3, JSON.stringify(before));
  }
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
