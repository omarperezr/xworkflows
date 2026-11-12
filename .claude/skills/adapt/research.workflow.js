export const meta = {
  name: "adapt-research",
  description: "Fixed research for /adapt: a project profile, the written rules, one agent per area and per mechanism kind, the questions no file answers, then the plain sentences.",
  phases: [{ title: "Profile" }, { title: "Topics and written rules" }, { title: "Areas and mechanisms" }, { title: "Questions" }, { title: "Plain" }],
};

// The frame is this fixed script; the judgment is the agents'. research.mjs holds the same `sum`.
const AREAS = {
  truth: "sources of truth, units and precision: which stored value, record or setting is the authority others are worked out from; units, time zones, rounding",
  state: "how state changes: who may write it and through which path, in what unit of work, and what happens when the same change arrives twice or half of it fails",
  access: "who may do or see what: sign-in, permissions, secrets and credentials, personal data",
  boundary: "the edge of the system: checks on outside input, calls to outside services, and what the code does when they fail or lie",
  compat: "what must not break for those who depend on it: public interfaces, file and data formats, schemas, protocols, stored history",
  order: "time and order: concurrency, scheduling, the order of events, and whether the same input always gives the same result",
  limits: "operating limits and failure: resource and rate limits, safety stops, budgets, what the system does when something goes wrong",
};

const CITE = { file: { type: "string" }, line: { type: "integer" }, quote: { type: "string" } };
const CITED = (extra, required) => ({ type: "object", properties: { ...extra, ...CITE }, required: [...required, "file", "line", "quote"] });
const AREA_HINT = { where: { type: "array", items: { type: "string" } }, patterns: { type: "array", maxItems: 6, items: { type: "string" } } };

const PROFILE_SCHEMA = {
  type: "object",
  properties: {
    what: { type: "string" },
    languages: { type: "array", items: { type: "string" } },
    docs: { type: "array", maxItems: 40, items: { type: "object", properties: { file: { type: "string" }, lines: { type: "integer" } }, required: ["file", "lines"] } },
    areas: {
      type: "array",
      items: { type: "object", properties: { key: { type: "string", enum: Object.keys(AREAS) }, present: { type: "string", enum: ["yes", "no", "unsure"] }, why: { type: "string" }, ...AREA_HINT }, required: ["key", "present", "why", "where", "patterns"] },
    },
    projectAreas: {
      type: "array",
      maxItems: 4,
      items: { type: "object", properties: { key: { type: "string" }, name: { type: "string" }, covers: { type: "string" }, why: { type: "string" }, ...AREA_HINT }, required: ["key", "name", "covers", "why", "where", "patterns"] },
    },
  },
  required: ["what", "languages", "docs", "areas", "projectAreas"],
};

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
  },
  required: ["lines"],
};

const WRITTEN_SCHEMA = {
  type: "object",
  properties: {
    rules: { type: "array", maxItems: 25, items: CITED({ text: { type: "string" }, area: { type: "string" } }, ["text", "area"]) },
    notes: { type: "array", maxItems: 12, items: CITED({ kind: { type: "string", enum: ["goal", "refusal", "incident", "provisional", "business"] }, text: { type: "string" } }, ["kind", "text"]) },
    notRead: { type: "array", items: { type: "string" } },
  },
  required: ["rules", "notes", "notRead"],
};

