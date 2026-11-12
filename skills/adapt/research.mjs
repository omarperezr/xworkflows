#!/usr/bin/env node
// Adapt run file, citation check and deterministic render of research.md.
// Standalone: node: built-ins only (it is copied into projects).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, statSync } from "node:fs";
import { join, resolve, sep, posix } from "node:path";
import { pathToFileURL } from "node:url";

const KINDS = ["values", "snap", "srvw", "delta", "idem", "txn", "access", "batch", "domain", "compat", "conc", "input"];
const HEADINGS = ["What it is", "Who pays, what is sold, what is not done", "Aspirations at about 3, 12 and 36 months", "Risks, the costliest mistake first", "What must not change; what is free to change", "Zones and which paths are risk paths", "How the owner works", "About you"];
const STOP = "Research could not be copied unchanged twice: stop and tell the owner.";

// Same function as the script's `sum` (a test checks they agree).
export const sum = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(16);
};

const norm = (p) => posix.normalize(String(p).replace(/^(\.\/)+/, "")).replace(/\/$/, "");
const collapse = (s) => String(s).replace(/\s+/g, " ").trim();

export function verifyCitation(root, c) {
  const base = resolve(root);
  const p = resolve(base, String(c.file || ""));
  if (!p.startsWith(base + sep) || !existsSync(p)) return false;
  const q = collapse(c.quote || "");
  if (!q || !Number.isInteger(c.line)) return false;
  const lines = readFileSync(p, "utf8").split("\n");
  for (let i = c.line - 3; i <= c.line + 3; i++) if (i >= 1 && i <= lines.length && collapse(lines[i - 1]).includes(q)) return true;
  return false;
}

const trim = (t, n = 160) => (t.length > n ? t.slice(0, n - 3) + "..." : t);

