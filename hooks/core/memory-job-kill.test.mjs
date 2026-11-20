// The memory.before limit must kill the whole step, not only its direct child.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runJob } from "./memory-job.mjs";

test("a step behind a wrapper leaves no process after the limit", () => {
  const dir = mkdtempSync(join(tmpdir(), "xwf-kill-"));
  const bin = join(dir, "bin"); mkdirSync(bin);
  symlinkSync("/bin/sleep", join(bin, "sleep")); // PATH has sleep and no qmd
  const mark = `600.${process.pid}`;
  const oldPath = process.env.PATH; process.env.PATH = bin;
  try {
    runJob({ root: dir, config: { memory: { before: ["/bin/sh", "-c", `sleep ${mark}; :`] } }, stateDir: join(dir, "state"), modelsDir: join(dir, "m"), beforeMs: 500 });
  } finally { process.env.PATH = oldPath; }
  const alive = spawnSync("pgrep", ["-f", `sleep ${mark}`], { encoding: "utf8" }).stdout.trim();
  spawnSync("pkill", ["-f", `sleep ${mark}`]);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(alive, "", `step process survived: ${alive}`);
});
