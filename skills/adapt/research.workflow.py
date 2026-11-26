# Fixed research for /adapt (Antigravity run_workflow).
# The frame is this fixed script; the judgment is the agents'. research.mjs holds the same `sum`.
import json

AREAS = {
    "truth": "sources of truth, units and precision: which stored value, record or setting is the authority others are worked out from; units, time zones, rounding",
    "state": "how state changes: who may write it and through which path, in what unit of work, and what happens when the same change arrives twice or half of it fails",
    "access": "who may do or see what: sign-in, permissions, secrets and credentials, personal data",
    "boundary": "the edge of the system: checks on outside input, calls to outside services, and what the code does when they fail or lie",
    "compat": "what must not break for those who depend on it: public interfaces, file and data formats, schemas, protocols, stored history",
    "order": "time and order: concurrency, scheduling, the order of events, and whether the same input always gives the same result",
    "limits": "operating limits and failure: resource and rate limits, safety stops, budgets, what the system does when something goes wrong",
}

CITE = {"file": {"type": "string"}, "line": {"type": "integer"}, "quote": {"type": "string"}}


def cited(extra, required):
    return {"type": "object", "properties": {**extra, **CITE}, "required": [*required, "file", "line", "quote"]}


AREA_HINT = {
    "where": {"type": "array", "items": {"type": "string"}},
    "patterns": {"type": "array", "maxItems": 6, "items": {"type": "string"}},
}

PROFILE_SCHEMA = {
    "type": "object",
    "properties": {
        "what": {"type": "string"},
        "languages": {"type": "array", "items": {"type": "string"}},
        "docs": {
            "type": "array",
            "maxItems": 40,
            "items": {
                "type": "object",
                "properties": {"file": {"type": "string"}, "lines": {"type": "integer"}},
                "required": ["file", "lines"],
            },
        },
        "areas": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "key": {"type": "string", "enum": list(AREAS.keys())},
                    "present": {"type": "string", "enum": ["yes", "no", "unsure"]},
                    "why": {"type": "string"},
                    **AREA_HINT,
                },
                "required": ["key", "present", "why", "where", "patterns"],
            },
        },
        "projectAreas": {
            "type": "array",
            "maxItems": 4,
            "items": {
                "type": "object",
                "properties": {
                    "key": {"type": "string"},
                    "name": {"type": "string"},
                    "covers": {"type": "string"},
                    "why": {"type": "string"},
                    **AREA_HINT,
                },
                "required": ["key", "name", "covers", "why", "where", "patterns"],
            },
        },
    },
    "required": ["what", "languages", "docs", "areas", "projectAreas"],
}

TOPIC_SCHEMA = {
    "type": "object",
    "properties": {
        "lines": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "heading": {"type": "string", "enum": ["1", "2", "3", "4", "5", "6", "7", "8", "config", "written"]},
                    "text": {"type": "string"},
                    "tag": {"type": "string", "enum": ["code", "git"]},
                    "key": {"type": "string"},
                },
                "required": ["heading", "text", "tag"],
            },
        },
    },
    "required": ["lines"],
}

