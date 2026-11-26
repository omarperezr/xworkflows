# Native Antigravity support for xworkflows

Goal: G2

## 1. The request

Request: add full, live-tested support for Google Antigravity (`agy` CLI, Antigravity App, Antigravity IDE) to `xworkflows` as `--tool antigravity`, coexisting side by side with Claude Code in the same repository, and install and adapt it in the owner's project. Done: `xworkflows install --tool antigravity` (alone or alongside `claude`) installs the full method (all 14 skills, 13 custom agents, 10 hooks in `.agents/hooks.json`, Python workflows for `run_workflow`, `/dream` and `doctor` transcript support), `node --test` and `pack --check` pass, `xworkflows doctor` exits 0 with `Antigravity: tested`, and real `agy -p` sessions prove hook enforcement (`design-first`, `handback`, `orchestrator`) with recorded fixtures.

Material:
- Antigravity discovers skills at `.agents/skills/<name>/SKILL.md`, custom agents at `.agents/agents/<name>.md`, rules at `AGENTS.md`, `GEMINI.md`, and `.agents/rules/*.md` (frontmatter `trigger: glob` + `globs:`), and hooks at `.agents/hooks.json` (official docs `antigravity.google/docs/{hooks,rules,skills,subagents,dynamic-workflows,models}.md`, `read not tested`, verified live below).
- Live `agy -p` probes (2026-11-25) proved:
  - `agy` sends `PreToolUse`/`PostToolUse` tool names `read_file`, `write_file`, `edit_file`, `run_command`, `invoke_subagent`, `run_workflow`, `ask_question`, `send_message`, `search_web` (while App/IDE docs list `view_file`, `write_to_file`, `replace_file_content`, `multi_replace_file_content`, `read_url_content`). `tested`
  - Returning `{"decision":"deny","reason":"..."}` from `PreToolUse` blocks `write_file`. `tested`
  - Subagents report back via `PreToolUse(send_message)` targeting the parent `conversationId`, enabling live `handback` enforcement. `tested`
  - `PostToolUse(invoke_subagent)` transcript step (`stepIdx` in `transcriptPath`) contains the child `conversationId`, linking child events (`isSubagent: true`, `agent: TypeName`, `session: parentId`). Workflow child agents carry the `lastUserInput` suffix `When you are done, call the finish tool with your result.`. `tested`
  - `PostToolUse(ask_question)` transcript step contains `A1: ...` answers, enabling `adapt-record` when `/adapt` prefixes `[<id>] ` in the question text. `tested`
  - `.agents/agents/*.md` and `run_workflow` accept only the 4 model keywords (`flash_lite`, `flash`, `pro`, `inherit`); concrete model IDs cause silent agent discard in `.agents/agents/*.md` and an error in `run_workflow`. Live resolution: `flash_lite` -> `gemini-3.5-flash-lite`, `flash` -> `gemini-4-hydrogen-tiered-high`, `pro` -> `gemini-4-hydrogen-tiered-xhigh`, `inherit` -> parent session model (e.g. `gemini-4-neon-xhigh`). `tested`
  - Artificial Analysis Coding Agent Index v2.1 (2026-11-25): `Antigravity CLI - Gemini 4 Neon (Xhigh)` ranks #1 at 58.6 (FC2 43.0%, QnA 67.7%, TB4 65.2%, $6.86/task, 30.5m) vs `Gemini 4 Hydrogen (Xhigh)` at 52.3 ($4.45, 32.1m). `read not tested`
  - `docs/gaps.md:8` notes Gemini CLI was replaced by Antigravity CLI on 2026-06-18 for unpaid/Google One tiers. `read not tested`

## 2. Design

1. **Tool name and coexistence.** The tool name is `antigravity` (`--tool antigravity`, or `--tool claude,antigravity`). Installing `antigravity` in a repo that already has `claude` keeps `claude` intact and records both in `.xworkflows/installed.json` `tools`; `--tool claude` preserves existing behavior for all current tests. The old Phase-0 `gemini.mjs` stub is marked superseded by `antigravity` in `docs/gaps.md`.
2. **Model tiers (`tiers.json`).** Under `"antigravity"`: `cheap: "flash"` (`gemini-4-hydrogen-tiered-high`), `medium: "inherit"`, `top: "inherit"`, `strongest: "inherit"`. Coding and reviews run on the session's Gemini 4 Neon model while exploration, mechanical edits, `/dream`, and `/pending triage` run on Hydrogen High. `/orchestrate` reminds the owner to switch to `/effort xhigh` before `risk-review` when the main session runs at a lower effort.
3. **Hook adapter (`hooks/adapters/antigravity.mjs`).**
   - Supports both CLI tool names (`read_file`, `write_file`, `edit_file`, `run_command`, `search_web`, `ask_question`, `invoke_subagent`, `run_workflow`, `send_message`) and App/IDE tool names (`view_file`, `write_to_file`, `replace_file_content`, `multi_replace_file_content`, `read_url_content`).
   - Maps `SessionStart` -> `sessionStart` (`source: "startup"`), `PreInvocation` -> `prompt` (with `fromUser: true` only when `lastUserInput` changed for that session), `PreToolUse` -> `preTool`, `PostToolUse` -> `postTool`, `Stop` -> `stop` (carrying `fullyIdle`).
   - Tracks parent/child subagent mappings in `stateDir` (`PostToolUse(invoke_subagent)` reads the child `conversationId` from `transcriptPath` at `stepIdx`) and detects workflow children via the `finish` prompt suffix; subagent events carry `isSubagent: true`, `agent`, and parent `session`.
   - `PreToolUse(send_message)` from a subagent to its parent normalizes to `kind: "handback"`.
   - `PostToolUse(ask_question)` reads `A1:`..`An:` from `transcriptPath` at `stepIdx`, extracts `[<id>] ` prefixes as `header`, and supplies `{ input, response }` to `adapt-record`.
   - `SessionStart` records main-session `{ id, transcript }` into git-ignored `.xworkflows/local.json` so `/dream`, `memory.mjs` `dreamLine`, and `doctor` find project sessions reliably across Antigravity CLI, App, and IDE.
   - Outputs Antigravity's JSON contract: `PreToolUse` returns `{ decision: "allow"|"deny"|"ask", reason }`, `SessionStart`/`PreInvocation` return `{ injectSteps: [...] }` (with `metadata.user_markdown` for notices), and `PostToolUse`/`Stop` return `{}`.
