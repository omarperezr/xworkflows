// Development-only, not shipped: one row of numbers per batch (a --no-ff merge on the main branch) of a project, from its git history,
// the session files Claude Code writes and the hook log; compares them with a baseline project's rows. Only reads the project; writes only under --out (inside a measured project, only a folder git ignores there).
// usage: node proof/measure.mjs --project <path> [--baseline <path>] [--sessions <dir>] [--out <dir>] | --false <time> <reason> [--out <dir>]
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { loadLenient } from "../hooks/core/config.mjs";

// Prices in USD per million tokens: input / output / 5-minute cache write / 1-hour cache write / cache read.
// Source: https://platform.claude.com/docs/en/about-claude/pricing, read 2026-11-18.
const PRICES = { "fable-5-2": [8, 40, 10, 16, 0.2], "opus-5-5": [4, 20, 5, 8, 0.2], "sonnet-5-5": [2, 10, 2.5, 4, 0.1], "haiku-5-5": [0.1, 0.5, 0.125, 0.2, 0.01] };
const COUNTS = ["in", "out", "w5", "w1", "read"];

export function price(model, u) {
  const key = Object.keys(PRICES).find((k) => String(model).includes(k));
  if (!key) return null;
  const t = tokensOf(u);
  return COUNTS.reduce((s, c, i) => s + t[c] * PRICES[key][i], 0) / 1e6;
}
function tokensOf(u) {
  const c = u.cache_creation ?? {};
  return { in: u.input_tokens ?? 0, out: u.output_tokens ?? 0, w5: c.ephemeral_5m_input_tokens ?? 0, w1: c.ephemeral_1h_input_tokens ?? 0, read: u.cache_read_input_tokens ?? 0 };
}

const jsonLines = (file) => readFileSync(file, "utf8").split("\n").flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
const readJson = (file) => { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return {}; } };

const jsonlUnder = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? jsonlUnder(join(d, e.name)) : e.name.endsWith(".jsonl") ? [join(d, e.name)] : [])).sort();
// the first field a message lacks, by name: Claude Code's format is not documented, so a missing one stops the tool
const lacking = (o) => {
  const u = o.message.usage;
  return [["timestamp", Date.parse(o.timestamp)], ["input_tokens", u.input_tokens], ["output_tokens", u.output_tokens], ["cache_read_input_tokens", u.cache_read_input_tokens], ["cache_creation.ephemeral_5m_input_tokens", u.cache_creation?.ephemeral_5m_input_tokens], ["cache_creation.ephemeral_1h_input_tokens", u.cache_creation?.ephemeral_1h_input_tokens]].find(([, v]) => !Number.isFinite(v))?.[0];
};

// records: one per assistant message id (the last line of an id wins); runs: one per subagent file (at any depth under <session>/subagents), with its start; first: the earliest record.
export function readSessions(dir) {
  const byId = new Map();
  const runs = [];
  let first = Infinity;
  const take = (file, agent, run) => {
    let start = Infinity;
    for (const o of jsonLines(file)) {
      const m = o.message;
      if (!m?.id || !m.usage) continue;
      const missing = lacking(o);
      if (missing) throw new Error(`${basename(file)}: message ${m.id} has no ${missing}`);
      const ts = Date.parse(o.timestamp);
      start = Math.min(start, ts);
      byId.set(m.id, { id: m.id, model: m.model, ts, agent, tokens: tokensOf(m.usage), usd: price(m.model, m.usage) });
    }
    first = Math.min(first, start);
    if (run && start < Infinity) runs.push({ agent, ts: start });
  };
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith(".jsonl")) take(join(dir, e.name), "main", false);
    const sub = join(dir, e.name, "subagents");
    if (e.isDirectory() && existsSync(sub)) for (const f of jsonlUnder(sub)) take(f, readJson(f.replace(/\.jsonl$/, ".meta.json")).agentType ?? "unknown", true);
  }
  const ids = new Set(readdirSync(dir).filter((f) => f.endsWith(".jsonl")).map((f) => f.slice(0, -6))); // the hook log names the main session
  return { records: [...byId.values()], runs, ids, first };
}

