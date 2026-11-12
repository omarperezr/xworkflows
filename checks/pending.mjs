import { inPaths } from "../hooks/core/config.mjs";

export const mainOnly = true;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function run(range, ctx) {
  const { git, tryGit } = ctx;
  const { mainBranch: main, paths, roles } = ctx.config;
  // nothing pushed, or a push backwards: not asked
  if (!range.commits.length) return { ok: true, lines: [] };
  const list = ctx.show(range.head, paths.pending);
  const lines = [];

  if (list !== null) {
    const cards = list.split("\n").filter((l) => /^- \*\*P-\d+\*\*/.test(l));
    const ids = cards.map((l) => l.match(/^- \*\*(P-\d+)\*\*/)[1]);

    // rule 1: a card closed by a commit is deleted
    const closed = new Set(
      (git("log", range.head, "--format=%B").match(/closes P-\d+(?:(?:, | and |,)P-\d+)*/gi) ?? [])
        .flatMap((m) => m.match(/P-\d+/gi).map((x) => x.toUpperCase())));
    for (const id of new Set(ids)) if (closed.has(id)) lines.push(`${id} was closed by a commit (closes ${id}) and is still in ${paths.pending}; delete its card`);

    // rule 2: "in progress on <branch>" does not outlive its branch
    const firstParent = new Set(git("rev-list", "--first-parent", main).split("\n"));
    const remote = range.remote ?? "origin";
    for (const l of cards) {
      const m = l.match(/^- \*\*(P-\d+)\*\*.*Status: in progress on ([A-Za-z0-9/_-]+)/);
      if (!m) continue;
      const [, id, br] = m;
      const tip = [`refs/heads/${br}`, `refs/remotes/${remote}/${br}`]
        .map((r) => tryGit("rev-parse", "-q", "--verify", r)).find((r) => r.code === 0)?.out;
      // shortcut: a branch merged by fast-forward reads as unmerged, branches are merged with --no-ff
      if (tip && tryGit("merge-base", "--is-ancestor", tip, main).code === 0 && !firstParent.has(tip))
        lines.push(`${id} says "in progress on ${br}" and that branch is already in ${main}; delete its card or change its status`);
      else if (!tip && !process.env.CI) // CI clones often lack the branch
        lines.push(`${id} says "in progress on ${br}" and that branch no longer exists; change its status or delete its card`);
    }

    // rule 4
    for (const id of new Set(ids)) if (ids.filter((x) => x === id).length > 1) lines.push(`${id} appears on more than one card in ${paths.pending}; renumber one`);
  }

  // rule 3: a commit that changes a plan also changes the list, or its merge or a later pending-for commit does
  const seal = new RegExp(`^\\+(?:${[roles.reviewer, roles.riskReviewer].map(esc).join("|")}) ok at [0-9a-f]{7,40}\\s*$`);
  const sealOnly = (patch) => {
    let hunk = false, added = 0;
    for (const l of patch.split("\n")) {
      if (l.startsWith("diff --git")) hunk = false;
      else if (l.startsWith("@@")) hunk = true;
      else if (hunk && l[0] === "-") return false;
      else if (hunk && l.trim() === "+") continue; // the blank line the template leaves under "Seals"
      else if (hunk && l[0] === "+") { if (!seal.test(l)) return false; added++; }
    }
    return added > 0;
  };
  const bad = [];
  for (const c of range.commits) {
    if (git("rev-list", "--parents", "-n1", c).split(" ").length > 2) continue;
    const files = git("diff-tree", "--root", "--no-commit-id", "--name-only", "-z", "-r", c).split("\0");
    const plans = files.filter((f) => inPaths(f, [paths.plans]));
    if (!plans.length || files.includes(paths.pending)) continue;
    if (sealOnly(git("diff-tree", "--root", "-p", "-U0", "--no-renames", "--no-commit-id", "-r", c, "--", ...plans))) continue;
    // a merge counts only if its first parent lacked c, so it is the one that brought c in
    // (--first-parent with --ancestry-path lists nothing here, so every merge on the path is tried)
    const brought = git("rev-list", "--merges", "--ancestry-path", `${c}..${range.head}`).split("\n").filter(Boolean).some((m) =>
      tryGit("merge-base", "--is-ancestor", c, `${m}^1`).code !== 0
      && tryGit("diff", "--quiet", `${m}^1`, m, "--", paths.pending).code === 1);
    if (brought) continue;
    const short = git("rev-parse", "--short=7", c);
    if (git("rev-list", "--no-merges", `--grep=pending-for:.*${short}`, `${c}..${range.head}`, "--", paths.pending)) continue;
    bad.push(`${short} ${git("log", "-1", "--format=%s", c)}`);
  }
  if (bad.length) {
    lines.push(`a commit changes a plan without ${paths.pending}${list === null ? " (the file does not exist)" : ""}:`, ...bad,
      `fix: add ${paths.pending} to that commit (git commit --amend if it is the last), to the merge of its branch,`,
      "or to a new commit whose message says pending-for: <sha>");
  }
  return { ok: !lines.length, lines };
}
