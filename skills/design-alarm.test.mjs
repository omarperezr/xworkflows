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

const block = [
  "   - The place of a finding is its file and the function or section it names; its file alone when it names none. " + repeat,
  "   - When step 3 finds a repeat, write in the plan, in the section of that batch, alone on its line: `Possible design error in <place>`. Under it write the root cause and the alternative design, or the reason none exists. A repeat holds nothing back by itself.",
  "   These two hold through the second round; step 6 says what follows it.",
  "   - An alternative design exists: ask the owner in the question dialog, with that design: redesign or patch once more. Redesign replaces the fix by a redesign task in the plan. " + hold,
  "   - None exists: the fix goes on, with no question.",
].join("\n");

test("orchestrate holds the whole repeat block of step 3 word for word, before step 4", () => {
  const t = orch(), at = t.indexOf(block);
  assert.ok(at > 0);
  assert.ok(at < t.indexOf("\n4. Fix:"));
});

const after = "After the second round, a repeat changes this only when it has a design: if a blocking finding still stands, `redesign` and that design join the owner's question (fix, accept, revert); if none stands, the owner is asked alone, with that design: redesign, or leave it as its card. A repeat with no design adds nothing: the two-round limit stands, so no third fix goes out without the owner's answer. In every case the line stays written in the plan.";

test("orchestrate says what follows a repeat after the second round once, in step 6, and the hold once in the file", () => {
  const t = orch(), at = t.indexOf(after);
  assert.ok(at > t.indexOf("\n6. Two rounds of steps 3 to 5 at most."));
  assert.ok(at < t.indexOf("\n## Seal"));
  assert.equal(t.split(hold).length, 2);
  assert.ok(!t.slice(t.indexOf("\n4. Fix:"), t.indexOf("\n5. Confirm:")).includes("owner"));
});

test("orchestrate holds the fix before the owner's answer, and that hold stands before step 4", () => {
  const t = orch(), step4 = t.indexOf("\n4. Fix:");
  assert.ok(step4 > 0);
  for (const s of [hold, "`Possible design error in <place>`", repeat]) {
    assert.ok(t.indexOf(s) > 0 && t.indexOf(s) < step4, s);
  }
  assert.ok(t.indexOf(repeat) < t.indexOf(hold));
});

test("orchestrate's confirmation prompt asks the reviewer", () => {
  const t = orch();
  assert.ok(t.includes("The prompt asks the reviewer to give, for a new finding in one of those places, the root cause and the best design that removes that class of error at the root if one exists, with its cost."));
});

test("docs/design.md states the rule with the place as a file with its function", () => {
  assert.ok(read("docs/design.md").includes("A finding in the same place as a finding of an earlier round of the batch is a repeat; the place is its file and the function or section it names, its file alone when it names none."));
});
