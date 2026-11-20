import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "../../test-tmp.mjs";
import { join } from "node:path";
import { runJob } from "./memory-job.mjs";

test("a live job running past the stale limit keeps its lock: a second job does not run and the first lock survives", () => {
  const state = mkdtempSync(join(tmpdir(), "xwf-job-"));
  const models = join(state, "models"); mkdirSync(models);
  writeFileSync(join(models, "hf_x_embeddinggemma-300M-Q8_0.gguf"), "");
  let t = Date.now(); const now = () => t;
  const args = { root: "/r", config: { memory: { before: [] } }, stateDir: state, modelsDir: models, now };
  let second, lockAfterSecond;
  let first = true;
  runJob({ ...args, run: () => {
    if (first) {
      first = false;
      t += 31 * 60000; // job 1 is still running (this process is alive), past the limit
      second = runJob({ ...args, run: () => ({ code: 0, timedOut: false }) });
      lockAfterSecond = readdirSync(state).some((f) => f.endsWith(".lock"));
    }
    return { code: 0, timedOut: false };
  } });
  assert.equal(second.ran, false, "second job must not run while the first is alive");
  assert.equal(lockAfterSecond, true, "first job's lock must still exist");
});
