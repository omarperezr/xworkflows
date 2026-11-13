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
    "How the owner works", "About you"]) assert.ok(s.includes(h), h);
  // research.md is no longer laid out under those headings: it is the three screens
  for (const h of ["## Screen 1: what the code shows", "## Screen 2: where the code contradicts itself or leaves a gap", "## Screen 3: what no file says"]) assert.ok(read("skills/adapt/screens.mjs").includes(h), h);
});
test("adapt leaves the tree clean on an unchanged re-run and commits only its files", () => {
  const s = read("skills/adapt/SKILL.md");
  has(s, ["a screen 1 sentence is not asked again when the owner answered it in the last approved run (any answer but `I don't know`), its wording and its `(file:line)` are the same, every line it cites still verifies, and no spec or plan under `paths.specs` or `paths.plans` added or changed since the commit of `summary.md` names a file it cites"]);
  assert.ok(!s.includes("in the earlier adaptation"));
  assert.ok(s.includes('git commit -m "chore: adapt xworkflows to this project" -- <the same paths>'));
});

test("full-review pins zones, file names, card form and decisions", () => {
  const s = read("skills/full-review/SKILL.md");
  assert.ok(firstBodyLine(s).includes("node .xworkflows/mark.mjs full-review"));
  for (const t of ["No zones yet: run /adapt first.", "docs/superpowers/reviews", "YYYY-MM-DD-full-review.md",
    "## Errors", "## Restructurings", "## Owner's decisions", "- **P-<n>** —", "Status: unscheduled.",
    "Do it", "Drop it", "Pending list", "red:", "# Pending", "Reviewed commit: <sha>"]) assert.ok(s.includes(t), t);
});
test("full-review writes the reviewed commit only when every agent returned", () => {
  const s = read("skills/full-review/SKILL.md");
  for (const t of ["is written only when every agent the skill launched returned",
    "when one did not, write the review file without that line and tell the owner which zones were not read",
    "the sha is the head the agents were given, noted before they start, not the head when the file is written"]) assert.ok(s.includes(t), t);
  assert.ok(s.split("\n").length < 120);
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
    "GitHub issues skipped: gh is not set up.", "(Recommended)", "verify-finding",
    "Status: scheduled."]) assert.ok(s.includes(t), t);
  assert.match(s, /^## Hand-off$/m);
  assert.ok(s.split(/^## Hand-off$/m)[1].includes("Invoke `deepen` with the chosen step (its text, source and goal). After a `red:`, also pass `verify/<id>` and the red test"));
  assert.doesNotMatch(s, /brainstorming/);
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
  assert.match(s, /`review of <branch>, <date>`[^\n]*not verified/);
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
test("adapt: installer files stay uncommitted, existing files are merged", () => {
  const s = read("skills/adapt/SKILL.md");
  has(s, ["If an installer file (the `files` keys and `created` list in `.xworkflows/installed.json`) is still uncommitted, tell the owner which ones. Do not commit them.",
    "is merged, never overwritten", "`## Changes to existing files`", "merge into only that section"]);
  assert.doesNotMatch(s, /replace only that section/);
  assert.ok(s.split("\n").length < 200);
});
test("README names graphify, the hand-off to deepen and the cursor/plugins credit", () => {
  const r = read("README.md");
  has(r, ["`/adapt` needs the `graphify` command installed", "`/next-step` hands the chosen step to `/deepen`"]);
  assert.match(r.split("## License")[1], /\[cursor\/plugins\]\(https:\/\/github\.com\/cursor\/plugins\) \(MIT\)/);
});
test("adapt asks how the code prevents each risk; research looks for mechanisms; zones question is plain", () => {
  const s = read("skills/adapt/SKILL.md");
  has(s, ["Mechanism rules are read from `details.md` only when the owner asks for detail", "up to 4 per call", "Screen 1 (`S1-<n>`)", "`Real, but a bad rule`", "`Not how it works`", "`G-interim`", "A kind's general rule can be a screen 1 sentence", "its other rules stay in the detail with no question",
    "Heading 5 groups its rule lines under the risk they prevent, costliest risk first, then `rules tied to no risk`.", "grouped under the risk it prevents",
    "in heading 5's order: each risk, then the rules that prevent it", "each with its path as in `What each answer writes`", "one line per rule the owner confirmed", "the `contradicted` lines of `## Written rules and their verdicts` in `details.md`", "`X<n>-why`"]);
  // the per-kind question is gone: a screen 1 sentence is judged with four options, written in one place
  assert.equal((read("skills/adapt/research.mjs") + read("skills/adapt/screens.mjs")).split('"Real, but a bad rule"').length, 2);
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
  has(rules, ["`open`", "`confirm`", "`choice`", "One item per question: Yes, No, I don't know.",
    "If none fits, or it is something else, type it in Type something.", "`(Recommended)` only on an option backed by a verified `file:line` citation in `research.md`",
    "What the owner types in `Type something` wins over research and over every drafted option.", "`I don't know` settles the item"]);
  assert.doesNotMatch(s, /multiSelect/);
  assert.doesNotMatch(s, /`mechanism`|Type the mechanism|`unprotected:|`unconfirmed:|## Contradicted written rules|## Dropped citations|per kind|each found kind|`absent`/);
  assert.doesNotMatch(rules, /multi-select answer/);
  assert.doesNotMatch(s.split("## Step 3")[1].split("### Zones")[0], /marked `\(Recommended\)`\./);
  has(s, ["No other options, and no `Type something` note.", "never `(Recommended)` (a proposal is not a citation), with the `Type something` note"]);
  assert.doesNotMatch(s, /\bOther\b/);
});
test("fixed labels stay English", () => {
  const rules = read("skills/adapt/SKILL.md").split("## Step 1")[0];
  has(rules, ["`Yes`", "`No`", "`I don't know`", "`Skip: not relevant here`", "`Right`", "`Wrong`", "`Missing something`",
    "`Money`", "`Data`", "`Access`", "`No risk`", "Only these stay in English: send them verbatim", "translation in the option `description`",
    "translated into the owner's language, label and description", "the line Claude Code shows", "(in English it reads \"Type something\")"]);
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
  inOrder(s, ["research.mjs start", "rules.mjs", "scan.mjs", "graphify update .", "`Workflow`", "scriptPath", "zeroHits", "`.xworkflows/research.json`", "research.mjs render", "research.mjs queue"]);
  has(s, ["Without the Workflow tool, stop", "`kinds.<key>.total` is 0", "wait for its result", "unchanged", "stop and tell the owner"]);
  assert.ok(!/script:/.test(s));
});
test("adapt passes the installed agent names to the Workflow", () => {
  const l = step(2).split("\n").find((x) => x.startsWith("5. "));
  has(l, ["`agents`", "(mechanism, explore)", "`xwf-<name>`", "`renamed` in `.xworkflows/installed.json`", "`.claude/agents/xwf-<name>.md`", "else the bare name"]);
});
test("adapt interview follows the queue", () => {
  const s = step(3);
  has(s, ["Ask the items of `.xworkflows/interview.json` in file order", "header = the item's `id`", "`style`", "question rules", "in three screens", "Screen 1 (`S1-<n>`)", "Screen 2 (`X<n>`)", "`B-rules`", "`G-interim`"]);
  assert.doesNotMatch(s, /H5-|H2-refused|H3-|H4-|G-provisional/);
  inOrder(s, ["research.mjs check", "status: draft"]);
  assert.ok(!s.includes("topics.md"));
});
test("playback by section", () => {
  const s = step(3);
  has(s, ["`## Not checked`", "`## Dropped`", "the questions of screen 2 left out"]);
  inOrder(s, ["`Hotspots`", "`P-H1`", "`Right`", "`Wrong`", "`Missing something`", "`P-H<n>-fix`"]);
  has(read("skills/adapt/SKILL.md"), ["research.mjs check --approved"]);
  assert.ok(!read("skills/adapt/SKILL.md").includes("Did I understand correctly?"));
});
test("screen 2 answers say what they write; a re-adapt asks only what changed", () => {
  has(step(4), ["`The written rule`: that rule and a card to change the code", "`The code`: the code's rule and a card to change the doc", "`Mistake: fix it`: the rule and one card per place",
    "`Exception: keep it`: the rule with its exceptions named", "`Not on purpose: protect it`: a card", "`On purpose` and `I don't know`: nothing; the log keeps them", "with no reason, ask for the reason once"]);
  has(step(1).split("\n").find((x) => x.includes("`status: approved`")), ["a screen 1 sentence is not asked again", "`I don't know`", "no spec or plan", "only config keys that already have a value are skipped"]);
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
  inOrder(l, ["step 2 in full", "research.mjs queue", "asked again"]);
});
test("rule without a path goes to AGENTS.md", () => {
  const l = step(4).split("\n").find((x) => x.startsWith("| `AGENTS.md`"));
  has(l, ["An owner-added rule with no path goes to `AGENTS.md` `## Project rules` only"]);
});
test("gitignore lines", () => {
  const s = step(4);
  const l = s.split("\n").find((x) => x.includes("to `.gitignore`"));
  has(l, ["`graphify-out/`", "`.xworkflows/research.md`", "`.xworkflows/research.json`", "`.xworkflows/research.prev.json`", "`.xworkflows/scan.json`",
    "`.xworkflows/interview.json`", "`.xworkflows/interview.log.jsonl`", "`.xworkflows/adapt-run.json`", "`.xworkflows/rules.json`", "`.xworkflows/screens.json`", "`.xworkflows/details.md`", "`.xworkflows/research.answered.json`"]);
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
  has(s, ["`H6-zones` is the zones question below, asked once, in a call of its own.", "after any merge, rename or split typed in `Type something`",
    "Any answer but `No risk` adds that scan zone's paths to `paths.risk`", "ask the follow-up `H6-split` once, `open`", "write its answer under heading 6",
    "On a bare `No`, ask the follow-up `H1-what-fix`, `open`", "list heading 1 under `Hotspots` until `P-H1` is `Right`.",
    "`Real, but a bad rule`, `Not how it works`, `I don't know`", "`You are right: a pending card`", "`Keep it, because ...`",
    "`P-H6` also covers the zones, the risk paths and the `## Config` block"]);
  assert.ok(!read("skills/adapt/SKILL.md").includes("no rule needed"));
  assert.ok(!read("skills/adapt/SKILL.md").includes("in plain text"));
});
test("final fixes: resume of an interrupted first adapt, render mismatch, done never mid-interview", () => {
  const l = step(1).split("\n").find((x) => x.includes("No `summary.md`"));
  inOrder(l, ["research.mjs start", "research.mjs queue", "research.mjs check", "ask only the ids `check` lists"]);
  const m = step(2).split("\n").find((x) => x.includes("`research.json was altered`"));
  inOrder(m, ["rm -f .xworkflows/research.json", "already in context", "Rerun the Workflow (5 and 6) only if", "stop and tell the owner"]);
  has(step(2), ["Never run `research.mjs done` while the interview is in progress"]);
  has(step(1), ["`research.mjs done` saved it"]);
});
test("fix round 1: approved check before step 4, summary written first", () => {
  inOrder(step(3), ["`Right`, run `node <base>/research.mjs check --approved`", "When it exits 0, the interview ends. Go to step 4."]);
  has(step(4), ["`.xworkflows/summary.md` first"]);
});
test("fix round 1: re-adapt draft has all eight headings and asks heading 8", () => {
  const l = step(1).split("\n").find((x) => x.includes("`status: approved`"));
  inOrder(l, ["ask heading 8 (`H8-*`) again", "with all eight headings"]);
});

test("revision 2: written rules first, coherent questions", () => {
  const s = read("skills/adapt/SKILL.md");
  inOrder(step(2), ["`node <base>/rules.mjs`", "`.xworkflows/rules.json`", "`node <base>/scan.mjs`"]);
  assert.doesNotMatch(s, /write it in Other|in Other/);
  const q = step(3);
  const h6 = q.split("\n").find((x) => x.includes("ask `H6-r<n>`"));
  has(h6, ["`Money`, `Data`, `Access`, `No risk`", "several risks typed in `Type something`", "Any answer but `No risk` adds that scan zone's paths to `paths.risk`"]);
  has(q, ["4 per call", "`B-free`", "`G-3m`, `G-12m`, `G-36m`, `G-interim`"]);
  assert.equal(s.split("backed by a verified `file:line` citation in `research.md`").length, 3);
  const c = q.split("\n").find((x) => x.startsWith("- `C<n>`"));
  has(c, ["on a bare `No`, ask the follow-up `C<n>-fix`, `open`: `What should it be?`", "Its answer is the key's value."]);
  has(s.split("## Step 1")[0], ["except `H6-r<n>`, whose text already says it"]);
  has(q, ["`H1-what`", "`H2-pays`"]);
  has(s.split("## Step 1")[0], ["Drafted options are suggestions from research"]);
  has(q, ["asks each heading in the owner's language", "the canonical English heading stays in `summary.md`",
    "for each zone, why it is or is not a risk path: the `H6-r<n>` answer"]);
  has(q, ["research's `## Dropped` lines, the questions of screen 2 left out"]);
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
test("adapt: second page, what Right writes, English labels, language without an interview", () => {
  const s = read("skills/adapt/SKILL.md");
  has(s.split("## Step 1")[0], ["`Keep it, because ...`, `Yes, show them`, `No, skip them`"]);
  has(step(3), ["When the queue holds `S1-more`, ask it in a call of its own", "On `Yes, show them`, ask `S1-13` and on, 4 per call, like the first twelve", "on `No, skip them`, go on to screen 2"]);
  has(step(4), ["`Right`: only the items the sentence names, each from `details.md`; a rule the owner did not see is never written",
    "A rule's path: a screen 1 rule takes it from `details.md`, a screen 2 rule (`Keep it, because ...`, `The written rule`, `The code`, `Mistake: fix it`, `Exception: keep it`) from its question in `interview.json`. For an exception question (`Mistake: fix it`, `Exception: keep it`) take it from the place where the rule itself holds, which the question names (`The rule itself holds at <path:line>`), never from the place that differs."]);
  assert.ok(!step(4).includes("doc line"), "a contradicted written rule gets no path rule of its own: the research holds no place where it holds");
  has(step(2), ["`language` is the owner's language in an interview; leave it out with `research-only`, where the sentences come out in English"]);
  assert.ok(s.split("\n").length < 200);
});

test("adapt step 4: the path sentence is one line of its own and the five answers read the same in it and in the zone file row", () => {
  const FIVE = "`Keep it, because ...`, `The written rule`, `The code`, `Mistake: fix it`, `Exception: keep it`";
  const lines = step(4).split("\n");
  const path = lines.find((l) => l.startsWith("- A rule's path:"));
  const row = lines.find((l) => l.startsWith("| `.claude/rules/<zone key>.md`"));
  assert.ok(path.includes(`a screen 2 rule (${FIVE}) from its question in \`interview.json\``), "path sentence");
  assert.ok(path.includes("take it from the place where the rule itself holds, which the question names (`The rule itself holds at <path:line>`), never from the place that differs."), "exception place");
  assert.ok(row.includes(`or a screen 2 rule kept: ${FIVE})`), "zone file row");
});
