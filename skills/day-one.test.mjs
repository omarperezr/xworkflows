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
  for (const t of ["status: draft", "status: approved", "research-only", ".xworkflows/research.md", "graphify update .",
    "~/.xworkflows/owner.md", "chore: adapt xworkflows to this project",
    "## Project rules", "- G<n> (about <N> months):", "Run a full review first, or start on the next step?",
    "from one past run, not measured here"]) assert.ok(s.includes(t), t);
  assert.ok(read("skills/adapt/research.workflow.js").includes("git show <sha>:<path>"));
  for (const k of ["paths.code", "paths.risk", "paths.heavyRead", "paths.codeAnyway", "tests.files", "tests.run", "tests.notRunnable", "checks", "zones"]) assert.ok(s.includes(k), k);
  for (const h of ["What it is", "Who pays, what is sold, what is not done", "Aspirations at about 3, 12 and 36 months",
    "Risks, the costliest mistake first", "What must not change; what is free to change", "Zones and which paths are risk paths",
    "How the owner works", "About you"]) { assert.ok(s.includes(h), h); assert.ok(read("skills/adapt/research.mjs").includes(h), h); }
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
  has(s, ["to `.gitignore` (create it if missing), only the lines not already there.",
    "plus `.graphifyignore` and `.gitignore`", "write nothing but `.graphifyignore`, `graphify-out/`, the `.xworkflows/` files of steps 2 and 3 and the draft."]);
  assert.ok(read("skills/adapt/research.workflow.js").includes(WIP_SKIP.replaceAll("`", "\\`"))); // the script keeps backticks escaped
  assert.ok(read("skills/next-step/SKILL.md").includes(WIP_SKIP));
});
test("adapt research reads no content diffs; the proof copy commits its removal", () => {
  has(read("skills/adapt/research.workflow.js"), ["no `git log -p`; `git diff` and `git stash show` only with `--stat` or `--name-only`.".replaceAll("`", "\\`")]);
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
    "is merged, never overwritten", "`## Changes to existing files`", "merge into only that section"]);
  assert.doesNotMatch(s, /replace only that section/);
  assert.ok(s.split("\n").length < 200);
});
test("README names graphify, superpowers brainstorming and the cursor/plugins credit", () => {
  const r = read("README.md");
  has(r, ["`/adapt` needs the `graphify` command installed", "`brainstorming` skill of the [superpowers]"]);
  assert.match(r.split("## License")[1], /\[cursor\/plugins\]\(https:\/\/github\.com\/cursor\/plugins\) \(MIT\)/);
});
test("adapt asks how the code prevents each risk; research looks for mechanisms; zones question is plain", () => {
  const s = read("skills/adapt/SKILL.md");
  const Q = "How does the code prevent this today, and what rule must every change follow?";
  has(s, ["mechanisms research found go straight under heading 5", "up to 4 per call", "`unprotected: <risk>`", "That line is settled, not a guess",
    "Heading 5 groups its rule lines under the risk they prevent, costliest risk first, then `rules tied to no risk`.", "grouped under the risk it prevents",
    "in heading 5's order: each risk, then the rules that prevent it", "whose path in `research.md` is in the zone's paths", "one line per heading 5 mechanism rule"]);
  assert.equal(read("skills/adapt/research.mjs").split(Q).length, 2);
  const zq = s.split("The zones question, in plain words:")[1].split(/^#{2,3} /m)[0];
  has(zq, ["so a bigger area costs more to review, and so does each extra zone", "everyday words", "about 5 MB", "`H6-zones` in a call of its own", "never `(Recommended)`"]);
  has(s.split("### Zones")[1], ["`.xworkflows/scan.json`", "`dir/*`", "`*`"]);
  has(s.split("## Step 4")[1], ["becomes `src/**`; `dir/*` and `*` stay as written"]);
  assert.doesNotMatch(zq, /bytes/);
  assert.doesNotMatch(s.split("## Step 3")[1].split("### Zones")[0], /bytes/);
});
test("adapt question rules", () => {
  const s = read("skills/adapt/SKILL.md");
  const rules = s.split("## Step 1")[0];
  has(rules, ["`open`", "`confirm`", "`mechanism`", "`choice`", "One item per question: Yes, No, I don't know.",
    "If none fits, or it is something else, write it in Other.", "`(Recommended)` only on an option backed by a verified citation",
    "An answer typed in Other wins over research.", "`I don't know` settles the item"]);
  assert.doesNotMatch(s, /multiSelect/);
  assert.doesNotMatch(rules, /multi-select answer/);
  assert.doesNotMatch(s.split("## Step 3")[1].split("### Zones")[0], /marked `\(Recommended\)`\./);
  has(s, ["No other options, and no Other note.", "never `(Recommended)` (a proposal is not a citation), with the Other note"]);
});
test("fixed labels stay English", () => {
  const rules = read("skills/adapt/SKILL.md").split("## Step 1")[0];
  has(rules, ["`Yes`", "`No`", "`I don't know`", "`Skip: not relevant here`", "`Nothing does today`", "`Right`", "`Wrong`", "`Missing something`",
    "Send them verbatim in English", "translation in the option `description`"]);
});

const step = (n) => read("skills/adapt/SKILL.md").split(`## Step ${n}:`)[1].split(/^## Step /m)[0];
const inOrder = (s, ts) => { let at = -1; for (const t of ts) { const i = s.indexOf(t, at + 1); assert.ok(i > at, `${t} after ${at}`); at = i; } };
test("adapt names no installed path", () => {
  const s = read("skills/adapt/SKILL.md");
  assert.ok(!s.includes(".claude/skills/adapt/"));
  has(s, ["`node <base>/scan.mjs`", "`node <base>/research.mjs start`", "<base>/research.workflow.js"]);
  assert.equal(s.split("this skill's base directory, shown when the skill loads").length, 2);
});
test("adapt research steps in order", () => {
  const s = step(2);
  inOrder(s, ["research.mjs start", "scan.mjs", "graphify update .", "`Workflow`", "scriptPath", "zeroHits", "`.xworkflows/research.json`", "research.mjs render", "research.mjs queue"]);
  has(s, ["Without the Workflow tool, stop", "`kinds.<key>.total` is 0", "wait for its result", "unchanged", "stop and tell the owner"]);
  assert.ok(!/script:/.test(s));
});
test("adapt interview follows the queue", () => {
  const s = step(3);
  has(s, ["Ask the items of `.xworkflows/interview.json` in file order", "header = the item's `id`", "`style`", "question rules", "`H5-<kind>-r`"]);
  inOrder(s, ["research.mjs check", "status: draft"]);
  assert.ok(!s.includes("topics.md"));
});
test("playback by section", () => {
  const s = step(3);
  inOrder(s, ["`Hotspots`", "`P-H1`", "`Right`", "`Wrong`", "`Missing something`", "`P-H<n>-fix`"]);
  has(read("skills/adapt/SKILL.md"), ["research.mjs check --approved"]);
  assert.ok(!read("skills/adapt/SKILL.md").includes("Did I understand correctly?"));
});
test("heading 5 names absent kinds", () => {
  has(step(3), ["`<kind>: <rule | unprotected: <risk> | not applicable>`", "For each kind marked `no rule found: <kind>`"]);
});
test("step 5 question id", () => has(step(5), ["header `S5-next`"]));
test("resume runs start", () => {
  const l = step(1).split("\n").find((x) => x.includes("`status: draft`"));
  inOrder(l, ["research.mjs start", "research.mjs check", "ask only the ids `check` lists", "step 3"]);
});
test("research-only stops after render", () => {
  const s = step(2);
  inOrder(s, ["research.mjs render", "`research-only`, run `node <base>/research.mjs done`", "No `queue`.", "research.mjs queue"]);
});
test("re-adapt reruns research", () => {
  const l = step(1).split("\n").find((x) => x.includes("`status: approved`"));
  inOrder(l, ["step 2 in full", "research.mjs queue", "only what changed"]);
});
test("rule without a path goes to AGENTS.md", () => {
  const l = step(4).split("\n").find((x) => x.startsWith("| `AGENTS.md`"));
  has(l, ["An owner-added rule with no path goes to `AGENTS.md` `## Project rules` only"]);
});
test("gitignore lines", () => {
  const s = step(4);
  const l = s.split("\n").find((x) => x.includes("to `.gitignore`"));
  has(l, ["`graphify-out/`", "`.xworkflows/research.md`", "`.xworkflows/research.json`", "`.xworkflows/research.prev.json`", "`.xworkflows/scan.json`",
    "`.xworkflows/interview.json`", "`.xworkflows/interview.log.jsonl`", "`.xworkflows/adapt-run.json`"]);
  inOrder(s, ["git commit -m", "research.mjs done"]);
});

test("fix round 1: every stop in step 2 ends the run", () => {
  const ls = step(2).split("\n");
  for (const k of ["`graphify` is missing", "Without the Workflow tool", "At a second mismatch", "If `render` fails again", "`research-only`"])
    assert.ok(ls.find((l) => l.includes(k)).includes("research.mjs done"), k);
  inOrder(step(2), ["rm -f .xworkflows/research.json", "`.xworkflows/research.json` with the Write tool"]);
});
test("fix round 1: zones, H1 and H5 follow-ups are mapped", () => {
  const s = step(3);
  has(s, ["`H6-zones` is the zones question below, asked once, in a call of its own.", "after any merge, rename or split given in Other",
    "`Yes` adds that scan zone's paths to `paths.risk`", "ask the risk of each new part in plain text and write it under heading 6",
    "On a bare `No`, ask in plain text what it is, and list heading 1 under `Hotspots` until `P-H1` is `Right`.",
    "a rule in Other becomes `<kind>: <rule>`; `I don't know` becomes `<kind>: unprotected: <risk>`; `Skip: not relevant here` becomes `<kind>: not applicable`.",
    "`P-H6` also covers the zones, the risk paths and the `## Config` block"]);
  assert.ok(!read("skills/adapt/SKILL.md").includes("no rule needed"));
});
test("fix round 1: approved check before step 4, summary written first", () => {
  inOrder(step(3), ["`Right`, run `node <base>/research.mjs check --approved`", "When it exits 0, the interview ends. Go to step 4."]);
  has(step(4), ["`.xworkflows/summary.md` first"]);
});
test("fix round 1: re-adapt draft has all eight headings and asks heading 8", () => {
  const l = step(1).split("\n").find((x) => x.includes("`status: approved`"));
  inOrder(l, ["ask heading 8 (`H8-*`) again", "with all eight headings"]);
});

test("next-step cannot-run-here keeps or creates a card", () => {
  const l = read("skills/next-step/SKILL.md").split("\n").find((x) => x.includes("`discarded: cannot run here"));
  for (const k of ["keep the candidate's card", "no card", "`Origin:` the review file", "`Status: scheduled`", "one above the highest `P-<n>`"])
    assert.ok(l.includes(k), k);
});
test("verify-finding cleans up on every exit", () => {
  const ls = read("agents/verify-finding.md").split("\n");
  const s3 = ls.find((x) => x.startsWith("3."));
  assert.ok(s3.includes("step 5 cleanup") && s3.indexOf("step 5 cleanup") < s3.indexOf("answer"), "step 3");
  for (const n of ["4.", "5."]) assert.ok(ls.find((x) => x.startsWith(n)).includes("git worktree remove --force <temp dir>"), n);
  assert.ok(ls.find((x) => x.startsWith("5.")).includes("git branch -D verify/<finding-id>"));
});
