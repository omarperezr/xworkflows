import path from "node:path";
import { DEFAULTS } from "./config.mjs";

const NONE = { decision: "allow" };

export function decide(ev, ctx) {
  const loads = (ev.event === "sessionStart" && (ev.source === "startup" || ev.source === "clear")) || ev.event === "preCompact";
  if (!loads) return NONE;
  try {
    const text = ctx.readFile(path.join(ev.root, ".xworkflows", "handoff.md"));
    if (typeof text !== "string" || !text) return NONE;
    const cap = ctx.config?.tokens?.handoffBytes ?? DEFAULTS.tokens.handoffBytes;
    if (Buffer.byteLength(text) > cap) return { decision: "allow", context: `The hand-off .xworkflows/handoff.md was not loaded: it is over ${cap} bytes (tokens.handoffBytes).` };
    const sha = ctx.git("rev-parse", ctx.config?.mainBranch ?? DEFAULTS.mainBranch);
    return sha && text.split("\n")[0].trim() === `main: ${sha}` ? { decision: "allow", context: text } : NONE;
  } catch { return NONE; } // broken input or a git error: never a block
}