const AREA_SCHEMA = {
  type: "object",
  properties: {
    area: { type: "string" },
    status: { type: "string", enum: ["found", "absent", "not-present"] },
    general: CITED({ rule: { type: "string" }, basis: { type: "string", enum: ["code", "both"] }, risk: { type: "string", enum: ["high", "medium", "low"] }, cost: { type: "string" } }, ["rule", "basis", "risk", "cost"]),
    second: CITED({ rule: { type: "string" }, risk: { type: "string", enum: ["high", "medium", "low"] }, cost: { type: "string" } }, ["rule", "risk", "cost"]),
    support: { type: "array", maxItems: 3, items: CITED({}, []) },
    exceptions: { type: "array", maxItems: 3, items: CITED({ how: { type: "string" } }, ["how"]) },
    contradicted: { type: "array", maxItems: 3, items: CITED({ written: { type: "string" }, wfile: { type: "string" }, wline: { type: "integer" }, wquote: { type: "string" }, how: { type: "string" } }, ["written", "wfile", "wline", "wquote", "how"]) },
    unprotected: { type: "array", maxItems: 2, items: CITED({ risk: { type: "string" } }, ["risk"]) },
    commentRules: { type: "array", maxItems: 5, items: CITED({ text: { type: "string" } }, ["text"]) },
    doubted: { type: "array", maxItems: 1, items: CITED({ rule: { type: "string" }, why: { type: "string" } }, ["rule", "why"]) },
    details: { type: "array", maxItems: 3, items: CITED({ rule: { type: "string" } }, ["rule"]) },
    notChecked: { type: "array", items: { type: "string" } },
  },
  required: ["area", "status", "support", "exceptions", "contradicted", "unprotected", "commentRules", "doubted", "details", "notChecked"],
};

// The question texts are fixed in research2.mjs; the agent only drafts what each one leans on.
const QUESTIONS = {
  "B-rules": "a business rule the code must respect that no file states",
  "B-refused": "what the project does not do, on purpose",
  "B-mistake": "the mistake that would cost the most",
  "B-incident": "one real time something went wrong here",
  "B-free": "what an agent may change or delete without asking",
  "G-3m": "where the project should be in about 3 months",
  "G-12m": "where it should be in about 12 months",
  "G-36m": "where it should be in about 36 months",
  "G-interim": "given those goals, which part of today's code is provisional",
};
const QUESTION_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", enum: Object.keys(QUESTIONS) },
          lead: { type: "string" },
          options: { type: "array", maxItems: 3, items: { type: "object", properties: { label: { type: "string" }, description: { type: "string" }, file: { type: "string" }, line: { type: "integer" }, quote: { type: "string" } }, required: ["label", "description"] } },
        },
        required: ["id", "lead", "options"],
      },
    },
  },
  required: ["questions"],
};

const KINDS = ["values", "snap", "srvw", "delta", "idem", "txn", "access", "batch", "domain", "compat", "conc", "input"];

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

const GLOSS = { values: "money, time, units, rounding", snap: "values frozen at write", srvw: "writes through server functions", delta: "changes as deltas", idem: "retried or offline writes", txn: "multi-row actions", access: "database or server access control", batch: "work over many rows", domain: "legal, tax or domain rules", compat: "public API, file formats, schemas", conc: "locks, queues, order", input: "validation of outside input" };

const KIND_PROMPT = (kind) => `Mechanism kind \`${kind}\` (${GLOSS[kind]}). The rules are about the application, never about its tests: do not use or cite test files (folders \`test\`, \`tests\`, \`__tests__\`, \`spec\`, \`e2e\`; files \`*.test.*\`, \`*.spec.*\`, \`test_*.py\`, \`*_test.*\`, \`conftest.py\`), and never state a rule about how tests are written or run. Work in this order.

1. Written rules. Read \`.xworkflows/rules.json\` (\`{ rules: [{ id, text, file, line, kinds }] }\`) and take the first 15 rules, in rules.json order (lowest W id first), whose \`kinds\` includes \`${kind}\` (at most 15; leave the rest). These are what the project says it does; check each against the code. A rule whose \`file\` is code (not a doc) is a comment about the code right below it: read that file from the rule's \`line\` on, and if the next lines do what it says, the verdict is \`enforced\` with one of those lines cited.
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

Every citation is \`file\`, \`line\` and \`quote\`: text copied exactly from that line of that file (it is checked; an unmatched citation is dropped and an \`enforced\` or \`contradicted\` verdict without one counts as \`no-evidence\`). List in notChecked the paths you could not open.

How to read:
- Ask \`graphify query\` before opening files. Verify each path still exists.
- Read history as commit messages and file stats only (\`git log --oneline\`, \`--stat\`, \`--name-only\`). Never read past versions of files or content diffs: no \`git show <sha>:<path>\`, no \`git log -p\`; \`git diff\` and \`git stash show\` only with \`--stat\` or \`--name-only\`.`;