WRITTEN_SCHEMA = {
    "type": "object",
    "properties": {
        "rules": {"type": "array", "maxItems": 25, "items": cited({"text": {"type": "string"}, "area": {"type": "string"}}, ["text", "area"])},
        "notes": {
            "type": "array",
            "maxItems": 12,
            "items": cited({"kind": {"type": "string", "enum": ["goal", "refusal", "incident", "provisional", "business"]}, "text": {"type": "string"}}, ["kind", "text"]),
        },
        "notRead": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["rules", "notes", "notRead"],
}

AREA_SCHEMA = {
    "type": "object",
    "properties": {
        "area": {"type": "string"},
        "status": {"type": "string", "enum": ["found", "absent", "not-present"]},
        "general": cited(
            {
                "rule": {"type": "string"},
                "short": {"type": "string"},
                "basis": {"type": "string", "enum": ["code", "both"]},
                "risk": {"type": "string", "enum": ["high", "medium", "low"]},
                "cost": {"type": "string"},
            },
            ["rule", "short", "basis", "risk", "cost"],
        ),
        "second": cited({"rule": {"type": "string"}, "risk": {"type": "string", "enum": ["high", "medium", "low"]}, "cost": {"type": "string"}}, ["rule", "risk", "cost"]),
        "ideas": {"type": "array", "maxItems": 4, "items": cited({"text": {"type": "string"}}, ["text"])},
        "support": {"type": "array", "maxItems": 3, "items": cited({}, [])},
        "exceptions": {"type": "array", "maxItems": 3, "items": cited({"how": {"type": "string"}}, ["how"])},
        "contradicted": {
            "type": "array",
            "maxItems": 3,
            "items": cited(
                {"written": {"type": "string"}, "wfile": {"type": "string"}, "wline": {"type": "integer"}, "wquote": {"type": "string"}, "how": {"type": "string"}},
                ["written", "wfile", "wline", "wquote", "how"],
            ),
        },
        "unprotected": {"type": "array", "maxItems": 2, "items": cited({"risk": {"type": "string"}}, ["risk"])},
        "commentRules": {"type": "array", "maxItems": 5, "items": cited({"text": {"type": "string"}}, ["text"])},
        "doubted": {"type": "array", "maxItems": 1, "items": cited({"rule": {"type": "string"}, "why": {"type": "string"}}, ["rule", "why"])},
        "details": {"type": "array", "maxItems": 3, "items": cited({"rule": {"type": "string"}}, ["rule"])},
        "notChecked": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["area", "status", "ideas", "support", "exceptions", "contradicted", "unprotected", "commentRules", "doubted", "details", "notChecked"],
}

QUESTIONS = {
    "B-rules": "a business rule the code must respect that no file states",
    "B-refused": "what the project does not do, on purpose",
    "B-mistake": "the mistake that would cost the most",
    "B-incident": "one real time something went wrong here",
    "B-free": "what an agent may change or delete without asking",
    "G-3m": "where the project should be in about 3 months",
    "G-12m": "where it should be in about 12 months",
    "G-36m": "where it should be in about 36 months",
    "G-interim": "given those goals, which part of today's code is provisional",
}

QUESTION_SCHEMA = {
    "type": "object",
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string", "enum": list(QUESTIONS.keys())},
                    "lead": {"type": "string"},
                    "options": {
                        "type": "array",
                        "maxItems": 3,
                        "items": {
                            "type": "object",
                            "properties": {
                                "label": {"type": "string"},
                                "description": {"type": "string"},
                                "file": {"type": "string"},
                                "line": {"type": "integer"},
                                "quote": {"type": "string"},
                            },
                            "required": ["label", "description"],
                        },
                    },
                },
                "required": ["id", "lead", "options"],
            },
        },
    },
    "required": ["questions"],
}

KINDS = ["values", "snap", "srvw", "delta", "idem", "txn", "access", "batch", "domain", "compat", "conc", "input"]

