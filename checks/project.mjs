export const needs = ["checks.project"];

export function run(range, ctx) {
  const list = ctx.config.checks.project;
  if (!Array.isArray(list) || list.some((e) => typeof e?.name !== "string" || typeof e.run !== "string")) {
    return { ok: false, cannotRun: true, lines: ["checks.project is not a list of { name, run }"] };
  }
  if (!list.length) return { ok: true, lines: [] };
  const fix = `check out ${range.ref ?? range.head.slice(0, 7)} or commit first`; // the commands test the working tree
  if (ctx.git("rev-parse", "HEAD") !== range.head || ctx.git("status", "--porcelain", "--untracked-files=no") !== "") {
    return { ok: false, lines: [fix] };
  }
  const lines = [];
  for (const { name, run: cmd } of list) {
    const r = ctx.exec("sh", ["-c", `{ ${cmd}\n} 2>&1`]); // one pipe keeps stdout and stderr in order
    if (r.code === null) return { ok: false, cannotRun: true, lines: [`${name} did not run to the end: ${r.err.trim() || "killed"}`] };
    if (r.code !== 0) lines.push(`${name} failed (exit ${r.code})`, ...r.out.replace(/\n$/, "").split("\n").slice(-20));
  }
  return { ok: !lines.length, lines };
}
