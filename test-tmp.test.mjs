import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "./test-tmp.mjs";

test("a process of the helper killed with SIGKILL, holding a folder without permissions, leaves its folder gone within a second; a folder beside it stays", async () => {
  const beside = mkdtempSync(join(tmpdir(), "xwf-beside-"));
  // the child makes its own helper folder (under TMPDIR), puts a folder of mode 000 in it, says where, and waits
  const code = `import { tmpdir } from ${JSON.stringify(new URL("./test-tmp.mjs", import.meta.url).href)};
    import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
    const d = tmpdir() + "/locked"; mkdirSync(d); writeFileSync(d + "/f", "x"); chmodSync(d, 0);
    console.log(tmpdir()); setInterval(() => {}, 1000);`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", code], { env: { ...process.env, TMPDIR: tmpdir() }, stdio: ["ignore", "pipe", "inherit"] });
  let theirs;
  try {
    theirs = await new Promise((ok, no) => { child.stdout.once("data", (b) => ok(String(b).trim())); child.once("exit", () => no(new Error("the child ended"))); });
    assert.ok(existsSync(theirs));
    child.kill("SIGKILL");
    for (let i = 0; i < 10 && existsSync(theirs); i++) await new Promise((r) => setTimeout(r, 100));
    assert.equal(existsSync(theirs), false, "the folder of the killed process is left");
    assert.ok(existsSync(beside), "a folder beside it went too");
  } finally { child.kill("SIGKILL"); rmSync(beside, { recursive: true, force: true }); }
});
