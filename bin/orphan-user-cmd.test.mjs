import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repo, cliAt, readJson, writeJson, packedCopy, inst } from "./shared.test.mjs";

// ga-orphan-user-cmd: a user's own command inside our old hook entry must survive the upgrade
function oldIdCopy() {
  const copy = packedCopy();
  const m = JSON.parse(readFileSync(join(copy, "manifest.json"), "utf8"));
  const p = m.pieces.find((q) => q.id === "handoff-load");
  p.id = "handoff";
  p.files = { "hooks/core/handoff.mjs": p.files["hooks/core/handoff-load.mjs"] };
  writeFileSync(join(copy, "hooks/core/handoff.mjs"), readFileSync(join(copy, "hooks/core/handoff-load.mjs")));
  writeFileSync(join(copy, "manifest.json"), JSON.stringify(m, null, 2) + "\n");
  return copy;
}
test("install: a user's command in the old handoff entry survives the upgrade", () => {
  const r = repo(); assert.equal(cliAt(oldIdCopy(), r, ["install", "--yes"]).status, 0);
  const s = readJson(r, ".claude/settings.json");
  const e = s.hooks.SessionStart.find((x) => x.hooks.some((h) => h.command.endsWith(" claude handoff")));
  e.hooks.push({ type: "command", command: "/opt/mine/session-banner.sh" });
  writeJson(r, ".claude/settings.json", s);
  assert.equal(inst(r, ["--yes"]).status, 0);
  assert.ok(JSON.stringify(readJson(r, ".claude/settings.json")).includes("/opt/mine/session-banner.sh"));
});