// `written` is the `rules` list of .xworkflows/rules.json.
export function renderResearch(root, research, scan, written = []) {
  const errors = [];
  const dropped = [];
  const notChecked = new Set();
  const contradicted = [];
  const wtext = new Map(written.map((w) => [w.id, trim(collapse(w.text))]));
  const kinds = research.kinds || {};
  const skipped = research.skipped || {};
  const byHeading = {};
  const add = (h, l) => ((byHeading[h] ||= []).push(l));
  const tag = (l) => `${l.text} (${l.tag})`;
  const config = [];
  const writtenDown = [];
  for (const t of ["t1", "t2", "t3", "t4", "t5", "t6"]) {
    if (!(research.topics || {})[t]) { errors.push(`topic ${t}: agent returned nothing, rerun the Workflow`); continue; }
    for (const l of research.topics[t].lines || []) {
      if (l.heading === "config") config.push(`- ${l.key ? `\`${l.key}\`: ` : ""}${tag(l)}`);
      else if (l.heading === "written") writtenDown.push(`- ${tag(l)}`);
      else add(l.heading, `- ${tag(l)}`);
    }
  }
  const cite = (x) => verifyCitation(root, { file: x.file, line: x.line, quote: x.quote });
  const blocks = [];
  for (const k of KINDS) {
    const r = kinds[k];
    if (!r) { errors.push(`${k}: agent returned nothing`); continue; }
    if (!["found", "absent", "not-present"].includes(r.status)) { errors.push(`${k}: invalid status ${JSON.stringify(r.status)}`); continue; }
    for (const p of r.notChecked || []) notChecked.add(`${k}: ${norm(p)}`); // listed, never fatal (ruling 2026-11-12)
    // A verdict stands only with a verified citation; otherwise it counts as no-evidence.
    const verdicts = [];
    const vd = []; // dropped verdict notes, listed after the general rule's
    for (const v of r.verdicts || []) {
      const q = v.file ? ` ${v.file}:${v.line} ${JSON.stringify(v.quote)}` : " no citation";
      if (!wtext.has(v.id)) { vd.push({ kind: k, note: `${v.id} not in rules.json:${q}` }); continue; }
      const ok = Boolean(v.file) && cite(v);
      let verdict = v.verdict;
      if (!ok && verdict !== "no-evidence") { vd.push({ kind: k, note: `${v.id} ${verdict}, now no-evidence:${q}` }); verdict = "no-evidence"; }
      else if (!ok && v.file) vd.push({ kind: k, note: `${v.id} ${verdict}:${q}` });
      const at = ok ? ` ${v.file}:${v.line}` : "";
      verdicts.push(`- ${v.id} ${verdict}: ${wtext.get(v.id)}${at}`);
      if (verdict === "contradicted") contradicted.push(`- ${k}: ${v.id}: ${wtext.get(v.id)}${at}`);
    }
    if (r.status !== "found") dropped.push(...vd);
    if (r.status === "absent") { blocks.push(`- no rule found: ${k}`); continue; }
    if (r.status === "not-present") { blocks.push(`- ${k}: not-present${skipped[k] ? ` (skipped: ${skipped[k]})` : ""}`); continue; }
    let kept = 0;
    const g = r.general;
    if (!g?.rule) errors.push(`${k}: found, but no general rule`);
    else if (cite(g)) { kept++; blocks.push(`- general: ${g.rule} (${g.basis}) ${g.file}:${g.line}`); }
    else { blocks.push(`- general: ${g.rule} (${g.basis}) (unverified)`); dropped.push({ kind: k, note: `general: ${g.file}:${g.line} ${JSON.stringify(g.quote)}` }); }
    dropped.push(...vd);
    blocks.push(...verdicts);
    for (const x of r.rules || []) {
      if (cite(x)) { kept++; blocks.push(`- ${x.rule} (code) ${x.file}:${x.line}`); }
      else dropped.push({ kind: k, file: x.file, line: x.line, quote: x.quote });
    }
    if (!kept) errors.push(`${k}: found, but no citation survived verification`);
  }
  const out = ["---", `commit: ${scan.commit}`, "---", ""];
  HEADINGS.forEach((h, i) => {
    out.push(`## ${i + 1}. ${h}`, "", ...(byHeading[i + 1] || []), ...(i === 4 ? blocks : []), "");
  });
  if (contradicted.length) out.push("## Contradicted written rules", "", ...contradicted, "");
  out.push("## Existing checks", "", ...(scan.checks || []).map((c) => `- ${c}`), "");
  out.push("## Config", "", ...config, "", "## Written down", "", ...writtenDown, "");
  if (dropped.length) out.push("## Dropped citations", "", ...dropped.map((d) => `- ${d.kind}: ${d.note ?? `${d.file}:${d.line} ${JSON.stringify(d.quote)}`}`), "");
  if (notChecked.size) out.push("## Not checked", "", ...[...notChecked].sort().map((l) => `- ${l}`), "");
  return { md: out.join("\n"), errors, dropped };
}

const CONFIG_KEYS = ["paths.code", "paths.risk", "paths.heavyRead", "paths.codeAnyway", "tests.files", "tests.run", "tests.notRunnable", "checks.project", "checks.patterns", "checks.ratchets"];
const GLOSS = { "paths.code": "code folders", "paths.risk": "paths where a mistake is costly", "paths.heavyRead": "big or generated paths not to read whole", "paths.codeAnyway": "paths that look like non-code but are code", "tests.files": "test file patterns", "tests.run": "the command that runs the tests", "tests.notRunnable": "test folders that need a service such as a database", "checks.project": "the project's own check commands", "checks.patterns": "text patterns that must never appear", "checks.ratchets": "counts that must not grow" };
const SPEC_Q = "How does the code prevent this today, and what rule must every change follow?";
const KIND_Q = { values: "Which currency or unit is the source of truth, how are other values worked out from it, and how and where is rounding done?", snap: "Which values of a record stay as they were when written, and which are worked out again later?", srvw: "Which data is written by server functions, and which can be written from elsewhere?", delta: "Which data may change only by adding or subtracting, never by setting a new value?", idem: "What happens when the same write arrives twice (offline, retried, a double click)?", txn: "When one user action changes several rows, how many requests and transactions does it take?", access: "Where is access checked, and can the screens be bypassed?", batch: "Is work over many rows or items done once for all of them, or once per item?", domain: "Which domain, legal or tax rules must the code follow, and where are they written down?", compat: "What must not break for those who use it (public API, file formats, schemas)?", conc: "What happens when two changes to the same data happen at the same time?", input: "Where is outside input checked before the code trusts it?" };
const OPEN = ["I don't know", "Skip: not relevant here"];
const FIXED = ["Right", "Wrong", "Missing something"];

