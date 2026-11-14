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

test("skills/adapt/SKILL.md makes a finding name its function", () => {
  assert.ok(read("skills/adapt/SKILL.md").includes(naming));
});

test("agents/review.md has the form of a finding with its function or section, and the rule once", () => {
  const t = read("agents/review.md");
  assert.ok(t.includes("path:line (function or section) - claim"));
  assert.ok(!t.includes(naming));
});

const orch = () => read("skills/orchestrate/SKILL.md");
const repeat = "A finding is a repeat when an earlier round of this batch, the last confirmation included, had a finding, blocking or pending, in the same place. Two findings of one round are not a repeat.";
const hold = "Dispatch no fix in that place before the answer.";

test("orchestrate defines the place and the repeat word for word", () => {
  assert.ok(orch().includes("The place of a finding is its file and the function or section it names; its file alone when it names none."));
  assert.ok(orch().includes(repeat));
});

test("orchestrate holds the fix before the owner's answer, and that hold stands before step 4", () => {
  const t = orch(), step4 = t.indexOf("\n4. Fix:");
  assert.ok(step4 > 0);
  for (const s of [hold, "`Possible design error in <place>`", repeat]) {
    assert.ok(t.indexOf(s) > 0 && t.indexOf(s) < step4, s);
  }
  assert.ok(t.indexOf(repeat) < t.indexOf(hold));
});

test("orchestrate's confirmation prompt asks the reviewer, and step 6 adds redesign", () => {
  const t = orch();
  assert.ok(t.includes("The prompt asks the reviewer to give, for a new finding in one of those places, the root cause and the best design that removes that class of error at the root if one exists, with its cost."));
  assert.ok(t.includes("After the second round, a repeat that has a design adds `redesign` to the options the owner is given (fix, accept, revert)."));
});

test("docs/design.md states the rule with the place as a file with its function", () => {
  assert.ok(read("docs/design.md").includes("A finding in the same place as a finding of an earlier round of the batch is a repeat; the place is its file and the function or section it names, its file alone when it names none."));
});
