import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { repo, git, cli, doctor, EMPTY_HOME } from "./shared.test.mjs";
test("doctor's session-start measure leaves out the whole hand-off text, envelope included", () => {
  const r = repo(); cli(r, ["install"]);
  git(r, "-c user.name=t -c user.email=t@t commit --allow-empty -m c");
  const base = doctor(r, { HOME: EMPTY_HOME }).stdout.match(/session-start text: (\d+) bytes/)[1];
  writeFileSync(join(r, ".xworkflows/handoff.md"), `main: ${git(r, "rev-parse main")}\nNext: x\n`);
  assert.match(doctor(r, { HOME: EMPTY_HOME }).stdout, new RegExp(`^ok +session-start text: ${base} bytes of 2000$`, "m"));
});