// The fixed-id interview queue (spec 5.1). `prev` is research.prev.json on a re-adapt; `cfg` is .xworkflows/config.json.
export function buildQueue(research, scan, prev, cfg) {
  const item = (id, heading, style, text, options) => ({ id, heading, style, text, ...(options ? { options } : {}) });
  const open = (id, h, text) => item(id, h, "open", text, OPEN);
  const confirm = (id, h, text) => item(id, h, "confirm", text, ["Yes", "No", "I don't know"]);
  const choice = (id, h, text) => item(id, h, "choice", text);
  const have = new Set(Object.values(research.topics || {}).flatMap((t) => (t.lines || []).filter((l) => l.heading === "config" && l.key).map((l) => l.key)));
  if (prev) for (const k of CONFIG_KEYS) if (k.split(".").reduce((o, p) => o?.[p], cfg) !== undefined) have.add(k); // a re-adapt asks only keys still without a value
  const config = CONFIG_KEYS.map((k, i) => (have.has(k) ? null : open(`C${i + 1}`, "config", `What is the value of ${k} (${GLOSS[k]})?`))).filter(Boolean);
  const mech = KINDS.filter((k) => research.kinds?.[k]?.status === "absent" && (!prev || prev.kinds?.[k]?.status !== "absent"))
    .map((k) => item(`H5-${k}`, "5", "mechanism", `${KIND_Q[k]} ${SPEC_Q}`, ["Nothing does today", "I don't know"]));
  if (prev) return [...mech, ...config];
  return [
    confirm("H1-what", "1", "Is this what the project is?"),
    open("H2-pays", "2", "Who pays for this, and what is sold?"),
    open("H2-refused", "2", "What does this project refuse to do?"),
    open("H4-incident", "4", "Tell me about one real time something went wrong here: what broke, and what did it cost?"),
    open("H4-risks", "4", "Which mistakes would cost the most here, in your words?"),
    ...mech,
    open("H5-keep", "5", "What must not change?"),
    open("H5-free", "5", "What is free to change?"),
    choice("H6-zones", "6", "Does this split of the code into zones match how you think about it?"),
    ...(scan.zones || []).map((z, i) => confirm(`H6-r${i + 1}`, "6", `Does a mistake in ${z.key} risk money, data or access?`)),
    ...[
      "Keep one branch per batch, merged with --no-ff and never rebased after review?",
      "Push only when you say so?",
      "Add files by explicit path, never `git add .` or `-A`?",
      "No commit, PR or comment names an AI as author or co-author?",
    ].map((t, i) => confirm(`H7-g${i + 1}`, "7", t)),
    choice("H7-depth", "7", "How deep should a review go on a normal change?"),
    choice("H7-push", "7", "Who may push?"),
    choice("H3-3m", "3", "What do you want at about 3 months?"),
    choice("H3-12m", "3", "What do you want at about 12 months?"),
    choice("H3-36m", "3", "What do you want at about 36 months?"),
    choice("H8-reply", "8", "How should I reply to you?"),
    choice("H8-budget", "8", "What model budget per session or month should I keep to?"),
    ...config,
  ];
}

// Ids with no answer in `run`; `-r` follow-ups after `Nothing does today`, `H1-what-fix` after a `No` on `H1-what`; with `approved`, P-H1..P-H7 last answer must be `Right`.
export function missing(queue, log, run, approved = false) {
  const last = {};
  for (const l of log) if (l.run === run && l.answer !== undefined && l.answer !== "") last[l.id] = l.answer;
  const out = [];
  for (const { id } of queue) {
    if (!(id in last)) out.push(id);
    else if (/^H5-/.test(id) && KINDS.includes(id.slice(3)) && last[id] === "Nothing does today" && !(`${id}-r` in last)) out.push(`${id}-r`);
    else if (id === "H1-what" && last[id] === "No" && !("H1-what-fix" in last)) out.push("H1-what-fix");
  }
  if (approved) for (let n = 1; n <= 7; n++) if (last[`P-H${n}`] !== FIXED[0]) out.push(`P-H${n}`);
  return out;
}

