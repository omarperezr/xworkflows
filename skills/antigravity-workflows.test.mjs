import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "../test-tmp.mjs";
import { sum } from "./adapt/research.mjs";
import { run as extractRun } from "./dream/extract.mjs";

const made = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "xwf-pywf-")); made.push(d); return d; };
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

// Executes an Antigravity Python workflow script with a mock async harness (matching run_workflow's top-level await & primitives).
function runPyWorkflow(scriptRelPath, argsObj, mockFnCode) {
  const scriptPath = join(import.meta.dirname, scriptRelPath);
  const harness = `
import asyncio, json, sys, ast

script_path = sys.argv[1]
args = json.loads(sys.argv[2])
calls = []
logs = []
phases = []

${mockFnCode}

def log(*items):
    logs.append(" ".join(str(x) for x in items))

def phase(name):
    phases.append(name)

def agent(prompt=None, schema=None, role=None, type_name="self", workspace="inherit", model=None):
    async def _run():
        entry = {"prompt": prompt, "schema": schema, "role": role, "type_name": type_name, "workspace": workspace, "model": model}
        calls.append(entry)
        return await mock_agent(entry)
    return _run()

async def parallel(items, fn):
    return list(await asyncio.gather(*(fn(item) for item in items)))

src = open(script_path, "r", encoding="utf-8").read()
# Wrap top-level await script in an async function
tree = ast.parse(src, filename=script_path)
fn_def = ast.AsyncFunctionDef(
    name="_workflow_main",
    args=ast.arguments(posonlyargs=[], args=[], kwonlyargs=[], kw_defaults=[], defaults=[]),
    body=tree.body,
    decorator_list=[],
)
mod = ast.Module(body=[fn_def], type_ignores=[])
ast.fix_missing_locations(mod)
ns = {"args": args, "agent": agent, "parallel": parallel, "log": log, "phase": phase}
exec(compile(mod, script_path, "exec"), ns)
asyncio.run(ns["_workflow_main"]())
sys.stderr.write("__META__" + json.dumps({"calls": calls, "logs": logs, "phases": phases}) + "\\n")
`;
  const r = spawnSync("python3", ["-c", harness, scriptPath, JSON.stringify(argsObj)], { encoding: "utf8" });
  assert.equal(r.status, 0, `python3 failed:\n${r.stderr}\n${r.stdout}`);
  const metaLine = r.stderr.split("\n").find((l) => l.startsWith("__META__"));
  const meta = JSON.parse(metaLine.slice("__META__".length));
  const out = JSON.parse(r.stdout.trim());
  return { out, ...meta };
}

test("adapt research.workflow.py: version 3, key order, and sum() matches research.mjs including non-ASCII", () => {
  const mock = `
async def mock_agent(c):
    r = c["role"]
    if r == "profile":
        return {
            "what": "Tienda rápida — café",
            "languages": ["js"],
            "docs": [{"file": "README.md", "lines": 40}],
            "areas": [{"key": "truth", "present": "yes", "why": "precios", "where": ["src"], "patterns": ["price"]}, {"key": "order", "present": "no", "why": "", "where": [], "patterns": []}],
            "projectAreas": [{"key": "shelf", "name": "Shelves", "covers": "stock", "why": "lost sales", "where": [], "patterns": []}],
        }
    if r.startswith("k:"):
        return {"kind": r[2:], "status": "found", "verdicts": [], "rules": [], "notChecked": [], "general": {"rule": "long", "short": "short " + r, "basis": "code", "risk": "medium", "cost": "c", "file": "a.js", "line": 1, "quote": "x"}}
    if r.startswith("a:"):
        return {"area": r[2:], "status": "found", "general": {"rule": "r", "short": "s", "basis": "code", "risk": "high", "cost": "c", "file": "a.js", "line": 1, "quote": "x"}, "ideas": [{"text": "idea", "file": "a.js", "line": 1, "quote": "x"}], "support": [], "exceptions": [], "contradicted": [], "unprotected": [], "commentRules": [], "details": [], "doubted": [], "notChecked": []}
    if r == "plain":
        return {"claims": [{"text": "Una regla clara.", "from": ["truth"]}]}
    if r == "questions":
        return {"questions": []}
    if r.startswith("docs") or r == "checks":
        return {"rules": [], "notes": [], "notRead": []}
    return {"lines": []}
`;
  const { out, calls, phases } = runPyWorkflow("adapt/research.workflow.py", { root: "/p", zeroHits: ["conc", "snap"], language: "Spanish" }, mock);
  assert.deepEqual(phases, ["Profile", "Topics and written rules", "Areas and mechanisms", "Questions", "Plain"]);
  assert.deepEqual(Object.keys(out), ["version", "profile", "areaOrder", "topics", "written", "areas", "kinds", "plain", "questions", "sum"]);
  assert.equal(out.version, 3);
  assert.equal(out.areas.order.status, "not-present");
  assert.equal(out.kinds.conc.status, "not-present");
  assert.equal(out.kinds.values.status, "found");
  const byRole = Object.fromEntries(calls.map((c) => [c.role, c.model]));
  assert.equal(byRole["a:truth"], "pro");
  assert.equal(byRole["a:shelf"], "pro");
  assert.ok(calls.every((c) => c.model !== "inherit" && c.model !== null), "no agent inherits the main session");
  for (const r of ["a:boundary", "a:compat", "a:limits", "k:values", "questions", "plain"]) assert.equal(byRole[r], "flash", r);
  const { sum: gotSum, ...rest } = out;
  assert.equal(gotSum, sum(JSON.stringify(rest)), "Python checksum must match research.mjs sum()");
});