const PLAIN_ITEMS = { type: "array", items: { type: "object", properties: { text: { type: "string" }, from: { type: "array", items: { type: "string" } } }, required: ["text", "from"] } };
const PLAIN_SCHEMA = { type: "object", properties: { claims: PLAIN_ITEMS, rest: PLAIN_ITEMS }, required: ["claims", "rest"] };

const PLAIN = (language, rules) => `You turn the rules below into short plain sentences for the owner of the project, who is not a programmer. Write in ${language}.

The rules, each with its id:
${JSON.stringify(rules)}

Return \`claims\`: sentences that each say ONE idea the owner can answer "yes" or "no" to.
- 14 words at most. Everyday words: no function, file or table names, no jargon. One subject, active voice.
- \`from\`: the ids of the rules the sentence comes from, at least one. Use only ids from the list.
- A sentence says what its rules say, no more: never widen a rule to more cases, more places or more strength than it states, and never add a reason it does not give. A short sentence that says more than its rule is worse than a long one that does not. For example, from the rule "A loan period is counted in whole days" write "A loan lasts whole days.", never "Nothing is ever counted in hours."
- Put first the ideas the owner would be most hurt to see broken. Two rules that give one idea give one sentence naming both ids.
- At most 12 in \`claims\`. Ideas beyond 12 go in \`rest\`, in the same form, never dropped.
- Leave out a rule you cannot say in 14 words without widening it.`;

// Same function as research.mjs `sum` (a test checks they agree).
const sum = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(16);
};

const READ = `How to read:
- Ask \`graphify query\` before opening files. Verify each path still exists.
- Read history as commit messages and file stats only (\`git log --oneline\`, \`--stat\`, \`--name-only\`). Never read past versions of files or content diffs: no \`git show <sha>:<path>\`, no \`git log -p\`; \`git diff\` and \`git stash show\` only with \`--stat\` or \`--name-only\`.
- The project may be written and documented in any language. Read it as it is; answer in English.
- Every citation is \`file\` (relative to the project root), \`line\` and \`quote\`: text copied exactly from that line of that file. A script checks each one; an unmatched citation is dropped with what it supported.`;

const PROFILE = `You profile a repository you have never seen, so that the agents after you know where to look. You judge; a script checks your citations later.

Read: the README files, the build and dependency files, \`graphify-out/GRAPH_REPORT.md\`, and \`.xworkflows/scan.json\` (use only its \`layout\` and \`zones\`, folder sizes, and its \`checks\`, the project's own check scripts and linter settings). Skim what those checks and the CI steps look for: what a project already checks about itself is the best sign of what it holds as rules.

Return:
- \`what\`: what the project is and does, three sentences at most.
- \`languages\`: the programming languages that hold the logic, most code first.
- \`docs\`: the files where this project wrote down how it must work or be changed, the most important first, each with its line count (\`wc -l\`): README files, design notes, decision records, contributing guides, plans, runbooks, in any folder and any language. Not generated files, not API listings, not changelogs. At most 40.
- \`areas\`: one entry for EACH of these seven areas, saying whether this project has it:
${Object.entries(AREAS).map(([k, v]) => `  - \`${k}\`: ${v}.`).join("\n")}
  \`present\`: \`yes\`, \`no\` or \`unsure\`. \`why\`: one sentence naming what in this project makes it so. \`where\`: the folders or files where it lives (at most 6). \`patterns\`: up to 6 search patterns for \`git grep -nE\` that find where this area is handled IN THIS STACK: names of the libraries, functions, keywords, decorators, types or file names this code really uses. Look at the code before you choose them; a pattern that matches nothing is useless, and so is one that matches every file.
- \`projectAreas\`: up to 4 areas that matter in THIS project and that the seven do not cover: for example the rules of its trade, the validity of its numbers, the hardware it drives, the law it must follow. Only what the code, the docs or the project's own checks show; none is a valid answer, and so is four. A project area never restates one of the seven. \`key\`: a short lower-case word. \`covers\`: what belongs in it. \`why\`: what a mistake there costs. \`where\` and \`patterns\` as above.

${READ}`;

