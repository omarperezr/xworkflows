# Pending

One living list. The `pending` brake checks these rules:

- One card per finding: `- **P-<n>** — <text>. Origin: <where>. Status: <unscheduled | scheduled | in progress on <branch>>.`
- A card is deleted in the commit whose message says `closes P-<n>`.
- A number is never used twice.
- `in progress on <branch>` does not outlive its branch.

## Adapt: research scripts

- **P-1** — `skills/adapt/scan.mjs`: the signal regexes backtrack on very long lines (a 1 MB one-line bundle took 18 s); skip lines over about 2,000 characters. Origin: review of branch 1.2b, 2026-11-12. Status: unscheduled.
- **P-2** — `skills/adapt/scan.mjs`: the entries scan itself writes to `.graphifyignore` match as prefixes, so a second run can drop a real file whose name starts the same and the output is no longer byte-stable; match an exact path or a folder. Origin: review of branch 1.2b, 2026-11-12. Status: unscheduled.
- **P-3** — `skills/adapt/rules.mjs`: comments in test files are collected as written rules, though the kind agents are told never to use tests. Origin: review of branch 1.2b, 2026-11-12. Status: unscheduled.
- **P-4** — `skills/adapt/rules.mjs`: `AGENTS.md` and `CLAUDE.md` are read as written rules (spec 12.1 does not list them); on a re-adapt, adapt's own earlier output comes back as the owner's rules. Needs a ruling. Origin: review of branch 1.2b, 2026-11-12. Status: unscheduled.
- **P-5** — `skills/adapt/scan.mjs`: the SQL inventory takes any `.sql` file, so a test or seed file can replace a migration's entry. Origin: review of branch 1.2b, 2026-11-12. Status: unscheduled.
- **P-6** — `skills/adapt/scan.mjs`: whole files are read only to get their size and every text stays in memory. Origin: review of branch 1.2b, 2026-11-12. Status: unscheduled.
- **P-7** — `skills/adapt/research.workflow.js`: agents are called by their unrenamed names, so a project that already has its own `mechanism` or `explore` agent runs the project's agent, not ours. Origin: review of branch 1.2b, 2026-11-12. Status: unscheduled.
- **P-29** — `skills/adapt/scan.mjs` `projectFiles`: a folder with no repository of its own that sits under an unrelated parent repository is scanned through the parent's file list, so its untracked files give an empty scan with no warning. Origin: review of the 1.2b safety fixes, 2026-11-12. Status: unscheduled.

## Adapt: render, queue, run

- **P-8** — `skills/adapt/research.mjs` `done`: an abandoned re-adapt still copies its research into `research.prev.json`. Origin: review of branch 1.2b, 2026-11-12. Status: unscheduled.
- **P-9** — `skills/adapt/SKILL.md` step 1: when step 4 stops after the approved summary is written, the next `/adapt` treats the project as fully adapted and the rules are never written. Origin: review of branch 1.2b, 2026-11-12. Status: unscheduled.
- **P-10** — `skills/adapt/research.mjs` `verifyCitation`: a citation whose file is a folder crashes render. Origin: review of branch 1.2b, 2026-11-12. Status: unscheduled.
- **P-11** — `skills/adapt/research.mjs` `rel()`: when the project folder is reached through a symlink, absolute citations are not made relative and are all dropped. Origin: review of branch 1.2b, 2026-11-12. Status: unscheduled.
- **P-12** — `skills/adapt/research.mjs` `verifyCitation`: a one-character quote counts as a verified citation. Origin: review of branch 1.2b, 2026-11-12. Status: unscheduled.
- **P-13** — `skills/adapt/research.mjs` `start`: a repository with no commit yet gets a stack trace, not a message. Origin: review of branch 1.2b, 2026-11-12. Status: unscheduled.

## Adapt: hooks

- **P-14** — `hooks/run.mjs`: `XWORKFLOWS_FREE`, or a `config.json` that does not parse, also turns off answer recording, silently. Origin: review of branch 1.2b, 2026-11-12. Status: unscheduled.
- **P-15** — `hooks/core/adapt-record.mjs`: an interview that lasts more than 12 hours in one session stops being recorded and gated, with no warning. Origin: review of branch 1.2b, 2026-11-12. Status: unscheduled.
- **P-16** — `hooks/core/adapt-gates.mjs`: on a disk that ignores case, a write spelled in another case (`Summary.md`) gets past the gate. No data is lost; the gate is skipped. Same gap as `design-first` (docs/gaps.md). Origin: review of branch 1.2b, 2026-11-12. Status: unscheduled.
- **P-17** — `hooks/core/adapt-gates.mjs`: the deny for a missing or unreadable `interview.json` does not name the fix (`research.mjs queue`). Origin: review of branch 1.2b, 2026-11-12. Status: unscheduled.
- **P-18** — `hooks/core/adapt-gates.mjs`: a write made by a shell redirect is not gated and the file lacks the `shortcut:` note `design-first` carries. Origin: review of branch 1.2b, 2026-11-12. Status: unscheduled.
- **P-19** — `hooks/core/adapt-gates.test.mjs`: no test shows that an incomplete draft summary is allowed when no run file exists (spec 1.2b section 6). Origin: review of branch 1.2b, 2026-11-12. Status: unscheduled.

## Proof harness (development only)

- **P-20** — `proof/harness.mjs`: spend enters the ledger only when a trial ends, so a killed or crashed trial is missing from the total; reserve the per-trial cap before starting and settle after. Until then: after a killed run, add its cap to the ledger by hand. Origin: review of branch 1.2b, 2026-11-12. Status: unscheduled.
- **P-21** — `proof/harness.mjs`: a failed prepare step counts the full per-trial cap although no model ran. Origin: review of branch 1.2b, 2026-11-12. Status: unscheduled.
- **P-22** — `proof/harness.mjs`: the default ledger path follows `--out`, so the total cap is per folder and the file can land in a tracked path; default to one git-ignored path. Until then: always pass `--spend-file`. Origin: review of branch 1.2b, 2026-11-12. Status: unscheduled.
- **P-23** — `proof/harness.mjs`: `--out` is not checked to be git-ignored, so private research output can land in a tracked path. Origin: review of branch 1.2b, 2026-11-12. Status: unscheduled.
- **P-24** — `proof/harness.mjs`: `canUseTool` allows every tool with any input, so the agent of a trial can write outside the trial folder. Trials run only on the owner's own repositories today. Origin: review of branch 1.2b, 2026-11-12. Status: unscheduled.
- **P-25** — `proof/trial-lib.mjs`: the ledger write is not atomic and the total is never checked against the entries. Origin: review of branch 1.2b, 2026-11-12. Status: unscheduled.

## Installer and docs

- **P-26** — `bin/xworkflows.mjs` `apply()`: an upgrade leaves behind a file a newer version no longer ships, unrecorded, so `uninstall` never removes it. Origin: review of branch 1.2b, 2026-11-12. Status: unscheduled.
- **P-27** — `README.md`: not updated for the two adapt hooks, the Workflow tool that `/adapt` needs, and the development-only SDK dependency. Origin: review of branch 1.2b, 2026-11-12. Status: unscheduled.
- **P-28** — Privacy, the owner's call: tracked files already on the main branch keep reference-project file and agent names (`docs/design.md` sections 7.2, 7.7, 9.1, 9.2) and the folder that holds this repository (recorded hook fixtures). The two privacy commands do not look for them. Neutralize them, or leave them. Origin: review of branch 1.2b, 2026-11-12. Status: unscheduled.