KIND_SCHEMA = {
    "type": "object",
    "properties": {
        "kind": {"type": "string"},
        "status": {"type": "string", "enum": ["found", "absent", "not-present"]},
        "verdicts": {
            "type": "array",
            "maxItems": 15,
            "items": {
                "type": "object",
                "properties": {"id": {"type": "string"}, "verdict": {"type": "string", "enum": ["enforced", "contradicted", "no-evidence"]}, **CITE},
                "required": ["id", "verdict"],
            },
        },
        "general": {
            "type": "object",
            "properties": {
                "rule": {"type": "string"},
                "short": {"type": "string"},
                "basis": {"type": "string", "enum": ["written", "code", "both"]},
                "risk": {"type": "string", "enum": ["high", "medium", "low"]},
                "cost": {"type": "string"},
                **CITE,
            },
            "required": ["rule", "short", "basis", "risk", "cost", "file", "line", "quote"],
        },
        "rules": {
            "type": "array",
            "maxItems": 3,
            "items": {"type": "object", "properties": {"rule": {"type": "string"}, **CITE}, "required": ["rule", "file", "line", "quote"]},
        },
        "notChecked": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["kind", "status", "verdicts", "rules", "notChecked"],
}

GLOSS = {
    "values": "money, time, units, rounding",
    "snap": "values frozen at write",
    "srvw": "writes through server functions",
    "delta": "changes as deltas",
    "idem": "retried or offline writes",
    "txn": "multi-row actions",
    "access": "database or server access control",
    "batch": "work over many rows",
    "domain": "legal, tax or domain rules",
    "compat": "public API, file formats, schemas",
    "conc": "locks, queues, order",
    "input": "validation of outside input",
}

WORDS = "Say the thing protected and the constraint in the words of the business (what the people who use the product call the thing), never a code name: no name of a function, table, column, constant or file; those belong in the detail."


def kind_prompt(kind):
    return (
        f"Mechanism kind `{kind}` ({GLOSS[kind]}). The rules are about the application, never about its tests: do not use or cite test files (folders `test`, `tests`, `__tests__`, `spec`, `e2e`; files `*.test.*`, `*.spec.*`, `test_*.py`, `*_test.*`, `conftest.py`), and never state a rule about how tests are written or run. Work in this order.\n\n"
        f"1. Written rules. Read `.xworkflows/rules.json` (`{{ rules: [{{ id, text, file, line, kinds }}] }}`) and take the first 15 rules, in rules.json order (lowest W id first), whose `kinds` includes `{kind}` (at most 15; leave the rest). These are what the project says it does; check each against the code. A rule whose `file` is code (not a doc) is a comment about the code right below it: read that file from the rule's `line` on, and if the next lines do what it says, the verdict is `enforced` with one of those lines cited.\n"
        f"2. The code. Read `.xworkflows/scan.json`: the `kinds.{kind}.hits` and the `sql` entries. Open the cited files and the files the written rules name. Search beyond the hits with `graphify query` and `grep`.\n"
        "3. verdicts: one per written rule from step 1, with its `id`:\n"
        "   - `enforced`: the code does what the rule says. Cite the code line that does it.\n"
        "   - `contradicted`: the code does otherwise. Cite the code line that breaks it.\n"
        "   - `no-evidence`: you found neither, or the rule is not about this mechanism. No citation.\n"
        "4. general: the kind's ONE project-level rule. Take the first case that applies:\n"
        "   (a) One or more written rules are `enforced`: the general rule is the broadest enforced one (the one that covers the most places in the code); on a tie, the one with the lowest W id. `basis` `both`. Anchor it on the pattern applied across files; cite one line where it is applied.\n"
        "   (b) None is enforced, but the code follows one consistent pattern for this kind across files: state that pattern. `basis` `code`. Anchor it on the pattern applied across files; cite one line where it is applied.\n"
        "   (c) Otherwise: no general rule, status `absent`.\n"
        "   A `contradicted` written rule never becomes the general rule.\n"
        f'   State the rule at project level, in your own words if needed: one sentence, how every change of this kind must behave across the project. It must not name a function, file, table or column. For example: "Every label a user sees comes from the translation files." `short`: the same claim as `rule` in one plain sentence of 14 words at most, never wider than the rule. {WORDS} It has no "all", "always", "never" or "every" unless one cited place enforces it for every case. `risk`: high, medium or low, how costly a change that breaks the rule is; `cost`: one short clause, what breaks, and for whom, when a change breaks it.\n'
        "5. rules: at most 3 details, each narrower than the general rule and not repeating it, worded as how the code must do something, with file, line and `quote`.\n"
        "6. status: `found` (case a or b: you state a general rule), `absent` (case c: the area for this kind exists, no general rule), `not-present` (the project has no such area). Give verdicts whatever the status.\n\n"
        "Every citation is `file`, `line` and `quote`: text copied exactly from that line of that file (it is checked; an unmatched citation is dropped and an `enforced` or `contradicted` verdict without one counts as `no-evidence`). List in notChecked the paths you could not open.\n\n"
        "How to read:\n"
        "- Ask `graphify query` before opening files. Verify each path still exists.\n"
        "- Read history as commit messages and file stats only (`git log --oneline`, `--stat`, `--name-only`). Never read past versions of files or content diffs: no `git show <sha>:<path>`, no `git log -p`; `git diff` and `git stash show` only with `--stat` or `--name-only`."
    )


PLAIN_SCHEMA = {
    "type": "object",
    "properties": {
        "claims": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"text": {"type": "string"}, "from": {"type": "array", "items": {"type": "string"}}},
                "required": ["text", "from"],
            },
        },
    },
    "required": ["claims"],
}


def compact_json(obj):
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False)


def plain_prompt(language, items):
    return (
        f"You merge and translate the items below into short plain sentences for the owner of the project, who is not a programmer. Write in {language}.\n\n"
        "The items, of two kinds and nothing else. A general rule has a short `rule`: an area's has an id that is an area key and its `risk`; a mechanism kind's has the id `kind:<kind>` and its `risk`. An idea has the id <area key>.<n>. Each was proven by its own line of code; you do not see the line:\n"
        f"{compact_json(items)}\n\n"
        'Return sentences that each say ONE item the owner can answer "yes" or "no" to.\n'
        "- 14 words at most. Everyday words, no jargon. One subject, active voice.\n"
        f"- {WORDS} A specific business word is never replaced by a vaguer one.\n"
        "- `from`: the ids of the items the sentence comes from, at least one. Use only ids from the list.\n"
        "- Merge items that say the same thing into one sentence naming all their ids. An idea that only repeats its own area's general rule is merged into that rule's sentence. Merge a kind's rule with an area's rule only when they say the same thing. Never split an item into several sentences, each would borrow a line that proves only the whole.\n"
        '- A sentence says what its items say, no more: never widen an item to more cases, more places or more strength than it states (no "all", "always" or "never" the item did not have), and never add a reason it does not give. A short sentence that says more than its item is worse than a long one that does not. For example, from the idea "A loan period is counted in whole days" write "A loan lasts whole days.", never "Nothing is ever counted in hours."\n'
        "- Return every sentence in `claims`, in no order: the script orders them and picks the first page, so do not count, rank or choose.\n"
        "- Leave out an item you cannot say in 14 words without widening it."
    )