const RULES = `Rules:
- Answer in 10 lines or fewer.
- Return your answer through the schema: each line has a heading, text, and tag \`code\` (read from the code) or \`git\` (read from history). Leave a line out rather than guess wildly.
- Put each line under the summary heading it belongs to, whatever your topic. \`heading\` is one of the strings '1' to '8', 'config' or 'written':
  '1' what the project is; '2' who it is for, what it gives them, what it does not do; '3' aspirations at about 3, 12 and 36 months; '4' risks, the costliest mistake first; '5' what must not change and what is free to change; '6' zones and which paths are risk paths; '7' how the owner works; '8' about the owner. Use 'config' and 'written' only where your topic asks for them.`;

const TOPIC6 = `Next steps already written down, searched in this order:
1. Pending list (\`paths.pending\`, default \`docs/PENDING.md\`): cards "in progress", then "scheduled".
2. Work in progress in git: uncommitted changes, skipping paths under \`.xworkflows/\`, \`graphify-out/\` and the files listed in \`.xworkflows/installed.json\` (\`files\` keys, \`created\`); local branches not merged into \`mainBranch\` with a commit in the last 30 days.
3. Plans in \`paths.plans\` with unchecked boxes (\`- [ ]\`), newest first.
4. The other pending cards, in file order.
5. \`TODO.md\`, \`TODO\`, \`ROADMAP.md\`, \`NEXT.md\` at the root or in \`docs/\`; README sections titled roadmap, todo, next or planned, in any language.
6. Open GitHub issues with \`gh issue list\`, only when \`gh\` is installed and authenticated and the repo has a GitHub remote. Otherwise print one line and skip this source.
7. \`TODO\` and \`FIXME\` comments (\`git grep -nE '\\b(TODO|FIXME)\\b'\`): the count, and at most 5, from the files changed most.
Return one line per item under heading "written": what, source, path.`;

const CFG = (keys) => ` Also return one line per key with heading "config" and \`key\` set: ${keys.map((k) => `\`${k}\``).join(", ")}. A guess goes in \`text\`; a value empty on purpose is written as \`[]\`.`;

const TOPICS = [
  "Stack, build files, linters." + CFG(["checks.project", "checks.patterns", "checks.ratchets"]) + " checks.project = the project's own check commands; checks.patterns = pattern checks; checks.ratchets = counts that must not grow.",
  "Layout: top folders, size in bytes per folder (`git ls-files` with `wc -c`), what each holds. Leave out generated and vendored code. Do not propose zones: they come from the scan." + CFG(["paths.code", "paths.risk", "paths.heavyRead", "paths.codeAnyway"]) + " paths.code = code folders; paths.risk = risk paths; paths.heavyRead = big or generated paths not to read whole; paths.codeAnyway = paths that look like non-code but are code.",
  "Tests: file patterns, run command, folders that need a service such as a database." + CFG(["tests.files", "tests.run", "tests.notRunnable"]) + " tests.files = test file globs; tests.run = the test command; tests.notRunnable = test folders that need a service.",
  "What the system holds and moves that has value, and where: stored data, outside services it calls, credentials, and anything it acts on in the world (payments, orders, messages, devices).",
  "History of the last 12 months: files changed most, reverts, fix commits.",
  TOPIC6,
];

const WRITTEN = (files, keys) => `You read what a project wrote down about itself and pick out its rules. Read each of these in full, every line of the range given, in this order:
${files.map((f) => `- ${f}`).join("\n")}

\`rules\`: every sentence or bullet that states a rule: how the system must behave, or how it must be changed. It may be in any language and need not use a word like "must": a decision record that says what was chosen and why is a rule, and so is a stated limit, a named source of truth, or a thing that is never done. These are NOT rules: a description of what a folder holds, a step of a how-to, a result that was measured, a plan for later. Keep a rule only once. At most 25, the ones a careless change would break first.
For each: \`text\`, the rule in one plain English sentence, faithful to the source; its citation; and \`area\`, the one key it belongs to: ${keys.map((k) => `\`${k}\``).join(", ")}, or \`none\`.

\`notes\`: what a later interview with the owner will lean on, each with its citation, at most 12:
- \`goal\`: where the project wants to be, or work that is planned.
- \`refusal\`: what the project says it does not do.
- \`incident\`: something that went wrong and what it cost.
- \`provisional\`: something the docs call temporary, a stopgap, or due to be replaced.
- \`business\`: who the project is for and what they get from it.

\`notRead\`: what you could not read in full, with the lines you skipped.

${READ}`;

