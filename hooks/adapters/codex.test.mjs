import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, parsePatch } from "./codex.mjs";
import { markFrom } from "../core/marks.mjs";

test("parsePatch: Add File gives a whole write", () => {
  const p = "*** Begin Patch\n*** Add File: docs/superpowers/specs/a.md\n+# A\n+Why?\n*** End Patch\n";
  assert.deepEqual(parsePatch(p), [{ path: "docs/superpowers/specs/a.md", content: "# A\nWhy?" }]);
});

test("parsePatch: Update File gives one replacement per hunk", () => {
  const p = "*** Begin Patch\n*** Update File: src/x.ts\n@@\n-a\n+b\n*** Update File: docs/superpowers/plans/p.md\n@@\n ## Questions for the owner\n-1. Which DB?\n+1. Which DB?\n+2. Which cache?\n*** End Patch\n";
  const w = parsePatch(p);
  assert.equal(w.length, 2);
  assert.deepEqual(w[0], { path: "src/x.ts", old: "a", new: "b" });
  assert.equal(w[1].path, "docs/superpowers/plans/p.md");
  assert.equal(w[1].old, "## Questions for the owner\n1. Which DB?");
  assert.equal(w[1].new, "## Questions for the owner\n1. Which DB?\n2. Which cache?");
});

test("parsePatch ignores Delete File, Move to, and text without file blocks", () => {
  assert.deepEqual(parsePatch("*** Begin Patch\n*** Delete File: a.md\n*** End Patch\n"), []);
  assert.deepEqual(parsePatch("hello"), []);
});

test("normalize: array command becomes a shell command markFrom reads", () => {
  const raw = { session_id: "s", cwd: "/p", tool_name: "Bash", tool_input: { command: ["bash", "-lc", "node .xworkflows/mark.mjs grill"] } };
  const d = normalize(raw, {});
  assert.equal(d.kind, "shell");
  assert.equal(markFrom(d.command), "grill");
});

test("normalize: no session throws", () => {
  assert.throws(() => normalize({ tool_name: "Bash", tool_input: {} }, {}));
});

test("parsePatch: CRLF line endings give the same write", () => {
  const p = "*** Begin Patch\r\n*** Add File: docs/superpowers/specs/a.md\r\n+# A\r\n+Why?\r\n*** End Patch\r\n";
  assert.deepEqual(parsePatch(p), [{ path: "docs/superpowers/specs/a.md", content: "# A\nWhy?" }]);
});
