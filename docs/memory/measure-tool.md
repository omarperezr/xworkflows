---
name: measure-tool
description: "proof/measure.mjs in xworkflows: what it counts per batch, its known bugs, the accuracy check that still fails, and where its numbers live (git-ignored)"
metadata:
  node_type: memory
  type: project
  originSessionId: 7d8ed281-0aa0-42f8-a16d-db817fa9c911
  modified: 2026-11-23T00:00:00.000Z
---

# Measure tool (proof/measure.mjs)

Header: built 2026-11-18 under spec `docs/superpowers/specs/2026-11-18-measure.md`, merged into `main` (f8d9220) the same day. Related: [[phase-1-progress]], [[workflow-upgrade-2026-11]].

## What it counts (as of 2026-11-19)

- Reads the session files of the project that runs the batch. Each message is counted once, by message id.
- The batch comes from the git branch recorded on each message, not from the session: one main session can cross several branches.
- Subagent sessions have a `meta.json` with `agentType` and `model`. Use these to group spend by role.
- Cost per message: input, output, cache writes (5 min and 1 hour) and cache reads. Prices are per model, from the official pricing table, and the table date is stored with the row.
- Price figures seen on 2026-11-18: Fable 5.1 at 10 input / 50 output / 12.50 cache write 5 min / 20 cache write 1 hour / 0.25 cache read, $ per million tokens (official page). The Fable 5.2 row of the draft table was NOT confirmed; do not use it.
- Quality metrics per batch: (a) fix rounds that repair an earlier fix (git blame of the fix lines lands on an earlier `fix:` in the same branch); (b) failures found after the seal (a later `fix:` whose blame lands on a sealed batch; needs a time window); (c) false blocks from brakes, a manual mark, since only the owner knows.
- Output goes only to `docs/measure/private/` (git-ignored): one row per batch, numbers only, no session text. A public report copies totals only.

## Accuracy check (2026-11-18)

Re-running the 2026-11-15 split of xworkflows' own sessions:
- risk reviewer 31 % (earlier 30 %): passes
- implementers 10 % (earlier 9 %): passes
- main session 42 % (earlier 34 %): FAILS the ±2 margin. Cause not known. Open.

## Known bugs and limits

- Review rounds are read by role name. A project whose reviewers have other names showed 0 rounds, and the tool printed a false "worse than reference" line. Fix role mapping before comparing.
- First version missed subagents that run inside a Workflow run (about 31 % of spend). Caught by review before merge. Any new spend parser must include them.
- A project's first merged batch has no baseline, so the tool cannot total it. Compute the total by hand from commit times and say so.
- Card P-201 (silent without a baseline): fixed in batch minor-d-1 (main 8a0f3a3, 2026-11-23, as the session reports it). With no usable baseline `measure` exits 2 with one line that says why, and each row without a cost prints "not compared". Not re-run by the dream run.
- On 2026-11-23 a review finding (in the batch `measure`, from the reviewer-model test) said the tool still did not count agents launched inside a Workflow, so its cost came out low. The session reports it fixed; check that a test covers a nested run before trusting a total.
- Its 2026-11-23 use: step 1 of the reviewer-model test read 47 `risk-review` sessions into `docs/measure/private/xworkflows.jsonl` (rows) and `docs/measure/private/p222-step1.json` (summary, both git-ignored). Results in [[risk-reviewer-model-test]].
- The quality baseline is the median of earlier batches. Owner's choice (2026-11-18): quality bar is "do not get worse than what is measured"; a failure after the seal counts against its batch even months later.

## Spend ledger for model calls

- Model calls that cost money run through `proof/flow.mjs` with `--api-credits` and a ledger file. A ledger file refuses to pass 60 USD; a new file was started for the month.
- Spend caps (owner, 2026-11-11; total raised 2026-11-12): model calls only through the harness with `--api-credits`; 15 USD per trial; total 190 USD, passed as `--max-usd-total 190`. Money beyond the credits is not allowed. Re-read the ledger before quoting a total. The 2026-11-12 entry in `phase-1-progress` gives the ledger figure of that day.
- CONFLICT: 2026-11-19 (this note): a ledger file refuses to pass 60 USD. 2026-11-12 (owner's raise): total cap 190 USD. Both may hold if the 60 USD is per file and the 190 USD is the sum over files; no source says which. Check the ledger code before relying on either.
- Process lesson (2026-11-19): the tool was run before the owner's question had been answered. Answer the question first, then measure.