const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
// Same match as the adapt-gates hook: quotes and any case accepted.
const statusOf = (f) => (existsSync(f) ? (readFileSync(f, "utf8").match(/^status:\s*["']?(\w+)/mi) || [])[1]?.toLowerCase() : null) || null;

function cli(cmd, root) {
  const dir = join(root, ".xworkflows");
  const runFile = join(dir, "adapt-run.json");
  const summary = join(dir, "summary.md");
  const prev = join(dir, "research.prev.json");
  if (cmd === "start") {
    mkdirSync(dir, { recursive: true });
    const commit = git(root, ["rev-parse", "HEAD"]);
    const status = statusOf(summary);
    let old = null;
    try { old = readJson(runFile); } catch {}
    // An interrupted draft or first adapt keeps its run, so its answers count; with the run file gone, the log's last run of it.
    const resume = status === "draft" || (!status && (!old || old.commit === commit));
    if (resume && !old) {
      let last = null;
      try { for (const l of readFileSync(join(dir, "interview.log.jsonl"), "utf8").split("\n")) try { last = JSON.parse(l).run || last; } catch {} } catch {}
      if (last && (status === "draft" || last.startsWith(commit.slice(0, 8) + "-"))) old = { run: last, mismatches: 0 };
    }
    const run = resume && old ? { ...old, commit, startedAt: Date.now() }
      : { run: `${commit.slice(0, 8)}-${Date.now().toString(36)}`, commit, startedAt: Date.now(), mismatches: 0 };
    if (!status) rmSync(prev, { force: true });
    writeFileSync(runFile, JSON.stringify(run, null, 2) + "\n");
    console.log(run.run);
  } else if (cmd === "done") {
    // The approved summary written in this run makes its research the base of the next re-adapt (2 s slack for coarse file times).
    let r = null;
    try { r = readJson(runFile); } catch {}
    if (r && statusOf(summary) === "approved" && statSync(summary).mtimeMs + 2000 >= r.startedAt && existsSync(join(dir, "research.json"))) copyFileSync(join(dir, "research.json"), prev);
    rmSync(runFile, { force: true });
  } else if (cmd === "render") {
    const research = readJson(join(dir, "research.json"));
    const scan = readJson(join(dir, "scan.json"));
    const { topics, kinds, skipped } = research;
    if (research.sum !== sum(JSON.stringify({ topics, kinds, skipped }))) {
      let n = 1;
      try { const r = readJson(runFile); n = (r.mismatches || 0) + 1; writeFileSync(runFile, JSON.stringify({ ...r, mismatches: n }, null, 2) + "\n"); } catch {}
      console.error(n >= 2 ? STOP : "research.json was altered after the Workflow returned it: rm -f it and write the Workflow result again, unchanged.");
      process.exit(1);
    }
    const rules = existsSync(join(dir, "rules.json")) ? readJson(join(dir, "rules.json")).rules || [] : [];
    const { md, errors } = renderResearch(root, research, scan, rules);
    if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
    writeFileSync(join(dir, "research.md"), md);
  } else if (cmd === "queue" || cmd === "check") {
    const need = (f) => { try { return readJson(join(dir, f)); } catch { console.error(`adapt: ${f} is missing or unreadable`); process.exit(1); } };
    if (cmd === "queue") {
      const q = buildQueue(need("research.json"), need("scan.json"), existsSync(prev) ? need("research.prev.json") : null, existsSync(join(dir, "config.json")) ? need("config.json") : null);
      writeFileSync(join(dir, "interview.json"), JSON.stringify(q, null, 2) + "\n");
    } else {
      const { run } = need("adapt-run.json");
      const logFile = join(dir, "interview.log.jsonl");
      const log = [];
      // a truncated line (killed mid-write) is skipped
      if (existsSync(logFile)) for (const l of readFileSync(logFile, "utf8").split("\n")) try { log.push(JSON.parse(l)); } catch {}
      const ids = missing(need("interview.json"), log, run, process.argv.includes("--approved"));
      if (ids.length) { console.log(ids.join("\n")); process.exit(1); }
    }
  } else {
    console.error("usage: research.mjs start|done|render|queue|check [--approved]");
    process.exit(2);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let root = process.cwd();
  try { root = git(root, ["rev-parse", "--show-toplevel"]); } catch {}
  cli(process.argv[2], root);
}