4. **Core hooks and checks.**
   - `hooks/core/config.mjs`: include `.agents/` in `paths.nonCode` and `GEMINI.md`, `.agents/rules/` in `paths.curated`.
   - `hooks/core/ctx.mjs`: resolve `skillName`, `agentName`, and `runCheck` against `ev.toolDir` (`.agents` for Antigravity, `.claude` for Claude).
   - `hooks/core/orchestrator.mjs`: check `${ev.toolDir}/agents/${type}.md` (or `.claude/agents/${type}.md`).
   - `hooks/core/adapt-gates.mjs`: accept `research.workflow.py` when `ev.toolDir === ".agents"` and `research.workflow.js` otherwise.
   - `hooks/core/adapt-record.mjs`: match `ev.kind === "ask"` rather than hardcoded `ev.tool === "AskUserQuestion"`.
   - `hooks/core/memory.mjs`: rebuild memory index on `ev.event === "stop"` when `ev.fullyIdle && !ev.isSubagent`; support Antigravity project session lists from `.xworkflows/local.json` in `dreamLine`.
   - `checks/skills-travel.mjs`: validate skills listed in `.agents/agents/*.md` against `.agents/skills/` as well as `.claude/agents/*.md`.
5. **Python workflows and scripts.**
   - Ship Python equivalents for `run_workflow` alongside JS workflows: `skills/adapt/research.workflow.py` (with identical `sum()` checksum), `skills/dream/dream.workflow.py`, `skills/pending/triage.workflow.py`, and `skills/full-review/full-review.workflow.py`.
   - `skills/adapt/research.mjs`: read the active tool's tiers (`--tool antigravity` or fallback detection) and check `.agents/agents/risk-review.md` as well as `.claude/agents/risk-review.md`.
   - `skills/dream/extract.mjs`: parse Antigravity `transcript_full.jsonl` format (`USER_INPUT` / `PLANNER_RESPONSE`) and support reading project session lists from `.xworkflows/local.json` (`--tool antigravity`).
6. **Installer, renderer, `doctor`, and `uninstall` (`bin/xworkflows.mjs`).**
   - Single source in `agents/` and `skills/`. At install time for `antigravity`:
     - Write `.agents/agents/<name>.md` rendered with `model: <tiers.antigravity[tier]>`, `subagent: true`, `mainAgent: false`, mapped Antigravity CLI tool list (`read_file`, `write_file`, `edit_file`, `run_command`, `search_web` — omitting unmapped `Grep`/`Glob`), without `effort:`, with Antigravity skill paths and `.agents/rules/` references.
     - Write `.agents/skills/<name>/` with `.workflow.py` (omitting `.workflow.js`) and `SKILL.md` rendered for Antigravity tool names (`ask_question`, `run_workflow`, `invoke_subagent`, `.agents/agents/`, `.agents/rules/`, `[<id>] ` prefix in `/adapt`, `/effort xhigh` reminder in `/orchestrate`, `--tool antigravity` in `/dream`).
     - Merge hook entries into `.agents/hooks.json` under named `xworkflows-<id>` keys; `uninstall` removes only those keys cleanly.
     - Update `.graphifyignore` for `.agents/skills/*` and `.agents/agents/*.md`.
   - `doctor` checks every installed tool in `installed.json` `tools`: verifies `.agents/hooks.json`, probes `design-first` with Antigravity JSON, measures `SessionStart` bytes, checks `always-loaded` including `GEMINI.md` / `AGENTS.md`, reports newest session first-turn tokens, and prints `Antigravity: tested`.
   - Node standard library only; every shipped file is in `manifest.json` with verified SHA-256 hashes; no private paths in tracked files.

## Questions for the owner

- Round 1: where changes live (`../xworkflows` vs `xinventory` only), target tool (`antigravity` vs `gemini` CLI), coexistence with Claude Code, verification flow.
- Round 2: tool name (`antigravity` vs `gemini`), tier mapping, `Stop` hook + `/dream` support, `xinventory` rules/plugins migration.
- Round 3: revised tier hierarchy based on live `agy` tests + Artificial Analysis Coding Agent Index v2.1, and how to handle `risk-review` `xhigh` effort.

## Owner's answers

- Round 1: implement in `../xworkflows` and install/adapt in `xinventory`; Antigravity only (live-tested); coexist with Claude Code; full `xworkflows` flow (verify facts, design, spec/plan, separate branch, tests, live `agy -p` proofs).
- Round 2: tool name `antigravity`; rebuild memory index on `Stop` (`fullyIdle: true`, main session) + Antigravity transcripts in `/dream` and `doctor`; in `xinventory`, `GEMINI.md` with `@[Reglas del proyecto](CLAUDE.md)`, `.agents/rules/*.md` with `trigger: glob`, adapt `risk-review.md` and `front`, import Claude plugins via `agy plugin`.
- Round 3: quality-first tiers (`cheap=flash`, `medium=inherit`, `top=inherit`, `strongest=inherit`); keep subagents 100% native (`inherit`) and remind `/effort xhigh` in `/orchestrate` before `risk-review`.
