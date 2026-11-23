// The pending list for /pending triage. No model.
// Usage: node triage.mjs list | drop --cards P-1,P-2   (run in the project's root; drop does not commit)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shared } from "../dream/shared.mjs";

const { load } = await shared("hooks/core/config.mjs");
const root = process.cwd(), file = join(root, load(root).paths.pending);
const lines = readFileSync(file, "utf8").split("\n");

const CARD = /^- \*\*P-(\d+)\*\* — (.*)\. Origin: (.*?)\. Status: (unscheduled|scheduled|in progress on .+?)\.$/;
const parsed = lines.map((text, i) => ({ text, line: i + 1, m: text.match(CARD) }))
  .filter((l) => l.m || l.text.startsWith("- **P-"));
const cards = parsed.filter((l) => l.m && l.m[4] === "unscheduled");

if (process.argv[2] === "list") {
  console.log(JSON.stringify({
    cards: cards.map(({ m }) => ({ n: `P-${m[1]}`, text: m[2], origin: m[3] })),
    skipped: parsed.filter((l) => l.m && l.m[4] !== "unscheduled").map(({ m }) => ({ n: `P-${m[1]}`, status: m[4] })),
    malformed: parsed.filter((l) => !l.m).map(({ line, text }) => ({ line, text })),
  }));
} else if (process.argv[2] === "drop") {
  const named = (process.argv[process.argv.indexOf("--cards") + 1] ?? "").split(",");
  // a number must name exactly one unscheduled card line; any other is refused before a byte is written
  const hit = named.map((n) => parsed.filter((l) => l.text.startsWith(`- **${n}**`)));
  const bad = named.filter((n, i) => hit[i].length !== 1 || !cards.includes(hit[i][0]));
  if (bad.length) { console.error(`refused, not an unscheduled card of the list: ${bad.join(", ")}`); process.exit(1); }
  const gone = new Set(hit.map(([l]) => l.line));
  writeFileSync(file, lines.filter((_, i) => !gone.has(i + 1)).join("\n"));
} else { console.error("usage: triage.mjs list | drop --cards P-1,P-2"); process.exit(2); }
