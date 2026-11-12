# Pending

One living list of the work left to do. The `pending` brake refuses a push to the main branch when the list breaks one of these rules:

- One card per finding, on one line: `- **P-<n>** — <text>. Origin: <where>. Status: <unscheduled | scheduled | in progress on <branch>>.`
- Closing a card deletes it, in the commit whose message says `closes P-<n>`. Nothing done stays in the list.
- A number is never used twice: the next one is above every `P-<n>` in this file and every `closes P-<n>` in the git log.
- `in progress on <branch>` does not outlive its branch.
- A commit that changes a plan also changes this list, or a later commit says `pending-for: <sha>`.

## Cards
