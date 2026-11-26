import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repo, git, cli, readJson, writeJson, doctor } from "./shared.test.mjs";

const AG_WRITE = "write_file|edit_file|write_to_file|replace_file_content|multi_replace_file_content";

test("antigravity fresh install writes .agents/skills, .agents/agents, .agents/hooks.json, adapter, and no .claude/", () => {
  const r = repo();
  const out = cli(r, ["install", "--tool", "antigravity"]);
  assert.equal(out.status, 0, out.stderr);
  for (const p of [
    ".agents/skills/grill/SKILL.md",
    ".agents/skills/adapt/research.workflow.py",
    ".agents/skills/dream/dream.workflow.py",
    ".agents/skills/pending/triage.workflow.py",
    ".agents/skills/full-review/full-review.workflow.py",
    ".agents/agents/explore.md",
    ".agents/agents/implement.md",
    ".agents/agents/review.md",
    ".agents/hooks.json",
    ".xworkflows/hooks/adapters/antigravity.mjs",
    ".xworkflows/installed.json",
    "AGENTS.md",
  ]) assert.ok(existsSync(join(r, p)), p);

  // No JS workflows or Claude folder in Antigravity-only install
  assert.ok(!existsSync(join(r, ".claude")));
  assert.ok(!existsSync(join(r, ".agents/skills/adapt/research.workflow.js")));
  assert.ok(!existsSync(join(r, ".agents/skills/dream/dream.workflow.js")));
  assert.ok(!existsSync(join(r, ".xworkflows/hooks/adapters/claude.mjs")));

  // Rendered agents use valid Antigravity tier keywords, valid CLI tools as YAML list (no unmapped Grep/Glob), subagent: true, mainAgent: false, no effort:, no plugin:skill
  const explore = readFileSync(join(r, ".agents/agents/explore.md"), "utf8");
  const exploreFm = explore.match(/^---\n([\s\S]*?)\n---/)[1];
  assert.match(exploreFm, /^model: flash_lite$/m);
  assert.match(exploreFm, /^tools:\n  - read_file\n  - run_command\n  - search_web$/m);
  assert.match(exploreFm, /^subagent: true$/m);
  assert.match(exploreFm, /^mainAgent: false$/m);
  assert.doesNotMatch(exploreFm, /^effort:/m);
  assert.doesNotMatch(exploreFm, /  - (Grep|Glob|Read|Bash)/);

  const impl = readFileSync(join(r, ".agents/agents/implement.md"), "utf8");
  const implFm = impl.match(/^---\n([\s\S]*?)\n---/)[1];
  assert.match(implFm, /^model: pro$/m);
  assert.match(implFm, /^tools:\n  - read_file\n  - run_command\n  - write_file\n  - edit_file$/m);
  assert.match(implFm, /  - tdd/);
  assert.doesNotMatch(implFm, /ponytail:ponytail/);

  const implFront = readFileSync(join(r, ".agents/agents/implement-front.md"), "utf8");
  assert.match(implFront, /^model: flash$/m);
  const mechCheap = readFileSync(join(r, ".agents/agents/mechanism-cheap.md"), "utf8");
  assert.match(mechCheap, /^model: flash$/m);

  const rev = readFileSync(join(r, ".agents/agents/review.md"), "utf8");
  assert.match(rev, /^model: pro$/m);
  for (const f of readdirSync(join(r, ".agents/agents"))) assert.doesNotMatch(readFileSync(join(r, ".agents/agents", f), "utf8"), /^model: inherit$/m, f);
  assert.match(rev, /\.agents\/rules\//);

  // Rendered skills reference Antigravity tools & Python workflows
  const adaptSkill = readFileSync(join(r, ".agents/skills/adapt/SKILL.md"), "utf8");
  assert.match(adaptSkill, /research\.workflow\.py/);
  assert.match(adaptSkill, /run_workflow/);
  assert.match(adaptSkill, /ask_question/);
  assert.match(adaptSkill, /--tool antigravity/);
  const dreamSkill = readFileSync(join(r, ".agents/skills/dream/SKILL.md"), "utf8");
  assert.match(dreamSkill, /ANTIGRAVITY_CONVERSATION_ID/);
  assert.match(dreamSkill, /dream\.workflow\.py/);
  const orchSkill = readFileSync(join(r, ".agents/skills/orchestrate/SKILL.md"), "utf8");
  assert.match(orchSkill, /node \.xworkflows\/hooks\/run-agent\.mjs <role> <prompt file>/);

  // .agents/hooks.json has all 10 hooks with Antigravity schema (nested matcher for PreToolUse/PostToolUse, flat handler array for SessionStart/PreInvocation/Stop)
  const hooks = readJson(r, ".agents/hooks.json");
  for (const id of ["design-first", "safe-rm", "safe-db", "adapt-gates", "adapt-record", "orchestrator", "handback", "memory", "modes", "handoff-load"]) {
    assert.ok(hooks[`xworkflows-${id}`], `missing xworkflows-${id}`);
  }
  assert.equal(hooks["xworkflows-design-first"].PreToolUse[0].matcher, `${AG_WRITE}|run_command`);
  assert.equal(hooks["xworkflows-modes"].SessionStart[0].type, "command");
  assert.equal(hooks["xworkflows-memory"].Stop[0].type, "command");
  assert.equal(hooks["xworkflows-orchestrator"].PreInvocation[0].type, "command");
  assert.equal(hooks["xworkflows-orchestrator"].PostToolUse[0].matcher, "invoke_subagent");

  const rec = readJson(r, ".xworkflows/installed.json");
  assert.deepEqual(rec.tools, ["antigravity"]);
  assert.equal(out.stdout.trim().split("\n").at(-1), "Next: open Antigravity and type /adapt");

  // Second install is idempotent and preserves antigravity even without --tool
  git(r, "add -A"); git(r, "commit -qm base");
  const out2 = cli(r, ["install"]);
  assert.equal(out2.status, 0, out2.stderr);
  assert.match(out2.stdout, /^nothing to do$/m);
  assert.equal(git(r, "status --porcelain"), "");
});

test("antigravity coexists with claude, preserves user hooks in .agents/hooks.json, and uninstall cleans only ours", () => {
  const r = repo();
  assert.equal(cli(r, ["install", "--tool", "claude"]).status, 0);
  // Pre-existing user hook in .agents/hooks.json and already-approved summary
  mkdirSync(join(r, ".agents"), { recursive: true });
  const userHook = { PreToolUse: [{ matcher: "run_command", hooks: [{ type: "command", command: "./my-lint.sh" }] }] };
  writeJson(r, ".agents/hooks.json", { "my-user-hook": userHook });
  writeFileSync(join(r, ".xworkflows/summary.md"), "---\nstatus: approved\ndate: 2026-11-25\n---\n");

  const out = cli(r, ["install", "--tool", "antigravity"]);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /already adapted/);
  const rec = readJson(r, ".xworkflows/installed.json");
  assert.deepEqual(rec.tools, ["claude", "antigravity"]);
  assert.ok(existsSync(join(r, ".claude/skills/grill/SKILL.md")));
  assert.ok(existsSync(join(r, ".agents/skills/grill/SKILL.md")));
  assert.ok(existsSync(join(r, ".agents/agents/mechanism-cheap.md")));
  assert.ok(!existsSync(join(r, ".claude/agents/mechanism-cheap.md")));
  assert.match(readFileSync(join(r, ".claude/agents/explore.md"), "utf8"), /^model: haiku$/m);
  assert.match(readFileSync(join(r, ".claude/agents/implement-front.md"), "utf8"), /^model: sonnet$/m);
  assert.ok(existsSync(join(r, ".xworkflows/hooks/adapters/claude.mjs")));
  assert.ok(existsSync(join(r, ".xworkflows/hooks/adapters/antigravity.mjs")));

  const hooks = readJson(r, ".agents/hooks.json");
  assert.deepEqual(hooks["my-user-hook"], userHook);
  assert.ok(hooks["xworkflows-design-first"]);

  // Uninstall removes all xworkflows-* keys and keeps my-user-hook
  const un = cli(r, ["uninstall"]);
  assert.equal(un.status, 0, un.stderr);
  assert.ok(existsSync(join(r, ".agents/hooks.json")));
  assert.deepEqual(readJson(r, ".agents/hooks.json"), { "my-user-hook": userHook });
  assert.ok(!existsSync(join(r, ".agents/skills/grill/SKILL.md")));
  assert.ok(!existsSync(join(r, ".claude/skills/grill/SKILL.md")));
});

test("antigravity doctor probes design-first, measures SessionStart bytes, reads GEMINI.md and first-turn tokens", () => {
  const r = repo();
  assert.equal(cli(r, ["install", "--tool", "antigravity"]).status, 0);
  writeFileSync(join(r, "GEMINI.md"), "@[Reglas](AGENTS.md)\n");
  const tr = join(r, ".xworkflows/sample-tr.jsonl");
  writeFileSync(tr, JSON.stringify({ step_index: 1, type: "PLANNER_RESPONSE", input_tokens: 1200, cache_read_tokens: 300 }) + "\n");
  writeJson(r, ".xworkflows/local.json", { antigravity: { sessions: [{ id: "s1", transcript: tr }] } });
  const d = doctor(r);
  assert.match(d.stdout, /ok   probe: design-first denies a spec write/);
  assert.match(d.stdout, /ok   session-start text: \d+ bytes of 3333/);
  assert.match(d.stdout, /ok   first turn: 1500 input tokens \(newest session\)/);
  assert.match(d.stdout, /ok   Antigravity: tested/);
  assert.doesNotMatch(d.stdout, /Claude Code: tested/);
});
