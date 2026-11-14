import path from "node:path";
import { DEFAULTS, memoryFolder } from "./config.mjs";
import { buildIndex, header } from "./memory-index.mjs";

const OWNER_ONLY = new Set(["user", "feedback"]);
export const NOISE = /<(system-reminder|local-command-[\w-]+|command-[\w-]+|bash-stdout|bash-stderr)>[\s\S]*?<\/\1>/g;
export const REPORT = /^(<task-notification>|Another Claude session sent a message)/;

const qmd = (ctx, ...args) => [...(ctx.config.memory.index ? ["--index", ctx.config.memory.index] : []), ...args];

function rebuild(ev, ctx) {
  const read = (p) => ctx.readFile(path.resolve(ev.root, p));
  const { dir } = memoryFolder(ctx.config, ev.root);
  if (!dir) return;
  const names = ctx.listDir(dir).filter((f) => f.endsWith(".md") && f !== "MEMORY.md");
  if (!names.length && !ctx.exists(dir)) return;
  const files = names.flatMap((file) => { const text = read(path.join(dir, file)); return text === null ? [] : [{ file, text }]; });
  const index = path.join(dir, "MEMORY.md");
  const text = buildIndex(files);
  if (read(index) !== text && (text || ctx.exists(index))) ctx.writeFile(index, text);
  ctx.background("qmd", qmd(ctx, "update"));
}

function typed(transcript) {
  const out = [];
  for (const line of transcript.split("\n")) {
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const c = o?.type === "user" && !o.isMeta && !o.isCompactSummary ? o.message?.content : null;
    const parts = typeof c === "string" ? [c] : Array.isArray(c) ? c.filter((b) => b?.type === "text" && typeof b.text === "string").map((b) => b.text) : [];
    for (const p of parts) {
      const t = p.replace(NOISE, "").trim();
      if (t && !REPORT.test(t)) out.push(t);
    }
  }
  return out;
}

// the line that suggests /dream when work has piled up unread, or null; it reads no session and starts nothing
function dreamLine(ev, ctx) {
  const o = { ...DEFAULTS.dream, ...ctx.config.dream };
  if (o.suggest === false || (ev.source !== "startup" && ev.source !== "clear") || !ev.transcript || ev.isSubagent) return null;
  const { dir } = memoryFolder(ctx.config, ev.root);
  if (!dir || !ctx.listDir(dir).some((f) => f.endsWith(".md") && f !== "MEMORY.md")) return null;
  let ran = NaN;
  try { const r = JSON.parse(ctx.readFile(path.resolve(ev.root, dir, "dream.json")))?.ran; if (typeof r === "string") ran = Date.parse(r); } catch { /* no state: never ran */ }
  const never = Number.isNaN(ran);
  const folder = path.dirname(ev.transcript), self = path.basename(ev.transcript);
  const count = ctx.listDir(folder).filter((f) => {
    if (!f.endsWith(".jsonl") || f === self) return false;
    const t = ctx.mtime(path.join(folder, f));
    return t !== null && (never || t > ran);
  }).length;
  const days = never ? 0 : Math.max(0, Math.floor((ctx.now() - ran) / 86400000));
  if (!(count >= o.suggestAfterSessions || (!never && days >= o.suggestAfterDays))) return null;
  return `Dream is due: ${count} sessions since ${never ? "it never ran here" : `the last run ${days} days ago`}. Suggest /dream to the owner; nothing runs by itself.`;
}

function start(ev, ctx) {
  const { config } = ctx;
  const lines = [];
  const summary = ctx.readFile(path.resolve(ev.root, ".xworkflows", "summary.md"));
  const date = summary && /^status:\s*approved\s*$/m.test(summary) ? /^date:\s*(\d{4})-(\d{2})-(\d{2})\s*$/m.exec(summary) : null;
  if (date) {
    const [y, m, d] = date.slice(1).map(Number);
    const now = new Date(ctx.now());
    const limit = new Date(Date.UTC(y, m - 1 + 3, d));
    if (now > limit) {
      const months = (now.getUTCFullYear() - y) * 12 + now.getUTCMonth() - (m - 1) - (now.getUTCDate() < d ? 1 : 0);
      lines.push(`Goals written ${months} months ago: run /adapt to refresh them.`);
    }
  }
  const refused = memoryFolder(config, ev.root).line;
  if (refused) lines.push(refused);
  const idx = config.lookup?.index;
  if (Array.isArray(config.paths.code) && config.paths.code.length && idx?.command) {
    const graph = ctx.mtime(path.join(idx.folder, "graph.json"));
    const head = Number(ctx.git("log", "-1", "--format=%ct"));
    if (graph === null || (head && graph < head * 1000)) {
      // graphify leaves graph.json untouched when the code's shape did not change, so the time is set here; the names go in as arguments, never as shell text
      ctx.background("sh", ["-c", '"$0" update . && touch -c -h -- "$1"', idx.command.split(/\s+/)[0], path.join(idx.folder, "graph.json")]);
      lines.push("The code graph is out of date, it is being updated in the background.");
    }
  }
  const text = ev.source === "compact" && ev.transcript ? ctx.readFile(ev.transcript) : null;
  if (text) {
    const q = typed(text).slice(-3).join(" ").replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(-300).trim();
    if (q) {
      const r = ctx.exec("qmd", qmd(ctx, "query", `lex: ${q}\nvec: ${q}`, "-n", "5", "--no-rerank"), { timeout: 8000 });
      if (r.code === 0 && r.out.trim()) lines.push(`Memory notes on the current topic:\n${r.out.slice(0, 3000)}`);
    }
  }
  const dream = dreamLine(ev, ctx);
  const cap = config.tokens?.sessionStartBytes ?? DEFAULTS.tokens.sessionStartBytes;
  if (dream && Buffer.byteLength([...lines, dream].join("\n")) <= cap) lines.push(dream); // after the old lines, and only when it fits with them
  return lines;
}

export function decide(ev, ctx) {
  if (ev.event === "preCompact" || ev.event === "sessionEnd") rebuild(ev, ctx);
  else if (ev.event === "sessionStart") {
    const lines = start(ev, ctx);
    if (lines.length) return { decision: "allow", context: lines.join("\n") };
  } else if (ev.event === "preTool" && ev.kind === "write") {
    const { dir: mem } = memoryFolder(ctx.config, ev.root);
    const dir = mem && path.resolve(ev.root, mem) + path.sep; // a refused folder is no memory folder: no write is judged as a note
    const left = new Map(); // the text of each file as the edits so far leave it
    for (const w of ev.writes ?? []) {
      const abs = path.resolve(ev.root, String(w.path).replaceAll("\\", "/"));
      if (!dir || !abs.startsWith(dir)) continue;
      const cur = left.has(abs) ? left.get(abs) : ctx.readFile(abs);
      const after = w.content !== undefined ? w.content : cur === null ? w.new ?? "" : cur.replace(String(w.old ?? ""), () => w.new ?? "");
      left.set(abs, after);
      if (OWNER_ONLY.has(header(after).type)) {
        return { decision: "deny", reason: "Facts about the owner and the owner's feedback go to ~/.xworkflows/owner.md, not into the repository." };
      }
    }
  }
  return { decision: "allow" };
}
