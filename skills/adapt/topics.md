# Question bank for adapt

Questions research cannot answer by itself, per summary heading. Ask one only when research left it empty or unsure. Put research's guess first, marked `(Recommended)`.

Each invariant the interview proof misses adds one line under its heading.

## 1. What it is

- In one sentence, what does this project do, and for whom?
- Which parts are live and used today, and which are experiments or dead?

## 2. Who pays, what is sold, what is not done

- Who pays, and for what exactly?
- What does the project refuse to do or sell, even if asked?

## 3. Aspirations at about 3, 12 and 36 months

- Roughly, where do you hope the project is in about 3 months? In about 12? In about 36? No dates.
- Which of those matters most if only one can happen?

## 4. Risks, the costliest mistake first

- What is the costliest mistake an agent could make here: lost data, lost money, a leak, a broken promise to users?
- Has something like it happened before? What broke, and what stops it now?
- For each risk: How does the code prevent this today, and what rule must every change follow?

## 5. What must not change; what is free to change

- What must stay as it is: a format, an API, a schema, a number, a name users see?
- What is free to change or delete without asking?

How the code enforces it, one question per mechanism; each answer is a rule line:

- Which currency or unit is the source of truth, and which values are only derived from it?
- Which values are frozen on a record when it is written (a rate, a cost, the amount charged), so a later change never restates a past row?
- How is rounding done: are stored values exact and rounded once, only when shown?
- Which data changes only through server functions, and do they change it by deltas rather than by setting absolute values?
- Where is access enforced: in the database for every row, with the client untrusted and UI gating never counted as security?
- Can a write arrive twice (offline, retried, a double click), and how does it replay without taking effect twice?
- When one user action touches several rows, is it one request and one transaction?
- Is any work done per row that could be done once: a query per loop iteration, a server call per item?
- Which domain, legal or tax rules must the code follow, and where are they written down?

## 6. Zones and which paths are risk paths

- Does this split match how you think about the code? Merge, split or rename any?
- Which paths are risk paths: a change there needs the risk reviewer every time?

## 7. How the owner works

- Do you keep each default git rule as it is? (Ask one rule per question.)
- How deep should a review go on a normal change, and who may push?

## 8. About you

- How do you want replies: language, length, tone?
- What model budget per session or per month should I keep to?

## Research topic 6

Next steps already written down, searched in this order:

1. Pending list (`paths.pending`, default `docs/PENDING.md`): cards "in progress", then "scheduled".
2. Work in progress in git: uncommitted changes, skipping paths under `.xworkflows/`, `graphify-out/` and the files listed in `.xworkflows/installed.json` (`files` keys, `created`); local branches not merged into `mainBranch` with a commit in the last 30 days.
3. Plans in `paths.plans` with unchecked boxes (`- [ ]`), newest first.
4. The other pending cards, in file order.
5. `TODO.md`, `TODO`, `ROADMAP.md`, `NEXT.md` at the root or in `docs/`; README sections titled roadmap, todo, next or planned.
6. Open GitHub issues with `gh issue list`, only when `gh` is installed and authenticated and the repo has a GitHub remote. Otherwise print one line and skip this source.
7. `TODO` and `FIXME` comments (`git grep -nE '\b(TODO|FIXME)\b'`): the count, and at most 5, from the files changed most.
