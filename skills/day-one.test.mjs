import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const front = (p) => Object.fromEntries(read(p).split(/^---$/m)[1].trim().split("\n").map((l) => [l.slice(0, l.indexOf(":")), l.slice(l.indexOf(":") + 1).trim()]));
const manifest = () => JSON.parse(read("manifest.json"));
const firstBodyLine = (s) => s.split(/^---$/m).slice(2).join("---").split("\n").find((l) => l.trim()) ?? "";

for (const name of ["thermo-nuclear-review", "thermo-nuclear-code-quality-review"]) {
  test(`${name} is vendored with license and source`, () => {
    for (const f of ["SKILL.md", "LICENSE", "SOURCE.md"]) assert.ok(existsSync(join(ROOT, "skills", name, f)), f);
    assert.match(read(`skills/${name}/LICENSE`), /Copyright \(c\) 2026 Cursor/);
    assert.match(read(`skills/${name}/SOURCE.md`), /dc415439eebed0cd8fddb11e896dee43bce9d8b0/);
    assert.match(read(`skills/${name}/SKILL.md`), /^## Whole-repo mode$/m);
    const p = manifest().pieces.find((x) => x.id === name);
    assert.equal(p.origin, "vendored"); assert.equal(p.license, "MIT"); assert.equal(p.modified, true);
  });
}

for (const name of ["thermo-nuclear-review", "thermo-nuclear-code-quality-review"]) {
  test(`${name} whole-repo mode has the JSON return contract`, () => {
    const s = read(`skills/${name}/SKILL.md`).split(/^## Whole-repo mode$/m)[1].split(/^#{1,2} /m)[0];
    assert.match(s, /JSON array/);
    assert.match(s, /empty array/);
    assert.match(s, /"the PR", "the branch" and "the diff" mean "the zone"/);
    if (name === "thermo-nuclear-review") {
      assert.match(s, /replaces the Scope restriction/);
      assert.match(s, /skip the PR\/MR discussion check/);
      assert.match(s, /"Final Response"/);
    } else for (const h of ["Output Expectations", "Approval Bar", "Review Tone"]) assert.ok(s.includes(`"${h}"`), h);
  });
}

test("zone-review is top tier and cannot write", () => {
  const f = front("agents/zone-review.md");
  assert.equal(f.tier, "top");
  assert.doesNotMatch(f.tools, /Write|Edit/);
});
test("verify-finding answers red: or discarded:", () => {
  assert.equal(front("agents/verify-finding.md").tier, "medium");
  const body = read("agents/verify-finding.md");
  assert.match(body, /`red: <test path> <command>`/);
  assert.match(body, /`discarded: <reason>`/);
  assert.match(body, /verify\/<finding-id>/);
  assert.match(body, /git worktree add/);
  assert.match(body, /git worktree remove/);
  assert.match(body, /discarded: not reproduced/);
  assert.match(body, /only that test file/);
  assert.match(body, /git branch -D verify\/<finding-id>/);
  assert.doesNotMatch(body, /switch back/i);
});
test("zone-review bash is read-only", () => {
  const body = read("agents/zone-review.md");
  assert.match(body, /git log, diff, show, ls-files, blame, status/);
  assert.match(body, /No redirects/);
});

test("adapt pins its questions, headings, keys and outputs", () => {
  const s = read("skills/adapt/SKILL.md");
  assert.ok(firstBodyLine(s).includes("node .xworkflows/mark.mjs adapt"));
  for (const t of ["Did I understand correctly?", "Yes, you understood", "What did I miss or get wrong?",
    "status: draft", "status: approved", "research-only", ".xworkflows/research.md", "graphify update .",
    "git show <sha>:<path>", "~/.xworkflows/owner.md", "chore: adapt xworkflows to this project",
    "## Project rules", "- G<n> (about <N> months):", "Run a full review first, or start on the next step?",
    "from one past run, not measured here"]) assert.ok(s.includes(t), t);
  for (const k of ["paths.code", "paths.risk", "paths.heavyRead", "paths.codeAnyway", "tests.files", "tests.run", "tests.notRunnable", "checks", "zones"]) assert.ok(s.includes(k), k);
  for (const h of ["What it is", "Who pays, what is sold, what is not done", "Aspirations at about 3, 12 and 36 months",
    "Risks, the costliest mistake first", "What must not change; what is free to change", "Zones and which paths are risk paths",
    "How the owner works", "About you"]) { assert.ok(s.includes(h), h); assert.ok(read("skills/adapt/topics.md").includes(h), h); }
});
test("adapt leaves the tree clean on an unchanged re-run and commits only its files", () => {
  const s = read("skills/adapt/SKILL.md");
  assert.ok(s.includes("If research changes no line of the approved summary, say so and stop before any playback"));
  assert.ok(s.includes('git commit -m "chore: adapt xworkflows to this project" -- <the same paths>'));
});

test("full-review pins zones, file names, card form and decisions", () => {
  const s = read("skills/full-review/SKILL.md");
  assert.ok(firstBodyLine(s).includes("node .xworkflows/mark.mjs full-review"));
  for (const t of ["No zones yet: run /adapt first.", "docs/superpowers/reviews", "YYYY-MM-DD-full-review.md",
    "## Errors", "## Restructurings", "## Owner's decisions", "- **P-<n>** —", "Status: unscheduled.",
    "Do it", "Drop it", "Pending list", "red:", "# Pending"]) assert.ok(s.includes(t), t);
});
test("full-review's Workflow script compiles as an async body", () => {
  const js = read("skills/full-review/SKILL.md").match(/```js\n([\s\S]*?)```/)[1];
  assert.match(js, /export const meta = \{/);
  assert.match(js, /thermo-nuclear-code-quality-review/);
  const body = js.replace(/export const meta = \{[\s\S]*?\n\};\n/, "");
  assert.doesNotMatch(body, /export const meta/);
  const AsyncFunction = (async () => {}).constructor;
  new AsyncFunction("args", "agent", "parallel", "pipeline", "log", "phase", body); // compiles only
  assert.match(body, /\breturn\b/);
  assert.doesNotMatch(body, /Date\.now|Math\.random/);
});

test("next-step pins sources, GitHub skip and the hand-off section", () => {
  const s = read("skills/next-step/SKILL.md");
  assert.ok(firstBodyLine(s).includes("node .xworkflows/mark.mjs next-step"));
  for (const t of ["docs/PENDING.md", "TODO.md", "ROADMAP.md", "NEXT.md", "gh issue list", "gh auth status",
    "GitHub issues skipped: gh is not set up.", "(Recommended)", "verify-finding", "superpowers:brainstorming",
    "Status: scheduled."]) assert.ok(s.includes(t), t);
  assert.match(s, /^## Hand-off$/m);
  const order = ["docs/PENDING.md", "TODO.md", "gh issue list", "git grep"].map((t) => s.indexOf(t));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.ok(s.split("\n").length < 120);
});

const has = (s, ts) => { for (const t of ts) assert.ok(s.includes(t), t); };
const WIP_SKIP = "uncommitted changes, skipping paths under `.xworkflows/`, `graphify-out/` and the files listed in `.xworkflows/installed.json`";

test("day one leaves the repo clean: gitignore and WIP skip list", () => {
  const s = read("skills/adapt/SKILL.md");
  has(s, ["Append `graphify-out/` and `.xworkflows/research.md` to `.gitignore` (create it if missing), only the lines not already there.",
    "plus `.graphifyignore` and `.gitignore`", "write nothing but `.graphifyignore`, `graphify-out/`, `research.md` and the draft."]);
  assert.ok(read("skills/adapt/topics.md").includes(WIP_SKIP));
  assert.ok(read("skills/next-step/SKILL.md").includes(WIP_SKIP));
});
test("adapt research reads no content diffs; the proof copy commits its removal", () => {
  has(read("skills/adapt/SKILL.md"), ["no `git log -p`; `git diff` and `git stash show` only with `--stat` or `--name-only`."]);
  const t7 = read("docs/superpowers/plans/2026-11-11-phase-1-2-day-one.md").split("### Task 7")[1];
  assert.match(t7, /with `git rm -r` and commit the removal in the copy/);
  assert.doesNotMatch(t7, /from the working tree only/);
});
test("verify-finding: temp dir, forced removal, config tests, deps, cannot run here", () => {
  const b = read("agents/verify-finding.md");
  has(b, ["`mktemp -d`", "outside the repo", "`tests.run`, `tests.files` and `tests.notRunnable`", "`node_modules`, `.venv`", "discarded: cannot run here: <why>"]);
  assert.equal(b.match(/git worktree remove --force <temp dir>/g).length, 2);
  assert.doesNotMatch(b, /git worktree remove <temp dir>/);
  assert.ok(read("skills/next-step/SKILL.md").includes("`discarded: cannot run here: <why>`: say why in one line, keep the candidate's card"));
});
test("next-step: plain text under 2 candidates, reads paths.reviews, names the verify branch", () => {
  const s = read("skills/next-step/SKILL.md");
  has(s, ["With fewer than 2 candidates, ask `What is the next step?` in plain text, not `AskUserQuestion`",
    "`paths.reviews` (default `docs/superpowers/reviews`)", "`<review date>-E<n>`", "`P-<n>` for a card",
    "A picked card whose `Origin:` is a review file counts as a review error.", "pass `verify/<id>`"]);
  assert.ok(s.split("## Step 2")[0].includes("paths.reviews"));
});
test("adapt reuses a fresh research.md when there is no summary", () => {
  has(read("skills/adapt/SKILL.md").split("## Step 2")[0], ["No `summary.md`, but `.xworkflows/research.md` has `commit:` equal to `HEAD`", "go to step 3"]);
});
test("full-review resolves renamed review skills; restructuring question has no recommendation", () => {
  const s = read("skills/full-review/SKILL.md");
  has(s, ["`.claude/skills/xwf-<name>`", "`renamed` in `.xworkflows/installed.json`", "`Do it`, `Drop it`, `Pending list`, none marked recommended"]);
  const js = s.match(/```js\n([\s\S]*?)```/)[1];
  assert.match(js, /args\.skills/);
  assert.doesNotMatch(js, /\.claude\/skills\/\$\{review\}/);
});
test("adapt: installer files stay uncommitted, existing files are merged, topic 6 list reaches explore", () => {
  const s = read("skills/adapt/SKILL.md");
  has(s, ["If an installer file (the `files` keys and `created` list in `.xworkflows/installed.json`) is still uncommitted, tell the owner which ones. Do not commit them.",
    "is merged, never overwritten", "`## Changes to existing files`", "merge into only that section", "`.claude/skills/adapt/topics.md`"]);
  assert.doesNotMatch(s, /replace only that section/);
  assert.ok(s.split("\n").length < 200);
});
test("README names graphify, superpowers brainstorming and the cursor/plugins credit", () => {
  const r = read("README.md");
  has(r, ["`/adapt` needs the `graphify` command installed", "`brainstorming` skill of the [superpowers]"]);
  assert.match(r.split("## License")[1], /\[cursor\/plugins\]\(https:\/\/github\.com\/cursor\/plugins\) \(MIT\)/);
});
test("adapt asks how the code prevents each risk; research looks for mechanisms; zones question is plain", () => {
  const s = read("skills/adapt/SKILL.md"), t = read("skills/adapt/topics.md");
  const Q = "How does the code prevent this today, and what rule must every change follow?";
  has(s, [Q, "7. Mechanisms: what the code itself enforces.", "each topic 7 mechanism as a candidate rule line", "Heading 5 lists every mechanism rule",
    "each risk, then the mechanism rules that prevent it", "every heading 5 mechanism rule that applies to the zone's paths", "one line per heading 5 mechanism rule"]);
  assert.ok(t.includes(Q));
  const mech = t.split("How the code enforces it, one question per mechanism")[1].split(/^## /m)[0];
  assert.ok(mech.split("\n").filter((l) => /^- .+\?$/.test(l)).length >= 8);
  const zq = s.split("The zones question, in plain words:")[1].split(/^#{2,3} /m)[0];
  has(zq, ["so a bigger area costs more to review", "everyday words", "about 5 MB", "Does this split match how you think about the code?", "`(Recommended)`"]);
  assert.doesNotMatch(zq, /bytes/);
  assert.doesNotMatch(s.split("## Step 3")[1].split("### Zones")[0], /bytes/);
});
