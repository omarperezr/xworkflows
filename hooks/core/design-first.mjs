import path from "node:path";

export const SKILL = "grill";

const lines = (s) => new Set(s.split("\n").map((l) => l.trim()));

export function decide(ev, ctx) {
  const { owner, paths } = ctx.config;
  const dir = (p) => path.resolve(ev.root, p) + path.sep;
  const [specs, plans] = [dir(paths.specs), dir(paths.plans)];
  for (const w of ev.writes ?? []) {
    const abs = path.resolve(ev.root, w.path.replaceAll("\\", "/"));
    const inSpecs = abs.startsWith(specs);
    if (!(inSpecs || abs.startsWith(plans)) || !abs.endsWith(".md")) continue;
    const disk = ctx.readFile(abs);
    const [before, after] = w.content !== undefined ? [disk ?? "", w.content] : [w.old ?? "", w.new ?? ""];
    const creates = inSpecs && disk === null;
    const seen = lines(before);
    const asks = [...lines(after)].some((l) => l.endsWith("?") && !seen.has(l))
      && /Questions for the owner|Owner's answers/.test((disk ?? "") + "\n" + after);
    if ((creates || asks) && !ctx.marked(SKILL)) {
      const rel = path.relative(ev.root, abs);
      return { decision: "deny", reason: `Run /${ctx.skillName?.(SKILL) ?? SKILL} and settle the design questions with ${owner} before writing ${rel}.` };
    }
  }
  return { decision: "allow" };
}
// shortcut: writes made by a shell command (heredoc, sed) are not seen, upgrade by parsing ev.command.