test("dream.workflow.py: runs analyzers in parallel then organizer, prefixes Agent: role header, tracks missing", () => {
  const mock = `
async def mock_agent(c):
    if c["role"] == "analyze 2":
        raise RuntimeError("did not finish")
    if c["role"].startswith("analyze"):
        return {"proposals": [{"rule": "Always test", "session": c["role"]}]}
    return {"merged": 2, "conflicts": 1, "remove": [{"note": "old.md", "reason": "dup"}], "fates": [], "owner": []}
`;
  const { out, calls, phases } = runPyWorkflow(
    "dream/dream.workflow.py",
    { sessions: ["/t/one.txt", "/t/two.txt"], memory: "/w/docs/memory", focus: "hooks", agents: { analyzer: "dream-analyzer", organizer: "dream-organizer" }, model: "flash", brought: ["old.md"] },
    mock,
  );
  assert.deepEqual(phases, ["Analyze", "Organize"]);
  assert.equal(calls.length, 3);
  assert.match(calls[0].prompt, /^Agent: dream-analyzer\n/);
  assert.match(calls[2].prompt, /^Agent: dream-organizer\n/);
  assert.ok(calls[2].prompt.includes("old.md") && !calls[0].prompt.includes("old.md"));
  assert.deepEqual(out.missing, ["two"]);
  assert.equal(out.merged, 2);
  assert.equal(out.conflicts, 1);
  assert.equal(out.proposals.length, 1);
  assert.deepEqual(out.remove, [{ note: "old.md", reason: "dup" }]);
});

test("pending triage.workflow.py: chunks of 20, ordered loses row, failed chunk goes to notJudged", () => {
  const mock = `
async def mock_agent(c):
    if c["role"] == "judge 2":
        raise RuntimeError("timeout")
    chunk = json.loads(c["prompt"].split("\\n", 1)[1])
    return {"results": [{"n": x["n"], "kind": "ordered" if x["n"] % 2 else "finding", "row": "drop" if x["n"] % 2 else "pending", "reason": "r"} for x in chunk]}
`;
  const cards = Array.from({ length: 25 }, (_, i) => ({ n: i + 1, text: `c${i + 1}`, origin: "r" }));
  const { out, calls } = runPyWorkflow("pending/triage.workflow.py", { cards, agent: "pending-triage", model: "flash" }, mock);
  assert.equal(calls.length, 2);
  assert.equal(out.ordered.length, 10);
  assert.ok(out.ordered.every((r) => r.row === null));
  assert.equal(out.judged.length, 10);
  assert.deepEqual(out.notJudged, [21, 22, 23, 24, 25]);
});

test("full-review.workflow.py: runs 2 reviews x N zones, marks both, sorts, reports missing", () => {
  const mock = `
async def mock_agent(c):
    if "app" in c["role"]:
        return {"findings": [{"severity": "high", "kind": "error", "row": "blocking", "file": "src/a.js", "line": 10, "title": "bug", "case": "c"}]}
    if "thermo-nuclear-code-quality-review" in c["role"]:
        raise RuntimeError("failed")
    return {"findings": [{"severity": "low", "kind": "restructure", "row": "pending", "file": "db/b.sql", "line": 3, "title": "clean", "case": "c"}]}
`;
  const { out, calls } = runPyWorkflow(
    "full-review/full-review.workflow.py",
    {
      zones: [{ key: "app", paths: ["src/"] }, { key: "db", paths: ["db/"] }],
      skills: { "thermo-nuclear-review": ".agents/skills/thermo-nuclear-review", "thermo-nuclear-code-quality-review": ".agents/skills/thermo-nuclear-code-quality-review" },
    },
    mock,
  );
  assert.equal(calls.length, 4);
  assert.equal(out.errors.length, 2);
  assert.ok(out.errors.every((e) => e.both === true));
  assert.equal(out.restructures.length, 1);
  assert.deepEqual(out.missing, [{ review: "thermo-nuclear-code-quality-review", zone: "db" }]);
});

