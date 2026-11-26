import path from "node:path";
import { get, inPaths, memoryDir, sealRe, DEFAULTS } from "./config.mjs";

const MARKS = ["orchestrate", "adapt", "full-review", "next-step", "dream"];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const list = (v) => (Array.isArray(v) && v.length ? v : null);
const allow = { decision: "allow" };
const lines = (s) => new Set(String(s ?? "").split("\n").map((l) => l.trim()));
// the real memory folders of the worktrees open marked, listed from the project's common git folder (a linked root names it in its .git file and commondir); read through ctx only
function runs(ctx, root, config) {
  const own = /^gitdir:\s*(.+?)\s*$/m.exec(ctx.readFile(path.join(root, ".git")) ?? "")?.[1];
  const common = own ? path.resolve(root, own, (ctx.readFile(path.resolve(root, own, "commondir")) ?? ".").trim()) : path.join(root, ".git");
  const mem = memoryDir(config.memory?.dir) ?? DEFAULTS.memory.dir, wts = path.join(common, "worktrees");
  return ctx.listDir(wts).flatMap((n) => {
    const at = path.join(wts, n), gitdir = ctx.readFile(path.join(at, "gitdir"))?.trim();
    const wt = gitdir && ctx.readFile(path.join(at, "dream-open")) !== null && ctx.realPath(path.dirname(path.resolve(at, gitdir)));
    return wt ? [path.join(wt, mem)] : [];
  });
}

