export const meta = {
  name: "adapt-research",
  description: "Fixed research for /adapt: six topic agents, then one agent per mechanism kind.",
  phases: [{ title: "Topics" }, { title: "Mechanisms" }],
};

const KINDS = ["values", "snap", "srvw", "delta", "idem", "txn", "access", "batch", "domain", "compat", "conc", "input"];

const TOPIC_SCHEMA = {
  type: "object",
  properties: {
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          heading: { type: "string", enum: ["1", "2", "3", "4", "5", "6", "7", "8", "config", "written"] },
          text: { type: "string" },
          tag: { type: "string", enum: ["code", "git"] },
          key: { type: "string" },
        },
        required: ["heading", "text", "tag"],
      },
    },
    areas: { type: "object", additionalProperties: { type: "string", enum: ["present", "absent", "unsure"] } },
  },
  required: ["lines"],
};

const CITE = { file: { type: "string" }, line: { type: "integer" }, quote: { type: "string" } };
const KIND_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string" },
    status: { type: "string", enum: ["found", "absent", "not-present"] },
    verdicts: {
      type: "array",
      maxItems: 15,
      items: {
        type: "object",
        properties: { id: { type: "string" }, verdict: { type: "string", enum: ["enforced", "contradicted", "no-evidence"] }, ...CITE },
        required: ["id", "verdict"],
      },
    },
    // required when status is found; render shows a found kind without it as "general rule missing"
    general: {
      type: "object",
      properties: { rule: { type: "string" }, basis: { type: "string", enum: ["written", "code", "both"] }, ...CITE },
      required: ["rule", "basis", "file", "line", "quote"],
    },
    rules: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        properties: { rule: { type: "string" }, ...CITE },
        required: ["rule", "file", "line", "quote"],
      },
    },
    notChecked: { type: "array", items: { type: "string" } },
  },
  required: ["kind", "status", "verdicts", "rules", "notChecked"],
};

// Same function as research.mjs `sum` (a test checks they agree).
const sum = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(16);
};

const RULES = `Rules:
- Ask \`graphify query\` before opening files. Verify each path still exists.
- Read history as commit messages and file stats only (\`git log --oneline\`, \`--stat\`, \`--name-only\`). Never read past versions of files or content diffs: no \`git show <sha>:<path>\`, no \`git log -p\`; \`git diff\` and \`git stash show\` only with \`--stat\` or \`--name-only\`.
- Answer in 10 lines or fewer.
- Return your answer through the schema: each line has a heading, text, and tag \`code\` (read from the code) or \`git\` (read from history). Leave a line out rather than guess wildly.
- Put each line under the summary heading it belongs to, whatever your topic. \`heading\` is one of the strings '1' to '8', 'config' or 'written':
  '1' what the project is; '2' who pays, what is sold, what is not done; '3' aspirations at about 3, 12 and 36 months; '4' risks, the costliest mistake first; '5' what must not change and what is free to change; '6' zones and which paths are risk paths; '7' how the owner works; '8' about the owner. Use 'config' and 'written' only where your topic asks for them.`;

const TOPIC6 = `Next steps already written down, searched in this order:
1. Pending list (\`paths.pending\`, default \`docs/PENDING.md\`): cards "in progress", then "scheduled".
2. Work in progress in git: uncommitted changes, skipping paths under \`.xworkflows/\`, \`graphify-out/\` and the files listed in \`.xworkflows/installed.json\` (\`files\` keys, \`created\`); local branches not merged into \`mainBranch\` with a commit in the last 30 days.
3. Plans in \`paths.plans\` with unchecked boxes (\`- [ ]\`), newest first.
4. The other pending cards, in file order.
5. \`TODO.md\`, \`TODO\`, \`ROADMAP.md\`, \`NEXT.md\` at the root or in \`docs/\`; README sections titled roadmap, todo, next or planned.
6. Open GitHub issues with \`gh issue list\`, only when \`gh\` is installed and authenticated and the repo has a GitHub remote. Otherwise print one line and skip this source.
7. \`TODO\` and \`FIXME\` comments (\`git grep -nE '\\b(TODO|FIXME)\\b'\`): the count, and at most 5, from the files changed most.
Return one line per item under heading "written": what, source, path.`;

const GLOSS = { values: "money, time, units, rounding", snap: "values frozen at write", srvw: "writes through server functions", delta: "changes as deltas", idem: "retried or offline writes", txn: "multi-row actions", access: "database or server access control", batch: "work over many rows", domain: "legal, tax or domain rules", compat: "public API, file formats, schemas", conc: "locks, queues, order", input: "validation of outside input" };

const WRITTEN = " Written rules: read `.xworkflows/rules.json` (`{ rules: [{ id, text, file, line, kinds }] }`, rule sentences collected from the docs and code comments). The rules with an empty `kinds` list are yours: use those that bear on your topic as evidence for the headings they belong to, with their `file`.";

const CFG = (keys) => ` Also return one line per key with heading "config" and \`key\` set: ${keys.map((k) => `\`${k}\``).join(", ")}. A guess goes in \`text\`; a value empty on purpose is written as \`[]\`.`;

