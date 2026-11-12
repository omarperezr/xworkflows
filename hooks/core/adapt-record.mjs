import { appendFileSync } from "node:fs";
import path from "node:path";

// Appends one line per answered question while an adapt run is active; the id is the question's header.
export function decide(ev, ctx) {
  const run = (() => { try { const r = JSON.parse(ctx.readFile(path.join(ev.root, ".xworkflows", "adapt-run.json"))); return Date.now() - r.startedAt < 12 * 3600 * 1000 ? r.run : null; } catch { return null; } })();
  if (!run || ev.tool !== "AskUserQuestion") return { decision: "allow" };
  const answers = ev.input?.answers ?? ev.response?.answers ?? {};
  const lines = (ev.input?.questions ?? []).filter((q) => q.question in answers).map((q) =>
    JSON.stringify({ run, id: q.header, question: q.question, options: (q.options ?? []).map((o) => o.label), answer: answers[q.question] }) + "\n");
  if (lines.length) appendFileSync(path.join(ev.root, ".xworkflows", "interview.log.jsonl"), lines.join(""));
  return { decision: "allow" };
}
