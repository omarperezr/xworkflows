# Phase 1.2 Day One Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After `install`, one `/adapt` session learns the project, plays back a summary until the owner says it understood, writes the project's rules and risk reviewer, offers a full review, and hands a chosen next step to the work flow.

**Architecture:** Day one is mostly instructions for the agent: three own skills (`adapt`, `full-review`, `next-step`), two agents (`zone-review`, `verify-finding`) and two vendored review skills. They ship as manifest pieces that sub-project 1's installer already knows how to place. Tests pin the parts a person depends on: the exact questions, the fixed headings, the file names, the estimate formula, and that the full review's Workflow script parses. Task 1 also clears the two items left open by sub-project 1.

**Tech Stack:** Markdown skills and agents for Claude Code; Node 22+ standard library for tests (`node:test`); the existing `bin/xworkflows.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-11-phase1-2-day-one-design.md` (approved 2026-11-11), on top of `docs/design.md` sections 7.1, 7.3, 7.7, 8 and 10.1. Read both.

## Global Constraints

- Node standard library only; no new runtime script for day one (spec 3). Skills and agents are Markdown.
- Every own skill's first body line runs `node .xworkflows/mark.mjs <skill>` (design 7.2; the phase 0 skill test checks the first non-empty body line).
- Questions go through `AskUserQuestion`: at most 4 per call, the recommended option first and labelled `(Recommended)`, except where the spec says no option is recommended.
- Fixed headings and config keys stay in English; the agent talks in the owner's language.
- Never name the reference project, its folder, or any private path in a tracked file; say "the reference project". `docs/reference-coupling.md` is local-only and may be read, never copied.
- Build rules (design 7.6): branch `phase-1-2-day-one`; add files by explicit path; no AI author or co-author line; no push.
- Before every commit both must print nothing: `git ls-files docs/reference-coupling.md docs/measure-tokens.py` and `git grep -nE '/Users/[a-z]|-Users-[a-z]'`.
- Every new piece is listed in `manifest.json` and `node bin/xworkflows.mjs pack --check` exits 0 at each commit.

## Review Focus

1. `/adapt` run a second time while `.xworkflows/summary.md` is `status: draft`: it resumes from the draft and does not restart research (Task 4 test pins the instruction).
2. The project already has a hand-written `.xworkflows/config.json`: adapt merges keys and never replaces the file (Task 4).
3. `zones` missing or `[]`: `full-review` stops and says to run `/adapt` (Task 5).
4. `gh` missing or not logged in: `next-step` prints one line and skips GitHub issues (Task 6).
5. Our grill installed as `xwf-grill`: the design-first deny names `/xwf-grill` (Task 1).

---

## File map

| File | Responsibility |
|---|---|
| `bin/xworkflows.mjs` | doctor message fix (Task 1) |
| `hooks/run.mjs`, `hooks/core/design-first.mjs` | deny names the installed skill (Task 1) |
| `skills/thermo-nuclear-review/`, `skills/thermo-nuclear-code-quality-review/` | vendored review skills: `SKILL.md`, `LICENSE`, `SOURCE.md` (Task 2) |
| `agents/zone-review.md`, `agents/verify-finding.md` | the two new roles (Task 3) |
| `skills/adapt/SKILL.md`, `skills/adapt/topics.md` | research, interview, writing; question bank (Task 4) |
| `skills/full-review/SKILL.md` | the zoned review and its Workflow script (Task 5) |
| `skills/next-step/SKILL.md` | sources, picking, hand-off (Task 6) |
| `skills/day-one.test.mjs` | structural tests of Tasks 2 to 6 |
| `manifest.json` | one piece per new skill and agent |
| `docs/proof/` (git-ignored `private/` inside) | the 10.1 proof's yes/no lines and counts (Task 7) |

---

### Task 1: Leftovers from sub-project 1

**Files:**
- Modify: `bin/xworkflows.mjs` (the kept-grill doctor message, line ~332), `hooks/run.mjs`, `hooks/core/design-first.mjs`, `hooks/core/design-first.test.mjs`, `bin/xworkflows.test.mjs`, `manifest.json` (by `pack`)