const CHECKS = (keys) => `You read what a project already checks about itself, and say which rule each check enforces. A rule that a script, a linter setting or a pipeline step enforces is one the project really holds.

Read \`.xworkflows/scan.json\`, key \`checks\`: the project's check scripts and linter settings. Add what you find yourself: the pipeline files (CI workflows), git hooks kept in the repository, pre-commit settings, and the script a push or a merge must pass. Open each one; a long script is read function by function.

\`rules\`: one entry per rule a check enforces, the costliest to break first, at most 25. \`text\`: the rule in one plain English sentence, as what the code must or must never do (not "the script checks X" but "X must hold"). Cite the line of the check that enforces it. \`area\`: the one key it belongs to: ${keys.map((k) => `\`${k}\``).join(", ")}, or \`none\`. Leave out checks of style, formatting and naming.
\`notes\`: return an empty list. \`notRead\`: the check files you could not read in full.

${READ}`;

const AREA = (key, gloss, hint, written, left) => `Area \`${key}\`: ${gloss}.

What the profile of this project says about this area: ${hint.why || hint.covers || ""}
Where to start: ${(hint.where || []).join(", ") || "(no path given)"}
Search patterns chosen for this stack, for \`git grep -nE\`: ${(hint.patterns || []).map((p) => `\`${p}\``).join("  ") || "(none)"}

Rules the project wrote down for this area, or enforces by its own checks (\`from\` says which; ${left ? `${left} more were left out of this list` : "all of them"}):
${written.length ? JSON.stringify(written) : "(none found)"}

The rules are about the system, never about its tests: do not cite test files, and state no rule about how tests are written or run. Work in this order.

1. Find how the code handles this area. Run the patterns, open the files they point at, and search beyond them with \`graphify query\` and \`grep\`. Read the comments and docstrings around what you find: rules live there too.
2. \`general\`: the area's ONE project-level rule. First list for yourself the candidates (the written and checked rules above, and the patterns you saw in the code); the general rule is the one whose breaking would cost the most and that the most code depends on. It is a pattern the code follows in more than one place, or a written rule the code really follows. State it as how every change in this area must behave, in one sentence, at the level where it is true: if it holds for every such value in the project, do not state it for one function. It names no function, file, table or column. For example, in a system that lends books: "A loan period is always counted in whole days in the library's own time zone." Cite one line where it is applied. \`basis\`: \`both\` when the docs say it and the code does it, \`code\` when only the code shows it. A rule that only the docs state, with no code behind it, is not the general rule. \`risk\`: how bad a mistake here is, \`high\`, \`medium\` or \`low\`; \`cost\`: what such a mistake costs, in a few words.
   \`second\`, optional: ONE more project-level rule of this area, in the same form with its own citation, only when the area holds a second rule that is independent of the general one (breaking one does not break the other) and about as costly to break. Most areas have none; never split one rule in two to fill it.
3. \`support\`: up to 3 more citations, in other files, where the same pattern is applied. A rule seen in one place only is weak: say so by giving none.
4. \`exceptions\`: places that handle the same thing differently from the general rule, each with its citation and \`how\` it differs. Look for them on purpose: the second-most-common way of doing the same thing, an older module, a quick fix. An exception the code itself explains (a comment says why this place differs) is already decided: leave it out. None is a valid answer, and the usual one.
5. \`contradicted\`: a rule from the written list above that the code breaks. \`written\` is the rule's text; \`wfile\`, \`wline\` and \`wquote\` cite the doc; \`file\`, \`line\` and \`quote\` cite the code line that breaks it; \`how\` says the difference.
6. \`unprotected\`: a place where a mistake in this area would lose money, data or safety and where you looked for a check, a constraint or a test and found none. \`risk\` says what could happen. Cite the place. Do not list what is merely unusual or could be tidier. None is a valid answer, and the usual one.
7. \`commentRules\`: up to 5 rules you found written in code comments or docstrings (any language), each as one plain English sentence with its citation.
8. \`details\`: up to 3 narrower rules, each with its citation, that do not repeat the general rule.
9. \`doubted\`: at most ONE rule the code follows in this area that you have a reason to doubt: it may be wrong, out of date, or costly to keep. \`rule\` is that rule in one sentence and \`why\` the reason in one sentence, with the citation of the line that follows it. A rule you merely dislike is not a reason; say what you saw. None is a valid answer, and the usual one.
10. \`status\`: \`found\` (you state a general rule), \`absent\` (the project has this area but no rule holds across it: then \`unprotected\` says what is at risk), \`not-present\` (the project has no such area: return empty lists).

List in \`notChecked\` the paths you could not open.

${READ}`;

const ASK = (what, lines, notes, generals) => `An interview with the owner of a project follows this research. Its centre is what no file says. For each question below, draft what the question can lean on: what research already found, so the owner corrects a guess rather than starts from nothing.

The project: ${what}

What research found (lines by summary heading; notes from the docs; the general rule of each area):
${JSON.stringify({ lines, notes, generals })}

For each of these ids return one entry:
${Object.entries(QUESTIONS).map(([id, q]) => `- \`${id}\`: ${q}.`).join("\n")}

