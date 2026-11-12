// shortcut: only whole lines that start with a mark count; a /* */ block or a mark inside a multi-line string is misjudged, upgrade by parsing the language.
export function isComment(line, ext, marks) {
  const t = line.trim();
  return t !== "" && (marks?.[ext] ?? []).some((m) => t.startsWith(m));
}

// True when every added or removed line, in every file, is blank or a comment.
export function commentOnly(ctx, sha) {
  const parent = ctx.tryGit("rev-parse", "--verify", "--quiet", `${sha}^2`);
  if (parent.code === 0) return false; // a merge's own change is a conflict resolution: code
  if (ctx.tryGit("rev-parse", "--verify", "--quiet", `${sha}^`).code !== 0) return false;
  const raw = ctx.git("diff", "--no-renames", "--raw", "-z", `${sha}^`, sha).split("\0").filter(Boolean);
  if (!raw.length) return false;
  for (let i = 0; i < raw.length; i += 2) {
    const [oldMode, newMode, , , status] = raw[i].slice(1).split(" ");
    const file = raw[i + 1], ext = /\.([^./]+)$/.exec(file)?.[1];
    // a new, deleted or chmod-ed file changes what the file does, whatever its lines say
    if (status !== "M" || oldMode !== newMode || !ctx.config.comments.marks[ext]) return false;
    const diff = ctx.git("diff", "--no-renames", "-U0", "--no-color", `${sha}^`, sha, "--", file);
    const body = diff.slice(diff.indexOf("\n@@") + 1).split("\n");
    for (const l of body) {
      if (l[0] !== "+" && l[0] !== "-") continue;
      if (l.slice(1).trim() !== "" && !isComment(l.slice(1), ext, ctx.config.comments.marks)) return false;
    }
  }
  return true;
}
