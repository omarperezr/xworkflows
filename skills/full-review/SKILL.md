---
name: full-review
description: Review every zone of the project with two reviews at once, write the review file, and decide each restructuring with the owner. Use when the owner asks for a full review, or on a yes from /adapt.
---

Before anything else, run `node .xworkflows/mark.mjs full-review` in the shell.

Talk to the owner in the owner's language. Headings, config keys and file contents stay in English. Questions go through `AskUserQuestion`: at most 4 per call, the recommended option first and marked `(Recommended)`.

## Step 1: Zones

Read `zones` from `.xworkflows/config.json`. If it is missing or `[]`, say `No zones yet: run /adapt first.` and stop.

## Step 2: Ask first, when run alone

When `adapt` did not just start you (its question already showed the estimate), ask yes or no: `Run the full review?` The description is `about X to Y million tokens, from one past run, not measured here`, where zones is the number of zones: X = zones × 2 × 0.17 and Y = zones × 2 × 0.25, rounded to one decimal. On no, stop.

## Step 3: The Workflow

Run one Workflow with the script below. Pass the `zones` array as the Workflow `args`.

```js
export const meta = {
  name: "full-review",
  description: "Two reviews times N zones, one read-only zone-review agent each",
  phases: [{ title: "Review" }, { title: "Merge" }],
};

const REVIEWS = ["thermo-nuclear-review", "thermo-nuclear-code-quality-review"];
const ZONES = args;
const RANK = { high: 0, medium: 1, low: 2 };
const schema = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { enum: ["high", "medium", "low"] },
          kind: { enum: ["error", "restructure"] },
          file: { type: "string" },
          line: { type: "number" },
          title: { type: "string" },
          case: { type: "string" },
        },
        required: ["severity", "kind", "file", "line", "title", "case"],
      },
    },
  },
  required: ["findings"],
};

phase("Review");
const jobs = [];
for (const review of REVIEWS) {
  for (const zone of ZONES) {
    jobs.push(async () => {
      const prompt = `Follow .claude/skills/${review}/SKILL.md, its "Whole-repo mode" section, on this zone only. Zone "${zone.key}", paths: ${zone.paths.join(", ")}.`;
      const out = await agent(prompt, { agentType: "zone-review", schema });
      return out.findings.map((f) => ({ ...f, review, zone: zone.key }));
    });
  }
}
const results = await parallel(jobs);
const ok = results.filter((r) => r);
log(`${ok.length} of ${jobs.length} agents returned`);

phase("Merge");
const seen = new Map();
for (const f of ok.flat()) {
  const at = `${f.file}:${f.line}`;
  seen.set(at, [...(seen.get(at) ?? []), f]);
}
const all = [];
for (const group of seen.values()) {
  const both = new Set(group.map((f) => f.review)).size > 1;
  all.push(...group.map((f) => ({ ...f, both })));
}
all.sort((a, b) => (b.both - a.both) || (RANK[a.severity] - RANK[b.severity]));
// The script's value is this last expression: { errors, restructures }.
({
  errors: all.filter((f) => f.kind === "error"),
  restructures: all.filter((f) => f.kind === "restructure"),
});
```

If fewer agents returned than were launched, tell the owner how many, and put that in the review file header.

## Step 4: The review file

Read `paths.reviews` from `.xworkflows/config.json` (default `docs/superpowers/reviews`). Write `<paths.reviews>/YYYY-MM-DD-full-review.md` with today's date; if it exists, use `-2`, `-3` for later runs that day. Contents:

- A header: the commit sha (`git rev-parse --short HEAD`), the zones, the two reviews, what `both` means (both reviews named the same `file:line`), and the counts.
- `## Errors`: numbered, each `**[<severity>, both] <title>** (<path>:<line>)` (leave `both` out when not both), then the case. Merge duplicates (same `file:line`, same point) into one item.
- `## Restructurings`: the same form.
- `## Owner's decisions (YYYY-MM-DD)`: empty for now.

Commit only that file: `git add <file>`, then `git commit -m "docs: full review YYYY-MM-DD" -- <file>`, so files the owner staged stay out. No AI author or co-author line. No push.

## Step 5: Decide each restructuring

Ask one question per restructuring, up to 4 per call, each decided on its own: `Do it`, `Drop it`, `Pending list`. Nothing is applied without a yes. Record each answer under `## Owner's decisions (YYYY-MM-DD)`, with the restructuring's number and title. Then commit the review file the same way (`docs: full review decisions YYYY-MM-DD`). Items answered `Do it` are the first source of `/next-step`.

## Step 6: The pending list

Until the `pending` skill exists, write the cards yourself. One card per unverified error and one per restructuring answered `Pending list`, appended to `paths.pending` (default `docs/PENDING.md`):

`- **P-<n>** — <text>. Origin: <review file>. Status: unscheduled.`

`<n>` is one above the highest `P-<n>` found both in that file and in `git log --grep "closes P-"`. If the file is missing, create it with the line `# Pending`. Commit only that file by path, as above.

## Errors enter a plan only after proof

The review does not verify. An error enters a plan only after the `verify-finding` agent answers `red: <test path> <command>`; on `discarded: <reason>` it is dropped. Verification runs when the owner picks the finding as the next step.