**Interfaces:**
- Produces: `ctx.skillName(id: string) -> string` built in `hooks/run.mjs`: reads `<root>/.xworkflows/installed.json`; if `renamed` has a key whose value is `id`, returns that key's last path segment (`xwf-grill`); else returns `id`. Any read or parse error returns `id`.
- `design-first` deny reason becomes: `Run /<name> and settle the design questions with <owner> before writing <rel>.` where `<name>` is `ctx.skillName?.(SKILL) ?? SKILL`. The mark it waits for stays `grill`.

- [ ] **Step 1: Write the failing tests**

```js
// hooks/core/design-first.test.mjs
test("deny names the installed skill", () => {
  const d = decide(writeSpec(), { ...ctx(), skillName: () => "xwf-grill" });
  assert.match(d.reason, /^Run \/xwf-grill and settle/);
});
// bin/xworkflows.test.mjs
test("kept grill doctor message offers only the way that works", () => {
  const r = repo({ ".claude/skills/grill/SKILL.md": "---\nname: grill\n---\nmine\n" });
  cli(r, ["install"]);
  const out = cli(r, ["doctor"]);
  assert.match(out.stdout, /^fail kept grill never marks itself/m);
  assert.doesNotMatch(out.stdout, /--yes/);
});
test("design-first deny names xwf-grill after a rename", () => {
  const r = repo({ ".claude/skills/grill/SKILL.md": "---\nname: grill\n---\nmine\n" });
  cli(r, ["install", "--yes"]);
  const ev = JSON.stringify({ session_id: "s1", cwd: r, hook_event_name: "PreToolUse", tool_name: "Write",
    tool_input: { file_path: join(r, "docs/superpowers/specs/x.md"), content: "# x\n" } });
  const out = spawnSync("node", [join(r, ".xworkflows/hooks/run.mjs"), "claude", "design-first"], { input: ev, cwd: r, encoding: "utf8", env: { ...cleanEnv(), CLAUDE_PROJECT_DIR: r } });
  assert.match(JSON.parse(out.stdout).hookSpecificOutput.permissionDecisionReason, /^Run \/xwf-grill/);
});
```

`writeSpec()` and `ctx()` are the existing helpers in `design-first.test.mjs` (add them if they are inline); `cleanEnv()` is `process.env` without `XWORKFLOWS_FREE`, `XWORKFLOWS_RECORD`, `XWORKFLOWS_STATE_DIR`.

- [ ] **Step 2: Run and see them fail** — `node --test hooks/ bin/` — Expected: the 3 new tests FAIL.

- [ ] **Step 3: Implement.** Doctor message, exact text: `kept grill never marks itself: spec writes will be denied. Add the line "node .xworkflows/mark.mjs grill" to its first step`. Then `ctx.skillName` and the new deny reason as in Interfaces. Update every existing test and fixture expectation that matched the old reason text (`Run the grill skill`); recorded fixtures keep their recorded text and are not edited. Run `node bin/xworkflows.mjs pack`.

- [ ] **Step 4: Run and see them pass** — `node --test` — Expected: all pass; `node bin/xworkflows.mjs pack --check` exits 0.

- [ ] **Step 5: Commit**

```bash
git add bin/xworkflows.mjs bin/xworkflows.test.mjs hooks/run.mjs hooks/core/design-first.mjs hooks/core/design-first.test.mjs manifest.json
git commit -m "fix: doctor kept-grill message, deny names the installed skill"
```

Also remove the gaps line about the xwf-grill wording from `docs/gaps.md` in the same commit (add it to the `git add` list).

---

### Task 2: Vendor the two thermo-nuclear skills

**Files:**
- Create: `skills/thermo-nuclear-review/{SKILL.md,LICENSE,SOURCE.md}`, `skills/thermo-nuclear-code-quality-review/{SKILL.md,LICENSE,SOURCE.md}`, `skills/day-one.test.mjs`
- Modify: `manifest.json`

**Interfaces:**
- Produces: two pieces, `kind: "skill"`, `origin: "vendored"`, `source: "https://github.com/cursor/plugins"`, `version: "dc415439eebed0cd8fddb11e896dee43bce9d8b0"`, `license: "MIT"`, `modified: true`.
- `SOURCE.md` names the upstream folder `thermos/`, the commit, the date fetched, and lists every change made here.