# Same function as research.mjs `sum` (iterates UTF-16 code units identically to JS charCodeAt).
def checksum(s):
    h = 5381
    data = s.encode("utf-16-le")
    for i in range(0, len(data), 2):
        code = data[i] | (data[i + 1] << 8)
        h = ((h * 33) ^ code) & 0xFFFFFFFF
    return format(h, "x")


READ = (
    "How to read:\n"
    "- Ask `graphify query` before opening files. Verify each path still exists.\n"
    "- Read history as commit messages and file stats only (`git log --oneline`, `--stat`, `--name-only`). Never read past versions of files or content diffs: no `git show <sha>:<path>`, no `git log -p`; `git diff` and `git stash show` only with `--stat` or `--name-only`.\n"
    "- The project may be written and documented in any language. Read it as it is; answer in English.\n"
    "- Every citation is `file` (relative to the project root), `line` and `quote`: text copied exactly from that line of that file. A script checks each one; an unmatched citation is dropped with what it supported."
)

PROFILE = (
    "You profile a repository you have never seen, so that the agents after you know where to look. You judge; a script checks your citations later.\n\n"
    "Read: the README files, the build and dependency files, `graphify-out/GRAPH_REPORT.md`, and `.xworkflows/scan.json` (use only its `layout` and `zones`, folder sizes, and its `checks`, the project's own check scripts and linter settings). Skim what those checks and the CI steps look for: what a project already checks about itself is the best sign of what it holds as rules.\n\n"
    "Return:\n"
    "- `what`: what the project is and does, three sentences at most.\n"
    "- `languages`: the programming languages that hold the logic, most code first.\n"
    "- `docs`: the files where this project wrote down how it must work or be changed, the most important first, each with its line count (`wc -l`): README files, design notes, decision records, contributing guides, plans, runbooks, in any folder and any language. Not generated files, not API listings, not changelogs. At most 40.\n"
    "- `areas`: one entry for EACH of these seven areas, saying whether this project has it:\n"
    + "\n".join(f"  - `{k}`: {v}." for k, v in AREAS.items())
    + "\n"
    "  `present`: `yes`, `no` or `unsure`. `why`: one sentence naming what in this project makes it so. `where`: the folders or files where it lives (at most 6). `patterns`: up to 6 search patterns for `git grep -nE` that find where this area is handled IN THIS STACK: names of the libraries, functions, keywords, decorators, types or file names this code really uses. Look at the code before you choose them; a pattern that matches nothing is useless, and so is one that matches every file.\n"
    "- `projectAreas`: up to 4 areas that matter in THIS project and that the seven do not cover: for example the rules of its trade, the validity of its numbers, the hardware it drives, the law it must follow. Only what the code, the docs or the project's own checks show; none is a valid answer, and so is four. A project area never restates one of the seven. `key`: a short lower-case word. `covers`: what belongs in it. `why`: what a mistake there costs. `where` and `patterns` as above.\n\n"
    + READ
)

RULES = (
    "Rules:\n"
    "- Answer in 10 lines or fewer.\n"
    "- Return your answer through the schema: each line has a heading, text, and tag `code` (read from the code) or `git` (read from history). Leave a line out rather than guess wildly.\n"
    "- Put each line under the summary heading it belongs to, whatever your topic. `heading` is one of the strings '1' to '8', 'config' or 'written':\n"
    "  '1' what the project is; '2' who it is for, what it gives them, what it does not do; '3' aspirations at about 3, 12 and 36 months; '4' risks, the costliest mistake first; '5' what must not change and what is free to change; '6' zones and which paths are risk paths; '7' how the owner works; '8' about the owner. Use 'config' and 'written' only where your topic asks for them."
)

TOPIC6 = (
    "Next steps already written down, searched in this order:\n"
    "1. Pending list (`paths.pending`, default `docs/PENDING.md`): cards \"in progress\", then \"scheduled\".\n"
    "2. Work in progress in git: uncommitted changes, skipping paths under `.xworkflows/`, `graphify-out/` and the files listed in `.xworkflows/installed.json` (`files` keys, `created`); local branches not merged into `mainBranch` with a commit in the last 30 days.\n"
    "3. Plans in `paths.plans` with unchecked boxes (`- [ ]`), newest first.\n"
    "4. The other pending cards, in file order.\n"
    "5. `TODO.md`, `TODO`, `ROADMAP.md`, `NEXT.md` at the root or in `docs/`; README sections titled roadmap, todo, next or planned, in any language.\n"
    "6. Open GitHub issues with `gh issue list`, only when `gh` is installed and authenticated and the repo has a GitHub remote. Otherwise print one line and skip this source.\n"
    "7. `TODO` and `FIXME` comments (`git grep -nE '\\b(TODO|FIXME)\\b'`): the count, and at most 5, from the files changed most.\n"
    'Return one line per item under heading "written": what, source, path.'
)


