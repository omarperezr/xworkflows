#!/usr/bin/env node
// Adapt run file, citation check, the render of the three screens and the detail file, and the interview queue.
// Standalone: node: built-ins only (it is copied into projects).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, statSync, lstatSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { screens, render, details, mechanism, seen, MAX_RULES, MAX_MORE } from "./screens.mjs";

const STOP = "Research could not be copied unchanged twice: stop and tell the owner.";

// Same function as the script's `sum` (a test checks they agree).
export const sum = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(16);
};

const collapse = (s) => String(s).replace(/\s+/g, " ").trim();

export function verifyCitation(root, c) {
  const base = resolve(root);
  const p = resolve(base, String(c.file || ""));
  if (!p.startsWith(base + sep) || !existsSync(p) || !statSync(p).isFile()) return false;
  const q = collapse(c.quote || "");
  if (q.length < 2 || !Number.isInteger(c.line)) return false;
  const lines = readFileSync(p, "utf8").split("\n");
  for (let i = c.line - 3; i <= c.line + 3; i++) if (i >= 1 && i <= lines.length && collapse(lines[i - 1]).includes(q)) return true;
  return false;
}

const OPEN = ["I don't know", "Skip: not relevant here"];
const FIXED = ["Right", "Wrong", "Missing something"];

// An option label fits 60 characters, cut at a word; the description keeps the whole text.
const label = (t) => { if (t.length <= 60) return t; const i = t.slice(0, 60).lastIndexOf(" "); return (i > 0 ? t.slice(0, i) : t.slice(0, 59)) + "…"; };
const MORE = ["Yes, show them", "No, skip them"];
const SENTENCE = ["Right", "Real, but a bad rule", "Not how it works", "I don't know"];