test("dream extract.mjs: --tool antigravity reads .xworkflows/local.json and parses Antigravity transcript_full.jsonl", () => {
  const root = tmp(), trDir = tmp();
  mkdirSync(join(root, "docs/memory"), { recursive: true });
  mkdirSync(join(root, ".xworkflows"), { recursive: true });
  writeFileSync(join(root, "docs/memory/a.md"), "note\n");
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "T"], { cwd: root });
  execFileSync("git", ["add", "docs/memory/a.md"], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: root });

  const tr1 = join(trDir, "s1.jsonl"), trCur = join(trDir, "cur.jsonl");
  writeFileSync(
    tr1,
    [
      JSON.stringify({ step_index: 0, type: "USER_INPUT", source: "USER_EXPLICIT", created_at: "2030-01-01T10:00:00Z", content: "<USER_REQUEST>\nFix the invoice rounding\n</USER_REQUEST><ADDITIONAL_METADATA>secret</ADDITIONAL_METADATA>" }),
      JSON.stringify({ step_index: 1, type: "USER_INPUT", source: "SUBAGENT_MESSAGE", created_at: "2030-01-01T10:00:01Z", content: "ignored subagent msg" }),
      JSON.stringify({ step_index: 2, type: "GENERIC", created_at: "2030-01-01T10:00:02Z", content: "tool output ignored" }),
      JSON.stringify({ step_index: 3, type: "PLANNER_RESPONSE", created_at: "2030-01-01T10:00:03Z", content: "Done, rounded to 2 decimals." }),
    ].join("\n") + "\n",
  );
  writeFileSync(trCur, JSON.stringify({ step_index: 0, type: "USER_INPUT", source: "USER_EXPLICIT", created_at: "2030-01-02T10:00:00Z", content: "current session" }) + "\n");
  writeFileSync(
    join(root, ".xworkflows/local.json"),
    JSON.stringify({ antigravity: { sessions: [{ id: "s1", transcript: tr1 }, { id: "cur", transcript: trCur }] } }),
  );

  const r = extractRun(["--tool", "antigravity", "--current", "cur"], {}, root, tmp());
  assert.equal(r.code, 0, r.stderr);
  const json = JSON.parse(r.stdout);
  if (json.out) made.push(json.out);
  assert.equal(json.sessions.length, 1);
  assert.equal(json.sessions[0].name, "s1");
  assert.equal(readFileSync(json.sessions[0].file, "utf8"), "user: Fix the invoice rounding\nassistant: Done, rounded to 2 decimals.");
});

test("adapt research.mjs: --tool antigravity skips redundant H6-model when strongest == top and resolves pro", () => {
  const root = tmp();
  mkdirSync(join(root, ".xworkflows"), { recursive: true });
  writeFileSync(join(root, ".xworkflows/tiers.json"), JSON.stringify({
    claude: { cheap: "haiku", medium: "sonnet", top: "opus", strongest: "fable" },
    antigravity: { cheap: "flash", medium: "pro", top: "pro", strongest: "pro" },
  }));
  writeFileSync(join(root, ".xworkflows/adapt-run.json"), JSON.stringify({ run: "r1", startedAt: Date.now() }));
  writeFileSync(join(root, ".xworkflows/screens.json"), JSON.stringify({ drawer1: [], drawer1LeftOut: [], drawer2: [], drawer3: [] }));
  writeFileSync(join(root, ".xworkflows/research.json"), JSON.stringify({ topics: {} }));
  writeFileSync(join(root, ".xworkflows/scan.json"), JSON.stringify({ zones: [] }));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "T"], { cwd: root });
  execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "init"], { cwd: root });

  const script = join(import.meta.dirname, "adapt/research.mjs");
  const q = spawnSync(process.execPath, [script, "queue", "--tool", "antigravity"], { cwd: root, encoding: "utf8" });
  assert.equal(q.status, 0, q.stderr);
  const items = JSON.parse(readFileSync(join(root, ".xworkflows/interview.json"), "utf8"));
  assert.ok(!items.some((i) => i.id === "H6-model"), "antigravity strongest==top skips redundant H6-model");

  const m = spawnSync(process.execPath, [script, "model", "--tool", "antigravity"], { cwd: root, encoding: "utf8" });
  assert.equal(m.status, 0, m.stderr);
  assert.equal(m.stdout.trim(), "pro");

  const mTier = spawnSync(process.execPath, [script, "model", "--tool", "antigravity", "cheap"], { cwd: root, encoding: "utf8" });
  assert.equal(mTier.status, 0, mTier.stderr);
  assert.equal(mTier.stdout.trim(), "flash");
});