def cfg_hint(keys):
    joined = ", ".join(f"`{k}`" for k in keys)
    return f' Also return one line per key with heading "config" and `key` set: {joined}. A guess goes in `text`; a value empty on purpose is written as `[]`.'


TOPICS = [
    "Stack, build files, linters." + cfg_hint(["checks.project", "checks.patterns", "checks.ratchets"]) + " checks.project = the project's own check commands; checks.patterns = pattern checks; checks.ratchets = counts that must not grow.",
    "Layout: top folders, size in bytes per folder (`git ls-files` with `wc -c`), what each holds. Leave out generated and vendored code. Do not propose zones: they come from the scan." + cfg_hint(["paths.code", "paths.risk", "paths.heavyRead", "paths.codeAnyway"]) + " paths.code = code folders; paths.risk = risk paths; paths.heavyRead = big or generated paths not to read whole; paths.codeAnyway = paths that look like non-code but are code.",
    "Tests: file patterns, run command, folders that need a service such as a database." + cfg_hint(["tests.files", "tests.run", "tests.notRunnable"]) + " tests.files = test file globs; tests.run = the test command; tests.notRunnable = test folders that need a service.",
    "What the system holds and moves that has value, and where: stored data, outside services it calls, credentials, and anything it acts on in the world (payments, orders, messages, devices).",
    "History of the last 12 months: files changed most, reverts, fix commits.",
    TOPIC6,
]


def written_prompt(files, keys):
    flist = "\n".join(f"- {f}" for f in files)
    klist = ", ".join(f"`{k}`" for k in keys)
    return (
        "You read what a project wrote down about itself and pick out its rules. Read each of these in full, every line of the range given, in this order:\n"
        f"{flist}\n\n"
        '`rules`: every sentence or bullet that states a rule: how the system must behave, or how it must be changed. It may be in any language and need not use a word like "must": a decision record that says what was chosen and why is a rule, and so is a stated limit, a named source of truth, or a thing that is never done. These are NOT rules: a description of what a folder holds, a step of a how-to, a result that was measured, a plan for later. Keep a rule only once. At most 25, the ones a careless change would break first.\n'
        f"For each: `text`, the rule in one plain English sentence, faithful to the source; its citation; and `area`, the one key it belongs to: {klist}, or `none`.\n\n"
        "`notes`: what a later interview with the owner will lean on, each with its citation, at most 12:\n"
        "- `goal`: where the project wants to be, or work that is planned.\n"
        "- `refusal`: what the project says it does not do.\n"
        "- `incident`: something that went wrong and what it cost.\n"
        "- `provisional`: something the docs call temporary, a stopgap, or due to be replaced.\n"
        "- `business`: who the project is for and what they get from it.\n\n"
        "`notRead`: what you could not read in full, with the lines you skipped.\n\n"
        + READ
    )


def checks_prompt(keys):
    klist = ", ".join(f"`{k}`" for k in keys)
    return (
        "You read what a project already checks about itself, and say which rule each check enforces. A rule that a script, a linter setting or a pipeline step enforces is one the project really holds.\n\n"
        "Read `.xworkflows/scan.json`, key `checks`: the project's check scripts and linter settings. Add what you find yourself: the pipeline files (CI workflows), git hooks kept in the repository, pre-commit settings, and the script a push or a merge must pass. Open each one; a long script is read function by function.\n\n"
        f'`rules`: one entry per rule a check enforces, the costliest to break first, at most 25. `text`: the rule in one plain English sentence, as what the code must or must never do (not "the script checks X" but "X must hold"). Cite the line of the check that enforces it. `area`: the one key it belongs to: {klist}, or `none`. Leave out checks of style, formatting and naming.\n'
        "`notes`: return an empty list. `notRead`: the check files you could not read in full.\n\n"
        + READ
    )


