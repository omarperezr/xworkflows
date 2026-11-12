import { inPaths } from "../hooks/core/config.mjs";
import { commentOnly } from "./comment-lines.mjs";

export const mainOnly = true;
export const needs = ["paths.codeAnyway", "paths.risk"];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function run(range, ctx) {
  const { paths, roles } = ctx.config;
  const line = (c) => ctx.git("log", "-1", "--format=%h %s", c);
  const unsealed = [];
  let risk = false;
  for (const c of range.commits) {
    const files = ctx.git("diff-tree", "--cc", "--root", "--no-commit-id", "--name-only", "-r", c).split("\n").filter(Boolean);
    const isCode = files.some((f) => !inPaths(f, paths.nonCode) || inPaths(f, paths.codeAnyway));
    if (!isCode) continue;
    const touchesRisk = files.some((f) => inPaths(f, paths.risk) && !f.endsWith(".md"));
    const escaped = ctx.git("log", "-1", "--format=%b", c).split("\n").some((l) => l.startsWith("no-review: "));
    if (escaped && !touchesRisk) continue;
    if (commentOnly(ctx, c)) continue;
    risk ||= touchesRisk;
    unsealed.push(c);
  }
  if (!unsealed.length) return { ok: true, lines: [] };

  const role = risk ? esc(roles.riskReviewer) : `${esc(roles.reviewer)}|${esc(roles.riskReviewer)}`;
  const re = new RegExp(`(?<![\\w-])(?:${role}) ok at ([0-9a-f]{7,40})(?![\\w])`, "g");
  const docs = ctx.git("ls-tree", "-r", "--name-only", range.head).split("\n")
    .filter((f) => inPaths(f, [paths.plans, paths.specs]));
  for (const f of docs) {
    for (const [, sha] of (ctx.show(range.head, f) ?? "").matchAll(re)) {
      const full = ctx.tryGit("rev-parse", "-q", "--verify", `${sha}^{commit}`);
      if (full.code !== 0) continue;
      if (unsealed.every((c) => ctx.tryGit("merge-base", "--is-ancestor", c, full.out).code === 0)) return { ok: true, lines: [] };
    }
  }
  const who = risk ? roles.riskReviewer : `${roles.reviewer} or ${roles.riskReviewer}`;
  return {
    ok: false,
    lines: [
      "code without a final review seal:",
      ...unsealed.map((c) => `  ${line(c)}`),
      `add the line "${risk ? roles.riskReviewer : roles.reviewer} ok at <sha>" to a file under ${paths.plans} or ${paths.specs}, with <sha> equal to or after every commit above (role: ${who})`,
      risk ? "a commit touching the risk paths takes no no-review: escape" : "or put a body line \"no-review: <reason>\" in a commit",
    ],
  };
}
