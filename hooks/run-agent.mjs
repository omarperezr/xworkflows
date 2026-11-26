#!/usr/bin/env node
// Runs a reviewer role of Antigravity on its fixed model through `agy -p --model`, never inherit (owner, 2026-11-26).
// Usage: node .xworkflows/hooks/run-agent.mjs <role> <prompt file>
// Standalone: Node built-ins and the core modules beside it only.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { load } from "./core/config.mjs";
import { decide as handback } from "./core/handback.mjs";

const KEYWORDS = new Set(["inherit", "flash_lite", "flash", "pro"]);
const stripFront = (s) => String(s ?? "").replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();

// The tier of a reviewer role: the plain reviewer is `top`, a risk reviewer `strongest`; any other role is not run here.
export function tierOf(role, roles) {
  if (role === roles.reviewer) return "top";
  if (role === roles.riskReviewer || role === roles.riskReviewerLite) return "strongest";
  return null;
}

// The agy call for one run, or { error } naming the fix.
// `agy -p --agent <role>` rejects agents with `mainAgent: false`, so the role's instructions from `.agents/agents/<role>.md` are prepended to the prompt; the orchestrator hook enforces read-only on `XWORKFLOWS_AGENT`.
export function plan({ role, prompt, agentText = "", config, tiers, env = process.env }) {
  const tier = tierOf(role, config.roles);
  if (!tier) return { error: `run-agent runs only ${config.roles.reviewer}, ${config.roles.riskReviewer} and ${config.roles.riskReviewerLite}: launch ${role} with invoke_subagent.` };
  const model = tiers?.antigravity?.[tier];
  if (typeof model !== "string" || !model || KEYWORDS.has(model)) return { error: `.xworkflows/tiers.json: antigravity.${tier} must name a concrete model (such as gemini-4-neon-high), not ${JSON.stringify(model ?? null)}.` };
  if (typeof prompt !== "string" || !prompt.trim()) return { error: "the prompt file is empty." };
  const body = stripFront(agentText);
  const fullPrompt = body ? `${body}\n\n---\n\n${prompt}` : prompt;
  return {
    bin: env.XWORKFLOWS_AGY || "agy",
    args: ["-p", fullPrompt, "--model", model, "--dangerously-skip-permissions"],
    env: { ...env, XWORKFLOWS_AGENT: role },
    model,
  };
}

// The report the child printed, judged by the handback rules of its role.
export function judge(role, report, config) {
  return handback({ kind: "handback", agent: role, message: report }, { config, save: () => {} });
}

export function main(argv, { cwd = process.cwd(), env = process.env, run = spawnSync, out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s) } = {}) {
  const [role, file] = argv;
  if (!role || !file) { err("usage: node .xworkflows/hooks/run-agent.mjs <role> <prompt file>\n"); return 2; }
  let config, tiers, prompt, agentText;
  try { config = load(cwd); } catch (e) { err(`run-agent: ${e.message}\n`); return 2; }
  try { tiers = JSON.parse(readFileSync(join(cwd, ".xworkflows", "tiers.json"), "utf8")); } catch { err("run-agent: .xworkflows/tiers.json is missing or does not parse\n"); return 2; }
  try { prompt = readFileSync(resolve(cwd, file), "utf8"); } catch { err(`run-agent: cannot read ${file}\n`); return 2; }
  const agentPath = join(cwd, ".agents", "agents", `${role}.md`);
  try { agentText = readFileSync(agentPath, "utf8"); } catch { err(`run-agent: cannot read .agents/agents/${role}.md\n`); return 2; }
  const p = plan({ role, prompt, agentText, config, tiers, env });
  if (p.error) { err(`run-agent: ${p.error}\n`); return 2; }
  const r = run(p.bin, p.args, { cwd, env: p.env, encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.error || r.status !== 0) { err(`run-agent: ${p.bin} failed (${r.error?.message ?? `exit ${r.status}`})\n${r.stderr ?? ""}`); return 2; }
  const report = String(r.stdout ?? "");
  out(report);
  const d = judge(role, report, config);
  if (d.decision === "deny") { err(`run-agent: ${d.reason}\n`); return 1; }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
