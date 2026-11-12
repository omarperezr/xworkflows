import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const TOOL = { command: "trivy", version: "0.75.0" };

// git holds the committed files only, so local secret files are never read; read-tree + checkout-index keep export-ignore paths
export function extract(ctx, head) {
  const tmp = mkdtempSync(join(tmpdir(), "xwf-trivy-"));
  const tree = join(tmp, "tree");
  const a = ctx.exec("sh", ["-c", `mkdir "$1" && export GIT_INDEX_FILE="$2" && git read-tree "$3" && git checkout-index -a --prefix="$1/"`, "sh", tree, join(tmp, "idx"), head]);
  return { tmp, tree, a };
}

export function run(range, ctx) {
  const { tmp, tree, a } = extract(ctx, range.head);
  try {
    if (a.code !== 0) return { ok: false, cannotRun: true, lines: [`could not extract ${range.head.slice(0, 7)}: ${a.err.trim()}`] };
    const r = ctx.exec("trivy", ["fs", "--quiet", "--scanners", "vuln,secret", "--severity", "HIGH,CRITICAL",
      "--ignore-unfixed", "--exit-code", "1", tree], { cwd: tree }); // the committed .trivyignore applies, not the folder's
    if (r.code === 0) return { ok: true, lines: [] };
    const lines = (r.out + r.err).replaceAll(tree, ".").replace(/\n$/, "").split("\n").slice(-20);
    if (r.code === 1) return { ok: false, lines };
    return { ok: false, cannotRun: true, lines: [r.code === null ? "trivy is not installed or did not run" : `trivy exited ${r.code}`, ...lines] };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
