# Source

- repo: https://github.com/cursor/plugins
- path: thermos/skills/thermo-nuclear-code-quality-review/SKILL.md
- commit: dc415439eebed0cd8fddb11e896dee43bce9d8b0
- copy date: 2026-11-11
- license: MIT, see LICENSE

Modified:
- A `## Whole-repo mode` section was added: review a named zone instead of a branch diff; it overrides Output Expectations, Approval Bar and Review Tone; the response is a JSON array of findings (`severity`, `kind`, `file`, `line`, `title`, `case`), empty array when none.
- The upstream text is otherwise unchanged.
