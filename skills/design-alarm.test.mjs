import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const naming = "Name the function or section each finding is in, right after its `path:line`.";

test("orchestrate holds the fixed design-error line", () => {
  assert.ok(read("skills/orchestrate/SKILL.md").includes("`Possible design error in <place>`"));
});

test("orchestrate keeps the two-round limit word for word", () => {
  assert.ok(read("skills/orchestrate/SKILL.md").includes("6. Two rounds of steps 3 to 5 at most. If a `blocking` finding still stands after the second, ask the owner in the question dialog: fix, accept or revert. An accepted finding goes under `Declined findings` with the owner's reason, and the accept counts as the ok."));
});

for (const f of ["agents/review.md", "skills/adapt/SKILL.md"]) test(`${f} makes a finding name its function`, () => {
  assert.ok(read(f).includes(naming));
});
