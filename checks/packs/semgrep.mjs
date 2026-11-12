import { rmSync } from "node:fs";
import { extract } from "./trivy.mjs";

export const TOOL = { command: "semgrep", version: "1.179.0" };

export function run(range, ctx) {
  const { configs, paths = ctx.config.paths.code } = ctx.config.packs.semgrep ?? {};
  const strings = (l) => Array.isArray(l) && l.length > 0 && l.every((s) => typeof s === "string" && s);
  if (!strings(configs)) return { ok: false, cannotRun: true, lines: ["packs.semgrep.configs is not a non-empty list of strings"] };
  if (!strings(paths)) return { ok: false, cannotRun: true, lines: ["no folders to scan: set packs.semgrep.paths or paths.code"] };
  const { tmp, tree, a } = extract(ctx, range.head); // the committed files at head, as trivy scans them
  let r;
  try {
    if (a.code !== 0) return { ok: false, cannotRun: true, lines: [`could not extract ${range.head.slice(0, 7)}: ${a.err.trim()}`] };
    r = ctx.exec("semgrep", ["scan", ...configs.flatMap((c) => ["--config", c]),
      "--metrics=off", "--severity", "ERROR", "--error", "--quiet", ...paths], { cwd: tree });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  if (r.code === 0) return { ok: true, lines: [] };
  const lines = (r.out + r.err).replace(/\n$/, "").split("\n").slice(-20);
  if (r.code === 1) return { ok: false, lines };
  return { ok: false, cannotRun: true, lines: [r.code === null ? "semgrep is not installed or did not run" : `semgrep exited ${r.code}`, ...lines] };
}
