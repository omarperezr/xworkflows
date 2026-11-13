import { inPaths } from "../hooks/core/config.mjs";
import { commentOnly } from "./comment-lines.mjs";

export const mainOnly = true;
export const needs = ["paths.codeAnyway", "paths.risk"];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// a seal inside a fenced code block is an example, not a seal; an unclosed fence runs to the end
function unfenced(text) {
  let open = null;
  return text.split("\n").filter((l) => {
    const m = /^ {0,3}(`{3,}(?!.*`)|~{3,})/.exec(l)?.[1];
    if (!open) { open = m ?? null; return !m; }
    if (m && m[0] === open[0] && m.length >= open.length) open = null;
    return false;
  }).join("\n");
}

export function run(range, ctx) {
  const { paths, roles } = ctx.config;
  const line = (c) => ctx.git("log", "-1", "--format=%h %s", c);
  const unsealed = [];
  let risk = false;
  for (const c of range.commits) {
    const files = ctx.git("diff-tree", "--cc", "--root", "--no-commit-id", "--name-only", "-r", "-z", c).split("\0").filter(Boolean);
    const isCode = files.some((f) => !inPaths(f, paths.nonCode) || inPaths(f, paths.codeAnyway));
    if (!isCode) continue;
    const touchesRisk = files.some((f) => inPaths(f, paths.risk) && !f.endsWith(".md"));
    const escaped = ctx.git("log", "-1", "--format=%b", c).split("\n").some((l) => /^no-review: \S/.test(l));
    if (escaped && !touchesRisk) continue;
    if (commentOnly(ctx, c)) continue;
    risk ||= touchesRisk;
    unsealed.push(c);
  }
  if (!unsealed.length) return { ok: true, lines: [] };

  const role = risk ? esc(roles.riskReviewer) : `${esc(roles.reviewer)}|${esc(roles.riskReviewer)}`;
  const re = new RegExp(`^\\s*(?:[-*>]\\s*)?\`?(?:${role}) ok at ([0-9a-f]{7,40})\`?\\.?\\s*$`, "gm");
  const docs = ctx.git("ls-tree", "-r", "--name-only", "-z", range.head).split("\0")
    .filter((f) => inPaths(f, [paths.plans, paths.specs]));
  for (const f of docs) {
    for (const [, sha] of unfenced(ctx.show(range.head, f) ?? "").matchAll(re)) {
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