\`lead\`: one sentence saying what research found that bears on this question, naming its source ("the README says…", "the history shows…"), or "Research found nothing on this." when that is so.
\`options\`: 2 or 3 answers the owner might give, each a real candidate taken from what research found, never a filler. \`label\`: at most 60 characters. \`description\`: one sentence on why research suggests it. Add \`file\`, \`line\` and \`quote\` when the option rests on one line of a file. If research found nothing for a question, return no options for it: a guess with no ground is worse than an open question.

You may open the files named in the findings to check a line. Do not search the code again.

${READ}`;

const root = args.root;
const at = (p) => `Project root: ${root}\n\n${p}`;

phase("Profile");
const profile = await agent(at(PROFILE), { agentType: "mechanism", model: "sonnet", schema: PROFILE_SCHEMA, label: "profile", phase: "Profile" });
if (!profile) return { version: 3, profile: null, sum: sum(JSON.stringify({ version: 3, profile: null })) };

const universal = Object.keys(AREAS).map((k) => ({ key: k, gloss: AREAS[k], hint: (profile.areas || []).find((a) => a.key === k) || { present: "unsure", why: "", where: [], patterns: [] } }));
const own = (profile.projectAreas || []).slice(0, 4).filter((a) => a.key && !AREAS[a.key]).map((a) => ({ key: a.key, gloss: `${a.name}: ${a.covers}`, hint: a }));
const areaList = [...universal, ...own];
const keys = areaList.map((a) => a.key);

// Docs go to at most 6 readers, about 1,500 lines each, a long file in pieces; what does not fit is reported, never dropped in silence.
const chunks = [];
const docsLeftOut = [];
for (const d of profile.docs || []) {
  for (let from = 1; from <= Math.max(1, d.lines); from += 1500) {
    const to = Math.min(d.lines, from + 1499);
    const piece = d.lines > 1500 ? `${d.file} (lines ${from} to ${to})` : d.file;
    const last = chunks[chunks.length - 1];
    if (last && last.lines + (to - from + 1) <= 1500) { last.files.push(piece); last.lines += to - from + 1; }
    else if (chunks.length < 6) chunks.push({ files: [piece], lines: to - from + 1 });
    else docsLeftOut.push(piece);
  }
}

