import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repo, cli } from "./shared.test.mjs";

test("uninstall removes .qmd/.qmd-embed.lock, which a killed qmd embed leaves", () => {
  const r = repo({ "app.py": "" });
  cli(r, ["install"]);
  writeFileSync(join(r, ".qmd/.qmd-embed.lock"), "");
  assert.equal(cli(r, ["uninstall"]).status, 0);
  assert.deepEqual(readdirSync(r).sort(), [".git", "app.py"]);
});
