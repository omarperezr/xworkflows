import { test } from "node:test";
import assert from "node:assert/strict";
import { repo, cli } from "./shared.test.mjs";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

for (const dir of ["../shared-memory", "/abs", ""]) {
  test(`uninstall: a memory.dir the config refuses (${JSON.stringify(dir)}) does not crash`, () => {
    const r = repo();
    cli(r, ["install"]);
    const cfg = {};
    cfg.memory = { dir };
    writeFileSync(join(r, ".xworkflows/config.json"), JSON.stringify(cfg));
    const out = cli(r, ["uninstall"]);
    assert.ok(!/ERR_INVALID_ARG_TYPE|TypeError/.test(String(out?.stderr ?? out)), String(out?.stderr ?? out));
  });
}