const git = (cwd, ...args) => execFileSync("git", ["-c", "core.quotepath=off", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 28 });

// Merges of the main branch, oldest first: sha, parents, time, branch (from "Merge branch 'x'"), and the commits it brought.
export function readBatches(repo, main) {
  const log = git(repo, "log", "--merges", "--first-parent", "--reverse", "--format=%H %P|%cI|%s", main).split("\n").filter(Boolean);
  return log.map((l) => {
    const [head, time, subject] = l.split("|");
    const [sha, first, second] = head.split(" ");
    const commits = second ? git(repo, "log", "--no-merges", "--format=%H|%s", `${first}..${second}`).split("\n").filter(Boolean).map((c) => { const [s, ...r] = c.split("|"); return { sha: s, subject: r.join("|") }; }) : [];
    return { sha, first, time: Date.parse(time), branch: /^Merge branch '([^']+)'/.exec(subject)?.[1] ?? sha.slice(0, 8), commits };
  });
}

// The file a "--- " or "+++ " header names, without its a/ or b/ prefix; a quoted name is unquoted; null for /dev/null.
const headerName = (h) => {
  const n = h.slice(4).replace(/\t.*$/, "");
  if (n === "/dev/null") return null;
  try { return (n.startsWith('"') ? JSON.parse(n) : n).slice(2); } catch { return n.slice(3, -1); }
};

// The commits that last changed or deleted the lines a commit changes: blame at its parent, per hunk. A file new in the commit blames nothing.
// A file's headers are read only before its first hunk, so a deleted line that starts with "-- " is never taken for one.
export function blamedBy(repo, sha) {
  let diff;
  try { diff = git(repo, "diff", "-U0", "--no-ext-diff", "--src-prefix=a/", "--dst-prefix=b/", `${sha}^`, sha); } catch { return new Set(); } // a root commit has no parent
  const out = new Set();
  let file = null;
  let inHunks = false;
  for (const l of diff.split("\n")) {
    if (l.startsWith("diff --git ")) { file = null; inHunks = false; continue; }
    if (!inHunks && l.startsWith("--- ")) { file = headerName(l); continue; }
    const h = /^@@ -(\d+)(?:,(\d+))? /.exec(l);
    if (!h) continue;
    inHunks = true;
    const n = h[2] === undefined ? 1 : Number(h[2]);
    if (!file || n === 0) continue;
    for (const b of git(repo, "blame", "-l", "--porcelain", `${sha}^`, "-L", `${h[1]},${Number(h[1]) + n - 1}`, "--", file).split("\n")) {
      const s = /^([0-9a-f]{40}) /.exec(b);
      if (s) out.add(s[1]);
    }
  }
  return out;
}

// null when there is no log; first: the time of its first line (Infinity when it has none), list: the denials with their session and hook.
const denialsOf = (stateDir) => {
  const f = join(stateDir, "xwf-hooks.log");
  if (!existsSync(f)) return null;
  const lines = readFileSync(f, "utf8").split("\n").map((l) => l.split(" ")).filter((p) => !isNaN(Date.parse(p[0])));
  return { first: lines.length ? Date.parse(lines[0][0]) : Infinity, list: lines.filter((p) => p[3] === "deny").map((p) => ({ time: p[0], ts: Date.parse(p[0]), session: p[1], hook: p[2] })) };
};

const sum = (a, b) => Object.fromEntries(COUNTS.map((c) => [c, (a?.[c] ?? 0) + b[c]]));
const group = (recs, key) => {
  const g = {};
  for (const r of [...recs].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const e = (g[r[key]] ??= { tokens: sum(null, { in: 0, out: 0, w5: 0, w1: 0, read: 0 }), usd: 0 });
    e.tokens = sum(e.tokens, r.tokens);
    // a message with no tokens costs nothing whatever its model (<synthetic>); an unpriced model with tokens makes the whole entry null
    if (r.usd === null && COUNTS.some((c) => r.tokens[c])) e.usd = null;
    else if (e.usd !== null) e.usd += r.usd ?? 0;
  }
  return Object.fromEntries(Object.entries(g).sort(([a], [b]) => (a < b ? -1 : 1)));
};
const usdOf = (g) => Object.values(g).reduce((s, e) => s + (e.usd ?? 0), 0);

