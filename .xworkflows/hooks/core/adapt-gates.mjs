import path from "node:path";
import { realpathSync, existsSync } from "node:fs";

const HEADINGS = ["What it is", "Who pays", "Aspirations at about", "Risks, the costliest", "What must not change", "Zones and which", "How the owner works", "About you"];
const real = (p) => { try { return realpathSync(p); } catch { return path.resolve(p); } };
const realFile = (p) => { const a = path.resolve(p); try { return realpathSync(a); } catch { return path.join(real(path.dirname(a)), path.basename(a)); } };
const folded = (a, b) => a.toLowerCase() === b.toLowerCase() && existsSync(path.dirname(b).toUpperCase()); // the same name in another case, on a disk that ignores case (checked, not assumed)
const same = (a, b) => a === b || folded(a, b);
const json = (s) => { try { return JSON.parse(s); } catch { return null; } };

const isSummary = (w) => w.replace(/["']/g, "").replace(/\/+/g, "/").endsWith(".xworkflows/summary.md");
// One pass over the command, linear: words split at spaces and at ; & | newline, a ( or a standalone { opens a piece; a > not after - or a backslash makes the next word a redirect target; after < or << or <<< the next word is a source, a delimiter or a here-string. A write is the summary as a redirect target or as an argument of a piece whose command word is tee. Quotes are not parsed (a quoted mention is denied too).
function writesSummary(cmd) {
  let first = null, target = false, skip = false, w = "";
  const reset = () => { first = null; target = false; skip = false; };
  const flush = () => {
    const t = w; w = "";
    if (t === "") return false;
    if (skip) skip = false;
    else if (target) { target = false; if (isSummary(t)) return true; }
    else if (first === null) first = t;
    else if (first === "tee" && isSummary(t)) return true;
    return false;
  };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (c === "\\") { w += c + (cmd[++i] ?? ""); continue; }
    if (c === ";" || c === "&" || c === "|" || c === "\n") { if (flush()) return true; reset(); }
    else if (c === " " || c === "\t" || c === "\r") { if (flush()) return true; }
    else if (w === "" && (c === "(" || (c === "{" && /\s/.test(cmd[i + 1] ?? " ")))) reset();
    else if (c === ">" && !w.endsWith("-")) {
      if (flush()) return true;
      if (cmd[i + 1] === ">") i++;
      if (cmd[i + 1] === "|") i++;
      target = true;
    } else if (c === "<") {
      if (flush()) return true;
      i += cmd.startsWith("<<<", i) ? 2 : cmd.startsWith("<<", i) ? 1 : 0;
      skip = true;
    } else w += c;
  }
  return flush();
}

export function decide(ev, ctx) {
  const x = (f) => path.join(ev.root, ".xworkflows", f);
  const run = json(ctx.readFile(x("adapt-run.json")));
  if (!run || !(Date.now() - run.startedAt < 12 * 3600 * 1000)) return { decision: "allow" };
  const name = ctx.skillName?.("adapt") ?? "adapt";
  const script = `.claude/skills/${name}/research.workflow.js`;
  const deny = (why) => ({ decision: "deny", reason: `${why} If no /adapt is in progress (a stale run file), run node .claude/skills/${name}/research.mjs done. To bypass in an emergency: XWORKFLOWS_FREE=1.` });
  const check = (...a) => {
    const r = ctx.runCheck(a);
    if (r.code === 0) return null;
    const out = (r.out ?? "").trim();
    if (r.code === 1 && out) return `Ask these first: ${out.split("\n").join(", ")}.`;
    const line = r.code === 1 ? (r.err ?? "").split("\n").find((l) => l.startsWith("adapt: ")) : null;
    if (line) return /interview\.json/.test(line) ? `${line} Run node .claude/skills/${name}/research.mjs queue.` : line;
    process.stderr.write("xworkflows: adapt check could not run\n"); // a crash, a signal or a spawn error never traps
    return null;
  };

  if (ev.kind === "workflow") {
    if (ev.inline || !ev.scriptPath || real(path.resolve(ev.root, ev.scriptPath)) !== real(path.join(ev.root, script)))
      return deny(`Run the fixed research script: scriptPath ${script}.`);
    const scan = json(ctx.readFile(x("scan.json")));
    if (!scan) return deny("Run the scan first: .xworkflows/scan.json is missing.");
    const zero = Object.entries(scan.kinds ?? {}).filter(([, k]) => k.total === 0).map(([k]) => k).sort();
    const given = [...new Set(ev.args?.zeroHits ?? [])].sort();
    if (zero.join() !== given.join()) return deny(`args.zeroHits must be exactly the kinds with no hits in scan.json: ${zero.join(", ") || "none"}.`);
    return { decision: "allow" };
  }

  // shortcut: only a redirect or tee into .xworkflows/summary.md is seen; cp, mv, sed -i or a cd first are not, upgrade by parsing ev.command.
  if (ev.kind === "shell" && writesSummary(ev.command ?? ""))
    return deny("summary.md is written with Write, not by a shell redirect or tee.");

  for (const w of ev.writes ?? []) {
    const abs = realFile(path.resolve(ev.root, w.path.replaceAll("\\", "/")));
    // Files the adapt scripts write; the agent never writes them directly.
    for (const [f, by] of [["research.md", "research.mjs render"], ["screens.json", "research.mjs render"], ["details.md", "research.mjs render"],["rules.json", "rules.mjs"], ["scan.json", "scan.mjs"], ["interview.json", "research.mjs queue"], ["adapt-run.json", "research.mjs start"]])
      if (same(abs, realFile(x(f)))) return deny(`${f} is written by node .claude/skills/${name}/${by}.`);
    if (same(abs, realFile(x("interview.log.jsonl")))) return deny("interview.log.jsonl is written by the adapt-record hook when the owner answers; ask the question with AskUserQuestion.");
    if (!same(abs, realFile(x("summary.md")))) continue;
    if (w.content === undefined) return deny("Write the whole summary with Write.");
    const status = (w.content.match(/^status:\s*["']?(\w+)/mi) ?? [])[1]?.toLowerCase();
    if (status === "approved") {
      const miss = check("--approved");
      if (miss) return deny(`${miss} The P-H1..P-H7 answers must be exactly the English label Right.`);
    } else {
      const miss = check();
      if (miss) return deny(miss);
      const lines = w.content.split("\n");
      const at = HEADINGS.map((h) => lines.findIndex((l) => /^#+\s/.test(l) && l.includes(h)));
      const lack = HEADINGS.filter((_, i) => at[i] < 0);
      if (lack.length) return deny(`The summary lacks these headings: ${lack.join("; ")}.`);
    }
  }
  return { decision: "allow" };
}
