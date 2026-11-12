---
name: pending
description: Add, change or close a card on the pending list, the one living list of work left to do. Use when a finding or a piece of work must be written down, when a plan or a batch branch changes what is left, and when work that has a card is done.
---

Before anything else, run `node .xworkflows/mark.mjs pending` in the shell.

Read `.xworkflows/config.json`: `paths.pending` (default `docs/PENDING.md`), `paths.plans` (default `docs/superpowers/plans`), `mainBranch` (default `main`).

The list is the file at `paths.pending`. The `pending` brake reads it on every push to `mainBranch` and refuses the push when the list breaks a rule below.

Only the main session edits the list. Agents report findings and you write the cards: two writers take the same number.

If the file is missing, create it: `cp .xworkflows/templates/PENDING.md <paths.pending>`.

Read only the cards you need. `grep -nw 'P-<n>' <paths.pending>` finds a card. `grep -n '<file or symbol>' <paths.pending>` shows whether a finding already has a card: if it has, change that card and add none.

## The card

One finding, one card, on one line with no indent:

`- **P-<n>** — <text>. Origin: <where>. Status: <unscheduled | scheduled | in progress on <branch>>.`

Write `P-<n>`, `Origin:`, `Status:` and the status words exactly as shown, in English: the brake and other skills match them.

- `<text>`: the place (file, symbol) and what is wrong or wanted, so that a reader who was not in this session understands it.
- `Origin:` the file that holds the finding (a review file, a plan, a spec), by path. With no such file: who found it and when, for example `review of <branch>, 2026-01-31`.
- `Status:` `unscheduled` at first; `scheduled` once the owner picks the work or a plan covers it; `in progress on <branch>` while a batch branch does it.

## Add

`<n>` is one above the highest number these two commands print, or 1 when they print nothing:

```
grep -owE 'P-[0-9]+' <paths.pending> | cut -d- -f2 | sort -n | tail -1
git log --all -i --grep='closes P-' --format=%B | grep -owiE 'P-[0-9]+' | cut -d- -f2 | sort -n | tail -1
```

The log counts because a closed card is gone from the file while its number stays taken: the brake fails a card whose number a commit closed. Several new cards take numbers in a row.

Put the card under the `##` heading that fits it, else at the end.

The brake fails two cards with one number. It happens when two branches each added cards and then merged: renumber the newer card.

## Change

Edit the card in place. Its number never changes.

`in progress on <branch>` is valid only while the branch exists, locally or at the remote, and is not merged into `mainBranch`; otherwise the brake fails the card. Before a branch is merged or deleted, close each card that names it or change its status. The brake reads only letters, digits, `/`, `_` and `-` in the branch name: for a branch with a dot or another character, leave the card `scheduled`.

## Close

Delete the card's line in a commit whose message says `closes P-<n>`; for several cards, `closes P-3, P-4 and P-7`. Nothing done stays in the list: no card is ticked, struck through or marked done.

- Close when the work is done. For a batch: after its review is ok, in a commit on its branch, before the branch merges.
- A card the owner drops is closed the same way, with the reason in the commit message.
- Write `closes P-<n>` in no other commit message. The brake takes every number after `closes` as closed, and the log keeps it forever: work that comes back gets a new card with a new number.

## Plans

The brake fails a commit that changes a file under `paths.plans` and not the list. So the commit that adds or changes a plan carries its list change:

- Each card the plan covers becomes `scheduled` and gets `plan <plan path>` at the end of its text, so the card leads to its plan.
- Each batch of the plan that covers no card gets one, `Origin:` the plan's path. Every batch branch then has a card to close.
- Work the plan drops is closed.

A plan commit passes without its own list change in three cases:

- It only adds seal lines, each a bare line `<role> ok at <sha>`: no bullet, no backticks, no final period.
- It is on a batch branch, and the `--no-ff` merge of that branch changes the list.
- A later commit changes the list and says `pending-for: <sha>` in its message, with 7 or more characters of the plan commit's sha.

A plan change that changes no card (wording, a ticked box) goes in a commit that changes the list for its own reason, or on the batch branch. Never edit the list only to pass the brake.

## Commit

A list change that belongs to another commit (a plan, a close) goes in that commit. Cards alone: `git add <paths.pending>`, then `git commit -m "docs: pending, <what changed>" -- <paths.pending>`. No AI author or co-author line. No push.

When another skill sent you here with findings (the full review does), write one card per finding, commit, and return to that skill.
