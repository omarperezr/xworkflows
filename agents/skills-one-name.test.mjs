import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

test("every skills: item of every agent is one name with no space", () => {
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".md"))) {
    const front = readFileSync(join(dir, f), "utf8").split(/^---\n/m)[1];
    const block = front.match(/^skills:\n((?:\s+- .*\n?)*)/m)?.[1] ?? "";
    for (const [, s] of block.matchAll(/^\s+- (.*)$/gm)) {
      assert.match(s.trim(), /^\S+$/, `${f}: "${s.trim()}"`);
    }
  }
});
