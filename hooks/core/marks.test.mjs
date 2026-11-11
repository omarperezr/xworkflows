import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname } from "node:path";
import { markFrom, markFile } from "./marks.mjs";

test("markFrom finds the skill in the mark command", () => {
  for (const c of ["node .xworkflows/mark.mjs grill", 'node "/x/y/.xworkflows/mark.mjs" grill', "node .xworkflows\\mark.mjs grill"]) assert.equal(markFrom(c), "grill");
  for (const c of ["echo hi", "node other.mjs grill"]) assert.equal(markFrom(c), null);
});

test("markFile stays inside the state folder", () => {
  for (const s of ["../../etc", "a/b"]) assert.equal(dirname(markFile("/s", "grill", s)), "/s");
});