phase("Topics and written rules");
const [t, w, checked] = await Promise.all([
  parallel(TOPICS.map((p, i) => () => agent(at(`Topic ${i + 1}.\n${p}\n\n${RULES}\n${READ}`), { agentType: "explore", schema: TOPIC_SCHEMA, label: `t${i + 1}`, phase: "Topics and written rules" }))),
  parallel(chunks.map((c, i) => () => agent(at(WRITTEN(c.files, keys)), { agentType: "mechanism", model: "sonnet", schema: WRITTEN_SCHEMA, label: `docs${i + 1}`, phase: "Topics and written rules" }))),
  agent(at(CHECKS(keys)), { agentType: "mechanism", model: "sonnet", schema: WRITTEN_SCHEMA, label: "checks", phase: "Topics and written rules" }),
]);
const topics = {};
t.forEach((r, i) => { topics[`t${i + 1}`] = r; });
const written = { rules: [], notes: [], notRead: [], docsLeftOut, readers: chunks.map((c) => c.files) };
// What a check enforces comes first: it is the stronger evidence.
if (checked) { written.rules.push(...checked.rules.map((r) => ({ ...r, from: "check" }))); written.notRead.push(...checked.notRead); }
else written.notRead.push("the project's own checks (the agent returned nothing)");
w.forEach((r, i) => {
  if (!r) { written.notRead.push(...chunks[i].files); return; }
  written.rules.push(...r.rules.map((x) => ({ ...x, from: "docs" }))); written.notes.push(...r.notes); written.notRead.push(...r.notRead);
});

phase("Areas and mechanisms");
const run = areaList.filter((a) => a.hint.present !== "no");
// A kind the scan found nothing on is not asked about (zeroHits is what adapt-gates checks against scan.json); the area agents cover it.
const zero = args.zeroHits || [];
const kindRun = KINDS.filter((k) => !zero.includes(k));
const res = await parallel([
  ...run.map((a) => () => {
    const mine = written.rules.filter((r) => r.area === a.key);
    return agent(at(AREA(a.key, a.gloss, a.hint, mine.slice(0, 15), Math.max(0, mine.length - 15))), { agentType: "mechanism", model: "sonnet", schema: AREA_SCHEMA, label: `a:${a.key}`, phase: "Areas and mechanisms" });
  }),
  ...kindRun.map((k) => () => agent(at(KIND_PROMPT(k)), { agentType: "mechanism", model: "sonnet", schema: KIND_SCHEMA, label: `k:${k}`, phase: "Areas and mechanisms" })),
]);
const areas = {};
for (const a of areaList) areas[a.key] = a.hint.present === "no" ? { area: a.key, status: "not-present", support: [], exceptions: [], contradicted: [], unprotected: [], commentRules: [], doubted: [], details: [], notChecked: [] } : null;
run.forEach((a, i) => { areas[a.key] = res[i]; });
const found = {};
kindRun.forEach((k, i) => { found[k] = res[run.length + i]; });
const kinds = {};
for (const k of KINDS) kinds[k] = zero.includes(k) ? { kind: k, status: "not-present", verdicts: [], rules: [], notChecked: [] } : found[k];

phase("Questions");
const lines = [];
for (const k of Object.keys(topics)) for (const l of (topics[k] && topics[k].lines) || []) if (["2", "3", "4", "5", "written"].includes(l.heading)) lines.push({ heading: l.heading, text: l.text });
const generals = keys.filter((k) => areas[k] && areas[k].general).map((k) => ({ area: k, rule: areas[k].general.rule, cost: areas[k].general.cost }));
const asked = await agent(at(ASK(profile.what, lines, written.notes, generals)), { agentType: "mechanism", model: "sonnet", schema: QUESTION_SCHEMA, label: "questions", phase: "Questions" });
const questions = (asked && asked.questions) || null;

// Last: it reads the areas' rules and nothing else. Id of a rule: the area key for its general rule, key#2 for its second.
phase("Plain");
const ruled = [];
for (const k of keys) {
  if (areas[k] && areas[k].general) ruled.push({ id: k, rule: areas[k].general.rule });
  if (areas[k] && areas[k].second) ruled.push({ id: k + "#2", rule: areas[k].second.rule });
}
const plain = await agent(at(PLAIN(args.language || "English", ruled)), { agentType: "mechanism", model: "sonnet", schema: PLAIN_SCHEMA, label: "plain", phase: "Plain" });

// The result carries how many rules were read, not their text: the area agents already used them, and the main session copies this result by hand.
const out = { version: 3, profile, areaOrder: keys, topics, written: { count: written.rules.length, fromChecks: written.rules.filter((r) => r.from === "check").length, notes: written.notes, notRead: written.notRead, docsLeftOut, readers: written.readers }, areas, kinds, plain, questions };
return { ...out, sum: sum(JSON.stringify(out)) };
