import { test } from "node:test";
import assert from "node:assert/strict";
import { repo, cli, readJson, withRecord } from "./shared.test.mjs";

test("uninstall: a plugin the record names but the package never installs stays in the user's settings", () => {
  const mine = { enabledPlugins: { "mine@corp": true }, extraKnownMarketplaces: { corp: true } };
  const r = repo({ ".claude/settings.json": JSON.stringify(mine) });
  cli(r, ["install", "--yes"]);
  withRecord(r, (rec) => {
    rec.scalars.push({ file: ".claude/settings.json", key: ["enabledPlugins", "mine@corp"], value: true, createdKey: true }, { file: ".claude/settings.json", key: ["extraKnownMarketplaces", "corp"], value: true, createdKey: true });
  });
  cli(r, ["uninstall"]);
  const s = readJson(r, ".claude/settings.json");
  assert.equal(s.enabledPlugins?.["mine@corp"], true);
  assert.equal(s.extraKnownMarketplaces?.corp, true);
});

test("uninstall: of two hooks on one event, the record naming one takes out that one only", () => {
  const r = repo();
  cli(r, ["install"]);
  withRecord(r, (rec) => { rec.merged = rec.merged.filter((m) => !(m.key[1] === "PreToolUse" && !m.entry.hooks[0].command.endsWith(" claude safe-rm"))); });
  cli(r, ["uninstall"]);
  const pre = readJson(r, ".claude/settings.json").hooks.PreToolUse.map((e) => e.hooks[0].command.split(" claude ")[1]);
  assert.ok(!pre.includes("safe-rm") && pre.includes("safe-db") && pre.includes("design-first"));
});
