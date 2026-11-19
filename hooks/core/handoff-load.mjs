import path from "node:path";
import { DEFAULTS } from "./config.mjs";

const NONE = { decision: "allow" };

export function decide(ev, ctx) {
  const loads = (ev.event === "sessionStart" && (ev.source === "startup" || ev.source === "clear")) || ev.event === "preCompact";
  if (!loads) return NONE;
  try {
    const text = ctx.readFile(path.join(ev.root, ".xworkflows", "handoff.md"));
    if (typeof text !== "string" || !text) return NONE;
    // fresh: the main branch and HEAD both stand at its sha; a stale hand-off is silent at any size
    const sha = ctx.git("rev-parse", ctx.config?.mainBranch ?? DEFAULTS.mainBranch);
    if (!sha || text.split("\n")[0].trim() !== `main: ${sha}` || ctx.git("rev-parse", "HEAD") !== sha) return NONE;
    const c = ctx.config?.tokens?.handoffBytes, cap = Number.isInteger(c) && c > 0 ? c : DEFAULTS.tokens.handoffBytes; // not a whole number above zero: the default
    if (Buffer.byteLength(text) > cap) return { decision: "allow", context: `The hand-off .xworkflows/handoff.md was not loaded: it is over ${cap} bytes (tokens.handoffBytes).` };
    return { decision: "allow", context: text };
  } catch { return NONE; } // broken input or a git error: never a block
}
