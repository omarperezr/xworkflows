# Phase 0 gaps

- Cursor: `preToolUse` input for `Write` is not documented; the adapter assumes `{ file_path, content }` (not confirmed).
- Cursor: permission hooks block the action on invalid JSON; the adapter always answers JSON (read, not tested).
- Codex: a hook that errors or times out lets the call through, and project hooks run only after `/hooks` trust; the git brake covers both (read, not tested).
- Codex: an `apply_patch` sent through a shell heredoc arrives as `Bash` and is not seen as a write (read, not tested).
- Codex, Cursor, Gemini CLI: `isSubagent` is always `false` in phase 0; the running-subagent count of 7.2 comes with the `orchestrator` hook (read, not tested).
- Gemini CLI: the hooks page reads «Unpaid tier and Google One users: Gemini CLI was replaced by Antigravity CLI on June 18th, 2026.» Section 11's free-tier option needs the author's call (read, not tested).
- All tools: a write made by a shell command (heredoc, `sed`) is not seen by `design-first` (read, not tested).
