import { appendFileSync, lstatSync } from "node:fs";
import path from "node:path";

// Appends one line per answered question while an adapt run is active; the id is the question's header.
export function decide(ev, ctx) {
  const run = (() => {
    try {
      const r = JSON.parse(ctx.readFile(path.join(ev.root, ".xworkflows", "adapt-run.json")));
      const age = Date.now() - r.startedAt;
      if (age >= 12 * 3600 * 1000 && ev.tool === "AskUserQuestion") process.stderr.write(`xworkflows: the interview expired after 12 hours and its answers are not recorded; start it again with node .claude/skills/${ctx.skillName?.("adapt") ?? "adapt"}/research.mjs start\n`);
      return age >= 0 && age < 12 * 3600 * 1000 ? r.run : null; // a start time in the future is a forged file
    } catch { return null; }
  })();
  if (!run || ev.tool !== "AskUserQuestion") return { decision: "allow" };
  const dir = path.join(ev.root, ".xworkflows");
  for (const p of [dir, path.join(dir, "interview.log.jsonl")]) try { if (lstatSync(p).isSymbolicLink()) return { decision: "allow" }; } catch { /* absent: fine */ }
  const answers = ev.input?.answers ?? ev.response?.answers ?? {};
  const lines = (ev.input?.questions ?? []).filter((q) => q.question in answers).map((q) =>
    JSON.stringify({ run, id: q.header, question: q.question, options: (q.options ?? []).map((o) => o.label), answer: answers[q.question] }) + "\n");
  if (lines.length) appendFileSync(path.join(dir, "interview.log.jsonl"), lines.join(""));
  return { decision: "allow" };
}
