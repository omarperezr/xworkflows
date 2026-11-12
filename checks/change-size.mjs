import { inPaths } from "../hooks/core/config.mjs";

export const needs = ["tests.files"];

const LOCKS = ["package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "bun.lock",
  "Cargo.lock", "Gemfile.lock", "poetry.lock", "composer.lock", "go.sum", "Pipfile.lock", "uv.lock"];

// shortcut: .graphifyignore lines are a prefix or *.ext only, no other globs; upgrade if projects need more
function ignored(file, ignoreText) {
  return (ignoreText ?? "").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    .some((l) => (l.startsWith("*.") ? file.endsWith(l.slice(1)) : file.startsWith(l)));
}

function measure(ctx, from, to, range) {
  const { config } = ctx;
  const ignoreText = ctx.show(range.head, ".graphifyignore");
  const out = ctx.git("diff", "--numstat", "--no-renames", "-z", from, to);
  const files = [];
  for (const rec of out.split("\0").filter(Boolean)) {
    const [add, del, ...p] = rec.split("\t");
    const file = p.join("\t");
    const base = file.split("/").at(-1);
    if (inPaths(file, config.tests.files) || inPaths(file, config.paths.nonCode) || file.split("/").includes("fixtures")
      || file.endsWith(".json") || LOCKS.includes(base) || ignored(file, ignoreText)) continue;
    files.push({ file, n: add === "-" ? 0 : Number(add) + Number(del) });
  }
  return { total: files.reduce((s, f) => s + f.n, 0), files };
}

export function run(range, ctx) {
  const { warn, max } = ctx.config.brakes.changeSize;
  const empty = ctx.git("hash-object", "-t", "tree", "/dev/null");
  let batches; // { label, total, files, messages }
  if (range.mainPush) {
    const inRange = new Set(range.commits);
    batches = ctx.git("rev-list", "--first-parent", range.head).split("\n").filter((c) => inRange.has(c)).map((c) => {
      const isRoot = ctx.tryGit("rev-parse", "--verify", "--quiet", `${c}^`).code !== 0;
      const subject = ctx.git("log", "-1", "--format=%s", c);
      const messages = isRoot ? ctx.git("log", "-1", "--format=%B", c) : ctx.git("log", "--format=%B", `${c}^1..${c}`);
      return { label: `${c.slice(0, 7)} ${subject}`, ...measure(ctx, isRoot ? empty : `${c}^1`, c, range), messages };
    });
  } else {
    const mb = ctx.tryGit("merge-base", range.head, ctx.config.mainBranch);
    const from = mb.code === 0 ? mb.out : range.diffBase;
    const messages = mb.code === 0 ? ctx.git("log", "--format=%B", `${from}..${range.head}`)
      : range.commits.map((c) => ctx.git("log", "-1", "--format=%B", c)).join("\n");
    batches = [{ label: null, ...measure(ctx, from, range.head, range), messages }];
  }
  if (!batches.length) return { ok: true, lines: [] };
  const big = batches.reduce((a, b) => (b.total > a.total ? b : a));
  const reason = big.messages.match(/^size-ok:[ \t]*(\S.*)$/m)?.[1].trim();
  const what = `${big.total} code lines changed${big.label ? ` in ${big.label}` : ""}`;
  if (big.total >= max) {
    if (reason) return { ok: true, lines: [`${what}, over the limit of ${max}; size-ok: ${reason}`] };
    const top = [...big.files].sort((a, b) => b.n - a.n).slice(0, 3).map((f) => `${f.file}: ${f.n}`);
    return { ok: false, lines: [`${what}, the limit is ${max}`, "split it into smaller batches, or add a line `size-ok: <reason>` to a commit message", `largest files: ${top.join(", ")}`] };
  }
  if (big.total >= warn) return { ok: true, lines: [`${what}, warning from ${warn}, limit ${max}`] };
  return { ok: true, lines: [] };
}
