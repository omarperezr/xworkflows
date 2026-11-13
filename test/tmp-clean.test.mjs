import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

test("the other test files leave nothing in the system temp folder", async () => {
  const scratch = mkdtempSync(join(tmpdir(), "tmp-clean-"));
  try {
    const self = "test/tmp-clean.test.mjs";
    const files = execFileSync("git", ["ls-files", "*.test.mjs"], { cwd: REPO, encoding: "utf8" }).split("\n").filter((f) => f && f !== self);
    const env = { ...process.env, TMPDIR: scratch };
    delete env.NODE_TEST_CONTEXT; // else the inner node --test runs its files as plain scripts
    const child = spawn("node", ["--test", ...files], { cwd: REPO, env, stdio: "ignore" });
    await new Promise((res) => child.on("close", res));
    assert.deepEqual(readdirSync(scratch), []);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});