const topics = (zero) => [
  "Stack, build files, linters." + CFG(["checks.project", "checks.patterns", "checks.ratchets"]) + " checks.project = the project's own check commands; checks.patterns = pattern checks; checks.ratchets = counts that must not grow.",
  "Layout: top folders, size in bytes per folder (`git ls-files` with `wc -c`), what each holds. Leave out generated and vendored code. Do not propose zones: they come from the scan." + CFG(["paths.code", "paths.risk", "paths.heavyRead", "paths.codeAnyway"]) + " paths.code = code folders; paths.risk = risk paths; paths.heavyRead = big or generated paths not to read whole; paths.codeAnyway = paths that look like non-code but are code.",
  "Tests: file patterns, run command, folders that need a service such as a database." + CFG(["tests.files", "tests.run", "tests.notRunnable"]) + " tests.files = test file globs; tests.run = the test command; tests.notRunnable = test folders that need a service.",
  `Where data and money move: database, payments, auth, outside calls.${zero.length ? ` Also return \`areas\`: for each of these kinds, ${JSON.stringify(zero)}, say whether the project has that area: "present", "absent" or "unsure". Kinds: ${KINDS.map((k) => `${k} (${GLOSS[k]})`).join(", ")}.` : ""}`,
  "History of the last 12 months: files changed most, reverts, fix commits.",
  TOPIC6,
];

const KIND_PROMPT = (kind) => `Mechanism kind \`${kind}\` (${GLOSS[kind]}). Work in this order.

1. Written rules. Read \`.xworkflows/rules.json\` (\`{ rules: [{ id, text, file, line, kinds }] }\`) and take the first 15 rules, in rules.json order (lowest W id first), whose \`kinds\` includes \`${kind}\` (at most 15; leave the rest). These are what the project says it does; check each against the code.
2. The code. Read \`.xworkflows/scan.json\`: the \`kinds.${kind}.hits\` and the \`sql\` entries. Open the cited files and the files the written rules name. Search beyond the hits with \`graphify query\` and \`grep\`.
3. verdicts: one per written rule from step 1, with its \`id\`:
   - \`enforced\`: the code does what the rule says. Cite the code line that does it.
   - \`contradicted\`: the code does otherwise. Cite the code line that breaks it.
   - \`no-evidence\`: you found neither, or the rule is not about this mechanism. No citation.
4. general: the kind's ONE project-level rule. Take the first case that applies:
   (a) One or more written rules are \`enforced\`: the general rule is the broadest enforced one (the one that covers the most places in the code); on a tie, the one with the lowest W id. \`basis\` \`both\`. Anchor it on the pattern applied across files; cite one line where it is applied.
   (b) None is enforced, but the code follows one consistent pattern for this kind across files: state that pattern. \`basis\` \`code\`. Anchor it on the pattern applied across files; cite one line where it is applied.
   (c) Otherwise: no general rule, status \`absent\`.
   A \`contradicted\` written rule never becomes the general rule.
   State the rule at project level, in your own words if needed: one sentence, how every change of this kind must behave across the project. It must not name a function, file, table or column. For example: "Every label a user sees comes from the translation files."
5. rules: at most 3 details, each narrower than the general rule and not repeating it, worded as how the code must do something, with file, line and \`quote\`.
6. status: \`found\` (case a or b: you state a general rule), \`absent\` (case c: the area for this kind exists, no general rule), \`not-present\` (the project has no such area). Give verdicts whatever the status.

Every citation is \`file\`, \`line\` and \`quote\`: text copied exactly from that line of that file (it is checked; an unmatched citation is dropped and an \`enforced\` or \`contradicted\` verdict without one counts as \`no-evidence\`). List in notChecked the paths you could not open. Read history only as commit messages and file stats.`;

phase("Topics");
const zero = args.zeroHits || [];
const t = await parallel(
  topics(zero).map((p, i) => () =>
    agent(`Project root: ${args.root}\nTopic ${i + 1}.\n${p}${i < 5 ? WRITTEN : ""}\n\n${RULES}`, {
      agentType: "explore", schema: TOPIC_SCHEMA, label: `t${i + 1}`, phase: "Topics",
    })),
);
const topicRes = {};
t.forEach((r, i) => { topicRes[`t${i + 1}`] = r; });

const areas = (topicRes.t4 && topicRes.t4.areas) || {};
const skipped = {};
const run = [];
for (const k of KINDS) {
  if (zero.includes(k) && areas[k] === "absent") skipped[k] = "no scan hits and topic 4 found the area absent";
  else run.push(k);
}

phase("Mechanisms");
const res = await parallel(
  run.map((k) => () =>
    agent(KIND_PROMPT(k), { agentType: "mechanism", model: "sonnet", schema: KIND_SCHEMA, label: `k:${k}`, phase: "Mechanisms" })),
);
const kinds = {};
for (const k of KINDS) if (skipped[k]) kinds[k] = { kind: k, status: "not-present", verdicts: [], rules: [], notChecked: [] };
run.forEach((k, i) => { kinds[k] = res[i]; });
const ordered = {};
for (const k of KINDS) ordered[k] = kinds[k];

return { topics: topicRes, kinds: ordered, skipped, sum: sum(JSON.stringify({ topics: topicRes, kinds: ordered, skipped })) };
