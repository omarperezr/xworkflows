---
name: handoff-batch-1
description: "State of batch handoff-1 in xworkflows (task T1: the handoff hook loads a hand-off at session start and prints it on PreCompact); what is untested, what pack must fix, and test-run lessons"
metadata:
  node_type: memory
  type: project
  originSessionId: 62e2799d-de68-4f2a-91af-071e07c81be2
---

Superseded on 2026-11-23: this is the T1 state only. Tasks T1 to T8 were done, the batch was merged, and a fix round followed a risk review. The hook is now `handoff-load` in `hooks/core/handoff-load.mjs` (the names below are the T1 names: `handoff`, `hooks/core/handoff.mjs`). Current state and open findings: [[xworkflows-handoff]].

Batch `handoff-1` in xworkflows, branch `handoff-1`. Plan: `docs/superpowers/plans/2026-11-19-handoff.md` (read Global Constraints, Review Focus and the task). Spec: `docs/superpowers/specs/2026-11-19-handoff.md`, section 2.

Task T1 (the `handoff` hook) was done by the `implement` agent on 2026-11-23, nothing committed:

- New: `hooks/core/handoff.mjs`, `hooks/core/handoff.test.mjs`. Changed: `hooks/core/config.mjs`, `hooks/adapters/claude.mjs`, `hooks/adapters/adapters.test.mjs`, `manifest.json`.
- Behaviour under test: a fresh hand-off loads at SessionStart `startup` and `clear`, not at `resume` or `compact`; PreCompact prints the context as plain text, not the `hookSpecificOutput` JSON.
- Red then green: the two failing cases (startup context, PreCompact plain text) now pass. `handoff.test.mjs` has 6 cases; the two files together ran 42 tests, 0 failing.
- Not verified: `node --test hooks/core/config.test.mjs` printed nothing, so it has no pass count. Treat silence as unknown, not as a pass. Run it again and read its count.
- Not run by the implementer, on purpose: the full suite, `pack`, `install`. The main session runs `pack`.
- `manifest.json` has placeholder hash `"stale"` for the new `handoff` hook piece (SessionStart and PreCompact, Claude) and for the `handoff` skill piece. `pack` must set the real hashes before the seal; `pack --check` fails until it does.

Process lessons (what burned turns):

- The shell blocked any command that set its own `TMPDIR`. Do not set it. `test-tmp.mjs` already gives each test process a private `TMPDIR`; use that.
- The orchestrating session must wait for the agent's completion and relay its report verbatim. Do not answer or summarise before the report arrives. The T7 dispatch broke this too: it answered "still running, no report yet" and then "blocked:" before the report came. For T7 and later state, see [[xworkflows-handoff]].

Related: [[phase-1-progress]] (overall phase 1 state), [[merge-sealed-batches-without-asking]] (a sealed batch merges without asking; this batch is not sealed yet).