Steps, as design 5 says: clone `https://github.com/cursor/plugins` at that commit into the session scratchpad; copy the two skills and the license from `thermos/`. Compare each with the reference project's copy (path in `docs/reference-coupling.md`): the reference differs by its project adaptations. Keep upstream text, and add the generic form of what the reference added: a "Whole-repo mode" section saying how to review one zone (the paths the prompt names) instead of a branch diff, and the finding shape `severity` (`high|medium|low`), `kind` (`error|restructure`), `file`, `line`, `title`, `case`. No project names, stacks or paths from the reference. Keep `disable-model-invocation: true` if upstream has it.

- [ ] **Step 1: Write the failing tests** in `skills/day-one.test.mjs`:

```js
for (const name of ["thermo-nuclear-review", "thermo-nuclear-code-quality-review"]) {
  test(`${name} is vendored with license and source`, () => {
    for (const f of ["SKILL.md", "LICENSE", "SOURCE.md"]) assert.ok(existsSync(join(ROOT, "skills", name, f)), f);
    assert.match(read(`skills/${name}/LICENSE`), /Copyright \(c\) 2026 Cursor/);
    assert.match(read(`skills/${name}/SOURCE.md`), /dc415439eebed0cd8fddb11e896dee43bce9d8b0/);
    assert.match(read(`skills/${name}/SKILL.md`), /^## Whole-repo mode$/m);
    const p = manifest().pieces.find((x) => x.id === name);
    assert.equal(p.origin, "vendored"); assert.equal(p.license, "MIT"); assert.equal(p.modified, true);
  });
}
```

`ROOT`, `read(p)` and `manifest()` are helpers at the top of the test file.

- [ ] **Step 2: Run and see them fail** — `node --test skills/` — Expected: FAIL.
- [ ] **Step 3: Fetch, copy, adapt, add the manifest pieces, run `pack`.**
- [ ] **Step 4: Run and see them pass** — `node --test` and `pack --check`.
- [ ] **Step 5: Commit** the six skill files, the test file and `manifest.json` by path: `feat(skills): vendor the two thermo-nuclear reviews`.

---

### Task 3: Agents `zone-review` and `verify-finding`

**Files:**
- Create: `agents/zone-review.md`, `agents/verify-finding.md`
- Modify: `skills/day-one.test.mjs`, `manifest.json`

**Interfaces:**
- `zone-review`: front matter `name: zone-review`, `tier: top`, `tools: Read, Grep, Glob, Bash`. Body: reads the SKILL.md its prompt names and follows it in whole-repo mode on the zone's paths; never writes or edits; Bash only for reads (`git`, `grep`, `wc`, `graphify query`); returns only the findings JSON the prompt's schema asks for.
- `verify-finding`: `name: verify-finding`, `tier: medium`, `tools: Read, Grep, Glob, Bash, Write, Edit`. Body: one finding in; on a new branch `verify/<finding-id>` it writes the smallest test that fails because of the finding and runs it; answers exactly one of `red: <test path> <command>` (the test fails as the finding predicts; keep the branch and commit the test) or `discarded: <reason>` (no failing test could be written; delete the branch). Never fixes the code.

- [ ] **Step 1: Write the failing tests**

```js
test("zone-review is top tier and cannot write", () => {
  const f = front("agents/zone-review.md");
  assert.equal(f.tier, "top");
  assert.doesNotMatch(f.tools, /Write|Edit/);
});
test("verify-finding answers red: or discarded:", () => {
  assert.equal(front("agents/verify-finding.md").tier, "medium");
  const body = read("agents/verify-finding.md");
  assert.match(body, /`red: <test path> <command>`/);
  assert.match(body, /`discarded: <reason>`/);
  assert.match(body, /verify\/<finding-id>/);
});
```

`front(p)` parses the `key: value` lines of the front matter into an object.

- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Write both agents; add the manifest pieces (`own`, `kind: "agent"`); `pack`.**
- [ ] **Step 4: Run and see them pass**, plus an install test in `bin/xworkflows.test.mjs`: after `install`, `.claude/agents/zone-review.md` has `model: opus` and `verify-finding.md` has `model: sonnet`.
- [ ] **Step 5: Commit** by path: `feat(agents): zone-review and verify-finding`.

