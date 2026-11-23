---
name: test-isolation-and-cleanup
description: "Rules for tests and agents that touch the owner's machine (qmd home, shared temp folder, paid calls, deletions), the incidents of 2026-11-15 that set them, and how the pre-push timing was fixed"
metadata:
  node_type: memory
  type: reference
  originSessionId: ae390796-e18d-4363-a406-510d18d6a48a
  modified: 2026-11-23
---

# Test isolation, deletions and pre-push timing

Incidents of 2026-11-14 and 2026-11-15, with the rule each one set.

## Incidents

1. **Real qmd in the tests.** The installer tests ran the real `qmd` on the owner's machine. About 110 config files were written into the owner's qmd folders, all pointing at this repository's memory folder. An agent later deleted some of its own files without asking. Rule now: tests run with a PATH that has no `qmd`. The proof harness gives a trial's install and its session the same PATH without `qmd`. (The session did not confirm that the trial session's SDK applies that environment.)
2. **Shared temp folder.** A cleanup agent measured which temp entries each test created by listing the system temp folder before and after every test, and deleting what was new. The folder is shared with other programs and projects. It deleted 193 entries; the session's check found none of them from this project. Rule now: no agent deletes in a shared folder, by pattern, by list, or as "what is new". Each test run uses a private temp folder inside the session folder; the helper `test-tmp.mjs` creates one per process and removes it however the run ends.
3. **Mass cleanup of temp folders.** About 40 GB of this project's temp folders were removed in two passes. The owner paused the first pass when he asked whether other projects were touched; it was not clear at that point that they were. Owner's rule (2026-11-15): delete only folders that this project's code generated and that nothing needs any more. Match by the line that creates the folder, not by a name prefix alone. Keep the folders younger than 2 hours.
4. **Delete command with a computed target.** An agent asked to run `rm -rf "$(...)"`, with the target coming from another command's output. The owner answered "No" and the command did not run. Rule now: `rm -rf` only on literal paths inside the agent's own working folder. If an agent cannot name the path, it leaves the folder and names it in its report.
5. **Orphan test process.** A test (`fix-has-test` test) had run for 9 hours 14 minutes at 100 % of one core, left by an earlier scratch session. Found by checking the process table and its working folder. It did not answer the normal stop signal; it was force-killed. Check the process table before reporting a background job as stuck or as fine, and report what you saw.
6. **Paid calls in tests.** No test calls the model SDK. The harness test starts the real harness with the SDK stubbed. A reviewer ran it with no SDK installed to prove the stub is what runs. Open: if the SDK's import name changes, the real SDK would load, with up to 45 USD of usage per test run, counted in a temp ledger.

## Pre-push timing

- A push with 14 `fix:` commits took more than 58 minutes. The `fix-has-test` brake reran the whole installer test file (about 356 tests, about 270 seconds each) for each fix commit, before and after the fix. The push was cut; nothing was pushed.
- Rejected shortcut: running only the tests whose names a commit added. Tests generated in a loop, and tests defined in a helper or shared table, were missed; a reviewer reproduced a fix accepted with a test that proves nothing (in 6 of 8 forms). The verdict must not change, so the shortcut was dropped.
- What worked: split the test file into 7 files of about 50 tests each, with shared helpers in one file. Suite: 313.7 s to 99.5 s. Slowest file: 309.9 s to 78 s. The `fix-has-test` verdict did not change. A later push took 83 s.
- Rule: when a check is slow, change the layout that makes it slow. Do not change the check's verdict logic to make it faster.

Related: [[qmd-local-index]] (where incident 1 came from), [[handoff-batch-1]] (the private `TMPDIR` rule as the shell enforces it), [[model-and-effort-policy]], [[phase-1-progress]].
