import { inPaths } from "../hooks/core/config.mjs";

export function run(range, ctx) {
  const added = ctx.git("diff", "--name-only", "-z", "--no-renames", "--diff-filter=A", range.diffBase, range.head)
    .split("\0").filter((f) => f.endsWith(".md") && inPaths(f, [ctx.config.paths.plans]));
  if (!added.length) return { ok: true, lines: [] };
  const biz = ctx.show(range.head, "docs/BUSINESS.md");
  if (biz === null) return { ok: false, lines: ["docs/BUSINESS.md is missing, so no plan can cite a goal", `Add docs/BUSINESS.md with goal lines like "G1 (about 3 months): ...", then cite one in ${added[0]}`] };
  const goals = new Set([...biz.matchAll(/^\s*(?:[-*]\s+)?(G\d+)(?=[ (:])/gm)].map((m) => m[1]));
  const bad = added.filter((f) => {
    const cited = [...(ctx.show(range.head, f) ?? "").matchAll(/^Goal:[ \t]*(G\d+)[ \t]*$/gm)];
    return !cited.some((m) => goals.has(m[1]));
  });
  if (!bad.length) return { ok: true, lines: [] };
  return { ok: false, lines: [`${bad.length} added plan(s) cite no goal of docs/BUSINESS.md`,
    ...bad.map((f) => `${f}: add a line "Goal: G<n>" naming a goal line of docs/BUSINESS.md`)] };
}