---

### Task 4: Skill `adapt`

**Files:**
- Create: `skills/adapt/SKILL.md`, `skills/adapt/topics.md`
- Modify: `skills/day-one.test.mjs`, `manifest.json`

The skill is the spec's sections 5.1 to 5.4, written as steps for the main session. It must say, in this order:

1. Mark: `node .xworkflows/mark.mjs adapt`.
2. Resume: if `.xworkflows/summary.md` exists with `status: draft`, resume the interview from it; with `status: approved`, re-adapt: research only the commits after its `commit:` line and play back with changes marked.
3. Research (no questions): write `.graphifyignore`, run `graphify update .`, read `graphify-out/GRAPH_REPORT.md`; then the six topics of spec 5.1 through `explore` agents in one Workflow, each asking `graphify query` before opening files; history as commit messages and file stats only, never `git show <sha>:<path>`. Write `.xworkflows/research.md` (each line `(code)` or `(git)`, plus the topic 6 list). With the argument `research-only`, stop here.
4. Interview: the eight headings of spec 5.2, verbatim; questions only for what research left empty or unsure, research's guess as `(Recommended)`; before any playback, every required key has a value (`[]` on purpose counts): `paths.code`, `paths.risk`, `paths.heavyRead`, `paths.codeAnyway`, `tests.files`, `tests.run`, `tests.notRunnable`, `checks`, `zones`; playback lines end `(code)`, `(git)` or `(you)`; each playback saves the draft with `status: draft`.
5. The question, exactly: `Did I understand correctly?` with options `Yes, you understood` and `No`, neither recommended. On `No`: `What did I miss or get wrong?`, questions only about that, then the whole summary again with changed lines marked.
6. Write, only after `Yes, you understood`: the table of spec 5.3, the `## Goals` lines `- G<n> (about <N> months): <aspiration>`, `## Project rules` in `AGENTS.md` outside the `<!-- xworkflows:start -->` block, `.xworkflows/config.json` merged key by key and never replaced, heading 8 only to `~/.xworkflows/owner.md`; then one commit of those repository files by explicit path, message `chore: adapt xworkflows to this project`, no push.
7. The question after the interview (spec 5.5): `Run a full review first, or start on the next step?`, neither recommended; the full-review option shows `about X to Y million tokens, from one past run, not measured here` with X = zones × 2 × 0.17 and Y = zones × 2 × 0.25. Then `/full-review` or `/next-step`.

`topics.md`: the eight headings, each with the questions research cannot answer by itself (start with two per heading; the 10.1 proof adds one per missed invariant).

- [ ] **Step 1: Write the failing tests**

```js
test("adapt pins its questions, headings, keys and outputs", () => {
  const s = read("skills/adapt/SKILL.md");
  assert.ok(firstBodyLine(s).includes("node .xworkflows/mark.mjs adapt"));
  for (const t of ["Did I understand correctly?", "Yes, you understood", "What did I miss or get wrong?",
    "status: draft", "status: approved", "research-only", ".xworkflows/research.md", "graphify update .",
    "git show <sha>:<path>", "~/.xworkflows/owner.md", "chore: adapt xworkflows to this project",
    "## Project rules", "- G<n> (about <N> months):", "Run a full review first, or start on the next step?",
    "from one past run, not measured here"]) assert.ok(s.includes(t), t);
  for (const k of ["paths.code", "paths.risk", "paths.heavyRead", "paths.codeAnyway", "tests.files", "tests.run", "tests.notRunnable", "checks", "zones"]) assert.ok(s.includes(k), k);
  for (const h of ["What it is", "Who pays, what is sold, what is not done", "Aspirations at about 3, 12 and 36 months",
    "Risks, the costliest mistake first", "What must not change; what is free to change", "Zones and which paths are risk paths",
    "How the owner works", "About you"]) { assert.ok(s.includes(h), h); assert.ok(read("skills/adapt/topics.md").includes(h), h); }
});
```

`firstBodyLine(s)` returns the first non-empty line after the front matter.

