import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const LINES = [
  "- `blocking`: a real error on a path that really happens, that breaks the app or touches money, permissions or data.",
  "- `pending`: a real error on a reachable path, worth fixing but not in this batch; it becomes a card.",
  "- `drop`: impossible, practically impossible, or inconsequential (a very unlikely scenario whose consequence is minimal, seen at once, or easily avoided); it is not written, it stays only in the report.",
];
const FILES = [
  "skills/pending/SKILL.md",
  "agents/review.md",
  "agents/review-small.md",
  "agents/zone-review.md",
  ".claude/agents/risk-review.md",
  "skills/adapt/SKILL.md",
  "skills/full-review/SKILL.md",
  "skills/orchestrate/SKILL.md",
];

for (const file of FILES) {
  test(`${file} carries the three bar lines verbatim`, () => {
    const have = new Set(readFileSync(new URL(`../${file}`, import.meta.url), "utf8").split("\n").map((l) => l.trim()));
    for (const line of LINES) assert.ok(have.has(line), `${file} lacks: ${line}`);
  });
}
