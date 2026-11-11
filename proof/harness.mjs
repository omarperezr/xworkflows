// Development-only: runs /adapt in fresh repo copies through the Claude Agent SDK.
// usage: node proof/harness.mjs --source <dir> --commit <sha> [--init] [--strip a,b] --answers <file|none> --trials <n> --mode full|research-only --out <dir>
import { query } from "@anthropic-ai/claude-agent-sdk";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { answerFor, stripLeft, stripPlan, toAnswers } from "./answers.mjs";

const REPO = resolve(import.meta.dirname, "..");
const MODEL = "claude-opus-5-5";
const TIMEOUT_MS = 60 * 60 * 1000;
const GIT = ["-c", "user.name=proof", "-c", "user.email=proof@example.invalid"];
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const git = (cwd, ...a) => run("git", a, cwd);

const { values: o } = parseArgs({ options: {
  source: { type: "string" }, commit: { type: "string" }, init: { type: "boolean" }, strip: { type: "string" },
  answers: { type: "string" }, trials: { type: "string", default: "1" }, mode: { type: "string", default: "full" }, out: { type: "string" },
} });
const source = o.source || process.env.XWF_PROOF_SOURCE;
if (!source || !o.out || !o.answers || !["full", "research-only"].includes(o.mode)) {
  console.error("usage: harness.mjs --source <dir> [--commit <sha>] [--init] [--strip a,b] --answers <file|none> --trials <n> --mode full|research-only --out <dir>");
  process.exit(2);
}
const answers = o.answers === "none" ? {} : toAnswers(readFileSync(o.answers, "utf8"));
const strip = (o.strip || "").split(",").filter(Boolean);

function prepare() {
  const dir = mkdtempSync(join(tmpdir(), "proof-trial-"));
  if (o.init) {
    cpSync(source, dir, { recursive: true });
    git(dir, "init", "-q");
    git(dir, "add", "-A");
    git(dir, ...GIT, "commit", "-q", "-m", "proof: initial");
  } else {
    run("git", ["clone", "-q", "--no-hardlinks", source, dir]);
    if (o.commit) git(dir, "checkout", "-q", o.commit);
    git(dir, "remote", "remove", "origin");
  }
  run("node", [join(REPO, "bin/xworkflows.mjs"), "install", "--yes"], dir);
  run("graphify", ["update", "."], dir);
  if (strip.length) {
    const files = () => git(dir, "ls-files").split("\n").filter(Boolean);
    for (const p of stripPlan(strip, files()).remove) git(dir, "rm", "-r", "-q", "--", p);
    git(dir, ...GIT, "commit", "-q", "--allow-empty", "-m", "proof: remove instruction files");
    const left = stripLeft(strip, files());
    if (left.length) throw new Error(`strip left: ${left.join(", ")}`);
  }
  return dir;
}

async function trial(n) {
  const cwd = prepare();
  const ac = new AbortController();
  let stoppedAt = null, misses = 0, costUsd = 0;
  const timer = setTimeout(() => { stoppedAt = "timeout"; ac.abort(); }, TIMEOUT_MS);
  const canUseTool = async (name, input) => {
    if (name !== "AskUserQuestion") return { behavior: "allow", updatedInput: input };
    const out = {};
    for (const q of input.questions) {
      const a = answerFor(q, answers);
      if (a.stop) { stoppedAt = "S5-next"; setTimeout(() => ac.abort(), 0); return { behavior: "deny", message: "trial over" }; }
      if (a.miss) misses++;
      out[q.question] = a.answer;
    }
    return { behavior: "allow", updatedInput: { ...input, answers: out } };
  };
  const t0 = Date.now();
  try {
    // A query emits several results (the Workflow finishes in a later turn): read until stop, timeout or stream end.
    for await (const m of query({ prompt: o.mode === "research-only" ? "/adapt research-only" : "/adapt",
      options: { cwd, model: MODEL, settingSources: ["project"], canUseTool, abortController: ac } })) {
      if (m.type === "result" && typeof m.total_cost_usd === "number") costUsd = m.total_cost_usd;
    }
  } catch (e) { if (!ac.signal.aborted) console.error(`trial ${n}: ${e}`); }
  clearTimeout(timer);
  return { cwd, stoppedAt, misses, costUsd, durationMs: Date.now() - t0 };
}

function save(n, r) {
  const dir = join(o.out, `trial-${n}`);
  mkdirSync(dir, { recursive: true });
  const X = join(r.cwd, ".xworkflows");
  const copy = (from, to, opts) => { if (existsSync(from)) { mkdirSync(join(to, ".."), { recursive: true }); cpSync(from, to, opts); } };
  for (const f of ["research.md", "research.json", "scan.json", "interview.log.jsonl"]) copy(join(X, f), join(dir, f));
  copy(join(r.cwd, "AGENTS.md"), join(dir, "AGENTS.md"));
  copy(join(r.cwd, ".claude/rules"), join(dir, ".claude/rules"), { recursive: true });
  copy(join(r.cwd, ".claude/agents/risk-review.md"), join(dir, ".claude/agents/risk-review.md"));
  const manifest = JSON.parse(readFileSync(join(REPO, "manifest.json"), "utf8"));
  const kinds = {};
  try { for (const k of Object.values(JSON.parse(readFileSync(join(dir, "research.json"), "utf8")).kinds)) kinds[k.kind] = k?.status; } catch { /* no research.json */ }
  const meta = {
    trial: n, model: MODEL, cliVersion: run("claude", ["--version"]).trim(),
    skillHash: manifest.pieces.find((p) => p.id === "adapt").sha256,
    commit: o.commit ?? null, costUsd: r.costUsd, misses: r.misses, durationMs: r.durationMs,
    stoppedAt: r.stoppedAt, failed: r.stoppedAt === "timeout", kinds,
  };
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
}

for (let n = 1; n <= Number(o.trials); n++) {
  const r = await trial(n);
  save(n, r);
  console.log(`trial ${n}: cost $${r.costUsd.toFixed(2)}, ${r.misses} misses, stopped at ${r.stoppedAt ?? "stream end"}`);
}
