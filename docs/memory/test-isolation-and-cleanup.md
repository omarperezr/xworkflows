---
name: test-isolation-and-cleanup
description: "Rules for tests and agents that touch the owner's machine (qmd, shared temp folder, deletions, orphan processes, paid calls) and how the slow pre-push was fixed"
metadata:
  node_type: memory
  type: reference
  modified: 2026-11-23T00:00:00.000Z
---

# Test isolation, deletions and pre-push timing

Incidents of 2026-11-14 and 2026-11-15, each with the rule it set:

1. Tests ran the real `qmd` and wrote about 110 config files on the owner's machine. Rule: tests never run real tools on the owner's machine; each test process gets a private `TMPDIR` (`test-tmp.mjs`); do not set `TMPDIR` by hand.
2. An agent deleted 193 entries of the shared system temp folder by "what is new". Rule: never delete in a shared folder, by pattern, or by "what is new".
3. About 40 GB of this project's temp folders were removed. Rule: delete only what this project made and nobody needs; prove it and say what and where first; never touch another project.
4. An agent asked for `rm -rf` on a computed path; the owner said no. Rule: `rm -rf` only on literal paths inside the agent's own folder; after a no, the command is not retried.
5. A test process ran 9 hours at full core. Rule: check the process table before reporting a job as stuck or fine.
6. No test calls the model SDK; the harness test runs with the SDK stubbed.

## Pre-push timing

- A push with 14 `fix:` commits took over 58 minutes, because `fix-has-test` reran the whole installer test file per commit.
- Rejected: running only the tests a commit added, because it changed the verdict.
- Fix: split the test file into 7 files. Suite 313.7 s to 99.5 s; a later push took 83 s.
- Rule: when a check is slow, change the layout that makes it slow, never its verdict.

Related: [[qmd-local-index]].
