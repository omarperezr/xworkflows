import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { repo, git, cli, EMPTY_HOME, doctor } from "./shared.test.mjs";
// P-219: a hand-off under the cap that quotes "was not loaded" must not make doctor warn that it was not loaded
test("doctor does not warn that a small hand-off was not loaded because its text quotes the phrase", () => {
  const r = repo(); cli(r, ["install"]);
  git(r, "-c user.name=t -c user.email=t@t commit --allow-empty -m c");
  writeFileSync(join(r, ".xworkflows/handoff.md"), `main: ${git(r, "rev-parse main")}\nNote: the old hand-off was not loaded last time.\n`);
  assert.doesNotMatch(doctor(r, { HOME: EMPTY_HOME }).stdout, /^warn .*was not loaded/m);
});
