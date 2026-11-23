---
name: workflow-upgrade-2026-11
description: "xworkflows workflow upgrade of 2026-11-18/19: optional deepen, one review per plan, small-change reviewer, three implementers, rm-seguro and database hooks; what was merged, what is still open"
metadata:
  node_type: memory
  type: project
  originSessionId: 7d8ed281-0aa0-42f8-a16d-db817fa9c911
  modified: 2026-11-23T00:00:00.000Z
---

# Workflow upgrade, 2026-11 (xworkflows)

Header: owner's design of 2026-11-18, built on branch `workflow-upgrade-1`, merged into `main` (96813d1) on 2026-11-19, pushed to GitHub (dcf9ce7..e0ce2a4) after the owner's "push". Related: [[phase-1-progress]], [[measure-tool]], [[xworkflows-handoff]], [[memory-hook]], [[risk-reviewer-model-test]], [[safe-db-hook]].

## Owner's design (confirmed by "si" on 2026-11-18)

1. `deepen` is optional. Use it only when the request is over 400 lines or more than one branch, or when it touches money, permissions, deleting data or security. Say in one line whether it was used and why.
2. One review per plan. Tasks that depend on each other share one branch, in order, and are reviewed at the end. Split into more branches only above 800 lines.
3. Reviewers: Sonnet for changes under 50 lines without risk; Opus for normal changes; Fable for risk. Fable's fix rounds are confirmed by a new Opus, never by another Fable.
4. Three implementers: generic (ponytail and tdd guides), SQL (Supabase guide plus a short own guide), front (impeccable and frontend-design). Install records the plugins in the project; if a plugin is missing, the short own guide is used.
5. Hooks: `rm-seguro` blocks `rm -r` with computed paths (also `xargs rm -rf`, `--rec`). A database hook asks the owner before a destructive database command; inside an agent it blocks.
6. Out of scope: price warning before Fable, GitHub Actions template.

## What was built and what it does now

- tdd guide rewritten: `SKILL.md` 330 to 136 lines; the good-tests guide 198 to 56 lines. Rules come from Beck, Fowler, the Google testing book and the Anthropic guide.
- Database hook, final shape after 6 review rounds: a blocklist kept leaving gaps (SQL comments, other quote styles, table aliases, `||` instead of OR). It was replaced by an allowlist: only a simple DELETE or UPDATE with a WHERE that compares to a plain number passes. Everything else asks. `dropdb` asks whenever it runs. A WHERE with OR or NOT asks. A comparison to zero asks (T18). `grep -rn dropdb` no longer asks.
- `rm -r` inside `if`/`for` is now seen; `git rm -r "$DIR"` with a computed path is blocked (a minor false positive, accepted).
- Tests at merge: 1,603 of 1,603 passing; hash list (`manifest.json`) current.

## Process lessons that cost turns