// One row per batch. Sessions bound by time only: other work in the window counts too.
export function buildRows(repo, main, sessions, log, judged) {
  const batches = readBatches(repo, main);
  const batchOf = new Map();
  batches.forEach((b, i) => { batchOf.set(b.sha, i); b.commits.forEach((c) => batchOf.set(c.sha, i)); });
  const isFix = (sha, i) => batches[i].commits.some((c) => c.sha === sha && /^fix(\(.*\))?!?:/.test(c.subject));
  const rows = batches.map((b, i) => ({ b, i, start: i ? batches[i - 1].time : -Infinity, fixes: b.commits.filter((c) => isFix(c.sha, i)), failuresAfterSeal: [], fixOfFix: 0 })).filter((x) => x.b.time >= sessions.first);
  const at = new Map(rows.map((r) => [r.i, r])); // a batch older than the first saved session has no row, and so no failure to count against it
  for (const x of rows) {
    for (const f of x.fixes) {
      const blamed = [...blamedBy(repo, f.sha)];
      if (blamed.some((s) => batchOf.get(s) === x.i && isFix(s, x.i))) x.fixOfFix++; // a fix counts once, however many fixes it repairs
      for (const j of new Set(blamed.map((s) => batchOf.get(s)))) if (j < x.i && at.has(j)) at.get(j).failuresAfterSeal.push({ fix: f.sha, commit: blamed.find((s) => batchOf.get(s) === j), fixBatch: x.b.branch });
    }
  }
  return rows.map(({ b, i, start, fixes, failuresAfterSeal, fixOfFix }) => {
    const inWin = (t) => t > start && t <= b.time;
    const recs = sessions.records.filter((r) => inWin(r.ts));
    const runs = sessions.runs.filter((r) => inWin(r.ts));
    const byModel = group(recs, "model");
    const byAgent = group(recs, "agent");
    const lines = git(repo, "diff", "--numstat", b.first, b.sha).split("\n").filter(Boolean).reduce((s, l) => { const [a, d] = l.split("\t"); return s + (Number(a) || 0) + (Number(d) || 0); }, 0);
    // the log is shared by every project; a window that ended before its first line has no data
    const wd = !log ? "log missing" : b.time < log.first ? "no data" : log.list.filter((d) => inWin(d.ts) && sessions.ids.has(d.session)).map(({ time, hook }) => ({ time, hook }));
    const unpriced = Object.entries(byModel).filter(([, e]) => e.usd === null).map(([m]) => `unpriced: ${m}`);
    return {
      merge: b.sha, branch: b.branch, windowStart: Number.isFinite(start) ? new Date(start).toISOString() : null, windowEnd: new Date(b.time).toISOString(), partial: start < sessions.first,
      byModel, byAgent, usd: usdOf(byModel), notes: unpriced,
      riskReviewRuns: runs.filter((r) => r.agent === "risk-review").length, reviewRounds: runs.filter((r) => r.agent === "review" || r.agent === "risk-review").length,
      commits: b.commits.length, changedLines: lines, fixCommits: fixes.length, fixOfFix, failuresAfterSeal,
      denials: wd, falseDenials: Array.isArray(wd) ? wd.filter((d) => judged.has(d.time)).length : 0,
    };
  });
}

