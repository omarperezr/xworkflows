import { isComment } from "./comment-lines.mjs";

export function run(range, ctx) {
  const { commentMinLines: min, commentRatio: ratio } = ctx.config.limits;
  const marks = ctx.config.comments.marks;
  if (!Number.isFinite(min) || !Number.isFinite(ratio)) return { ok: false, cannotRun: true, lines: ["limits.commentMinLines and limits.commentRatio must be numbers"] };
  if (marks === null || typeof marks !== "object" || Array.isArray(marks) || !Object.values(marks).every((m) => Array.isArray(m) && m.every((s) => typeof s === "string" && s))) {
    return { ok: false, cannotRun: true, lines: ["comments.marks must map an extension to a list of mark strings"] };
  }
  const escape = range.commits.map((c) => ctx.git("log", "-1", "--format=%b", c).match(/^comments:[ \t]*(\S.*)$/m)).find(Boolean);
  if (escape) return { ok: true, lines: [] };
  const files = ctx.git("diff", "--name-only", "-z", "--no-renames", range.diffBase, range.head).split("\0").filter(Boolean);
  let total = 0, comments = 0;
  const per = [];
  for (const f of files) {
    const ext = /\.([^./]+)$/.exec(f)?.[1];
    if (!ext || !(Object.hasOwn(marks, ext) && marks[ext].length)) continue;
    const d = ctx.git("diff", "-a", "--no-ext-diff", "--no-textconv", "--no-renames", "-U0", "--no-color", range.diffBase, range.head, "--", `:(literal)${f}`);
    const at = d.indexOf("\n@@");
    let n = 0;
    for (const l of at < 0 ? [] : d.slice(at + 1).split("\n")) {
      if (l[0] !== "+" || l.slice(1).trim() === "" || l.includes("shortcut:")) continue;
      total++;
      if (isComment(l.slice(1), ext, marks)) { comments++; n++; }
    }
    if (n) per.push([f, n]);
  }
  if (total < min || !comments || comments / total <= ratio) return { ok: true, lines: [] };
  const top = per.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f, n]) => `${f}: ${n}`);
  return { ok: false, lines: [`${comments} of ${total} new code lines are comments (${(comments / total).toFixed(2)}), the limit is ${ratio}`,
    "a comment says only the why the code cannot show: delete the ones that repeat the code, or add a line `comments: <reason>` to a commit message",
    `most comment lines: ${top.join(", ")}`] };
}
