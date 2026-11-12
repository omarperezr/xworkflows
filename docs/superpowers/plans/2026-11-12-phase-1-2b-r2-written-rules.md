# Adapt Revision 2 (Written Rules First) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Research starts from the project's written rules and states one general rule per mechanism kind; the interview confirms those rules with coherent options.

**Architecture:** A new no-LLM `rules.mjs` collects normative sentences into `.xworkflows/rules.json`; `scan.mjs` uses them to pick hits; the fixed Workflow hands each kind agent its written rules and asks for verdicts plus a general rule; `research.mjs` renders and queues them; `SKILL.md` drives the new order and wording.

**Tech Stack:** Node 22 ES modules, `node:test`, the existing adapt pieces.

**Spec:** `docs/superpowers/specs/2026-11-11-phase1-2b-adapt-reproducible-design.md`, section 12 (owner approved 2026-11-12: "do everything"). Sections 4-7 still apply where 12 does not change them.

## Global Constraints

Same as plan `2026-11-11-phase-1-2b-adapt-reproducible.md` (Global Constraints), unchanged: Node >=22, no runtime deps in installed files, manifest pieces by hand then `pack` and `pack --check`, `node --test $(git ls-files '*.test.mjs')`, both privacy greps empty before every commit, explicit-path `git add`, no AI author/co-author or session line in commits, headers <= 12 characters, fixed English option labels with the translation in the description, kind keys and config key order unchanged. Tests never call a model; never run `proof/harness.mjs` in a task.

## Review Focus

1. A project with no docs at all: `rules.json` is empty and research falls back to code-only, same as today.
2. A huge docs tree (thousands of markdown files): the 400-rule cap holds, docs before comments, output byte-stable.
3. Spanish and English mixed docs: normative words in both languages are caught; a sentence is never cut mid-word.
4. A written rule that the code contradicts: the verdict is `contradicted` with a citation and reaches the playback Hotspots.
5. A kind with no general rule (absent): the queue still asks the mechanism question, never a confirm with an empty rule.

---

### Task R1: Written rules without AI (`rules.mjs`)

**Files:** create `skills/adapt/rules.mjs`, `skills/adapt/rules.test.mjs`; fixture files under `test/fixtures/mechanisms/` (a `README.md`, a `docs/product.md` with English and Spanish rule sentences, a code comment with "must"); manifest piece `adapt` gets `skills/adapt/rules.mjs`.

**Interfaces:** `export function collectRules(root): { rules: { id: string, text: string, file: string, line: number, kinds: string[] }[] }`; CLI `node rules.mjs [root]` writes `<root>/.xworkflows/rules.json` and prints `rules: <n>`. `id` = `W<n>` in output order. Uses the same exclusions as `scan.mjs` (import its exclusion helper or share a tiny module beside it; no imports outside the skill folder and `node:`).

