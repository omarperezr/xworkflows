import path from "node:path";
import { realpathSync } from "node:fs";

const HEADINGS = ["What it is", "Who pays", "Aspirations at about", "Risks, the costliest", "What must not change", "Zones and which", "How the owner works", "About you"];
const real = (p) => { try { return realpathSync(p); } catch { return path.resolve(p); } };
const json = (s) => { try { return JSON.parse(s); } catch { return null; } };

export function decide(ev, ctx) {
  const x = (f) => path.join(ev.root, ".xworkflows", f);
  const run = json(ctx.readFile(x("adapt-run.json")));
  if (!run || !(Date.now() - run.startedAt < 12 * 3600 * 1000)) return { decision: "allow" };
  const name = ctx.skillName?.("adapt") ?? "adapt";
  const script = `.claude/skills/${name}/research.workflow.js`;
  const deny = (why) => ({ decision: "deny", reason: `${why} No adapt running? Run node .claude/skills/${name}/research.mjs done. To bypass in an emergency: XWORKFLOWS_FREE=1.` });
  const check = (...a) => {
    const r = ctx.runCheck(a);
    return r.code === 0 ? null : r.out || "the adapt check failed";
  };

  if (ev.kind === "workflow") {
    if (ev.inline || !ev.scriptPath || real(path.resolve(ev.root, ev.scriptPath)) !== real(path.join(ev.root, script)))
      return deny(`Run the fixed research script: scriptPath ${script}.`);
    const scan = json(ctx.readFile(x("scan.json")));
    if (!scan) return deny("Run the scan first: .xworkflows/scan.json is missing.");
    const zero = Object.entries(scan.kinds ?? {}).filter(([, k]) => k.total === 0).map(([k]) => k).sort();
    const given = [...(ev.args?.zeroHits ?? [])].sort();
    if (zero.join() !== given.join()) return deny(`args.zeroHits must be exactly the kinds with no hits in scan.json: ${zero.join(", ") || "none"}.`);
    return { decision: "allow" };
  }

  for (const w of ev.writes ?? []) {
    const abs = path.resolve(ev.root, w.path.replaceAll("\\", "/"));
    if (abs === x("research.md")) return deny(`research.md is written by node .claude/skills/${name}/research.mjs render.`);
    if (abs !== x("summary.md")) continue;
    if (w.content === undefined) return deny("Write the whole summary with Write.");
    const status = (w.content.match(/^status:\s*(\w+)/m) ?? [])[1];
    if (status === "approved") {
      const miss = check("--approved");
      if (miss) return deny(`Ask these first: ${miss.split("\n").join(", ")}.`);
    } else if (status === "draft") {
      const miss = check();
      if (miss) return deny(`Ask these first: ${miss.split("\n").join(", ")}.`);
      const lines = w.content.split("\n");
      const at = HEADINGS.map((h) => lines.findIndex((l) => /^#+\s/.test(l) && l.includes(h)));
      const lack = HEADINGS.filter((_, i) => at[i] < 0);
      if (lack.length) return deny(`The summary lacks these headings: ${lack.join("; ")}.`);
      const r = json(ctx.readFile(x("research.json")));
      const end = lines.findIndex((l, i) => i > at[4] && /^#+\s/.test(l));
      const five = lines.slice(at[4], end < 0 ? undefined : end).map((l) => l.replace(/^\s*[-*]?\s*/, ""));
      const none = Object.entries(r?.kinds ?? {}).filter(([k, v]) => v.status === "absent" && !five.some((l) => l.startsWith(`${k}:`))).map(([k]) => k);
      if (none.length) return deny(`Heading 5 needs a line for each of these, "<kind>: <rule>", "<kind>: unprotected: <risk>" or "<kind>: not applicable": ${none.join(", ")}.`);
    }
  }
  return { decision: "allow" };
}
