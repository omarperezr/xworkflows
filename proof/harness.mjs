// Development-only: runs /adapt in fresh repo copies through the Claude Agent SDK.
// usage: node proof/harness.mjs --source <dir> --commit <sha> [--init] [--strip a,b] --answers <file|none> --trials <n> --mode full|research-only --out <dir> [--spend-file <file>]
// Spending is summed across runs in --spend-file (default <out>/../proof-spend.json); --max-usd-total caps that sum.
import { addSpend, apiKeyGuard, budgetStop, countedCost, prepareCopy, readLedger, restoreOwner, stopFor, withOwnerBackup } from "./trial-lib.mjs";
import { answerFor, loadAnswers } from "./answers.mjs";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";


const REPO = resolve(import.meta.dirname, "..");
const MODEL = "claude-opus-5-5";
const TIMEOUT_MS = 60 * 60 * 1000;
const exec = (cmd, args, cwd, timeout) => execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout });
const die = (m) => { console.error(m); process.exit(2); };

const { values: o } = parseArgs({ options: {
  source: { type: "string" }, commit: { type: "string" }, init: { type: "boolean" }, strip: { type: "string" },
  answers: { type: "string" }, trials: { type: "string", default: "1" }, mode: { type: "string", default: "full" }, out: { type: "string" },
  "api-credits": { type: "boolean" }, "max-usd-per-trial": { type: "string", default: "15" }, "max-usd-total": { type: "string", default: "60" },
  "spend-file": { type: "string" },
} });
const guard = apiKeyGuard(process.env, o["api-credits"]);
if (guard) { console.error(guard); process.exit(1); }
const { query } = await import("@anthropic-ai/claude-agent-sdk");
const perTrial = Number(o["max-usd-per-trial"]), totalCap = Number(o["max-usd-total"]);
if (!(perTrial > 0) || !(totalCap > 0)) die("--max-usd-per-trial and --max-usd-total must be positive numbers");
const source = o.source || process.env.XWF_PROOF_SOURCE;
if (!source || !o.out || !o.answers || !["full", "research-only"].includes(o.mode)) die("usage: harness.mjs --source <dir> --commit <sha> [--init] [--strip a,b] --answers <file|none> --trials <n> --mode full|research-only --out <dir>");
if (!/^[1-9]\d*$/.test(o.trials)) die("--trials must be a positive integer");
if (!o.commit && !o.init) die("--commit is required (or --init)");
let answers = {};
if (o.answers !== "none") { try { answers = loadAnswers(readFileSync(o.answers, "utf8")); } catch (e) { die(`--answers ${o.answers}: ${e.message}`); } }
const strip = (o.strip || "").split(",").filter(Boolean);

async function trial(n) {
  const cwd = mkdtempSync(join(tmpdir(), "proof-trial-"));
  let commit;
  try {
    commit = prepareCopy({ dir: cwd, source, commit: o.commit, init: o.init, strip, repo: REPO, exec, copyDir: (a, b) => cpSync(a, b, { recursive: true }) });
  } catch (e) {
    console.error(`trial ${n}: prepare failed: ${e}`);
    rmSync(cwd, { recursive: true, force: true });
    return { cwd, commit: null, stoppedAt: "prepare", misses: 0, costUsd: 0, cliVersion: "unknown", error: String(e), failed: true, durationMs: 0 };
  }
  const ac = new AbortController();
  let stoppedAt = null, misses = 0, costUsd = 0, cliVersion = "unknown", error = null, fallback = null, failed = false, gotResult = false;
  const stop = (why) => { stoppedAt = why; fallback ??= setTimeout(() => { failed = true; ac.abort(); }, 60_000); };
  const timer = setTimeout(() => { stoppedAt = "timeout"; failed = true; ac.abort(); }, TIMEOUT_MS);
  const canUseTool = async (name, input) => {
    const skip = stopFor(name, input);
    if (skip) { stop(skip); return { behavior: "deny", message: "trial ends here", interrupt: true }; }
    if (name !== "AskUserQuestion") return { behavior: "allow", updatedInput: input };
    const out = {};
    for (const q of input.questions) {
      const a = answerFor(q, answers);
      if (a.stop) { stop("S5-next"); return { behavior: "deny", message: "trial ends here", interrupt: true }; }
      if (a.miss) misses++;
      out[q.question] = a.answer;
    }
    return { behavior: "allow", updatedInput: { ...input, answers: out } };
  };
  const t0 = Date.now();
  try {
    // A query emits several results (the Workflow finishes in a later turn): read until stop, timeout or stream end.
    // After a stop, the next result carries the last turn's cost.
    for await (const m of query({ prompt: o.mode === "research-only" ? "/adapt research-only" : "/adapt",
      options: { cwd, model: MODEL, settingSources: ["project"], permissionMode: "default", systemPrompt: { type: "preset", preset: "claude_code" }, canUseTool, abortController: ac, maxBudgetUsd: perTrial } })) {
      if (m.type === "system" && m.subtype === "init" && m.claude_code_version) cliVersion = m.claude_code_version;
      if (m.type === "result") {
        gotResult = true;
        if (typeof m.total_cost_usd === "number") costUsd = m.total_cost_usd;
        if (String(m.subtype).startsWith("error_")) { failed = true; stoppedAt ??= m.subtype === "error_max_budget_usd" ? "budget" : m.subtype; break; }
        if (stoppedAt === "S5-next" || stoppedAt === "S5-skip") break;
      }
    }
  } catch (e) { if (!ac.signal.aborted) { error = String(e); console.error(`trial ${n}: ${e}`); } }
  clearTimeout(timer); clearTimeout(fallback);
  ac.abort();
  return { cwd, commit, stoppedAt, misses, costUsd, cliVersion, error, failed: failed || !!error, noResult: !gotResult, durationMs: Date.now() - t0 };
}

