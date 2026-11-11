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
