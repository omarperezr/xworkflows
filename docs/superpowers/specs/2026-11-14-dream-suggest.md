# The method suggests a `dream` run

Card P-120. It builds on the `dream` skill (docs/superpowers/specs/2026-11-13-dream.md) and is planned once that skill is on the main branch.

## 1. The deepened request

- Request: when enough work has piled up unread, the method suggests a `/dream` run with one line. It never starts one. Done: past the threshold, the start of a new session holds the line; below it, nothing; after an adopted run, nothing.
- Adds: "the last run" needs no new store: the state file of `dream` on the main branch says when it was written.
- Adds: counting sessions must cost little. The session-start hook runs in every session and all hooks share 2000 bytes of text, so sessions are counted by their files' times and never read.
- Adds: Claude Code only; a project with no memory note gets no line.
- Material: the memory hook already writes lines at session start and already has one reminder by date, for goals older than three months (`hooks/core/memory.mjs:37-72`, read not tested).
- Material: the cap of session-start text is `tokens.sessionStartBytes`, 2000 (`hooks/core/config.mjs:33`, read not tested).
- Methods: A, the memory hook adds the line at session start. B, only `/next-step` names it when the owner asks what is next.

## 2. The rule

1. **When.** The suggestion is due when at least `dream.suggestAfterDays` days (default 7) have passed since the last adopted run, or at least `dream.suggestAfterSessions` sessions (default 10) have new text since it, whichever comes first. A project where `dream` never ran: when it has at least `dream.suggestAfterSessions` sessions.
2. **Where.** One line in the text the memory hook gives at the start of a session. The agent tells the owner. Nothing runs by itself.
3. **How often.** At the start of every new session while it is due. It ends when a run is adopted. `dream.suggest: false` turns it off.
4. **Not.** In a session that goes on after a compact or a resume; in a sub-agent's session; in a tool other than Claude Code; in a project with no memory note.

## 3. Decided by the main session

- The last adopted run: `close` writes the date of the run into the state file `dream.json` (a field beside `sessions`). The hook reads that file in the working folder. No file: `dream` never ran here.
- The count of sessions: the files of the project's sessions folder whose time is later than that date, the running one left out; with no state, all of them. The hook reads the folder's list and the files' times. It reads no session and starts no process.
- The line is fixed English and at most 160 bytes: it gives the number of sessions and of days, and tells the agent to suggest `/dream` to the owner.
- The three settings come from the defaults module: `dream.suggest` (true), `dream.suggestAfterDays` (7), `dream.suggestAfterSessions` (10).

## Owner's answers

Asked on 2026-11-14.

- When: "7 días o 10 sesiones, lo que pase primero".
- Where: "Una línea al empezar la sesión".
- How often: "En cada sesión nueva, hasta que corras /dream".
- A project where it never ran: "Sí, cuando haya 10 sesiones".
