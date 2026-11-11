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

## 5. What must not change; what is free to change

- What must stay as it is: a format, an API, a schema, a number, a name users see?
- What is free to change or delete without asking?

## 6. Zones and which paths are risk paths

- Do these zones match how you think of the code? Merge, split or rename any?
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
