import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repo, cli, cliAt, packedCopy, readJson, writeJson, withRecord, tree } from "./shared.test.mjs";

// the package that retires the id "design-first-old": its manifest lists it
function retiring() {
  const copy = packedCopy();
  const m = JSON.parse(readFileSync(join(copy, "manifest.json"), "utf8"));
  m.retiredHooks = ["design-first-old"];
  writeFileSync(join(copy, "manifest.json"), JSON.stringify(m, null, 2) + "\n");
  return copy;
}
test("install over a record whose first hook has an older id, then uninstall, leaves the tree as it was", () => {
  const r = repo();
  const before = tree(r);
  cli(r, ["install"]);
  const rename = (e) => { e.hooks[0].command = e.hooks[0].command.replace(/ claude design-first$/, " claude design-first-old"); };
  const s = readJson(r, ".claude/settings.json");
  rename(s.hooks.PreToolUse.find((e) => e.hooks[0].command.endsWith(" claude design-first")));
  writeJson(r, ".claude/settings.json", s);
  withRecord(r, (rec) => { rec.merged.filter((m) => m.entry?.hooks?.[0]?.command.endsWith(" claude design-first")).forEach((m) => rename(m.entry)); });
  cliAt(retiring(), r, ["install"]);
  cli(r, ["uninstall"]);
  assert.equal(tree(r), before);
});
