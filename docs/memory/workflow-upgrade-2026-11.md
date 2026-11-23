---
name: workflow-upgrade-2026-11
description: "The xworkflows workflow upgrade (owner's design of 2026-11-18, merged 2026-11-19): optional deepen, one review per plan, reviewers by size and risk, three implementers, rm-seguro and database hooks, and the lessons it left"
metadata:
  node_type: memory
  type: project
  modified: 2026-11-23T00:00:00.000Z
---

# Workflow upgrade, 2026-11

Owner's design, confirmed on 2026-11-18, merged into `main` on 2026-11-19.

1. `deepen` is optional: only for a request over 400 lines or more than one branch, or one that touches money, permissions, deleting data or security. Say in one line whether it was used and why.
2. One review per plan. Dependent tasks share one branch and are reviewed at the end. Split into more branches only above 800 lines.
3. Reviewers: Sonnet for changes under 50 lines without risk; Opus for normal changes; Fable at xhigh for risk. Fable's fix rounds are confirmed by a new Opus, never by another Fable.
4. Three implementers: generic (ponytail and tdd guides), SQL (Supabase guide plus a short own guide), front (impeccable and frontend-design). A missing plugin falls back to the short own guide.
5. Hooks: `rm-seguro` blocks `rm -r` with computed paths (also `xargs rm -rf`, `--rec`). The database hook asks the owner before a destructive database command and blocks inside an agent ([[safe-db-hook]]).

Later the same week: a file that matches `tests.files` is never a risk path, and the risk reviewer reads a risk file's tests as context only; a test under a risk path cannot skip review with `no-review:`.

## Lessons that still hold

- Review fixes are `fix:` commits with a test that fails first; `feat:` escapes the `fix-has-test` brake.
- Check the test count after every fix round: a fix agent once deleted 9 protective tests.
- A test that is red only because a module is missing proves nothing; the behaviour check must fail.
- A serious error that survives 2 review rounds means the design is wrong: stop patching and redesign.
- Announcing a skill is not running it: run its agents, then report.
- Parallel implementers on one branch can amend each other's commits: check the sha after parallel tasks.
- After a batch merges, refresh the whole installed copy (`.claude/` and `.xworkflows/`), not only the batch's files. No brake warns when the copy goes stale (open).
- Auto mode may refuse `git push origin main` even under the owner's standing push rule; the owner then pushes himself with `!`. The pre-push brakes take about 5 to 10 minutes.

Related: [[phase-1-progress]], [[model-and-effort-policy]], [[triage-bar]], [[xworkflows-handoff]].