- The push was refused by the review-seal brake. Cause: the install commit (345ccab) changed `.claude/settings.json`, which counts as code, and it came after the last seal. A review-small seal never counts on a range that touches risk paths; an Opus review sealed it. Lesson: run the install and packaging before the final review, so the seal covers them.
- Fix rounds recorded as `feat:` escaped the `fix-has-test` brake, because the brake checks only `fix:` commits. Review fixes must be `fix:` with a test that fails first.
- A fix agent deleted 9 protective tests (31 to 16) in the measure branch. Restored. Check the test count after every fix round.
- A test that is "red" only because a module is missing does not prove the test works. The guide now requires the behaviour check to fail.
- A serious error that survives 2 review rounds means the design is wrong: stop patching and redesign (owner's rule, already in the table of steps).

## Still open (2026-11-19)

- P-205: inside an agent the database hook blocks; the path "ask the owner from an agent" is not tested.
- P-211: closed on 2026-11-23 (group A, main d35b887): the 13 listed holes now ask. Details in [[safe-db-hook]]. P-214 to P-216: the session did not report them closed; see the triage update below.
- Not verified: that agents load plugin guides (reports of failures); that Claude Code offers to install plugins from the project config.
- Handoff skill (`/handoff`): as of 2026-11-19, spec written, plan in `docs/superpowers/plans/2026-11-19-handoff.md` (commit d12b02b), not built. Built later in batch handoff-1 and merged on 2026-11-23 (`main` at `baa7478` after the notice batch); current state in [[xworkflows-handoff]]. Design: writes `.xworkflows/handoff.md` (git-ignored, 1,500-byte cap, points to plan and PENDING instead of copying them); a SessionStart hook loads it after `/clear`; PreCompact passes it to `/compact`; `orchestrate` calls it at every batch close; Claude says in one line whether `/clear` or `/compact` fits. Run it in a fresh session, not in the long one.

## Update 2026-11-23 (batch triage-bar-1, see [[triage-bar]])

- The owner's triage of 2026-11-23 discarded cards P-205, P-212, P-213, P-214, P-215, P-216 and P-228 (all database-hook cards, see [[safe-db-hook]]). The "still open" list above is out of date for them. Their state in `docs/PENDING.md` was not checked.
- The installed copy (`.claude/`, `.xworkflows/`) had fallen 15 files behind, because each batch copied only its own files. The owner chose a full refresh of 22 files (commit 24723d1); doctor 0 failures. No brake warns when the copy goes stale (open).
- Pre-push brakes take about 5 to 10 minutes. Auto mode refused `git push origin main` twice on 2026-11-23, though the owner's standing push rule covers it; the owner pushed himself with `!`.

## Update 2026-11-23 (session 6c0db597-361b-4d5c-b60b-338bb201c865)

Source: that session's account of its batches. The brake results and test counts are the agents' reports, not re-run by the dream run.

- Tests and risk: a file that matches `tests.files` is never a risk path (batch tests-not-risk-1, main 88db730, pushed). The risk reviewer reads a risk file's tests as context, and its findings cover only risk files. A test under a risk path cannot skip review with `no-review:`; any reviewer seal satisfies the brake (owner's word: always some reviewer).
- Risk reviewer: Fable at xhigh stays after the P-222 test ([[risk-reviewer-model-test]]). A cheaper risk reviewer per route came with batch B (main def665d); which paths use it is config.
- Round rule (owner approved it as card P-239 on 2026-11-23; not built when the session ended): each finding is classified at birth as blocks, card or not written, and not-written findings stay in the report. From round 2 only a fault the batch caused blocks. An old fault found on the way becomes a card; an old money or data fault goes to the owner at once. Group A had already used the round-2 rule as "only a regression against main blocks".
- Push rule (owner, 2026-11-23): when a batch passes every brake, push and continue; do not tell the owner first.
- Merged in the same session, as the session reports them: group A (safe-db holes, install retires only hooks the manifest lists, `pack` fails when a hook vanishes unlisted; main d35b887); group C (memory job, [[memory-hook]]; main c9c3734); group D (skills-travel checks enabled plugins, measure exits 2 without a usable baseline; main 8a0f3a3); group B (agent config, cheap risk reviewer, pre-commit rule 3; main def665d); P-219 and P-221 (main 8c2a007); P-237 (`memory.autoDirectory`; main e5fca91).

Process lessons from this session:

- Announcing a skill is not running it. A `/deepen` request was answered with "I run deepen" and none of its steps ran; the owner asked what had happened. Run the agents, then report.
- A pending brake that reads only a merge's net diff misses a branch that adds and then removes the same card, so it rejects the push. Read the history instead: `git rev-list -n1 --full-history m^1..m -- <file>` (P-221, commit 41b7735; fixed for the opposite case in f0f1873, where main changed the file and the branch did not).
- A push from a clean copy of main runs the brakes on that copy. The review-graph brake needs `graphify-out/graph.json` current there; the first such push was refused for its absence.
- Parallel implementers on one branch can amend each other's commits (group B: one agent amended another's commit; restored to its sha). Check the sha after parallel tasks.
- A review round that finds faults already on main sends the batch into more rounds. Group A took four rounds, and from round 2 every blocker was a variant of an old safe-db hole. This is the reason for the round rule above.
