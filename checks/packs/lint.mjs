export function run(range, ctx) {
  const cmd = ctx.config.packs.lint?.run;
  if (typeof cmd !== "string" || !cmd.trim()) return { ok: false, cannotRun: true, lines: ["packs.lint.run is not a command"] };
  const fix = `check out ${range.ref ?? range.head.slice(0, 7)} or commit first`; // the command tests the working tree
  if (ctx.git("rev-parse", "HEAD") !== range.head || ctx.git("status", "--porcelain", "--untracked-files=no") !== "") {
    return { ok: false, lines: [fix] };
  }
  const r = ctx.exec("sh", ["-c", `{ ${cmd}\n} 2>&1`]);
  if (r.code === null || r.code === 126 || r.code === 127) return { ok: false, cannotRun: true, lines: [`the linter did not run to the end: ${r.err.trim() || r.out.trim().split("\n").pop() || "killed"}`] };
  return r.code === 0 ? { ok: true, lines: [] } : { ok: false, lines: r.out.replace(/\n$/, "").split("\n").slice(-20) };
}