const CONFIG_KEYS = ["paths.code", "paths.risk", "paths.heavyRead", "paths.codeAnyway", "tests.files", "tests.run", "tests.notRunnable", "checks.project", "checks.patterns", "checks.ratchets"];
const GLOSS = { "paths.code": "code folders", "paths.risk": "paths where a mistake is costly", "paths.heavyRead": "big or generated paths not to read whole", "paths.codeAnyway": "paths that look like non-code but are code", "tests.files": "test file patterns", "tests.run": "the command that runs the tests", "tests.notRunnable": "test folders that need a service such as a database", "checks.project": "the project's own check commands", "checks.patterns": "text patterns that must never appear", "checks.ratchets": "counts that must not grow" };
const NEG = /\b(not|never|nunca|refuses?|won't|doesn't|don't)\b|\bno\s/i; // what the project does not do: not offered as who pays

// The interview queue: S1-<n> a sentence, X<n> a screen 2 question, the nine ids of screen 3 (all from screens.json `s`),
// then the shipped questions no screen asks. `prev` is research.prev.json on a re-adapt (then only the config keys still without a value in `cfg`, .xworkflows/config.json).
// `earlier` ({ root, log, docs }: the interview log, the texts of the specs and plans added or changed since the earlier adaptation's commit) lets a re-adapt skip a screen 1 sentence already answered.
export function buildQueue(s, research = {}, scan = {}, prev = null, cfg = {}, earlier = null) {
  const item = (id, heading, text, options, style = "choice") => ({ id, heading, style, text, ...(options ? { options } : {}) });
  const confirm = (id, h, text) => item(id, h, text, ["Yes", "No", "I don't know"], "confirm");
  const lines = Object.keys(research.topics || {}).sort().flatMap((t) => research.topics[t]?.lines || []);
  const val = {};
  for (const l of lines) if (l.heading === "config" && l.key && !(l.key in val)) val[l.key] = collapse(l.text || "");
  const o = [];
  for (const l of lines) { const t = collapse(l.text || ""); if (l.heading === "2" && t && !NEG.test(t) && o.length < 3 && !o.some((x) => x.label === label(t))) o.push({ label: label(t), description: t }); }
  const config = CONFIG_KEYS.map((k, i) => (prev && k.split(".").reduce((x, p) => x?.[p], cfg) !== undefined ? null : val[k]
    ? confirm(`C${i + 1}`, "config", `Is this right for ${GLOSS[k]}: ${val[k] === "[]" ? "none" : val[k]}?`)
    : item(`C${i + 1}`, "config", `What should I write for ${GLOSS[k]}?`, OPEN, "open"))).filter(Boolean);
  const kept = [
    confirm("H1-what", "1", "Is this what the project is?"),
    item("H2-pays", "2", "Who pays for this, and what is sold?", o.length ? [...o, OPEN[0]] : OPEN),
    item("H6-zones", "6", "Does this split of the code into zones match how you think about it?"),
    ...(scan.zones || []).map((z, i) => item(`H6-r${i + 1}`, "6", `What does a mistake in ${z.key} risk? If more than one applies, type them all in Type something.`, ["Money", "Data", "Access", "No risk"])),
    ...["Keep one branch per batch, merged with --no-ff and never rebased after review?", "Push only when you say so?", "Add files by explicit path, never `git add .` or `-A`?", "No commit, PR or comment names an AI as author or co-author?"].map((t, i) => confirm(`H7-g${i + 1}`, "7", t)),
    item("H7-depth", "7", "How deep should a review go on a normal change?"),
    item("H7-push", "7", "Who may push?"),
    item("H8-reply", "8", "How should I reply to you?"),
    item("H8-budget", "8", "What model budget per session or month should I keep to?"),
  ];
  const asked = (x) => {
    if (!prev || !earlier) return true;
    const text = `${x.text} (${x.at})${seen(x)}`;
    const a = earlier.log.filter((l) => l.question === text && l.answer !== undefined && l.answer !== "").pop()?.answer;
    if (!a || a === SENTENCE[3]) return true;
    const claim = [...(prev.plain?.claims || []), ...(prev.plain?.rest || [])].find((c) => c.text === x.text);
    const cites = (claim?.from || []).flatMap((id) => {
      const [key, n] = id.split(".");
      const a = prev.areas?.[key], k = id.startsWith("kind:") ? prev.kinds?.[id.slice(5)] : null;
      return k ? [k.general] : n ? [a?.ideas?.[n - 1]] : a?.general ? [a.general, ...(a.support || [])] : [undefined];
    });
    if (!cites.length || !cites.every((c) => c && verifyCitation(earlier.root, c))) return true;
    return cites.some((c) => earlier.docs.some((d) => d.includes(String(c.file).replace(resolve(earlier.root) + sep, "")))); // a newer spec or plan names a cited file
  };
  const sentence = (x, i) => item(`S1-${i + 1}`, "1", `${x.text} (${x.at})${seen(x)}`, SENTENCE);
  const first = s.drawer1.filter(asked), out = s.drawer1LeftOut.filter(asked);
  const left = out.length, more = out.slice(0, MAX_MORE);
  return [
    ...first.map(sentence),
    ...(left ? [item("S1-more", "1", `${left} more sentence(s) were left out of the first ${MAX_RULES}. Show up to ${more.length} of them?`, MORE)] : []),
    ...more.map((x, i) => sentence(x, MAX_RULES + i)),
    ...s.drawer2.map((g) => item(g.id, "2", g.text, g.options)),
    ...s.drawer3.map((q) => {
      const opts = q.options.slice(0, 3).map((x) => ({ label: label(collapse(x.label)), description: `${collapse(x.description)}${x.at ? ` (${x.at})` : ""}` }));
      return item(q.id, "3", `${q.text} ${q.lead}`, opts.length ? [...opts, OPEN[0]] : OPEN);
    }),
    ...(prev ? [] : kept),
    ...config,
  ];
}

// Ids with no answer in `run`; `H1-what-fix` after a `No` on `H1-what`, `C<n>-fix` after a `No` on a config confirm, `<id>-why` after the bare `Keep it, because ...`; with `approved`, P-H1..P-H7 last answer must be `Right`.
export function missing(queue, log, run, approved = false) {
  const last = {};
  for (const l of log) if (l.run === run && l.answer !== undefined && l.answer !== "") last[l.id] = l.answer;
  const out = [];
  for (const { id, style } of queue) {
    if (/^S1-\d+$/.test(id) && Number(id.slice(3)) > MAX_RULES && last["S1-more"] !== MORE[0]) continue; // the second page is asked only after a yes
    if (!(id in last)) out.push(id);
    else if (id === "H1-what" && last[id] === "No" && !("H1-what-fix" in last)) out.push("H1-what-fix");
    else if (last[id] === "Keep it, because ..." && !(`${id}-why` in last)) out.push(`${id}-why`);
    else if (/^C\d+$/.test(id) && style === "confirm" && last[id] === "No" && !(`${id}-fix` in last)) out.push(`${id}-fix`);
  }
  if (approved) for (let n = 1; n <= 7; n++) if (last[`P-H${n}`] !== FIXED[0]) out.push(`P-H${n}`);
  return out;
}

const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
// Same match as the adapt-gates hook: quotes and any case accepted.
const statusOf = (f) => (existsSync(f) ? (readFileSync(f, "utf8").match(/^status:\s*["']?(\w+)/mi) || [])[1]?.toLowerCase() : null) || null;

// A tracked symlink under .xworkflows would send the write outside the project.
const isLink = (f) => { try { return lstatSync(f).isSymbolicLink(); } catch { return false; } };
const refuse = (f) => { console.error(`adapt: ${f} is a symlink; remove it, adapt will not write through it`); process.exit(1); };
const put = (f, data) => { if (isLink(f)) refuse(f); writeFileSync(f, data); };
const putCopy = (from, to) => { if (isLink(to)) refuse(to); copyFileSync(from, to); };

// What the earlier adaptation left: the answers in the log and the specs and plans added or changed since the commit its summary names; null (ask everything) when that commit cannot be read.
function earlier(root, dir, cfg) {
  try {
    const commit = (readFileSync(join(dir, "summary.md"), "utf8").match(/^commit:\s*["']?([0-9a-f]{7,40})/mi) || [])[1];
    if (!commit) return null;
    const log = [];
    try { for (const l of readFileSync(join(dir, "interview.log.jsonl"), "utf8").split("\n")) try { log.push(JSON.parse(l)); } catch {} } catch {}
    const dirs = [cfg.paths?.specs ?? "docs/superpowers/specs", cfg.paths?.plans ?? "docs/superpowers/plans"];
    const files = new Set([...git(root, ["diff", "-z", "--name-only", commit, "--", ...dirs]).split("\0"), ...git(root, ["ls-files", "-z", "-o", "--exclude-standard", "--", ...dirs]).split("\0")].filter(Boolean));
    return { root, log, docs: [...files].filter((f) => existsSync(join(root, f))).map((f) => readFileSync(join(root, f), "utf8")) };
  } catch { return null; }
}

function cli(cmd, root) {
  const dir = join(root, ".xworkflows");
  const runFile = join(dir, "adapt-run.json");
  const summary = join(dir, "summary.md");
  const prev = join(dir, "research.prev.json");
  if (cmd === "start") {
    for (const f of [dir, join(dir, "interview.log.jsonl")]) if (isLink(f)) refuse(f);
    mkdirSync(dir, { recursive: true });
    // The owner's answers land here from the first question; ignore them now, not at step 4.
    try { writeFileSync(join(dir, ".gitignore"), [".gitignore", "research.md", "research.json", "research.prev.json", "scan.json", "interview.json", "interview.log.jsonl", "adapt-run.json", "rules.json", "kinds.json", "screens.json", "details.md"].join("\n") + "\n", { flag: "wx" }); } catch {}
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
    put(runFile, JSON.stringify(run, null, 2) + "\n");
    console.log(run.run);
  } else if (cmd === "done") {
    // The approved summary written in this run makes its research the base of the next re-adapt (2 s slack for coarse file times).
    let r = null;
    try { r = readJson(runFile); } catch {}
    if (r && statusOf(summary) === "approved" && statSync(summary).mtimeMs + 2000 >= r.startedAt && existsSync(join(dir, "research.json"))) putCopy(join(dir, "research.json"), prev);
    rmSync(runFile, { force: true });
  } else if (cmd === "render") {
    const research = readJson(join(dir, "research.json"));
    const scan = readJson(join(dir, "scan.json"));
    if (research.profile === null) { console.error("profile: agent returned nothing, rerun the Workflow"); process.exit(1); }
    const { version, profile, areaOrder, topics, written, areas, kinds, plain, questions } = research; // the script's own key order
    if (research.sum !== sum(JSON.stringify({ version, profile, areaOrder, topics, written, areas, kinds, plain, questions }))) {
      let n = 1;
      try { const r = readJson(runFile); n = (r.mismatches || 0) + 1; put(runFile, JSON.stringify({ ...r, mismatches: n }, null, 2) + "\n"); } catch {}
      console.error(n >= 2 ? STOP : "research.json was altered after the Workflow returned it: rm -f it and write the Workflow result again, unchanged.");
      process.exit(1);
    }
    let rules = [];
    try { rules = readJson(join(dir, "rules.json")).rules || []; } catch {}
    const s = screens(root, research);
    const m = mechanism(root, research);
    s.dropped.push(...m.dropped);
    const errors = [...s.errors, ...m.errors];
    if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
    const out = [["research.md", render(research, s, scan.commit)], ["screens.json", JSON.stringify(s, null, 2) + "\n"], ["details.md", details(research, s, m, root, rules)], ["kinds.json", m.state]];
    for (const [f] of out) if (isLink(join(dir, f))) refuse(join(dir, f)); // refuse before writing any
    for (const [f, text] of out) put(join(dir, f), text);
    console.log(`screen 1: ${s.drawer1.length} sentence(s), ${s.drawer1LeftOut.length} left out; screen 2: ${s.drawer2.length} question(s), ${s.drawer2LeftOut.length} left out; dropped: ${s.dropped.length}`);
  } else if (cmd === "queue" || cmd === "check") {
    const need = (f) => { try { return readJson(join(dir, f)); } catch { console.error(`adapt: ${f} is missing or unreadable`); process.exit(1); } };
    if (cmd === "queue") {
      const opt = (f) => { try { return readJson(join(dir, f)); } catch { return null; } };
      const prevRun = opt("research.prev.json"), cfg = opt("config.json") || {};
      const q = buildQueue(need("screens.json"), need("research.json"), need("scan.json"), prevRun, cfg, prevRun && earlier(root, dir, cfg));
      put(join(dir, "interview.json"), JSON.stringify(q, null, 2) + "\n");
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