def area_prompt(key, gloss, hint, written_rules, left):
    where = ", ".join(hint.get("where") or []) or "(no path given)"
    patterns = "  ".join(f"`{p}`" for p in (hint.get("patterns") or [])) or "(none)"
    extra = f"{left} more were left out of this list" if left else "all of them"
    wjson = compact_json(written_rules) if written_rules else "(none found)"
    return (
        f"Area `{key}`: {gloss}.\n\n"
        f"What the profile of this project says about this area: {hint.get('why') or hint.get('covers') or ''}\n"
        f"Where to start: {where}\n"
        f"Search patterns chosen for this stack, for `git grep -nE`: {patterns}\n\n"
        f"Rules the project wrote down for this area, or enforces by its own checks (`from` says which; {extra}):\n"
        f"{wjson}\n\n"
        "The rules are about the system, never about its tests: do not cite test files, and state no rule about how tests are written or run. Work in this order.\n\n"
        "1. Find how the code handles this area. Run the patterns, open the files they point at, and search beyond them with `graphify query` and `grep`. Read the comments and docstrings around what you find: rules live there too.\n"
        f'2. `general`: the area\'s ONE project-level rule. First list for yourself the candidates (the written and checked rules above, and the patterns you saw in the code); the general rule is the one whose breaking would cost the most and that the most code depends on. It is a pattern the code follows in more than one place, or a written rule the code really follows. State it as how every change in this area must behave, in one sentence, at the level where it is true: if it holds for every such value in the project, do not state it for one function. It names no function, file, table or column. For example, in a system that lends books: "A loan period is always counted in whole days in the library\'s own time zone." Before you settle on it, look for the case that contradicts it: the same operation done without the guard (use `graphify query` and a search for the operation\'s other call sites). When you find one, either narrow the rule to where it holds, or keep the rule and return that case under `exceptions` with its citation and how it differs. Cite one line where it is applied. `short`: the same claim as `rule` in one plain sentence of 14 words at most, never wider than the rule. {WORDS} A specific business word is never replaced by a vaguer one: "a loan is counted in whole days in the library\'s own time zone", not "dates are handled with care". It has no "all", "always", "never" or "every" unless one cited place enforces it for every case. `basis`: `both` when the docs say it and the code does it, `code` when only the code shows it. A rule that only the docs state, with no code behind it, is not the general rule. `risk`: how bad a mistake here is, `high`, `medium` or `low`; `cost`: what such a mistake costs, in a few words.\n'
        '   `ideas`: up to 4 things this code does in this area, each one sentence of 14 words at most, in plain words, with the citation of the line that proves it. An idea says no more than its cited line and the few lines around it show. One idea is one thing the code does: never split one rule into several ideas that share its citation. An idea about every case ("all", "always", "never" or "every") must cite the one place that enforces it for all cases (a check, a constraint, a single entry point); when there is no such place, the idea says where it holds, or is left out.\n'
        "   `second`, optional: ONE more project-level rule of this area, in the same form with its own citation, only when the area holds a second rule that is independent of the general one (breaking one does not break the other) and about as costly to break. Most areas have none; never split one rule in two to fill it.\n"
        "3. `support`: up to 3 more citations, in other files, where the same pattern is applied. A rule seen in one place only is weak: say so by giving none.\n"
        "4. `exceptions`: places that handle the same thing differently from the general rule, each with its citation and `how` it differs. Look for them on purpose: the second-most-common way of doing the same thing, an older module, a quick fix. An exception the code itself explains (a comment says why this place differs) is already decided: leave it out. None is a valid answer, and the usual one.\n"
        "5. `contradicted`: a rule from the written list above that the code breaks. `written` is the rule's text; `wfile`, `wline` and `wquote` cite the doc; `file`, `line` and `quote` cite the code line that breaks it; `how` says the difference.\n"
        "6. `unprotected`: a place where a mistake in this area would lose money, data or safety and where you looked for a check, a constraint or a test and found none. `risk` says what could happen. Cite the place. Do not list what is merely unusual or could be tidier. None is a valid answer, and the usual one.\n"
        "7. `commentRules`: up to 5 rules you found written in code comments or docstrings (any language), each as one plain English sentence with its citation.\n"
        "8. `details`: up to 3 narrower rules, each with its citation, that do not repeat the general rule.\n"
        "9. `doubted`: at most ONE rule the code follows in this area that you have a reason to doubt: it may be wrong, out of date, or costly to keep. `rule` is that rule in one sentence and `why` the reason in one sentence, with the citation of the line that follows it. A rule you merely dislike is not a reason; say what you saw. None is a valid answer, and the usual one.\n"
        "10. `status`: `found` (you state a general rule), `absent` (the project has this area but no rule holds across it: then `unprotected` says what is at risk), `not-present` (the project has no such area: return empty lists).\n\n"
        "List in `notChecked` the paths you could not open.\n\n"
        + READ
    )