export function decide(ev, ctx) {
  const { config } = ctx;
  const deny = (reason) => ({ decision: "deny", reason });
  const rel = (p) => path.relative(ev.root, path.resolve(ev.root, String(p).replaceAll("\\", "/"))).replaceAll("\\", "/");
  const under = (p, prefixes) => { const r = rel(p); return !r.startsWith("..") && inPaths(r, prefixes); };

  if (ev.isSubagent) {
    // reviewers never edit files (also enforces read-only when launched via run-agent.mjs)
    const isRole = (id) => id && String(ev.agent ?? "").endsWith(id) && ev.agent === (ctx.agentName?.(id) ?? id);
    if ((ev.writes ?? []).length && [config.roles.reviewer, config.roles.riskReviewer, config.roles.riskReviewerLite].some(isRole))
      return deny(`${ev.agent} never edits files: report findings only.`);
    // the installed name is the id or xwf-<id>: an agent whose name ends otherwise costs no read
    const dream = ["dream-analyzer", "dream-organizer"].some((id) => String(ev.agent ?? "").endsWith(id) && ev.agent === (ctx.agentName?.(id) ?? id));
    const writes = dream ? (ev.writes ?? []).filter((w) => typeof w?.path === "string") : [];
    if (writes.length) {
      const mems = runs(ctx, ev.root, config);
      if (!mems.length) return deny(`${ev.agent} writes only in the memory folder of the run's branch, and no run is open: the main session must run \`branch.mjs open\` first.`);
      const away = writes.find((w) => {
        if (/(^|[\\/])\.\.([\\/]|$)/.test(w.path)) return true; // `..` after a link is not where path.resolve says
        const real = ctx.realPath(path.resolve(ev.root, w.path.replaceAll("\\", "/")));
        return !(real && mems.some((m) => real.startsWith(m + path.sep)));
      });
      if (away) return deny(`${away.path} is outside the memory folder of the run's branch: ${ev.agent} writes only under ${mems.join(" or ")}.`);
    }
    const bad = (ev.writes ?? []).find((w) => under(w.path, [...config.paths.curated, config.paths.business]));
    return bad ? deny(`${bad.path} is curated by ${config.owner}: report the change you wanted instead.`) : allow;
  }
  if (ev.event === "prompt") {
    if (ev.fromUser) {
      ctx.save("agents", 0);
      if (config.lookup?.index?.perMessage) ctx.save("index", 0);
      if (typeof config.lookup?.memory?.command === "string" && config.lookup.memory.command.trim()) ctx.save("qmd", 0);
    }
    return allow;
  }
  if (ev.event !== "preTool") return allow;
  if (ev.kind === "ask") {
    ctx.save("agents", 0);
    return allow;
  }

  if (ev.kind === "write") {
    const seal = sealRe(config.roles);
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
  const idxCfg = config.lookup?.index ?? DEFAULTS.lookup.index;
  const memCfg = config.lookup?.memory ?? DEFAULTS.lookup.memory;
  const memCmd = typeof memCfg?.command === "string" && memCfg.command.trim() ? memCfg.command.trim() : null;
  const memHint = memCmd === "qmd" ? "qmd query" : memCmd;
  const memDir = memoryDir(config.memory?.dir);
  const isMemoryIndex = (p) => path.basename(String(p ?? "").replaceAll("\\", "/")) === "MEMORY.md";
  const home = String(ctx.home ?? "~").replaceAll("\\", "/").replace(/(.)\/$/, "$1");
  const fresh = (key, mins) => { const t = Number(ctx.state(key)) || 0; return t > 0 && ctx.now() - t <= mins * 60000; };
  const idxFresh = () => fresh("index", idxCfg.minutes ?? 30);
  const qmdFresh = () => fresh("qmd", memCfg?.minutes ?? idxCfg.minutes ?? 30);
  const isSessionTranscript = (p) => {
    const n = String(p ?? "").replaceAll("\\", "/");
    if (home === "~") return false;
    return n.startsWith(`${home}/.claude/projects/`) || (n.startsWith(`${home}/.gemini/antigravity-cli/brain/`) && /\/transcript(?:_full)?\.jsonl$/.test(n));
  };
  const qmdSearchPaths = [
    ...(memDir ? [`${memDir}/`] : []),
    config.paths?.pending, config.paths?.plans, config.paths?.specs,
    ...(Array.isArray(memCfg?.paths) ? memCfg.paths : []),
  ].filter((p) => typeof p === "string" && p.trim());

  if (ev.kind === "shell") {
    const idx = idxCfg.command;
    const root = ev.root.replaceAll("\\", "/").replace(/\/{2,}/g, "/").replace(/(.)\/$/, "$1");
    // the root under its usual spellings, one way; `//` and `/./` collapse
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
    if (idx && new RegExp(`(^|[;&|(\\n][ \\t\\r]*)${env}(${word}*/)?${esc(idx).replace(/\s+/g, "\\s+")}\\b`).test(code)) ctx.save("index", ctx.now());
    if (memCmd && new RegExp(`(^|[;&|(\\n][ \\t\\r]*)${env}(${word}*/)?(${esc(memCmd).replace(/\s+/g, "\\s+")}|qmd(?:\\s+--index\\s+${word}+)?\\s+(?:query|search|vsearch))\\b`).test(code)) ctx.save("qmd", ctx.now());
    const prefixes = (heavy ?? []).map((p) => esc(p.replace(/\/?$/, "/"))).join("|");
    // shortcut: a line inside a quoted text of several lines counts as a command, like `;` inside quotes; upgrade when a real command is denied for it
    // a redirect target is written, not read
    // shortcut: a line is judged by its first 4000 characters (the reader pattern costs the square of a line): a read that starts after them is not seen; upgrade when a real command is allowed late
    const read = code.replace(/>>?\s*&?[^\s<>;&|()]+/g, " ").split("\n").map((l) => l.slice(0, 4000)).join("\n");
    const cmdLead = `(^|[;&|(\\n][ \\t\\r]*)(((do|then|else|elif|time|!|\\{)|[A-Za-z_]\\w*=${word}*)[ \\t]+)*(${word}*/)?`;
    const searchLead = `(^|[;&(\\n][ \\t\\r]*)(((do|then|else|elif|time|!|\\{)|[A-Za-z_]\\w*=${word}*)[ \\t]+)*(${word}*/)?(git\\s+grep|grep|egrep|fgrep|rg|find)\\b`;
    const pathAlt = (ps) => ps.map((p) => {
      const clean = p.replace(/^\.\//, "");
      return clean.endsWith("/") ? esc(clean) : `${esc(clean)}(?=[/\\s"'=;&|()]|$)`;
    }).join("|");
    if (prefixes && new RegExp(`${cmdLead}(cat|sed\\s+-n|head|tail)\\b[^|;&\\n]*(^|[\\s"'=])(\\./|${esc(root)}/)?(${prefixes})`).test(read))
      return deny("Reading that much into the main session costs context: delegate it to an agent.");
    if (memCmd && !qmdFresh()) {
      const homeAlt = home !== "~" ? `|${esc(home)}/\\.claude/projects/|${esc(home)}/\\.gemini/antigravity-cli/brain/[^\\s"'=;&|()]*transcript(?:_full)?\\.jsonl` : "";
      const qmdReadAlt = [memDir && esc(`${memDir}/`)].filter(Boolean).join("|");
      const readNoIndex = memDir ? read.replace(new RegExp(`(^|[\\s"'=])(\\./|${esc(root)}/)?${esc(memDir)}/MEMORY\\.md(?=[\\s"'=;&|()]|$)`, "g"), "$1 ") : read;
      if ((qmdReadAlt || homeAlt) && new RegExp(`${cmdLead}(cat|sed\\s+-n|head|tail)\\b[^|;&\\n]*(^|[\\s"'=])(${qmdReadAlt ? `(\\./|${esc(root)}/)?(${qmdReadAlt})` : "(?!)"}` + `${homeAlt})`).test(readNoIndex))
        return deny(`Ask memory first: run \`${memHint} "<topic>"\` before reading memory or past sessions.`);
      const qmdSAlt = pathAlt(qmdSearchPaths);
      if ((qmdSAlt || homeAlt) && new RegExp(`${searchLead}[^|;&\\n]*(^|[\\s"'=])(${qmdSAlt ? `(\\./|${esc(root)}/)?(${qmdSAlt})` : "(?!)"}` + `${homeAlt})`).test(read))
        return deny(`Ask memory first: run \`${memHint} "<topic>"\` before searching indexed memory or docs.`);
    }
    const codeDirs = list(config.paths?.code);
    if (idxCfg.gateShell && codeDirs && idx && ctx.exists(idxCfg.folder) && !idxFresh()) {
      const codeAlt = pathAlt(codeDirs);
      if (codeAlt && new RegExp(`${searchLead}[^|;&\\n]*(^|[\\s"'=])(\\./|${esc(root)}/)?(${codeAlt})`).test(read))
        return deny(`Ask the index first: run \`${idx} "<topic>"\` before grepping code.`);
    }
    // run-agent.mjs launches a reviewer through agy -p: judged as launching that agent
    const arg = `(?:"([^"]+)"|'([^']+)'|(${word}+))`;
    const ra = new RegExp(`(^|[;&|(\\n][ \\t\\r]*)${env}(${word}*/)?node[ \\t]+["']?(${word}*/)?run-agent\\.mjs["']?[ \\t]+${arg}[ \\t]+${arg}`).exec(code);
    if (ra) {
      const role = ra[ra.length - 6] ?? ra[ra.length - 5] ?? ra[ra.length - 4];
      const file = ra[ra.length - 3] ?? ra[ra.length - 2] ?? ra[ra.length - 1];
      return agentGate({ ...ev, kind: "agent", agent: role, prompt: ctx.readFile(path.resolve(ev.root, file)) ?? "", viaRunner: true });
    }
    // In Antigravity, never bypass orchestrator/handback gates by running `agy -p` directly from the main session.
    if (ev.toolDir === ".agents" && new RegExp(`(^|[;&|(\\n][ \\t\\r]*)${env}(${word}*/)?agy(?:[ \\t]+[^;&|\\n]*)?[ \\t]+(-p|--print|--prompt)(?:$|[ \\t=])`).test(code))
      return deny("Do not run `agy -p` directly from the main session: dispatch reviewers through `node .xworkflows/hooks/run-agent.mjs <role> <prompt file>` so orchestrator and handback gates apply.");
    return allow;
  }

  return agentGate(ev);

  // the rules of launching an agent or a workflow, then the main-session web and read rules
  function agentGate(ev) {
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
    const toolDir = ev.toolDir || ".claude";
    const is = (role) => type === (ctx.agentName?.(role) ?? role); // the installed name: when ours was renamed xwf-<role>, the bare name is the project's own agent
    if (!type || !(ctx.exists(`${toolDir}/agents/${type}.md`) || roles.builtIn.includes(type)))
      return deny(`Use an agent defined in ${toolDir}/agents/.`);
    // in Antigravity a reviewer runs on its fixed model through agy -p, never on what invoke_subagent gives it
    if (toolDir === ".agents" && !ev.viaRunner && (is(roles.reviewer) || is(roles.riskReviewer) || is(roles.riskReviewerLite)))
      return deny(`In Antigravity, run ${type} with \`node .xworkflows/hooks/run-agent.mjs ${type} <prompt file>\`: it runs on its fixed model from .xworkflows/tiers.json.`);
    if (is(roles.lookup) && list(paths.code)) {
      const { command, folder, minutes } = config.lookup.index;
      if (!ctx.exists(folder)) return deny(`The index is missing: build the graph first: \`${command.split(" ")[0]} update .\`.`);
      if (ctx.now() - (Number(ctx.state("index")) || 0) > minutes * 60000)
        return deny(`Ask the index first: run \`${command} "<topic>"\`; launch ${type} only if it does not answer.`);
    }
    if (is(roles.riskReviewer) || is(roles.riskReviewerLite)) {
      const dirs = [paths.plans, paths.specs].map((p) => esc(p.replace(/\/$/, ""))).join("|");
      const docMatch = new RegExp(`(${dirs})/\\S+\\.md`).exec(String(ev.prompt ?? "").replaceAll("\\", "/"));
      if (!docMatch)
        return deny(`${type} reviews against a plan or spec: name its .md path under ${paths.plans} or ${paths.specs}.`);
      // One risk review per batch (branch + plan/spec): confirm fixes with roles.reviewer at effort high, never a second risk reviewer.
      const branch = ctx.git("rev-parse", "--abbrev-ref", "HEAD") ?? "";
      const doc = docMatch[0];
      const named = String(ev.prompt ?? "").match(/(?<![0-9A-Za-z])[0-9a-f]{7,40}(?![0-9A-Za-z])/g) ?? [];
      const head = [...new Set([...named, ctx.git("rev-parse", "HEAD") ?? ""].map((x) => x.slice(0, 7)).filter(Boolean))].sort().join(",");
      const batchKey = branch && branch !== "HEAD" ? `${branch}::${doc}` : `${doc}::${head}`;
      if (ctx.state("risk") === batchKey)
        return deny(`${type} already reviewed this batch (${branch || "detached"}, ${doc}): confirm fixes with ${roles.reviewer} at effort high, never a second ${type}.`);
      ctx.save("risk", batchKey);
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
    if (memCmd && !qmdFresh() && !isMemoryIndex(ev.path) && ((memDir && under(ev.path, [`${memDir}/`])) || isSessionTranscript(ev.path)))
      return deny(`Ask memory first: run \`${memHint} "<topic>"\` before reading memory or past sessions.`);
    if (heavy && under(ev.path, heavy) && !(ev.limit <= config.limits.inlineReadLines))
      return deny(`Reading more than ${config.limits.inlineReadLines} lines of that code here costs context: delegate it to ${config.roles.lookup}, or pass a limit.`);
  }
  return allow;
  }
}
