import path from "node:path";
import { get, inPaths } from "./config.mjs";

const MARKS = ["orchestrate", "adapt", "full-review", "next-step"];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const list = (v) => (Array.isArray(v) && v.length ? v : null);
const allow = { decision: "allow" };
const lines = (s) => new Set(String(s ?? "").split("\n").map((l) => l.trim()));

export function decide(ev, ctx) {
  const { config } = ctx;
  const deny = (reason) => ({ decision: "deny", reason });
  const rel = (p) => path.relative(ev.root, path.resolve(ev.root, String(p).replaceAll("\\", "/"))).replaceAll("\\", "/");
  const under = (p, prefixes) => { const r = rel(p); return !r.startsWith("..") && inPaths(r, prefixes); };

  if (ev.isSubagent) {
    const bad = (ev.writes ?? []).find((w) => under(w.path, config.paths.curated));
    return bad ? deny(`${bad.path} is curated by ${config.owner}: report the change you wanted instead.`) : allow;
  }
  if (ev.event === "prompt") {
    if (ev.fromUser) ctx.save("agents", 0);
    return allow;
  }
  if (ev.event !== "preTool") return allow;
  if (ev.kind === "ask") {
    ctx.save("agents", 0);
    return allow;
  }

  if (ev.kind === "write") {
    const roles = [config.roles.reviewer, config.roles.riskReviewer].map(esc).join("|");
    const seal = new RegExp(`^\\s*(?:[-*>]\\s*)?\`?(?:${roles}) ok at [0-9a-f]{7,40}\`?\\.?\\s*$`);
    for (const w of ev.writes ?? []) {
      if (!under(w.path, [config.paths.plans, config.paths.specs])) continue;
      const before = w.content !== undefined ? ctx.readFile(path.resolve(ev.root, w.path)) : w.old;
      const seen = lines(before);
      if ([...lines(w.content ?? w.new)].some((l) => seal.test(l) && !seen.has(l))) {
        ctx.save("agents", 0);
        return allow;
      }
    }
    return allow;
  }

  const heavy = list(get(config, "paths.heavyRead"));
  if (ev.kind === "shell") {
    const cmd = String(ev.command ?? "");
    const idx = config.lookup.index.command;
    if (new RegExp(`(^|[;&|(]\\s*)(\\S*/)?${esc(idx).replace(/\s+/g, "\\s+")}\\b`).test(cmd.replaceAll("\\", "/"))) ctx.save("index", ctx.now());
    const prefixes = (heavy ?? []).map((p) => esc(p.replace(/\/?$/, "/"))).join("|");
    if (prefixes && new RegExp(`(^|[;&|(]\\s*)(\\S*/)?(cat|sed\\s+-n|head|tail)\\b[^|;&]*(^|[\\s/"'=])(${prefixes})`).test(cmd.replaceAll("\\", "/")))
      return deny("Reading that much into the main session costs context: delegate it to an agent.");
    return allow;
  }

  if (ev.kind === "agent" || ev.kind === "workflow") {
    const summary = ctx.readFile(path.resolve(ev.root, ".xworkflows/summary.md"));
    if (!/^status:\s*approved\s*$/m.test(summary ?? "") && !ctx.marked("adapt"))
      return deny(`There is no approved .xworkflows/summary.md yet: run /adapt and settle it with ${config.owner} before launching agents.`);
    if (!MARKS.some((m) => ctx.marked(m)))
      return deny("Run /orchestrate (once per session) before launching agents.");
  }
  if (ev.kind === "agent") {
    const { roles, paths, limits } = config;
    const type = ev.agent;
    const is = (role) => type === (ctx.agentName?.(role) ?? role); // the installed name: when ours was renamed xwf-<role>, the bare name is the project's own agent
    if (!type || !(ctx.exists(`.claude/agents/${type}.md`) || roles.builtIn.includes(type)))
      return deny("Use an agent defined in .claude/agents/.");
    if (is(roles.lookup) && list(paths.code)) {
      const { command, folder, minutes } = config.lookup.index;
      if (!ctx.exists(folder)) return deny(`The index is missing: build the graph first: \`${command.split(" ")[0]} update .\`.`);
      if (ctx.now() - (Number(ctx.state("index")) || 0) > minutes * 60000)
        return deny(`Ask the index first: run \`${command} "<topic>"\`; launch ${type} only if it does not answer.`);
    }
    if (is(roles.riskReviewer)) {
      const dirs = [paths.plans, paths.specs].map((p) => esc(p.replace(/\/$/, ""))).join("|");
      if (!new RegExp(`(${dirs})/\\S+\\.md`).test(String(ev.prompt ?? "").replaceAll("\\", "/")))
        return deny(`${type} reviews against a plan or spec: name its .md path under ${paths.plans} or ${paths.specs}.`);
      const head = ctx.git("rev-parse", "HEAD") ?? "";
      if (head && ctx.state("risk") === head)
        return deny(`${type} already reviewed this commit: confirm the fixes with ${roles.reviewer}, or commit before another review.`);
      ctx.save("risk", head);
    } else {
      const n = Number(ctx.state("agents")) || 0;
      if (n >= limits.agentsBeforeWorkflow)
        return deny(`Another agent without a decision from ${config.owner} in between: use a Workflow.`);
      ctx.save("agents", n + 1);
    }
  }

  if (ev.kind === "web" && config.mainSession.denyWeb) return deny(`Research goes through an agent, not the main session.`);
  if (ev.kind === "read") {
    const ext = path.extname(String(ev.path ?? "")).slice(1).toLowerCase();
    if (ext && config.mainSession.denyExtensions.includes(ext)) return deny("Screenshots and PDFs are read by an agent.");
    if (heavy && under(ev.path, heavy) && !(ev.limit <= config.limits.inlineReadLines))
      return deny(`Reading more than ${config.limits.inlineReadLines} lines of that code here costs context: delegate it to ${config.roles.lookup}, or pass a limit.`);
  }
  return allow;
}