- [ ] **Step 2: Run and see it fail.**
- [ ] **Step 3: Write the skill and the bank; manifest piece `adapt` (`own`, files `SKILL.md`, `topics.md`); `pack`.** Keep `SKILL.md` under 200 lines; details the agent can look up go in `topics.md`.
- [ ] **Step 4: Run and see it pass.**
- [ ] **Step 5: Commit** by path: `feat(skills): adapt`.

---

### Task 5: Skill `full-review`

**Files:**
- Create: `skills/full-review/SKILL.md`
- Modify: `skills/day-one.test.mjs`, `manifest.json`

The skill is spec section 7. It must say:

1. Mark: `node .xworkflows/mark.mjs full-review`.
2. Read `zones` from `.xworkflows/config.json`; missing or `[]`: say `No zones yet: run /adapt first.` and stop.
3. Run alone (not from `adapt`): ask yes or no with the estimate of Task 4 step 7.
4. Run one Workflow whose script is in a fenced `js` block in the skill: `REVIEWS = ["thermo-nuclear-review", "thermo-nuclear-code-quality-review"]`, `ZONES = args` (the main session passes the `zones` array as the Workflow `args`), one `zone-review` agent per review × zone with the findings schema (`severity`, `kind` `error|restructure`, `file`, `line`, `title`, `case`), mark `both` where both reviews named the same `file:line`, sort `both` first then `high`, `medium`, `low`, return `{ errors, restructures }`.
5. Write `<paths.reviews>/YYYY-MM-DD-full-review.md` (`-2`, `-3` for later runs that day; `paths.reviews` default `docs/superpowers/reviews`): header (commit sha, zones, the two reviews, what `both` means, counts), `## Errors` numbered `**[<severity>, both] <title>** (<path>:<line>)` then the case, duplicates merged; `## Restructurings`; `## Owner's decisions (YYYY-MM-DD)`. Commit only that file.
6. Ask each restructuring: `Do it`, `Drop it`, `Pending list`; up to 4 per call; record each answer under the decisions heading.
7. Unverified errors and pending-list restructurings: one card each, appended to `paths.pending` (default `docs/PENDING.md`) in the form `- **P-<n>** — <text>. Origin: <review file>. Status: unscheduled.`, `<n>` one above the highest `P-<n>` in the file and in `git log --grep "closes P-"`; a missing file is created with the line `# Pending`. (Until sub-project 3's `pending` skill exists; ruling of this plan.)
8. An error enters a plan only after `verify-finding` answers `red:`.

- [ ] **Step 1: Write the failing tests**

```js
test("full-review pins zones, file names, card form and decisions", () => {
  const s = read("skills/full-review/SKILL.md");
  assert.ok(firstBodyLine(s).includes("node .xworkflows/mark.mjs full-review"));
  for (const t of ["No zones yet: run /adapt first.", "docs/superpowers/reviews", "YYYY-MM-DD-full-review.md",
    "## Errors", "## Restructurings", "## Owner's decisions", "- **P-<n>** —", "Status: unscheduled.",
    "Do it", "Drop it", "Pending list", "red:", "# Pending"]) assert.ok(s.includes(t), t);
});
test("full-review's Workflow script parses", () => {
  const js = read("skills/full-review/SKILL.md").match(/```js\n([\s\S]*?)```/)[1];
  const f = join(mkdtempSync(join(tmpdir(), "xwf-wf-")), "wf.mjs");
  writeFileSync(f, js);
  assert.equal(spawnSync("node", ["--check", f]).status, 0);
  assert.match(js, /export const meta = \{/);
  assert.match(js, /thermo-nuclear-code-quality-review/);
});
```

- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Write the skill; manifest piece `full-review` (`own`); `pack`.** The script uses only the Workflow API (`agent`, `parallel`, `log`, `args`); no `Date.now()`.
- [ ] **Step 4: Run and see them pass.**
- [ ] **Step 5: Commit** by path: `feat(skills): full-review`.

---

### Task 6: Skill `next-step`

**Files:**
- Create: `skills/next-step/SKILL.md`
- Modify: `skills/day-one.test.mjs`, `manifest.json`

The skill is spec section 6. It must say:

1. Mark: `node .xworkflows/mark.mjs next-step`.
2. Sources in order (spec 6.1): what the owner asked for in this session (including "next I want ..." from the interview); next steps written down; own suggestions (the full review's `Do it` items first, then its errors, else research's hotspots and risk paths without tests), each naming its `G<n>`.
3. "Written down" in the order of spec 6.2, items 1 to 7, verbatim names (`docs/PENDING.md`, `TODO.md`, `TODO`, `ROADMAP.md`, `NEXT.md`, `gh issue list`, `git grep -nE '\b(TODO|FIXME)\b'`), reusing `.xworkflows/research.md` topic 6 when present. GitHub: only when `gh auth status` succeeds and a GitHub remote exists; else print `GitHub issues skipped: gh is not set up.`
4. One question, at most 3 candidates in source order, the first `(Recommended)`, each with one line, its source and its goal; free text takes anything else.
5. A picked full-review error goes to `verify-finding` first; `discarded:` drops it and asks again.
6. A section titled exactly `## Hand-off` (sub-project 3 replaces only this section): invoke `superpowers:brainstorming` with the chosen step; if that skill is not available, say so, append the step to `paths.pending` as a card (Task 5 form, `Status: scheduled.`), and stop.

- [ ] **Step 1: Write the failing test**

```js
test("next-step pins sources, GitHub skip and the hand-off section", () => {
  const s = read("skills/next-step/SKILL.md");
  assert.ok(firstBodyLine(s).includes("node .xworkflows/mark.mjs next-step"));
  for (const t of ["docs/PENDING.md", "TODO.md", "ROADMAP.md", "NEXT.md", "gh issue list", "gh auth status",
    "GitHub issues skipped: gh is not set up.", "(Recommended)", "verify-finding", "superpowers:brainstorming",
    "Status: scheduled."]) assert.ok(s.includes(t), t);
  assert.match(s, /^## Hand-off$/m);
  const order = ["docs/PENDING.md", "TODO.md", "gh issue list", "git grep"].map((t) => s.indexOf(t));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});
```

- [ ] **Step 2: Run and see it fail.**
- [ ] **Step 3: Write the skill; manifest piece `next-step`; `pack`.**
- [ ] **Step 4: Run and see it pass**, plus an install test: a fresh `install` writes `.claude/skills/{adapt,full-review,next-step,thermo-nuclear-review,thermo-nuclear-code-quality-review}/SKILL.md` and `doctor` exits 0.
- [ ] **Step 5: Commit** by path: `feat(skills): next-step`. Update README's status and "What comes next" in the same commit: day one ships with `/adapt`, `/full-review`, `/next-step`.

---

### Task 7: Acceptance — the interview proof with the owner (design 10.1, spec 8)

This task is run by the controller with the owner, live; it is not delegated.

- [ ] **Step 1: Prepare (controller).** Read the reference location and its 10 invariants from `docs/reference-coupling.md` and the reference's instructions. Write one yes/no line per invariant to `docs/proof/private/invariants.md`; add `docs/proof/private/` to `.gitignore` first. Show the lines to the owner and fix any they reject.
- [ ] **Step 2: Copy.** `git clone` the reference into the scratchpad; remove `CLAUDE.md` files, `.claude/` and `docs/` with `git rm -r` and commit the removal in the copy; run `node <repo>/bin/xworkflows.mjs install --yes` there.
- [ ] **Step 3: R.** The owner runs `claude` in the copy and types `/adapt research-only`. Count R of 10 on `.xworkflows/research.md`.
- [ ] **Step 4: I.** The owner runs `/adapt` to "Yes, you understood". Count I of 10 on `AGENTS.md`, `.claude/rules/` and `.claude/agents/risk-review.md`, each tagged research, question, or owner after a "No". Record playbacks, questions and minutes.
- [ ] **Step 5: Mark.** Pass: I ≥ 8. Each missed invariant adds one question to `skills/adapt/topics.md` under its heading (commit it by path, `pack`). Write the numbers, without any reference content, to `docs/proof/2026-11-11-interview-proof.md`: R, I, I by origin, playbacks, questions, minutes, pass or fail, and the commands used. Commit it and `.gitignore` by path.
