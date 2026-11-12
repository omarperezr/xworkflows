# xworkflows

A working method for AI coding agents. It installs into any repository and makes the agent work the way a careful senior developer would: think first, plan, build in small steps, get reviewed, and never push broken work.

## Why

AI coding agents are fast, but they tend to:

- start writing before the design is clear,
- burn tokens re-reading things they don't need,
- skip tests and reviews when nobody checks.

xworkflows fixes this with rules that are **enforced**, not just suggested. A rule the agent can ignore is a wish; a hook that blocks the action is a rule.

## Goals

1. **Efficiency.** Spend fewer tokens and less time per task.
2. **Quality.** Catch mistakes before they reach your main branch.
3. **Any tool.** One method for Claude Code, Codex, Cursor and Gemini CLI.
4. **Any project.** On first run it studies your code and asks you about your business and goals, then writes rules for your project.

## The method in seven steps

| # | Step | What happens |
|---|---|---|
| 1 | Deepen | The request is rewritten the way a top professional would ask it |
| 2 | Design questions | The agent asks you the decisions, with a recommended answer each time |
| 3 | Plan | A written plan, tied to one of your goals |
| 4 | Implement | Small batches, each done by its own agent |
| 5 | Review by risk | A reviewer checks each batch; risky changes get a stricter one |
| 6 | Brakes | A check that blocks `git push` when something is missing |
| 7 | Pending list | One living list of what is left to do |

## Status

This is an early version. The installer and `doctor` work for Claude Code. **Only step 2 of the method is enforced today**: the agent cannot write a spec until it has asked you the design questions. Day one now ships `/adapt`, `/full-review` and `/next-step` for Claude Code. `/adapt` needs the `graphify` command installed. `/next-step` hands the chosen step to `/deepen`, the first stage of the method.

| Tool | Status |
|---|---|
| Claude Code | **tested** in a real session |
| Codex | **documented**: built from the official docs, not run yet |
| Cursor | **documented**: built from the official docs, not run yet |
| Gemini CLI | **documented**: built from the official docs, not run yet |

What is included:

- **`design-first` hook**: blocks creating a spec, or adding design questions to one, until the `grill` skill has run.
- **`grill` skill**: asks you the design questions in rounds, with its recommendation first.
- **`explore` agent**: a cheap, read-only helper that finds things in the code and answers in 10 lines or fewer.

Known limits are listed in [docs/gaps.md](docs/gaps.md).

## Setup

You need [Node.js](https://nodejs.org) (tested on v26) and git. Nothing else gets installed: no dependencies.

### 1. Get the code and run the tests

```bash
git clone https://github.com/omarperezr/xworkflows.git
cd xworkflows
node --test
```

Every test should pass.

### 2. Try it in Claude Code

The `sandbox/` folder is a tiny project that is already set up.

```bash
cd sandbox
claude
```

Then, in Claude Code:

1. Ask: *"Create docs/superpowers/specs/demo.md with the line '# Demo'."* The write is **blocked**, and the agent is told to run the `grill` skill first.
2. Type `/grill`. The skill starts and asks you design questions.
3. Ask again for the spec. Now the write is **allowed**.

### 3. Use it in your own project (Claude Code)

Run this from the root of your project (it must be a git repository):

```bash
node /path/to/xworkflows/bin/xworkflows.mjs install
```

Then check it:

```bash
node /path/to/xworkflows/bin/xworkflows.mjs doctor
```

- `--dry-run`: shows what would be written, and writes nothing.
- `--yes`: answers the questions for you (for scripts).
- `uninstall`: removes what the installer added.

Nothing is committed or pushed for you. The installer prints the paths to `git add`; you decide when to commit.

Settings you can change are in `.xworkflows/config.json`: your name, and where your specs and plans live.

The other three tools have their config in the same `sandbox/` folder (`.codex/`, `.cursor/`, `.gemini/`, `.agents/`). They are untested; if you try one, please share what happened.

## What comes next

1. Claude Code, complete (in progress: the installer and day one are done; the rest of the method and the pilot in a second real project come next).
2. Codex.
3. Cursor.
4. Gemini CLI.

The full design is in [docs/design.md](docs/design.md).

## License

MIT. The `grill` skill is adapted from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT); see `skills/grill/SOURCE.md`. The `thermo-nuclear-review` and `thermo-nuclear-code-quality-review` skills are adapted from [cursor/plugins](https://github.com/cursor/plugins) (MIT); see their `SOURCE.md`.
