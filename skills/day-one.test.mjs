import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const front = (p) => Object.fromEntries(read(p).split(/^---$/m)[1].trim().split("\n").map((l) => [l.slice(0, l.indexOf(":")), l.slice(l.indexOf(":") + 1).trim()]));
const manifest = () => JSON.parse(read("manifest.json"));

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
  assert.match(body, /current HEAD/);
  assert.match(body, /starting branch/);
});