def ask_prompt(what, lines, notes, generals):
    qlist = "\n".join(f"- `{qid}`: {q}." for qid, q in QUESTIONS.items())
    return (
        "An interview with the owner of a project follows this research. Its centre is what no file says. For each question below, draft what the question can lean on: what research already found, so the owner corrects a guess rather than starts from nothing.\n\n"
        f"The project: {what}\n\n"
        "What research found (lines by summary heading; notes from the docs; the general rule of each area):\n"
        f"{compact_json({'lines': lines, 'notes': notes, 'generals': generals})}\n\n"
        "For each of these ids return one entry:\n"
        f"{qlist}\n\n"
        '`lead`: one sentence saying what research found that bears on this question, naming its source ("the README says…", "the history shows…"), or "Research found nothing on this." when that is so.\n'
        "`options`: 2 or 3 answers the owner might give, each a real candidate taken from what research found, never a filler. `label`: at most 60 characters. `description`: one sentence on why research suggests it. Add `file`, `line` and `quote` when the option rests on one line of a file. If research found nothing for a question, return no options for it: a guess with no ground is worse than an open question.\n\n"
        "You may open the files named in the findings to check a line. Do not search the code again.\n\n"
        + READ
    )


async def safe_agent(prompt, schema, role, type_name, model=None):
    try:
        kwargs = {"prompt": prompt, "schema": schema, "role": role, "type_name": type_name}
        if model is not None:
            kwargs["model"] = model
        return await agent(**kwargs)
    except Exception:
        return None


root = args.get("root", ".")
agents_map = args.get("agents") or {}
models_map = args.get("models") or {}
medium_model = models_map.get("medium") or "inherit"
cheap_model = models_map.get("cheap") or "flash"
CRITICAL_AREAS = {"truth", "state", "access"}


def at(p):
    return f"Project root: {root}\n\n{p}"


def name(n):
    return agents_map.get(n) or n


phase("Profile")
profile = await safe_agent(at(PROFILE), PROFILE_SCHEMA, "profile", name("mechanism"), medium_model)
if not profile:
    empty = {"version": 3, "profile": None}
    print(compact_json({**empty, "sum": checksum(compact_json(empty))}))