const metrics = (r) => ({ usdPer100: r.changedLines ? (r.usd / r.changedLines) * 100 : 0, fixOfFix: r.fixOfFix, reviewRounds: r.reviewRounds, failuresAfterSeal: r.failuresAfterSeal.length });
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : 0; };
export function worseThanBaseline(rows, baseRows) {
  const base = baseRows.filter((r) => r.usd && r.changedLines).map(metrics); // a row with no cost or no changed line says nothing
  if (!base.length) return [];
  return rows.flatMap((r) => Object.entries(metrics(r)).filter(([k, v]) => v > median(base.map((m) => m[k]))).map(([k, v]) => `${r.branch}: ${k} ${v} is worse than the baseline median ${median(base.map((m) => m[k]))}`));
}

// Returns the exit code: 0 done, 2 could not run.
export function measure(argv, deps = {}) {
  const { env = process.env, home = homedir(), log = console.log, err = console.error } = deps;
  let o, pos;
  try { ({ values: o, positionals: pos } = parseArgs({ args: argv, allowPositionals: true, options: { project: { type: "string" }, baseline: { type: "string" }, sessions: { type: "string" }, out: { type: "string" }, false: { type: "string" } } })); } catch (e) { err(`measure: ${e.message}`); return 2; }
  const out = resolve(o.out ?? join(import.meta.dirname, "..", "docs", "measure", "private"));
  const judgedFile = join(out, "judged.jsonl");
  const judgedRows = () => (existsSync(judgedFile) ? jsonLines(judgedFile) : []);
  try {
    if (o.false !== undefined) {
      if (!pos[0]) { err("usage: measure.mjs --false <time> <reason>"); return 2; }
      const known = (existsSync(out) ? readdirSync(out) : []).filter((f) => f.endsWith(".jsonl") && f !== "judged.jsonl").flatMap((f) => jsonLines(join(out, f))).flatMap((r) => (Array.isArray(r.denials) ? r.denials : []));
      if (!known.some((d) => d.time === o.false)) { err(`measure: ${o.false} is not a denial of any measured row`); return 2; }
      if (!judgedRows().some((j) => j.time === o.false)) { mkdirSync(out, { recursive: true }); appendFileSync(judgedFile, JSON.stringify({ time: o.false, reason: pos[0] }) + "\n"); }
      return 0;
    }
    if (!o.project) { err("usage: measure.mjs --project <path> [--baseline <path>] [--sessions <dir>] [--out <dir>]"); return 2; }
    const project = resolve(o.project);
    // inside a measured project only its own folder, one that git ignores there
    const ignored = (p) => { try { git(p, "check-ignore", "-q", "--", join(out, "x")); return true; } catch { return false; } };
    for (const p of [project, o.baseline && resolve(o.baseline)]) if (p && (out === p || (out.startsWith(p + sep) && !ignored(p)))) { err(`measure: --out is inside ${basename(p)}; nothing is written in a measured project`); return 2; }
    const sdir = o.sessions ?? join(home, ".claude", "projects", project.replace(/[^a-zA-Z0-9]/g, "-"));
    if (!existsSync(sdir)) { err(`measure: no session folder ${sdir}`); return 2; }
    const sessions = readSessions(sdir);
    if (!sessions.records.length) { err("measure: no assistant message with an id and usage in the session files"); return 2; }
    const main = loadLenient(project).config.mainBranch;
    const rows = buildRows(project, main, sessions, denialsOf(env.XWORKFLOWS_STATE_DIR ?? tmpdir()), new Set(judgedRows().map((j) => j.time)));
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, `${basename(project)}.jsonl`), rows.map((r) => JSON.stringify(r) + "\n").join(""));
    for (const r of rows) for (const f of r.failuresAfterSeal) log(`failure after the seal: ${r.branch} came back in fix ${f.fix} of ${f.fixBatch}, from commit ${f.commit}`);
    if (o.baseline) {
      const bf = join(out, `${basename(resolve(o.baseline))}.jsonl`);
      if (!existsSync(bf)) { err(`measure: the baseline ${basename(o.baseline)} has not been measured: no ${bf}`); return 2; }
      for (const l of worseThanBaseline(rows, jsonLines(bf))) log(l);
    }
    return 0;
  } catch (e) { err(`measure: ${e.message}`); return 2; }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = measure(process.argv.slice(2));
