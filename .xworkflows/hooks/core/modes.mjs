import path from "node:path";

const LEAD = "About the owner (from ~/.xworkflows/owner.md):";

export function decide(ev, ctx) {
  if (ev.event !== "sessionStart" || !ctx.home) return { decision: "allow" };
  let text = null;
  try { text = ctx.readFile(path.join(ctx.home, ".xworkflows", "owner.md")); } catch { /* unreadable: no context */ }
  if (typeof text !== "string" || !text.trim()) return { decision: "allow" };
  return { decision: "allow", context: `${LEAD}\n${text}` };
}
