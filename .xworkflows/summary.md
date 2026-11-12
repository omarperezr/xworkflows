---
status: approved
date: 2026-11-12
source: written by hand from docs/design.md and the phase 1 specs; approved by the owner on 2026-11-12, who gave the goals at 3 and 36 months
---

## 1. What it is

- A working method for AI coding agents that installs into any repository and adapts to it. (design 1)
- Two things travel: the flow (seven mandatory stages, the agents that run them, the hooks that enforce them, the scripts that brake a push) and the package (one manifest with origin, version, hash and license of every piece, and a small installer). (design 1)
- The goal: make the work with any AI as efficient as possible, with the highest quality possible. Every piece is judged by what it saves and what it guards. (design 1)

## 2. Who pays, what is sold, what is not done

- Nobody pays: MIT, free and open. The first user is the author, a solo technical founder. Publishing carries no support commitment. (design 1)
- Not done: marketing skills or any skill outside the flow; changes to the reference project; indexing past chat sessions; stack skills in the core. (design 1, "Out of scope")

## 3. Aspirations at about 3, 12 and 36 months

- About 3 months: a proven, improved repository that serves any project in any language, with results that are efficient, cheap, fast and of quality. (owner, 2026-11-12)
- About 12 months: the author's own tool, published, for the four tools. It serves the author first. (design 1, 11)
- About 36 months: other developers install it and use it without the author's help, in the four tools. (owner, 2026-11-12)

## 4. Risks, the costliest mistake first

- The installer overwrites or deletes something in a user's project that it did not write. (installer spec; design 6.2)
- A brake passes when it could not run, or a hook traps an agent on broken input. (spec 1.3 section 2)
- A private name, path or business term of the author's projects lands in a tracked file. (specs, "Constraints")
- Model calls that cost money outside the free credits. (owner, 2026-11-11)
- A piece that costs more context than it saves. (design 2)

## 5. What must not change; what is free to change

- Node standard library only in everything that is installed; no dependency in the installer. (design 2)
- Hook logic is a pure `decide(ev, ctx)` with a test beside it; broken input lets the call through; `XWORKFLOWS_FREE` skips every hook and is logged. (design 7.2)
- Every installed file is a manifest piece with its hash: `pack --check` prints nothing. (design 5)
- Every project value comes from `.xworkflows/config.json` through the one defaults module; a project key has no default. (spec 1.3 sections 3 and 5)
- The product vocabulary is fixed English: the seal line, the commit-body escapes, the card form, the report keys. (design 7.7)
- A brake returns `{ ok, lines }`; the check exits 0, 1, or 2 when anything could not run. (spec 1.3 section 10)
- Free to change without asking: the wording of skills and agents, the vendor list of `signature`, test helpers. (spec 1.3 section 15)

## 6. Zones and which paths are risk paths

- `bin/`: the installer. Risk: it writes into other people's projects.
- `hooks/`: the runtime, the adapters and the hook logic. Risk: it sits in every tool call.
- `checks/`: the brakes. Risk: it decides every push.
- `skills/`, `agents/`, `templates/`: prompts and files written into a project.
- `proof/`: the measuring harness, development only. Risk: it spends credits and moves the owner's profile aside.
- `docs/`, `sandbox/`, `test/`: not risk.

## 7. How the owner works

- A spec is approved before anything is built; a plan is one page.
- Work goes in small batches by agents with exclusive files, test first; one fresh reviewer per batch; two fix rounds, then the owner decides.
- Git: one branch per batch, merged with `--no-ff`; push and merge only on the owner's word; files added by explicit path; no AI authorship line. (design 7.6)
- Before every commit the two privacy commands print nothing.
