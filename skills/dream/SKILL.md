---
name: dream
description: Reads the sessions since the last run with hindsight and improves the memory notes on a branch of its own, for the owner to review. Use when the owner types /dream.
---

Before anything else, run `node .xworkflows/mark.mjs dream` in the shell.

`<base>` is this skill's base directory, shown when the skill loads. Run its scripts with `node` from the repository root; quote the path if it holds a space. Claude Code only. Talk to the owner in the owner's language. `/dream <focus>` passes `<focus>` on as the focus. You never read a session or an extract, never merge, never push, and never write outside the branch.

A script that prints nothing or exits with an error: show its text to the owner and stop.

1. The agents are `dream-analyzer` and `dream-organizer`, each `xwf-<name>` when `renamed` in `.xworkflows/installed.json` holds it. The model of `cheap` is in `.xworkflows/tiers.json`.
2. Run `node <base>/extract.mjs --current $CLAUDE_CODE_SESSION_ID`. It prints one JSON object. With `sessions` empty, tell the owner its `reason` and stop.
3. Run `node <base>/branch.mjs unseen`; it prints a list of notes. Ask once with `AskUserQuestion`: `Run the dream?`, options `Yes, run it` and `No, not now`, with sessions, megabytes (`bytes`), `tokens` and `left` (the sessions that wait) in the description; when the list is not empty, add that those notes are not on the main branch and the run will not see them. On no, remove the `out` folder and stop.
4. Run `node <base>/branch.mjs open`; it prints `{ branch, worktree, memory, main }`.
5. Call the `Workflow` tool with `scriptPath: "<base>/dream.workflow.js"` and `args: { sessions: [each file of the extract's sessions], memory, focus, agents: { analyzer, organizer }, model }`, never an inline script. Without the Workflow tool, say so and stop. It runs in the background: wait for its result, `{ merged, conflicts, proposals, missing }`.
6. Run `node <base>/branch.mjs close --worktree <worktree> --out <out>`. It removes the `out` folder itself. When it fails, show its text and the worktree's path, and stop.
7. Report: `added`, `changed`, `removed` from `close`; `merged` and `conflicts` as the organizer reported them, and `missing` analyzers that returned nothing; the files in `masked`; the sessions that wait for the next run (`left`, and `cut`); the lines of `stale` and `outside` if any; and the commands `see`, `adopt`, `discard`. Then the proposed rules: group the corrections that two or more sessions share, show each with its sessions, and say that turning one into a rule is the owner's act. Write none of them anywhere.