function save(n, r) {
  const dir = join(o.out, `trial-${n}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const X = join(r.cwd, ".xworkflows");
  const copy = (from, to, opts) => { if (existsSync(from)) { mkdirSync(join(to, ".."), { recursive: true }); cpSync(from, to, opts); } };
  for (const f of ["research.md", "research.json", "scan.json", "interview.log.jsonl"]) copy(join(X, f), join(dir, f));
  copy(join(r.cwd, "AGENTS.md"), join(dir, "AGENTS.md"));
  copy(join(r.cwd, ".claude/rules"), join(dir, ".claude/rules"), { recursive: true });
  copy(join(r.cwd, ".claude/agents/risk-review.md"), join(dir, ".claude/agents/risk-review.md"));
  const kinds = {};
  let skillHash = null;
  try { skillHash = JSON.parse(readFileSync(join(REPO, "manifest.json"), "utf8")).pieces.find((p) => p.id === "adapt").sha256; } catch { /* unknown */ }
  try { for (const k of Object.values(JSON.parse(readFileSync(join(dir, "research.json"), "utf8")).kinds)) kinds[k.kind] = k?.status; } catch { /* no research.json */ }
  writeFileSync(join(dir, "meta.json"), JSON.stringify({
    trial: n, model: MODEL, cliVersion: r.cliVersion, skillHash, commit: r.commit, stripped: strip,
    costUsd: r.costUsd, misses: r.misses, durationMs: r.durationMs, stoppedAt: r.stoppedAt,
    failed: r.failed, error: r.error, kinds,
  }, null, 2) + "\n");
}

if (restoreOwner(homedir())) console.log("restored ~/.xworkflows/owner.md from a backup left by an earlier killed run");
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { restoreOwner(homedir()); process.exit(1); });
const spendFile = o["spend-file"] || join(resolve(o.out), "..", "proof-spend.json");
let spent;
try { spent = readLedger(spendFile).totalUsd; } catch (e) { die(`spend ledger ${spendFile}: ${e.message}`); }
console.log(`spend ledger ${spendFile}: ${spent.toFixed(2)} USD spent before this run`);
for (let n = 1; n <= Number(o.trials); n++) {
  const why = budgetStop(spent, perTrial, totalCap);
  if (why) { console.log(`not starting trial ${n}: ${why}`); break; }
  const r = await withOwnerBackup(homedir(), () => trial(n));
  const counted = countedCost(r, perTrial);
  try { save(n, r); } catch (e) { console.error(`trial ${n}: save failed: ${e}`); }
  rmSync(r.cwd, { recursive: true, force: true });
  try { spent = addSpend(spendFile, { out: o.out, trial: n, at: new Date().toISOString(), recordedUsd: r.costUsd, countedUsd: counted }); }
  catch (e) { die(`trial ${n}: could not add ${counted.toFixed(2)} USD to the spend ledger ${spendFile}: ${e.message}; stopping`); }
  console.log(`trial ${n}: recorded ${r.costUsd.toFixed(2)} USD, counted ${counted.toFixed(2)} USD, ledger total ${spent.toFixed(2)} USD of ${totalCap} cap`);
}
