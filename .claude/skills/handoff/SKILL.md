---
name: handoff
description: Write the hand-off for the next session and say whether /clear or /compact fits. Use when a batch merges (orchestrate does) and when the owner types /handoff.
---

Before anything else, run `node .xworkflows/mark.mjs handoff` in the shell.

Read `.xworkflows/config.json`: `mainBranch` (default `main`), `tokens.handoffBytes` (default 1500).

Write `.xworkflows/handoff.md`. It points, it does not copy: ids and paths, never the plan or the cards pasted in.

1. First line: `main: <full sha>`, from `git rev-parse <mainBranch>`. A hook loads the file only while this sha is both the branch's and `HEAD`'s, so write it as the last step, after any commit or merge.
2. Done: the batch, its merge sha, the result.
3. The owner's recent instructions still in force and not yet written in a plan, a spec or the pending list, quoted.
4. Every relevant next task, one line each: its id (plan task or card) and the path of its plan or of the pending list.

Run `wc -c .xworkflows/handoff.md`: at most `tokens.handoffBytes`. Over it, cut words, not instructions.

Then choose. Does everything the next session needs already stand written in the plan, the pending list and the hand-off? Yes: `/clear`. No (an owner question still open, a design round half done, a debugging in progress, a nuance that matters and does not fit): `/compact`. In doubt: `/compact`.

Tell the owner one line that starts `Next: /clear` or `Next: /compact`, with the reason.

On Codex, Cursor and Gemini, which have no session-start hook here, also print the hand-off in the chat, ready to paste into the new session.
