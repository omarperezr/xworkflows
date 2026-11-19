import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const naming = "Name the function or section each finding is in, right after its `path:line`.";

test("skills/adapt/SKILL.md makes a finding name its function", () => {
  assert.ok(read("skills/adapt/SKILL.md").includes(naming));
});

test("agents/review.md has the form of a finding with its function or section, and the rule once", () => {
  const t = read("agents/review.md");
  assert.ok(t.includes("path:line (function or section) - claim"));
  assert.ok(!t.includes(naming));
});

const orch = () => read("skills/orchestrate/SKILL.md");
const review = [
  "## Review",
  "",
  "One review per batch, before the batch merges.",
  "",
  "1. Pick the reviewer: `roles.riskReviewer` when the batch touches `paths.risk`; `roles.smallReviewer` when the batch changes under 50 code lines (the `paths.nonCode` count rule of `plan`) and touches no `paths.risk`; otherwise `roles.reviewer`; none when the batch is docs only (every changed path under `paths.nonCode`, none under `paths.codeAnyway`).",
  "2. Commit every task, note `<reviewed sha>` (the `HEAD` of the batch branch) and dispatch; the risk reviewer's first review of a batch runs at effort `xhigh`. The prompt names the plan or spec file, the range `<mainBranch>...<reviewed sha>` and the commit id to review. The hook denies the risk reviewer when its prompt names no `.md` file under `paths.plans` or `paths.specs`, and when it already ran on the same named commit at the same root `HEAD`: it never runs twice on one commit.",
  "3. Sort the findings. Only an error of the app, money, permissions or data blocks; the rest become cards.",
  "   - `blocking`: dispatch `roles.verifier` with the finding and a short id of letters, digits and `-`. The finding enters the plan, as a fix task, only after the answer `red: <test path> <command>`; that test is on branch `verify/<id>`. On any `discarded:`, the finding does not enter the plan: write a card with the verifier's reason, and on `cannot run here` also tell the owner in one line.",
  "   - `pending`: one card each, written with the `pending` skill. A card opens no round.",
  "   - `ask-owner:`: put its options to the owner in the question dialog (`AskUserQuestion`), and write the answer in the plan.",
  "   - The place of a finding is its file and the function or section it names; its file alone when it names none. A finding is a repeat when an earlier round of this batch, the last confirmation included, had a finding, blocking or pending, in the same place. Two findings of one round are not a repeat.",
  "   - When step 3 finds a repeat, write in the plan, in the section of that batch, alone on its line: `Possible design error in <place>`. Under it write the root cause and the alternative design, or the reason none exists. A repeat holds nothing back by itself.",
  "   - Through the second round (step 6 says what follows it):",
  "     - An alternative design exists: ask the owner in the question dialog, with that design: redesign, or for a blocking finding patch once more, for a pending one leave it as its card. Redesign replaces the fix by a redesign task in the plan. Dispatch no fix in that place before the answer.",
  "     - None exists: the fix goes on, with no question.",
  "4. Fix: dispatch, at effort `high`, a new implementer, not the one that wrote the code, with the verified findings and the test path and branch of each (`git show verify/<id>:<test path>` gives the test). Commit the fix and its test together, with the subject `fix: <what>`: the `fix-has-test` brake checks the commits whose subject starts with `fix:` or `fix(`, and runs the test on the parent commit, where it must fail. Then delete the `verify/<id>` branches.",
  "5. Confirm: dispatch a fresh `roles.reviewer` at effort `high`, never the one that asked for the fix and never a second risk reviewer; a `roles.smallReviewer` or `roles.reviewer` batch is confirmed by a fresh one of the same role. The prompt names the plan or spec file, the findings, `<reviewed sha>` and the commit id of the fix to review (the new `HEAD`); the hook takes a second review of the same named commit at the same root `HEAD` as the same review; the reviewer reads the findings and only `git diff <reviewed sha>..HEAD`. The `HEAD` it read is the next `<reviewed sha>`.",
  "   - The prompt also names the place of each earlier finding. The prompt asks the reviewer to give, for a new finding in one of those places, the root cause and the best design that removes that class of error at the root if one exists, with its cost.",
  "6. Two rounds of steps 3 to 5 at most. If a `blocking` finding still stands after the second, ask the owner in the question dialog: fix, accept or revert. An accepted finding goes under `Declined findings` with the owner's reason, and the accept counts as the ok. After the second round, a repeat changes this only when it has a design: if a blocking finding still stands, `redesign` and that design join the owner's question (fix, accept, revert); if none stands, the owner is asked alone, with that design: redesign, or leave it as its card. A repeat with no design adds nothing: the two-round limit stands, so no third fix goes out without the owner's answer.",
  "",
  "",
].join("\n");

test("orchestrate's Review section is exactly this text", () => {
  const t = orch();
  assert.equal(t.slice(t.indexOf("## Review"), t.indexOf("## Seal")), review);
});

test("docs/design.md states the rule with the place as a file with its function", () => {
  assert.ok(read("docs/design.md").includes("A finding in the same place as a finding of an earlier round of the batch is a repeat; the place is its file and the function or section it names, its file alone when it names none."));
});
