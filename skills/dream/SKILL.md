---
name: dream
description: Reads the sessions since the last run with hindsight and improves the memory notes on a branch of its own, for the owner to review. Use when the owner types /dream.
---

Before anything else, run `node .xworkflows/mark.mjs dream` in the shell.

`<base>` is this skill's base directory, shown when the skill loads. Run its scripts with `node` from the repository root; quote the path if it holds a space. Claude Code only. Talk to the owner in the owner's language. `/dream <focus>` passes `<focus>` on as the focus. You never read a session or an extract, never merge, never push, and never write outside the branch.

1. Read from `.xworkflows/config.json`: `memory.dir` (default `docs/memory`), `mainBranch` (default `main`), `dream.maxExtractBytes` (default 4000000). The agents are `dream-analyzer` and `dream-organizer`, each `xwf-<name>` when `renamed` in `.xworkflows/installed.json` holds it. The model of `cheap` is in `.xworkflows/tiers.json`.
2. Run `node <base>/extract.mjs --current $CLAUDE_CODE_SESSION_ID`. It prints one JSON object. With `sessions` empty, tell the owner its `reason` and stop.
3. Ask once with `AskUserQuestion`: `Run the dream?`, options `Yes, run it` and `No, not now`, with sessions, megabytes (`bytes`), `tokens` and `left` (the sessions that wait) in the description. On no, remove the `out` folder and stop.
4. Run `node <base>/branch.mjs open`; it prints `{ branch, worktree, memory, main }`.
5. Call the `Workflow` tool with `scriptPath: "<base>/dream.workflow.js"` and `args: { sessions: [each file of the extract's sessions], memory, focus, agents: { analyzer, organizer }, model }`, never an inline script. Without the Workflow tool, say so and stop. It runs in the background: wait for its result.
6. Run `node <base>/branch.mjs close --worktree <worktree> --name <last.name> --time <last.time>`, then remove the `out` folder.
7. Report: `added`, `changed`, `merged`, `conflicts` from the result, and `missing` analyzers that returned nothing; the sessions left for the next run; each proposed rule with its sessions, and that turning one into a rule in `AGENTS.md` is the owner's act; the lines of `stale` and `outside` if any; and the commands `see`, `adopt`, `discard`.
