// Development-only, not shipped: drives one real Claude Code session through the method's stages in a throwaway
// project, answering every question dialog with its first option, and records what happened.
// usage: node proof/flow.mjs --cwd <project> --prompt <text> --out <dir> --api-credits [--spend-file <file>] [--model <id>] [--max-usd <n>]
// Spending goes to the harness's ledger (--spend-file, else the default of proof/trial-lib.mjs).
import { acquireLock, releaseLock, addSpend, apiKeyGuard, budgetStop, outNotIgnored, outsideTrial, readLedger, restoreOwner, spendFilePath, withOwnerBackup } from "./trial-lib.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

// Returns the exit code. deps replaces what a test must not touch: query (the model call), home, repo, env and the output lines.
export async function runFlow(argv, deps = {}) {
  const { home = homedir(), repo = resolve(import.meta.dirname, ".."), env = process.env, exec = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), log = console.log, err = console.error } = deps;
  let o;
  try { ({ values: o } = parseArgs({ args: argv, options: {
    cwd: { type: "string" }, prompt: { type: "string" }, out: { type: "string" }, "spend-file": { type: "string" },
    "api-credits": { type: "boolean" }, model: { type: "string", default: "claude-sonnet-5-5" }, "max-usd": { type: "string", default: "6" },
  } })); } catch (e) { err(`flow: ${e.message}`); return 2; }
  if (!o.cwd || !o.prompt || !o.out) { err("usage: flow.mjs --cwd <project> --prompt <text> --out <dir> --api-credits [--spend-file <file>]"); return 2; }
  const cap = Number(o["max-usd"]);
  if (!(cap > 0)) { err("--max-usd must be a positive number"); return 2; }
  const guard = apiKeyGuard(env, o["api-credits"]);
  if (guard) { err(guard); return 1; }
  const notIgnored = outNotIgnored(o.out, exec);
  if (notIgnored) { err(notIgnored); return 2; }
  const spendFile = spendFilePath(repo, o["spend-file"]);
  const why = budgetStop(readLedger(spendFile).totalUsd, cap, 60);
  if (why) { err(`not starting: ${why}`); return 2; }
  const lock = acquireLock(home);
  if (!lock.ok) { err(`another proof run (pid ${lock.pid}) holds the owner profile lock`); return 2; }
  if (restoreOwner(home)) log("restored ~/.xworkflows/owner.md from a backup left by an earlier killed run");
  const onSignal = () => { restoreOwner(home); releaseLock(home); process.exit(1); };
  const sigs = ["SIGINT", "SIGTERM"];
  for (const sig of sigs) process.on(sig, onSignal);
  try {
    const query = deps.query ?? (await import("@anthropic-ai/claude-agent-sdk")).query;
    mkdirSync(o.out, { recursive: true });
    const events = [];
    const asked = [];
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 45 * 60 * 1000);
    // A write or a shell command outside the project is denied; every question dialog is answered with its first option: the session's recommended one.
    const canUseTool = async (name, input) => {
      const outside = outsideTrial(name, input, o.cwd);
      if (outside) return { behavior: "deny", message: outside };
      if (name !== "AskUserQuestion") return { behavior: "allow", updatedInput: input };
      const answers = {};
      for (const q of input.questions) { answers[q.question] = q.options?.[0]?.label ?? "Yes"; asked.push({ header: q.header, question: q.question, answer: answers[q.question] }); }
      return { behavior: "allow", updatedInput: { ...input, answers } };
    };
    let costUsd = 0, result = null, turns = 0, error = null;
    await withOwnerBackup(home, async () => {
      try {
        for await (const m of query({ prompt: o.prompt, options: { cwd: o.cwd, model: o.model, settingSources: ["project"], permissionMode: "default", systemPrompt: { type: "preset", preset: "claude_code" }, canUseTool, abortController: ac, maxBudgetUsd: cap } })) {
          if (m.type === "assistant") for (const b of m.message?.content ?? []) if (b.type === "tool_use") events.push({ tool: b.name, sub: Boolean(m.parent_tool_use_id), input: b.name === "Skill" ? b.input?.skill : b.name === "Agent" ? b.input?.subagent_type : b.name === "Bash" ? String(b.input?.command).slice(0, 160) : b.name === "Write" || b.name === "Edit" ? b.input?.file_path : undefined });
          if (m.type === "result") { costUsd = m.total_cost_usd ?? costUsd; result = m.result ?? m.subtype; turns = m.num_turns ?? turns; }
        }
      } catch (e) { error = String(e); }
    });
    clearTimeout(timer);
    const counted = error || result === null ? Math.max(costUsd, cap) : costUsd;
    const total = addSpend(spendFile, { out: `flow ${o.out}`, trial: 1, at: new Date().toISOString(), recordedUsd: costUsd, countedUsd: counted });
    writeFileSync(join(o.out, "flow.json"), JSON.stringify({ model: o.model, prompt: o.prompt, costUsd, turns, error, result, asked, events }, null, 2) + "\n");
    log(`flow: ${turns} turns, ${events.length} tool calls, ${asked.length} questions answered, recorded ${costUsd.toFixed(2)} USD, ledger total ${total.toFixed(2)} USD${error ? `, error: ${error}` : ""}`);
    return 0;
  } finally { for (const sig of sigs) process.off(sig, onSignal); releaseLock(home); }
}

if (import.meta.filename === process.argv[1]) process.exitCode = await runFlow(process.argv.slice(2));