- [ ] Tests first: finds the fixture's English and Spanish rule sentences with their file and line; a sentence with no normative word is skipped; a comment rule is found; `kinds` tags (e.g. a sentence about rounding -> `values`, about retries/idempotent/duplicates -> `idem`, about one transaction/request -> `txn`, about loops/per item/N+1 -> `batch`); output is byte-identical twice; the 400 cap with docs first; generated/vendored and `.xworkflows/` paths skipped; a project with no docs gives `{ rules: [] }`.
- [ ] Implement: sentence split on `. ! ?` and line breaks inside list items, trimmed to 300 characters; normative words per spec 12.1; a fixed keyword table per kind (English and Spanish); order: docs files (README, PRODUCT, DESIGN, ARCHITECTURE, CONTRIBUTING, docs/**) then code comments, each by change count over `git log -n 500 --name-only HEAD` then path then line.
- [ ] Pack, full suite, `pack --check`, privacy greps; commit `feat(adapt): collect written rules without AI`.

### Task R2: Scan picks hits from written rules; narrower signals

**Files:** modify `skills/adapt/scan.mjs`, `skills/adapt/scan.test.mjs`.

**Interfaces:** consumes `.xworkflows/rules.json` (R1) when present. Hit order per kind: files named in that kind's written rules (`rules[].file` where `kinds` includes the kind, plus file paths quoted inside rule text) first, then change count, then path, then line; still at most 30.

- [ ] Tests first: with a rules.json naming `b.js` for `batch`, `b.js` hits come before more-changed files; without rules.json, today's order; every signal now requires a mechanism-specific token: a test per kind with a common-word line (e.g. `const value = price * 2`, `for (const x of xs) total += x`) that must not match.
- [ ] Narrow the catalog accordingly; keep each signal's `example`/`counter`; fixture still 12/12 (existing test).
- [ ] Pack, full suite, `pack --check`, privacy greps; commit `feat(adapt): scan prefers files named by written rules; narrower signals`.

### Task R3: Kind agents verify written rules and state a general rule; render shows them

**Files:** modify `skills/adapt/research.workflow.js`, `skills/adapt/research.mjs` (render), `skills/adapt/research.test.mjs`.

**Interfaces:** KIND_SCHEMA adds `general: { rule, basis: 'written'|'code'|'both', file, line, quote }` (required when status is `found`), `verdicts: [{ id (W<n>), verdict: 'enforced'|'contradicted'|'no-evidence', file?, line?, quote? }]`; `rules` maxItems 3. KIND_PROMPT: read the kind's written rules from `.xworkflows/rules.json` (by `kinds`), give a verdict on each with a citation, then the general rule (the project-level rule every change must follow for this kind, worded as how the code must do something), then up to 3 details. Topic prompts: the written rules file is listed as input for topics 1-5 too. `render`: verifies `general` and verdict citations like rules (a verdict without a citation is kept as `no-evidence`); per kind writes `- general: <rule> (<basis>) file:line`, then verdict lines `- W<n> <verdict>: <rule text> file:line`, then details; contradicted written rules also go to a `## Contradicted written rules` section; a `found` kind whose general citation is dropped keeps the general rule text marked `(unverified)`.

- [ ] Tests first: schema fields and caps; the prompt names `.xworkflows/rules.json`; render layout with general, verdicts, details; a contradicted verdict appears in its section; dropped general citation marked `(unverified)`; sum still covers `{ topics, kinds, skipped }`.
- [ ] Implement; pack, full suite, `pack --check`, privacy greps; commit `feat(adapt): kind agents verify written rules and state a general rule`.

### Task R4: Queue with coherent questions

**Files:** modify `skills/adapt/research.mjs` (buildQueue, check), `skills/adapt/research.test.mjs`.

**Interfaces:** `Item.options` filled by the queue where spec 12.2 says. `H5-<kind>`: for `found` kinds, `confirm` with text `Is this the rule every change must follow here: <general rule>?`; follow-up `H5-<kind>-r` required after `No`; for `absent` kinds, the current mechanism item. `H2-pays`, `H2-refused`, `H4-risks`, `H5-keep`, `H5-free` become `choice` with up to 3 options from research (topic lines of the matching heading, then written rules), plus `I don't know`; with no research text, options are `I don't know` and `Skip: not relevant here`. `H5-keep` text: `What must not change here (a format, an API, a schema, a number, a name users see)?`; `H5-free`: `What can an agent change or delete without asking you?`. `H6-r<n>`: `choice` with options `Money`, `Data`, `Access`, `No risk` (fixed English labels). `C<n>`: when a config line has a value, `confirm` with `Is this right for <gloss>: <value>?`; otherwise `open` as today. The note text names the free-text line `Type something` instead of `Other`.

- [ ] Tests first: each of the above, ids unchanged and <= 12 characters; queue byte-identical for the same research; `check` requires `H5-<kind>-r` after `No` on a found kind's confirm.
- [ ] Implement; pack, full suite, `pack --check`, privacy greps; commit `feat(adapt): queue asks to confirm general rules, with options`.

### Task R5: SKILL.md drives the new order and wording

**Files:** modify `skills/adapt/SKILL.md`, `skills/day-one.test.mjs`.

- [ ] Tests first: step 2 runs `rules.mjs` before `scan.mjs`; the question rules name `Type something` (no "write it in Other"); `H6-r<n>` choices and their meaning (several risks typed in free text); the playback asks headings in the owner's language and explains each zone's risk-path reason; Hotspots include `## Contradicted written rules`; heading 5 writes each found kind's confirmed general rule as `<kind>: <rule>`.
- [ ] Edit SKILL.md; pack, full suite, `pack --check`, privacy greps; commit `feat(adapt): skill runs written rules first and asks coherent questions`.

### Task R6: Rubric v2 and measuring (controller)

- [ ] Write `docs/proof/private/rubric-v2.json` before any new trial (widen patterns that miss meaning, e.g. invariant 7 as `outbox` plus `idempot|replay|claimed once|op_id`); record its sha; re-grade runs 2, 3 and 4 with v2 in `results-1.2b.md`.
- [ ] 3 research-only trials on the reference copy (`--source <run-2/3 proof copy> --commit 69ae4341`, `--api-credits`); pass R >= 6 in 3 of 3. Report cost to the owner.
- [ ] If pass: owner live run, then 3 replays (section 8). If fail: stop and report.
