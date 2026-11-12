import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIndex, header } from "./memory-index.mjs";

test("header: top-level fields, quotes dropped", () => {
  assert.deepEqual(header('---\nname: A\ndescription: "does a"\ntype: project\n---\nbody\nname: no'), { name: "A", description: "does a", type: "project" });
});

test("header: type under metadata; a top-level type wins", () => {
  assert.equal(header("---\nname: A\nmetadata:\n  type: feedback\n---\n").type, "feedback");
  assert.equal(header("---\ntype: user\nmetadata:\n  type: project\n---\n").type, "user");
});

test("header: no block, or an unclosed one, gives nothing", () => {
  assert.deepEqual(header("name: A\n"), {});
  assert.deepEqual(header("---\nname: A\n"), {});
});

test("buildIndex: sorted lines, name falls back to the file name, trailing newline", () => {
  const out = buildIndex([
    { file: "b.md", text: "---\nname: Beta\ndescription: second\n---\n" },
    { file: "a-note.md", text: "no header" },
  ]);
  assert.equal(out, "- [a-note](a-note.md) — \n- [Beta](b.md) — second\n");
});

test("buildIndex: an empty list gives an empty string", () => {
  assert.equal(buildIndex([]), "");
});
