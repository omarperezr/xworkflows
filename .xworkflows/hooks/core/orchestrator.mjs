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
    const idx = config.lookup.index.command;
    const root = ev.root.replaceAll("\\", "/").replace(/\/{2,}/g, "/").replace(/(.)\/$/, "$1");
    // the root under its usual spellings, one way; `//` and `/./` collapse
    const home = String(ctx.home ?? "~").replaceAll("\\", "/");
    const text = String(ev.command ?? "").replace(/\\\r?\n/g, " ").replaceAll("\\", "/")
      .replace(/(^|[\s"'=:])~(?=\/)/g, (_, p) => p + home)
      .replace(/\$\{?HOME\}?"?/g, () => home)
      .replace(/\$\{?(PWD|CLAUDE_PROJECT_DIR)\}?"?/g, () => root)
      .replace(/\$\((?:pwd|git rev-parse --show-toplevel)\)"?/g, () => root)
      .replace(/\/(?:\.?\/)+/g, "/")
      .replace(/(^|[\s"'=:/])(?!\.\.\/)[^/\s"'=:]+\/\.\.\//g, "$1") // `dir/../` is nothing
      .replace(new RegExp(`(^|[\\s"'=:])\\.\\./${esc(root.replace(/.*\//, ""))}/`, "g"), (_, p) => p + root + "/");
    const word = "[^\\s;&|()]"; // a word stops at a separator: no pattern runs past it
    const env = `((${word}*/)?env[ \\t]+)?([A-Za-z_]\\w*=${word}*[ \\t]+|-u[ \\t]+${word}+[ \\t]+)*`; // env, its -u NAME and NAME=value words
    // a here-document body is text; a here-string and a shift are not here-documents
    let end = null;
    const code = text.split("\n").filter((l) => end === null ? ((end = /(?<!<)<<(?!<)-?\s*['"]?([A-Za-z_][\w.-]*)/.exec(l)?.[1] ?? null), true) : (l.trim() === end && (end = null), false)).join("\n");
    if (new RegExp(`(^|[;&|(\\n][ \\t\\r]*)${env}(${word}*/)?${esc(idx).replace(/\s+/g, "\\s+")}\\b`).test(code)) ctx.save("index", ctx.now());
    const prefixes = (heavy ?? []).map((p) => esc(p.replace(/\/?$/, "/"))).join("|");
    // shortcut: a line inside a quoted text of several lines counts as a command, like `;` inside quotes; upgrade when a real command is denied for it
    // a redirect target is written, not read
    // shortcut: a line is judged by its first 4000 characters (the reader pattern costs the square of a line): a read that starts after them is not seen; upgrade when a real command is allowed late
    const read = code.replace(/>>?\s*&?[^\s<>;&|()]+/g, " ").split("\n").map((l) => l.slice(0, 4000)).join("\n");
    if (prefixes && new RegExp(`(^|[;&|(\\n][ \\t\\r]*)(((do|then|else|elif|time|!|\\{)|[A-Za-z_]\\w*=${word}*)[ \\t]+)*(${word}*/)?(cat|sed\\s+-n|head|tail)\\b[^|;&\\n]*(^|[\\s"'=])(\\./|${esc(root)}/)?(${prefixes})`).test(read))
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
      // the commits the prompt names and the root HEAD, each cut to 7: the same commit is one key in any spelling, and a fix commit opens a new review
      const named = String(ev.prompt ?? "").match(/(?<![0-9A-Za-z])[0-9a-f]{7,40}(?![0-9A-Za-z])/g) ?? [];
      const head = [...new Set([...named, ctx.git("rev-parse", "HEAD") ?? ""].map((x) => x.slice(0, 7)).filter(Boolean))].sort().join(",");
      if (head && ctx.state("risk") === head)
        return deny(`${type} already reviewed this commit: name the commit to review in the prompt and commit the fixes, or confirm them with ${roles.reviewer}.`);
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
