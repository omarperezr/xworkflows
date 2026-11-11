# Phase 1.4: Pilot in a second project

Status: approved by the owner, 2026-11-11

## Intent and why

Phase 1 ends when xworkflows works in a real project that is not the one it
came from. Sandbox tests prove the pieces; only a real project proves that
install, day one and the method fit together and pay for themselves
(design 10, points 4 and 7; design 11, item 1).

## Goals

1. Install xworkflows for Claude Code in a second real project of the owner,
   run day one for real, and carry one real next step through the method to
   a reviewed batch.
2. Measure what design 10 asks for, against written pass marks.
3. Turn every failure into a fix in xworkflows or a line in `docs/gaps.md`.
4. Publish the numbers without publishing anything about the pilot project.

## Non-goals

- Codex, Cursor, Gemini CLI (phase 2 and later, design 11).
- Windows: out of phase 1. Proof 1 on Windows runs at publish on a Windows CI
  runner and is recorded in `docs/gaps.md` as deferred. (Claude's call)
- A stranger installing from the guide (design 10, point 5). That is later.
- The interview test against the reference (design 10.1). It runs on the
  reference, not here.

## Anti-goals

- Changing the pilot project's code or history outside the pilot branch.
- Hand fixes during the run that are not counted. Every manual step counts.
- Any private detail of the pilot project in the public repo.

## Constraints

- Built one after another (owner, 2026-11-11): installer, day one, rest of the
  method, pilot; each starts after the previous one is merged. The pilot starts
  only when 1, 2 and 3 are done and `node --test` passes in xworkflows, so it
  may rely on their interfaces: the hook log (1.3 section 5), the `doctor`
  lines, the full review and its estimate (1.2). With 3 done, day one hands the next
  step to xworkflows' own stages, not to superpowers.
- Git rules of design 7.6 hold in the pilot too. The owner decides every push.
- Design 6.2 is the install contract over existing configuration. The pilot
  exercises it; it does not change it.
- The pilot runs on the owner's Mac, Claude Code only.
- The pilot project (owner, 2026-11-11) is the owner's Python and pytest
  project that design 6.2 describes. Its name stays out of this repository.
- Check packs ready before the pilot (owner, 2026-11-11): the project's own
  linter, `semgrep` and `trivy` (1.3).
- The full review runs once in the pilot, step 7 (owner, 2026-11-11).
- Review unit (owner, 2026-11-11): per batch; a fresh reviewer confirms a fix.

## Already decided

- What is measured first: minutes from `install` to the first reviewed batch,
  and the count of manual steps (design 10, point 4).
- `install` run twice changes nothing: `git status --porcelain` and `git diff`
  are byte-identical before and after the second run (design 10, point 7).
- `doctor` exits 0 and every hash matches (design 10, points 1 and 2).
- `doctor` fails above the always-loaded budget, 24,000 bytes,
  `tokens.alwaysLoadedBytes` (design 10, point 8; design 13).
- Day one runs research, interview, the review-or-next-step question, then
  the next step through the method (owner, 2026-11-11).
- Every number sits beside the command that produced it (design 10, point 10).

## How the pilot runs

1. **Freeze.** Record the xworkflows commit sha. Install from a local clone
   at that sha: `node <clone>/bin/xworkflows.mjs install`. The npx path is
   tested at publish (design 11, item 5). (Claude's call)
2. **Before snapshot.** Make a separate local clone of the pilot project, not
   a worktree (a worktree shares `.git` hooks with the owner's main tree),
   and a branch `xworkflows-pilot`. The owner's uncommitted work stays in
   the main tree. (Claude's call) Save `git status --porcelain`, `git diff`,
   the sha256 of every file under `.claude/`, plus `CLAUDE.md` and `AGENTS.md`
   if present, and the hooks folder from `git rev-parse --git-path hooks`
   with `core.hooksPath`.
3. **Install.** Start the clock. The owner follows only the README guide.
   Record each prompt `install` asks (6.2) and the answer. The pilot answers
   yes to the `@AGENTS.md` import. (Claude's call)
4. **Doctor.** `xworkflows doctor` must exit 0. Save its output.
5. **Idempotence.** Run `install` again. Compare as in design 10, point 7.
6. **Day one.** Open Claude Code in the clone and run day one as the owner
   would. The owner answers the interview for real. Record: research minutes
   and tokens, interview minutes, how many times the summary was played back,
   the owner's review-or-next-step answer, and where the next step came from
   (owner request, written next steps, or suggestions).
7. **Full review** (runs once, owner). Record its tokens beside the estimate it showed.
8. **Next step.** Deepen, design questions, plan, implement, review by risk,
   until the first batch carries its seal. Stop the clock at the seal.
9. **Brakes.** Run `xworkflows check` on the branch. A failure is either a real
   problem in the batch (fix it the normal way) or a false brake (a defect).
10. **After snapshot.** Compare with step 2. Every changed pre-existing file
    must match installed.json's `merged`, `blocks` and `imports`; the hooks
    folder differs only by our pre-push (the clone's own, restored by uninstall).
11. **Uninstall round trip.** In the clone, run `uninstall`. Every product
    file installed.json lists must be gone. Project content stays and is
    listed: `docs/BUSINESS.md`, the project part of `AGENTS.md`, the
    `risk-review` agent, `config.json`, the pending list, memory, rules, and
    the batch's own files. (Claude's call)

## What is measured, and pass marks

| # | Measure | How | Pass mark |
|---|---|---|---|
| 1 | Minutes, install to first reviewed batch | wall clock, steps 3 to 8; interview minutes also listed apart | 120 or less |
| 2 | Manual steps | anything the owner types or does that the guide or the agent did not ask as a question | 3 or fewer |
| 3 | `doctor` | exit code | 0 |
| 4 | Hashes | `doctor` output | all match |
| 5 | Second install | byte compare, design 10.7 | identical |
| 6 | Pre-existing files | step 10 | only allowed merges |
| 7 | Always-loaded bytes | `doctor` | at most 24,000 |
| 8 | Session-start injected bytes | `doctor` line (ships in 1.3) | within `tokens.sessionStartBytes` |
| 9 | Interview | owner answers "Yes, you understood"; every required key filled; 8.3 files written | yes |
| 10 | False denials and false brakes | count from hook log and `check` | 0 |
| 11 | Facts about the user in the pilot repo | `type: user` or `type: feedback` in any `docs/memory/` file (1.3) | 0 |
| 14 | Code graph current | `graph-current` brake and `doctor` (graphify and qmd required, 1.3 section 8a) | pass |
| 12 | Tokens per day-one step | session `usage`, summed per step | recorded, no mark |
| 13 | Uninstall round trip | step 11 | only project content left |

Marks 1 and 2 are pass marks too (Claude's call);
marks 3 to 11, 13 and 14 are hard. A miss is fixed in xworkflows, then only the
failing step and those after it are run again; a fix to `install` reruns from
step 2. The report counts the last full run. A rerun reuses the interview
output when the fix did not touch adapt. (Claude's call)

## Evidence: where it goes

Two places, and only one is public. (Claude's call)

- **Private.** `docs/pilot/private/` in xworkflows, git-ignored. It holds the
  raw material: snapshots, `doctor` output, hook logs, session token sums,
  and `names.txt`, one line per word that must never be public (project name,
  folder, people, domains, business terms from the interview).
- **Public.** `docs/pilot/2026-MM-DD-pilot.md`: one table with each measure,
  its value, its pass mark, pass or fail, and the command beside it. The
  project is called "the pilot project" and described only by stack kind and
  size. No code, no file names beyond xworkflows' own paths, no interview
  content, no session excerpts.
- Interview output (`docs/BUSINESS.md`, rules, the risk reviewer) stays in the
  pilot repo. It is never copied into xworkflows.
- Before any commit in xworkflows, `grep -rinFf docs/pilot/private/names.txt`
  over the tracked files must print nothing.
- Gaps found go into `docs/gaps.md`, written generically, with the source
  "pilot, <date>".
- A command that names a private path appears in the public table with that
  path replaced by `<pilot>`.

## Left to the builder

- The exact `.gitignore` line for `docs/pilot/private/`.
- How the clock, manual steps and snapshots are kept (plain logs and standard
  tools), and the per-step token sum (the approach of design 13).

## Done when

All hard marks pass, the public report is committed with the owner's yes,
`names.txt` grep is clean, and README's status table moves Claude Code from
"step 2 works" to the full method.
