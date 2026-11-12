import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const manifest = JSON.parse(read("manifest.json"));

for (const name of ["deepen", "plan", "orchestrate", "pending"]) test(`${name}: marks itself first, fits in 150 lines, is a manifest piece`, () => {
  const [, front, body] = read(`skills/${name}/SKILL.md`).split(/^---\n/m);
  assert.match(front, new RegExp(`^name: ${name}$`, "m"));
  assert.match(front, /^description: \S/m);
  assert.ok(body.split("\n").find((l) => l.trim()).includes(`node .xworkflows/mark.mjs ${name}`));
  assert.ok(read(`skills/${name}/SKILL.md`).split("\n").length <= 150);
  assert.equal(manifest.pieces.find((p) => p.id === name)?.origin, "own");
});

for (const name of ["tdd", "ponytail", "ponytail-review"]) test(`${name}: vendored with its license and a pinned origin`, () => {
  assert.match(read(`skills/${name}/SKILL.md`), new RegExp(`^name: ${name}$`, "m"));
  assert.match(read(`skills/${name}/LICENSE`), /^MIT License/);
  const src = read(`skills/${name}/SOURCE.md`);
  const commit = src.match(/^- commit: ([0-9a-f]{40})\b/m)?.[1];
  assert.ok(commit, "SOURCE.md names a 40-character commit");
  const piece = manifest.pieces.find((p) => p.id === name);
  assert.deepEqual([piece.origin, piece.version, piece.license], ["vendored", commit, "MIT"]);
  assert.ok(src.includes(piece.source));
});

test("every skill an agent lists travels with the package", () => {
  for (const a of ["implement", "review"]) {
    const front = read(`agents/${a}.md`).split(/^---\n/m)[1];
    for (const [, s] of front.matchAll(/^\s+- (\S+)$/gm)) assert.ok(existsSync(join(root, "skills", s, "SKILL.md")), `${a} -> ${s}`);
  }
});

test("the pending template is what the pending skill copies, and it holds no card", () => {
  assert.match(read("skills/pending/SKILL.md"), /cp \.xworkflows\/templates\/PENDING\.md/);
  assert.ok(Object.keys(manifest.pieces.find((p) => p.id === "pending").files).includes("templates/PENDING.md"));
  assert.doesNotMatch(read("templates/PENDING.md"), /^- \*\*P-\d+\*\*/m);
});