else:
    profile_areas = profile.get("areas") or []
    universal = [
        {
            "key": k,
            "gloss": AREAS[k],
            "hint": next((a for a in profile_areas if a.get("key") == k), {"present": "unsure", "why": "", "where": [], "patterns": []}),
        }
        for k in AREAS
    ]
    own = [
        {"key": a["key"], "gloss": f"{a['name']}: {a['covers']}", "hint": a}
        for a in (profile.get("projectAreas") or [])[:4]
        if a.get("key") and a["key"] not in AREAS
    ]
    area_list = [*universal, *own]
    keys = [a["key"] for a in area_list]

    chunks = []
    docs_left_out = []
    for d in profile.get("docs") or []:
        total_lines = max(1, int(d.get("lines") or 1))
        for start in range(1, total_lines + 1, 1500):
            end = min(total_lines, start + 1499)
            piece = f"{d['file']} (lines {start} to {end})" if total_lines > 1500 else d["file"]
            span = end - start + 1
            if chunks and chunks[-1]["lines"] + span <= 1500:
                chunks[-1]["files"].append(piece)
                chunks[-1]["lines"] += span
            elif len(chunks) < 6:
                chunks.append({"files": [piece], "lines": span})
            else:
                docs_left_out.append(piece)

    phase("Topics and written rules")
    stage2_jobs = [
        *[{"kind": "topic", "i": i, "p": p} for i, p in enumerate(TOPICS)],
        *[{"kind": "doc", "i": i, "c": c} for i, c in enumerate(chunks)],
        {"kind": "checks"},
    ]

    def run_stage2(job):
        if job["kind"] == "topic":
            i = job["i"]
            return safe_agent(at(f"Topic {i + 1}.\n{job['p']}\n\n{RULES}\n{READ}"), TOPIC_SCHEMA, f"t{i + 1}", name("explore"))
        if job["kind"] == "doc":
            i = job["i"]
            return safe_agent(at(written_prompt(job["c"]["files"], keys)), WRITTEN_SCHEMA, f"docs{i + 1}", name("mechanism"), medium_model)
        return safe_agent(at(checks_prompt(keys)), WRITTEN_SCHEMA, "checks", name("mechanism"), medium_model)

    stage2_res = await parallel(stage2_jobs, run_stage2)
    t_res = stage2_res[: len(TOPICS)]
    w_res = stage2_res[len(TOPICS) : len(TOPICS) + len(chunks)]
    checked = stage2_res[-1]

    topics = {f"t{i + 1}": r for i, r in enumerate(t_res)}
    written_rules = []
    written_notes = []
    written_not_read = []
    if checked:
        written_rules.extend([{**r, "from": "check"} for r in checked.get("rules") or []])
        written_not_read.extend(checked.get("notRead") or [])
    else:
        written_not_read.append("the project's own checks (the agent returned nothing)")
    for i, r in enumerate(w_res):
        if not r:
            written_not_read.extend(chunks[i]["files"])
            continue
        written_rules.extend([{**x, "from": "docs"} for x in r.get("rules") or []])
        written_notes.extend(r.get("notes") or [])
        written_not_read.extend(r.get("notRead") or [])

    phase("Areas and mechanisms")
    run_areas = [a for a in area_list if a["hint"].get("present") != "no"]
    zero = args.get("zeroHits") or []
    kind_run = [k for k in KINDS if k not in zero]
    own_keys = {a["key"] for a in own}
    crit_areas = [a for a in run_areas if a["key"] in CRITICAL_AREAS or a["key"] in own_keys]
    sec_areas = [a for a in run_areas if a["key"] not in CRITICAL_AREAS and a["key"] not in own_keys]

    def run_area(a, model):
        mine = [r for r in written_rules if r.get("area") == a["key"]]
        return safe_agent(at(area_prompt(a["key"], a["gloss"], a["hint"], mine[:15], max(0, len(mine) - 15))), AREA_SCHEMA, f"a:{a['key']}", name("mechanism"), model)

    crit_res = await parallel(crit_areas, lambda a: run_area(a, medium_model)) if crit_areas else []
    sec_res = await parallel(sec_areas, lambda a: run_area(a, cheap_model)) if sec_areas else []
    kind_res = []
    for i in range(0, len(kind_run), 6):
        kind_res.extend(await parallel(kind_run[i : i + 6], lambda k: safe_agent(at(kind_prompt(k)), KIND_SCHEMA, f"k:{k}", name("mechanism"), cheap_model)))
    areas = {
        a["key"]: (
            {"area": a["key"], "status": "not-present", "support": [], "exceptions": [], "contradicted": [], "unprotected": [], "commentRules": [], "doubted": [], "details": [], "notChecked": []}
            if a["hint"].get("present") == "no"
            else None
        )
        for a in area_list
    }
    for a, r in zip(crit_areas, crit_res):
        areas[a["key"]] = r
    for a, r in zip(sec_areas, sec_res):
        areas[a["key"]] = r
    found_kinds = {k: r for k, r in zip(kind_run, kind_res)}
    kinds = {
        k: ({"kind": k, "status": "not-present", "verdicts": [], "rules": [], "notChecked": []} if k in zero else found_kinds.get(k))
        for k in KINDS
    }

    phase("Questions")
    lines = []
    for tk in topics:
        for l in (topics[tk] or {}).get("lines") or []:
            if l.get("heading") in ("2", "3", "4", "5", "written"):
                lines.append({"heading": l["heading"], "text": l["text"]})
    generals = [
        {"area": k, "rule": areas[k]["general"]["rule"], "cost": areas[k]["general"]["cost"]}
        for k in keys
        if areas.get(k) and areas[k].get("general")
    ]
    asked = await safe_agent(at(ask_prompt(profile.get("what", ""), lines, written_notes, generals)), QUESTION_SCHEMA, "questions", name("mechanism"), cheap_model)
    questions = asked.get("questions") if isinstance(asked, dict) else None

    phase("Plain")
    items = []
    for k in KINDS:
        g = kinds.get(k) and kinds[k].get("status") == "found" and kinds[k].get("general")
        if g:
            items.append({"id": f"kind:{k}", "rule": g["short"], "risk": g["risk"]})
    for k in keys:
        g = areas.get(k) and areas[k].get("general")
        if g:
            items.append({"id": k, "rule": g["short"], "risk": g["risk"]})
        for i, x in enumerate((areas.get(k) or {}).get("ideas") or []):
            items.append({"id": f"{k}.{i + 1}", "idea": x["text"]})
    language = args.get("language") or "English"
    plain = await safe_agent(at(plain_prompt(language, items)), PLAIN_SCHEMA, "plain", name("mechanism"), cheap_model)

    out = {
        "version": 3,
        "profile": profile,
        "areaOrder": keys,
        "topics": topics,
        "written": {
            "count": len(written_rules),
            "fromChecks": sum(1 for r in written_rules if r.get("from") == "check"),
            "notes": written_notes,
            "notRead": written_not_read,
            "docsLeftOut": docs_left_out,
            "readers": [c["files"] for c in chunks],
        },
        "areas": areas,
        "kinds": kinds,
        "plain": plain,
        "questions": questions,
    }
    print(compact_json({**out, "sum": checksum(compact_json(out))}))
