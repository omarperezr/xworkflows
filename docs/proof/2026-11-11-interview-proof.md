# Interview proof, 2026-11-11 (design 10.1)

The adapt skill ran on a copy of the reference project with its instruction files removed. The owner answered the interview live. The project's ten written invariants were set down before any run, in a git-ignored file, and each was counted yes or no against what adapt wrote.

- R: invariants stated in `.xworkflows/research.md` after research alone.
- I: invariants stated in the written rules (AGENTS.md "Project rules", `.claude/rules/*.md`, `.claude/agents/risk-review.md`) after the interview.
- Pass mark: I of at least 8 of 10.

| Run | adapt version | R | I | Owner said No | Minutes to "Yes" | Result |
|---|---|---|---|---|---|---|
| 1 | before the mechanisms fix | 3 | 3 | 0 | not recorded | fail |
| 2 | after the mechanisms fix | 6 | 8 (+1 borderline) | 1 | 21 | pass |

Run 1 failed because the interview captured risks but not the mechanisms that prevent them. The fix added research topic 7 (mechanisms the code enforces), asked mechanism questions only where research found none, and grouped the rules by risk.

In run 2, six recovered invariants came from research and two from mechanism questions, with the borderline one also from a question. Because the owner knows the invariants, the question-origin count may be inflated; the research-origin count is not. The one missed invariant (which value may enter money when the same amount shows in several rates) now has its own question in `topics.md`.
