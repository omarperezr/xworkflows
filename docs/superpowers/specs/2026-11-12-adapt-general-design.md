# Adapt, general: the real build (design)

Status: approved by the owner on 2026-11-12 (the seven decisions below).
It replaces sections 4, 5 and 12 of the 1.2b spec
(`2026-11-11-phase1-2b-adapt-reproducible-design.md`) where they differ.

## The request, deepened

Goal: G1
Request: Build the new `/adapt`: research by general areas and three screens, in place of today's research and question screens. Done when, in 3 runs on the reference copy: screen 1 holds 12 sentences or fewer, one idea each, 14 words at most, each with its verified citation; counting the detail it finds at least what the shipped version finds (6 to 7 of 8); none invented; and the tests pass.
Adds: Every short sentence keeps its `file:line` citation; without a verified citation it is not shown.
Adds: When a rule is split into ideas, a sentence never says more than its proof.
Adds: A rule is doubted only with a written reason and a citation, and it counts in the cap of 6 of screen 2.
Adds: "You are right" leaves a card and writes no rule; "keep it, because ..." writes the rule with the owner's reason.
Adds: The two exam projects are used up: another one is needed, or only the reference measures.
Adds: What the hooks read from a run must keep existing, or the hooks change with it.
Material: The prototype is 4 files, +423 -89 (`git diff --stat 1095425 phase-1-adapt-general`). tested
Material: 10 tests of `skills/adapt/research.test.mjs` fail on the prototype: they test the old Workflow script. tested
Material: Today's detail comes from `skills/adapt/research.mjs:103-105`; the prototype caps it at 3 per area (`research.workflow.js:84` on that branch). read not tested
Material: `hooks/core/adapt-gates.mjs:28-34` requires the script `research.workflow.js` and its counts; `:57-60` reads the absent kinds. read not tested
Material: The caps of 12 and 6 and the line that says what was left out exist in the prototype (`research2.mjs:9`, `:68`, `:72`). read not tested
Material: The harness measures research alone with `--mode research-only` (`proof/harness.mjs:31`), with a spend cap (`:22`). read not tested
Material: 20 pending cards touch `/adapt` (`docs/PENDING.md:10-38`). read not tested
Methods: Short sentences, way A: one cheap pass after research, as the one that worked on 2026-11-12 (46 rules to 12 sentences). Way B: each area agent writes short. Both fit.
Methods: Detail: raise the cap per area, or add the pass per mechanism kind the shipped version uses.
Methods: Measure: the reference plus a new exam project, or the reference alone.
Proof: The question dialog takes 1 to 4 questions per call, 2 to 4 options and a 12-character header (https://code.claude.com/docs/en/agent-sdk/user-input). read not tested
Proof: At 14 words per sentence readers understand more than 90 %; at 43, less than 10 % (https://insidegovuk.blog.gov.uk/2014/08/04/sentence-length-why-25-words-is-our-limit/). read not tested
Proof: One thought per statement is a rule of requirements engineering (https://www.nasa.gov/seh/appendix-c-how-to-write-a-good-requirement). read not tested
Proof: No source measures how many rules a person judges well on one screen: the cap of 12 is a design choice. read not tested

## Decisions (owner, 2026-11-12)

1. One `/adapt`: the new version replaces today's research and question screens.
2. Research by general areas, as the prototype measured on 2026-11-12.
3. Screen 1: 12 sentences or fewer, one idea each, 14 words at most. The detail is kept apart and shown when the owner asks.
4. The detail the shipped version finds is kept.
5. Screen 2: 6 questions at most, among them "this rule may be wrong". "You are right" leaves a card; "keep it, because ..." writes the rule with that reason.
6. Measured on the reference copy and on exam project C, a project `/adapt` has never seen, in read-only copies, 3 runs each.
7. Cost: 2.50 USD per run at most.

## Design

### Research: one fixed Workflow

The profile agent runs first. Then, at once: the readers of the docs, the reader of the project's own checks, one agent per area (seven universal areas and up to four the profile proposes), and one `mechanism` agent per kind the scan found. A `plain` agent runs last.

- The mechanism agents are the shipped ones (decision 4, the method already measured). Since the fourth round their general rules are candidates for screen 1 like the areas' rules, each with a short form; their other rules stay in the detail. In the third round (3 runs on the reference) the first page held 2 of the 10 invariants whole while the detail held 8 to 9, and those sat in the mechanism rules.
- An area's answer gains `doubted`: at most one rule the code follows that the agent has a reason to doubt, with the reason and one citation.
- An area's answer also carries `ideas`, four at most: each is one thing the code does, in one sentence of 14 words at most, with its own citation, and says no more than the cited line and the few lines around it show. An idea about every case names the one place that enforces it for all; otherwise it says where it holds (way B; owner, 2026-11-12, after the first run on the reference: 7 of 8 sentences cited a line that did not prove them).
- An area's general rule also comes in a short form, `general.short`: the same claim in one plain sentence of 14 words at most, no wider than the rule (owner's order to fix and measure, second tuning round, 2026-11-12: with ideas alone the screen held local facts and lost the rules that matter, 1 invariant of 8 against 3).
- The `plain` agent reads the areas' short general rules and ideas and nothing else. It merges the items that say the same thing and writes each in the owner's language. It never splits an item and never widens one. Each sentence names the items it comes from. The general rules come first, by risk; the ideas fill the places that are left. Sentences beyond 12 are returned in a second list, never dropped.
- The six topic agents of the prototype stay, under `topics`: three of them propose the values of the config keys, and their lines feed `H2-pays` and the questions of screen 3. Their cost is judged in the measure.
- Before an area agent writes its general rule it looks for the case that contradicts it: the same operation done without the guard. When it finds one it narrows the rule to where it holds, or keeps the rule and returns that case under `exceptions`, which becomes a question of screen 2. The short form says the thing protected and the constraint in the words of the business (what the thing is called by the people who use the product), never a code name: no name of a function, table, column, constant or file, which belong in the detail (third round: with "key words" half the sentences needed a programmer). It and carries no "all", "always", "never" or "every" unless one place enforces it for every case (owner, 2026-11-12: "Y si hacemos ambas?", the second page and a third round on the instructions).
- With `research-only` nobody is interviewed: the sentences are written in English.
- Agents judge. Scripts verify, cap and order; they judge nothing.

### Render

- `screens.json` and `research.md`: screen 1 is the short sentences, each with the verified citation of an item it comes from, then the line that says how many were left out and why. A sentence that comes from a general rule shows that rule's citation as an example and says in how many more places the rule was seen (its verified `support`): a general rule is a pattern, and no single line proves it.
- `details.md`, apart (decision 3): under each sentence the full rules it comes from with every verified citation; then the mechanism rules; then the rules found in comments.
- A sentence is shown only when an item it names has a verified citation. One over 14 words, or naming no item, goes under "Dropped" with its reason.
- Screen 2, in this order: a written rule the code contradicts; a doubted rule; a rule with exceptions; a risk with no protection. Six at most, then the left-out line.
- Screen 3: the nine questions of the prototype, each with the options research proposes.
- Nothing verified is lost without a line: a verified rule that no shown sentence names is listed in the detail file, and when screen 1 has free places the verified sentences of `rest` fill them.
- What did not verify never counts as found: a mechanism rule whose citation fails makes its kind absent and gets a line under "Dropped"; a doubted rule with no reason is dropped; an agent that returned nothing stops `render`.

### Interview

- Screen 1: one question per sentence, four per dialog call: `Right`, `Real, but a bad rule`, `Not how it works`, `I don't know`.
- A second page: when sentences were left out of screen 1, the item `S1-more` says how many and asks whether to see them: `Yes, show them`, `No, skip them`. On yes, up to 12 of them are asked the same way, as `S1-13` and on; the ones beyond those 12 are counted in one line. On no, none of them is asked and none is written.
- `Right` writes only the items the sentence names. A general rule the owner did not see is never written: in the detail file it is listed under the rules no sentence shows, not under a sentence of its area.
- A sentence that names an area whose general rule did not verify is dropped; that area's verified ideas stay in the detail.
- Screens 2 and 3: the questions as rendered; the dialog's free text takes the owner's own answer.
- What an answer writes: `Right` writes the full rule from the detail. `Real, but a bad rule` and `You are right` write a card with the `pending` skill and no rule. `Keep it, because ...` writes the rule with the reason. `Not how it works` writes nothing and is logged.
- What a screen 2 answer writes: `The written rule` writes that rule and a card to change the code; `The code` writes the code's rule and a card to change the doc; `Mistake: fix it` writes the rule and one card per place; `Exception: keep it` writes the rule with its exceptions named; `Not on purpose: protect it` writes a card; `On purpose` and `I don't know` write nothing and are logged. `Keep it, because ...` with no reason asks for the reason once.
- The mechanism kinds are detail only: no question and no summary line per kind, and the gate asks for none.
- A re-adaptation asks the three screens again; it skips only the config keys that already have a value.
- Research proposes a value for every required config key, with its evidence; the playback shows them, and the interview does not end while one is missing.
- After the three screens come the shipped questions that no screen asks, unchanged, with their follow-ups: `H1-what`, `H2-pays`, the zones (`H6-zones`, `H6-r<n>`), the way of working (`H7-*`), the reply preferences and the budget (`H8-*`) and the config keys (`C<n>`). The shipped questions the screens replace go away: `H2-refused`, `H3-*`, `H4-*`, `H5-*`.
- Every agent that reads the repository keeps the shipped rules for it: the code index first, and history without content (`git show <sha>:<path>`, never a content diff).
- The detail file also lists each written rule with the verdict the mechanism agents gave it.
- The playback by section, its eight headings and the files step 4 writes stay as they are.
- `adapt-gates` and `adapt-record` keep their contract: the run file, the denied direct writes, one log line per answer. The gate's Workflow check follows the new script's arguments.

### Data

The Workflow returns what the prototype's script returns (branch `phase-1-adapt-general`, `skills/adapt/research.workflow.js`), plus:

- `areas[k].doubted`: a list of at most one `{ rule, why, file, line, quote }`.
- `kinds`: the mechanism agents' answers, in the shipped shape.
- `areas[k].ideas`: a list of at most four `{ text, file, line, quote }`.
- `plain`: `{ claims: [{ text, from }], rest: [{ text, from }] }`. `from` lists item ids: `<key>` for an area's general rule, `<key>.<n>` for the idea at place n of its list, from 1, and `kind:<kind>` for a mechanism kind's general rule.
- `kinds[k].short`: the kind's general rule in one sentence of 14 words at most.
- `areas[k].general.short`: the general rule in one sentence of 14 words at most.

`screens.json` is what the prototype's `screens()` returns (`skills/adapt/research2.mjs` on that branch), with `drawer1` holding the sentences as `{ text, from, at, risk }` and a gap of kind `doubted` in `drawer2`.

`interview.json` keeps the item shape the shipped queue writes. Ids: `S1-<n>` for a sentence, `X<n>` for a screen 2 question, and the nine ids of screen 3.

### Removed

The queue built from topics and kinds, and the questions about mechanism kinds. Their tests are replaced in the same commit, never left failing.

## Measure

- Reference copy, research only, 3 runs (the first one before the ideas carried their own citation): screen 1 within its caps in every run; a judge outside `/adapt` opens each sentence's citation: a sentence from an idea must be shown by its line, a sentence from a general rule must have its example and its other places as true cases of it, and at most one sentence in a run fails that; of the 8 invariants the code proves, 6 or more counting the detail in every run (shipped version: 6, 7, 6) and 3 or more on the screen (both versions: 3 to 5); 2.50 USD per run was the target; the first run cost 2.73 and the owner went on at that price (2026-11-12). A later run above 3.00 is reported before the next one.
- Exam project C, 3 runs, once: the owner marks the short sentences blind; the target is none invented. A key of its written rules, made by an agent from the instruction files removed from the copy, splits the missed rules into "in the code" and "only in the owner's head".
- The interview is measured afterwards, on the owner's word: one live interview and three replays.
- Tuning uses the reference only. Two rounds were the limit; on 2026-11-12 the owner raised the spend cap to 190 USD "para tus pruebas y ajustes" and asked for a third round. Exam project C is run once.
- Fourth round, 3 runs on the reference: the same counts, and how many first-page sentences an owner who does not write code understands as written.
- Third round, 3 runs of one version on the reference: the same judge counts the invariants whole on the two pages together and in the detail, and the sentences that say more than their places show.
- The suite passes and `pack --check` prints nothing.

## Limits

- Files: `skills/adapt/`, `agents/mechanism.md`, `proof/`, `hooks/core/adapt-*`; `manifest.json` only through `pack`.
- Every model call goes through the harness with `--api-credits` and the spend ledger. Estimate for the measure: 13 USD.
- Exam project C is written in the reference's language: it proves "never seen", not "another language".

## Questions for the owner

None open.

## Owner's answers

- Measure: another project, exam project C.
- Detail: apart, on request.
- The seven decisions above: yes.
