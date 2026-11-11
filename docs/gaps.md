# Phase 0 gaps

- Cursor: `preToolUse` input for `Write` is not documented; the adapter assumes `{ file_path, content }` (not confirmed). Source: https://cursor.com/docs/agent/hooks, read 2026-11-11.
- Cursor: permission hooks block the action on invalid JSON; the adapter always answers JSON (read, not tested). Source: https://cursor.com/docs/agent/hooks, read 2026-11-11.
- Codex: a hook that errors or times out lets the call through, and project hooks run only after `/hooks` trust; the git brake covers both (read, not tested). Source: https://developers.openai.com/codex/hooks, read 2026-11-11.
- Codex: an `apply_patch` sent through a shell heredoc arrives as `Bash` and is not seen as a write (read, not tested). Source: https://developers.openai.com/codex/hooks, read 2026-11-11.
- Codex, Cursor, Gemini CLI: `isSubagent` is always `false` in phase 0; the running-subagent count of 7.2 comes with the `orchestrator` hook (read, not tested). Sources: https://developers.openai.com/codex/hooks ; https://cursor.com/docs/agent/hooks ; https://geminicli.com/docs/hooks/reference/ , read 2026-11-11.
- Gemini CLI: the hooks page reads «Unpaid tier and Google One users: Gemini CLI was replaced by Antigravity CLI on June 18th, 2026.» Section 11's free-tier option needs the author's call (read, not tested). Source: https://geminicli.com/docs/hooks/reference/, read 2026-11-11.
- All tools: a write made by a shell command (heredoc, `sed`) is not seen by `design-first` (read, not tested). Source: final review 2026-11-11.
- Claude Code: `claude -p` in an untrusted workspace ignores project `permissions.allow`; `--allowedTools` applies. The installer must not rely on project permissions before trust. Source: tested: claude -p session 2026-11-11.
- All tools: `design-first` compares paths by exact text: a case-variant path (`Docs/...` on a case-insensitive disk) or a symlinked root (`/tmp` vs `/private/tmp`) is not matched (not confirmed in a real session). Source: final review 2026-11-11.
- Windows: the installer is not tested there (not tested; proof at publish). Source: phase 1.1, 2026-11-11.
- Installer: the readline question path (existing `CLAUDE.md`) is covered only by a manual check (not tested in automation). Source: phase 1.1, 2026-11-11.
- Installer: `npx github:` is not tested until publish (not tested). Source: phase 1.1, 2026-11-11.
