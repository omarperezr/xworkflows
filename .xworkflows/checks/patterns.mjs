import { inPaths } from "../hooks/core/config.mjs";

export const needs = ["checks.patterns"];

function compile(list) {
  if (!Array.isArray(list)) throw new Error("checks.patterns must be a list");
  return list.map((e, i) => {
    const at = `checks.patterns entry ${i}${typeof e?.name === "string" ? ` (${e.name})` : ""}`;
    if (!e || typeof e !== "object" || typeof e.name !== "string" || !e.name || typeof e.regex !== "string" || !e.regex) throw new Error(`${at} needs a name and a regex`);
    if (e.paths !== undefined && !(Array.isArray(e.paths) && e.paths.every((p) => typeof p === "string"))) throw new Error(`${at}: paths must be a list of prefixes`);
    if (e.why !== undefined && typeof e.why !== "string") throw new Error(`${at}: why must be text`);
    try { return { ...e, re: new RegExp(e.regex) }; } catch { throw new Error(`${at}: regex does not compile`); }
  });
}

export function run(range, ctx) {
  let entries;
  try { entries = compile(ctx.config.checks?.patterns); } catch (e) { return { ok: false, cannotRun: true, lines: [e.message] }; }
  const bad = [];
  const files = ctx.git("diff", "--name-only", "--no-renames", "--diff-filter=AMT", "-z", range.diffBase, range.head).split("\0").filter(Boolean);
  for (const file of files) {
    const mine = entries.filter((e) => !e.paths?.length || inPaths(file, e.paths));
    if (!mine.length) continue;
    const d = ctx.git("diff", "--no-color", "--inter-hunk-context=0", "-a", "--no-ext-diff", "--no-textconv", "--no-renames", "-U0", range.diffBase, range.head, "--", `:(literal)${file}`);
    let n = 0, inHunk = false;
    for (const l of d.split("\n")) {
      const h = /^@@ -\S+ \+(\d+)/.exec(l);
      if (h) { n = Number(h[1]); inHunk = true; continue; }
      if (!inHunk || !l.startsWith("+")) continue;
      for (const e of mine) if (e.re.test(l.slice(1))) bad.push(`${file}:${n}: ${e.name}${e.why ? ` (${e.why})` : ""}`);
      n++;
    }
  }
  if (!bad.length) return { ok: true, lines: [] };
  return { ok: false, lines: [`${bad.length} added line(s) match a forbidden pattern`, ...bad, "remove or rewrite each line, or change checks.patterns if the rule is wrong"] };
}
