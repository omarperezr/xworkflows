#!/usr/bin/env node
// No-LLM scan of a repository for evidence of twelve kinds of code mechanisms.
// Standalone: node: built-ins only (it is copied into projects).
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync, appendFileSync, mkdirSync, lstatSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { pathToFileURL } from "node:url";

const CODE = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts", ".py", ".sql"];
// Zones count the bytes of any common source language; signals run on CODE only.
const SRC = [...CODE, ".go", ".rs", ".java", ".kt", ".rb", ".php", ".cs", ".swift", ".vue", ".svelte", ".dart", ".ex", ".scala", ".c", ".cc", ".cpp", ".h"];
const E = (re, example, counter, ext = CODE) => ({ re, ext, example, counter });
// shortcut: regex signals are single-line (a loop and its query on two lines are missed), upgrade when a kind needs multi-line evidence.
export const KINDS = [
  { key: "values", name: "source of truth, units and precision", signals: [
    E(/\.toFixed\(|\bround\(|\bDecimal\(/i, "price.toFixed(2)", "// round trip to the server"),
    E(/\b\w*(money|cents)\w*\(/i, "toCents(price)", "const monkey = money;"),
    E(/\b(convert|to|from)_?units?\(/i, "convertUnit(x, 'kg')", "const unit = 1;"),
    E(/\bat time zone\b|\btime_?zone\w*\s*[:=]|\bcurrency(_code)?\s*(=\s*["']|text\b|char|varchar)|\bunit_(price|cost|of)\w*/i, "created_at at time zone 'utc'", "const community = 1;") ] },
  { key: "snap", name: "values frozen when a record is written", signals: [
    E(/\b\w+_at_(sale|purchase|order|checkout|invoice)\b|\bnew\.(?!(updated|modified|created)_)\w+\s*:=\s*(\w+\.\w+|\(\s*select\b)/i, "new.unit_price := p.price;", "select renewal from plan;") ] },
  { key: "srvw", name: "data written only through server functions", signals: [
    E(/\.rpc\(|\.from\(\s*["']\w+["']\s*\)\s*\.(insert|update|delete|upsert)\(/, "await db.rpc(\"make\", {})", "db.from(\"item\").select(\"*\")"),
    E(/\bcreate\s+(or\s+replace\s+)?function\s+[\w."]*\b(create|make|add|insert|update|delete|remove|set|record|apply|register|cancel|submit)_\w*|\bsecurity definer\b|\b(app|router)\.(post|put|patch|delete)\(|@(app|router)\.(post|put|patch|delete)\b/i, "create or replace function make_item()", "-- a function of time") ] },
  { key: "delta", name: "changes as deltas, never absolute values", signals: [
    E(/\bset\s+(\w+)\s*=\s*\1\s*[+-]|\.increment\(|\bF\(\s*["']\w+["']\s*\)\s*[+-]|\b(\w+)\s*=\s*\2\s*[+-]\s*:\w+/i, "set stock = stock - 1", "i = i + 1") ] },
  { key: "idem", name: "retried or offline writes applied once", signals: [
    E(/\bon conflict\b.*\bdo nothing\b|idempotency[_-]?key|\boutbox\b/i, "on conflict (id) do nothing", "# a merge conflict in git"),
    E(/\bunique\b.*\b(request|idempotency|event)_?id\b|\b(request|idempotency|event)_?id\b.*\bunique\b/i, "request_id text unique", "# a unique name"),
    E(/\benqueue\w*\(/i, "enqueue(job)", "const queued = 1;") ] },
  { key: "txn", name: "a multi-row action is one transaction", signals: [
    E(/^\s*(begin|start transaction)\s*;|[.$]transaction\(|transaction\.atomic/i, "with transaction.atomic():", "// transactions are explained in the docs") ] },
  { key: "access", name: "access checked by the database or server", signals: [
    E(/enable row level security|\bcreate policy\b|\braise exception\b.*\b(permission|not allowed|forbidden|denied|unauthori[sz]ed|access|role|admin|owner)|\brequire_?auth\w*\(|\bcheck_?permission\w*\(/i, "alter table t enable row level security;", "-- see the policy document") ] },
  { key: "batch", name: "work over many rows done once", signals: [
    E(/\.map\(\s*async\b|\bfor\s*\([^)]*\)\s*\{?\s*await\s+[\w.]+\.(query|execute|insert|update|delete|rpc|save|create)\w*\(|\bfor\b.*:\s*\w+\.(execute|query)\(/, "ids.map(async (i) => q(i))", "for (const x of xs) { total += x; }"),
    E(/\bfor\s+\w+\s+in\b.*\bloop\b/i, "for r in select id from t loop", "for r in select id from t") ] },
  { key: "domain", name: "legal, tax or domain rules", signals: [
    E(/\b(tax(es)?|vat|gdpr|by law|legally)\b/i, "Tax rules by law", "Notes on the project.", [".md"]),
    E(/\b(tax|vat)[_ ]?rate\b|\b(TAX|VAT)_[A-Z_]+\b/i, "TAX_RATE = 0.2", "const taxi = 1;") ] },
  { key: "compat", name: "what must not break for those who use it", signals: [
    E(/\bdeprecated\b|schema_?version|format_?version|\bAPI_VERSION\b/i, "SCHEMA_VERSION = 3", "# the version of node we use"),
    E(/\b__all__\s*=|\bmodule\.exports\s*=\s*\{|^\s*export\s*\{/, "module.exports = { run };", "const exports2 = 1;"),
    E(/\bchangelog\b|\bbreaking changes?\b/i, "Update the CHANGELOG", "# a log of changes", [...CODE, ".md"]),
    E(/\b__version__\b|\bversion\s*=\s*["']\d+\.\d+/, "__version__ = \"1.2\"", "# the version of node we use") ] },
  { key: "conc", name: "concurrency and order", signals: [
    E(/\bselect\b.*\bfor (no key )?update\b|\bpg_advisory\w*\(|\bmutex\b|\bLock\(|\.lock\(/i, "lock = threading.Lock()", "const clock = now();"),
    E(/\.consume\(/i, "queue.consume(handle)", "const consumed = 1;"),
    E(/\b(version|seq|sequence)\s+(int|integer|bigint|serial|bigserial)\b|\bnextval\(|\bcreate sequence\b/i, "version int not null", "-- the version of the docs") ] },
  { key: "input", name: "validation of outside input", signals: [
    E(/\bz\.object\(|\bjoi\.|\.safeParse\(|\bBaseModel\b|\bsanitize\w*\(|\bvalidate\w*\(/i, "class Req(BaseModel):", "# validation is hard"),
    E(/\b(req|request)\.(user|session|auth)\b|\bis_authenticated\b|\blogin_required\b|\bpermission_required\b/i, "if not request.user.is_authenticated:", "# the user guide") ] },
];

const DIRS = ["node_modules", "dist", "build", "vendor"]; // also written to .graphifyignore
const SILENT = ["graphify-out", ".xworkflows", ".git"];
const LOCK = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|Gemfile\.lock|composer\.lock|go\.sum)$/;
const TESTS = /(^|\/)(tests?|__tests__|specs?|e2e|cypress|playwright)\/|\.(test|spec)\.[^/]+$|(^|\/)test_[^/]+\.py$|_test\.[^/]+$|(^|\/)conftest\.py$/;
const CHECKS = /(^|\/)scripts\/check-|(^|\/)\.semgrep|(^|\/)(\.eslintrc[^/]*|eslint\.config\.[^/]*|ruff\.toml|\.flake8)$|^\.github\/workflows\/|^\.gitlab-ci\.yml$|^\.circleci\/|(^|\/)Jenkinsfile$|(^|\/)\.pre-commit-config\.yaml$/;
const MAX_HITS = 30, PER_FILE = 3;

const gitOut = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 28 });

function walk(root, rel = "") {
  return readdirSync(join(root, rel), { withFileTypes: true }).flatMap((e) => {
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.name === ".git" || e.name === "node_modules") return [];
    return e.isDirectory() ? walk(root, p) : e.isFile() ? [p] : [];
  });
}

const kindOf = (p) => { try { return lstatSync(p); } catch { return null; } };
export const isFile = (p) => !!kindOf(p)?.isFile();

// The output folder must not be a symlink: scan.json and rules.json would land in its target.
export function outDir(root) {
  const d = join(root, ".xworkflows");
  if (kindOf(d)?.isSymbolicLink()) { console.error(`${d} is a symlink; refusing to write through it`); process.exit(1); }
  mkdirSync(d, { recursive: true });
}

const readLines = (p) => (isFile(p) ? readFileSync(p, "utf8").split("\n").map((l) => l.trim()).filter(Boolean) : []);

const keyOf = (p) => p.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "zone";

// Zones by the fixed rule of spec 4.4. A "<dir>/*" entry is the files directly in <dir>, "*" the root files.
export function proposeZones(layout) {
  const by = new Map(layout.map((e) => [e.path, e.bytes]));
  const top = layout.filter((e) => !e.path.includes("/"));
  const total = top.reduce((n, e) => n + e.bytes, 0);
  const kids = (p) => layout.filter((e) => e.path.startsWith(p + "/") && e.path.split("/").length === 2 + p.split("/").length - 1);
  const mk = (p, bytes) => ({ paths: [p], bytes });
  const split = (z) => { const k = kids(z.paths[0]); return k.length > 1 ? k.map((e) => mk(e.path, e.bytes)) : [z]; };
  let zs = top.flatMap((e) => (e.bytes > 0.4 * total || e.bytes > 6e6 ? split(mk(e.path, e.bytes)) : [mk(e.path, e.bytes)]));
  const small = zs.filter((z) => z.bytes < 0.02 * total);
  zs = zs.filter((z) => !small.includes(z));
  const common = (a, b) => { const x = a.split("/"), y = b.split("/"); let n = 0; while (n < x.length && x[n] === y[n]) n++; return n; };
  for (const sm of small) {
    let best = null, n = 0;
    for (const z of zs) { const c = common(sm.paths[0], z.paths[0]); if (c > n) { n = c; best = z; } }
    if (!best) { best = zs.find((z) => z.other) || (zs.push({ paths: [], bytes: 0, other: true }), zs[zs.length - 1]); }
    best.paths.push(...sm.paths); best.bytes += sm.bytes;
  }
  const bySize = () => zs.sort((a, b) => a.bytes - b.bytes || (a.paths[0] < b.paths[0] ? -1 : 1));
  if (zs.length < 3 && zs.length) { bySize(); const big = zs.pop(); zs.push(...(big.paths.length === 1 ? split(big) : [big])); }
  while (zs.length > 6) { bySize(); const [a, b] = zs.splice(0, 2); zs.push({ paths: [...a.paths, ...b.paths].sort(), bytes: a.bytes + b.bytes, other: a.other || b.other, keyFrom: b }); }
  const used = new Set();
  return zs.map((z) => {
    let k = z.other ? "other" : keyOf((z.keyFrom || z).paths[0].replace(/^\*$/, "root")), n = 2;
    for (const base = k; used.has(k); n++) k = `${base}-${n}`;
    used.add(k);
    return { key: k, paths: [...z.paths].sort(), bytes: z.bytes };
  }).sort((a, b) => (a.key < b.key ? -1 : 1));
}

// Statements split on ";" outside comments, quotes and dollar-quoted bodies; each keeps the line it starts on.
function statements(text) {
  const out = [], n = text.length;
  let cur = "", start = 1, line = 1, i = 0;
  const take = (piece) => {
    const nl = (piece.match(/\n/g) || []).length;
    if (!cur && !/\S/.test(piece)) { line += nl; return; }
    if (!cur) start = line;
    cur += piece; line += nl;
  };
  while (i < n) {
    const c = text[i];
    let end = i + 1;
    if (text.startsWith("--", i)) { const e = text.indexOf("\n", i); i = e < 0 ? n : e; continue; }
    if (text.startsWith("/*", i)) { const e = text.indexOf("*/", i + 2); end = e < 0 ? n : e + 2; take(cur ? "\n".repeat((text.slice(i, end).match(/\n/g) || []).length) + " " : ""); if (!cur) line += (text.slice(i, end).match(/\n/g) || []).length; i = end; continue; }
    if (c === "'" || c === '"') { let j = i + 1; while (j < n) { if (text[j] === c) { if (text[j + 1] === c) { j += 2; continue; } break; } j++; } end = Math.min(j + 1, n); }
    else if (c === "$") { const re = /\$(?:[A-Za-z_]\w*)?\$/y; re.lastIndex = i; const m = re.exec(text); if (m) { const e = text.indexOf(m[0], i + m[0].length); end = e < 0 ? n : e + m[0].length; } }
    take(text.slice(i, end));
    i = end;
    if (c === ";") { out.push({ text: cur, line: start }); cur = ""; }
  }
  if (cur.trim()) out.push({ text: cur, line: start });
  return out;
}

// Last definition wins by name. Regex over whole statements, not a SQL parser.
export function sqlInventory(files) {
  const m = { triggers: new Map(), policies: new Map(), definers: new Map(), uniques: new Map(), checks: new Map() };
  const strip = (n) => n.replace(/^"|"$/g, "");
  const set = (k, name, file, line) => m[k].set(name, { name, file, line });
  const on = (name, table) => strip(name) + (table ? ` on ${strip(table)}` : "");
  for (const { path, text } of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    if (!/migration|\.sql$/i.test(path)) continue;
    for (const { text: st, line } of statements(text)) {
      let x;
      if ((x = /^create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+("[^"]+"|[\w.]+)(?:[\s\S]*?\s+on\s+([\w."]+))?/i.exec(st))) set("triggers", on(x[1], x[2]), path, line);
      else if ((x = /^create\s+policy\s+("[^"]+"|[\w.]+)(?:\s+on\s+([\w."]+))?/i.exec(st))) set("policies", on(x[1], x[2]), path, line);
      else if ((x = /^create\s+(?:or\s+replace\s+)?function\s+([\w."]+)/i.exec(st))) { const name = strip(x[1]); m.definers.delete(name); if (/security\s+definer/i.test(st)) set("definers", name, path, line); }
      else if ((x = /^alter\s+function\s+([\w."]+)[\s\S]*security\s+definer/i.exec(st))) set("definers", strip(x[1]), path, line);
      else if ((x = /^create\s+unique\s+index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?([\w."]+)/i.exec(st))) set("uniques", strip(x[1]), path, line);
      for (const c of st.matchAll(/constraint\s+([\w."]+)\s+(unique\b|check\s*\()/gi)) set(c[2][0].toLowerCase() === "u" ? "uniques" : "checks", strip(c[1]), path, line + (st.slice(0, c.index).match(/\n/g) || []).length);
    }
  }
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [...v.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))]));
}

// Files the scan looks at, with the ones dropped (generated by name) and the change count per file.
export function projectFiles(root) {
  let files, hasGit = true;
  try { files = gitOut(root, ["ls-files", "-z"]).split("\0").filter(Boolean); } catch { hasGit = false; files = walk(root); } // root may be a subfolder of a repository
  files = [...new Set(files)].sort();

  let commit = "", churn = new Map();
  if (hasGit) {
    try {
      commit = gitOut(root, ["rev-parse", "HEAD"]).trim();
      for (const f of gitOut(root, ["-c", "core.quotepath=false", "log", "--relative", "-n", "500", "--name-only", "--format=", "HEAD"]).split("\n")) if (f) churn.set(f, (churn.get(f) || 0) + 1);
    } catch { /* no commits yet */ }
  }

  const ignorePath = join(root, ".graphifyignore");
  const owner = readLines(ignorePath).filter((l) => !l.startsWith("#")).map((l) => l.replace(/^\//, ""));
  const ignored = (p) => owner.some((l) => (l.startsWith("*.") ? p.endsWith(l.slice(1)) : p.startsWith(l))); // shortcut: .graphifyignore read as prefixes and *.ext only, upgrade to full gitignore syntax if a project needs it
  let rec = {};
  try { rec = JSON.parse(readFileSync(join(root, ".xworkflows/installed.json"), "utf8")); } catch { /* not installed */ }
  const installed = new Set([...Object.keys(rec.files || {}), ...(rec.created || [])]);

  const dropped = new Set(), kept = [];
  for (const p of files) {
    const segs = p.split("/");
    const dirAt = segs.slice(0, -1).findIndex((s) => DIRS.includes(s));
    if (p === ".graphifyignore" || segs.some((s) => SILENT.includes(s)) || installed.has(p) || ignored(p)) continue;
    if (LOCK.test(p) || /\.min\./.test(p)) { dropped.add(p); continue; }
    if (dirAt >= 0) { dropped.add(segs.slice(0, dirAt + 1).join("/") + "/"); continue; }
    kept.push(p);
  }

  return { kept, dropped, churn, commit, ignorePath };
}

export function scan(root) {
  const { kept, dropped, churn, commit, ignorePath } = projectFiles(root);
  const checks = [];
  const text = new Map(), layoutBytes = new Map();
  const live = [];
  for (const p of kept) {
    let buf;
    if (!isFile(join(root, p))) continue; // tracked symlinks and pipes are not read
    try { buf = readFileSync(join(root, p)); } catch { continue; }
    if (buf.subarray(0, 8000).includes(0)) continue; // binary
    const s = buf.length <= 1 << 20 ? buf.toString("utf8") : "";
    const first = s.slice(0, s.indexOf("\n") < 0 ? undefined : s.indexOf("\n"));
    if (/@generated|DO NOT EDIT/.test(first)) { dropped.add(p); continue; }
    live.push(p);
    text.set(p, s);
    if (!SRC.includes(extname(p)) || CHECKS.test(p)) continue; // zones count source bytes only
    // layout keys: folders at depth 1 and 2, "*" for root files, "<dir>/*" for files directly in a depth-1 folder; a path is in one zone at most
    const segs = p.split("/");
    const keys = [segs.length === 1 ? "*" : segs[0], ...(segs.length > 2 ? [segs.slice(0, 2).join("/")] : segs.length === 2 ? [`${segs[0]}/*`] : [])];
    for (const k of keys) layoutBytes.set(k, (layoutBytes.get(k) || 0) + buf.length);
  }

  const kinds = {};
  for (const k of KINDS) kinds[k.key] = { hits: [], total: 0 };
  for (const p of live) {
    if (CHECKS.test(p)) { checks.push(p); continue; }
    if (TESTS.test(p)) continue; // mechanisms are about the app, not its tests
    const ext = extname(p);
    const lines = text.get(p).split("\n");
    for (const k of KINDS) {
      const sigs = k.signals.filter((s) => s.ext.includes(ext));
      if (!sigs.length) continue;
      lines.forEach((l, i) => {
        if (sigs.some((s) => s.re.test(l))) { kinds[k.key].total++; kinds[k.key].hits.push({ file: p, line: i + 1, text: l.trim().slice(0, 160) }); }
      });
    }
  }
  // Files the project's written rules name per kind: a rule's own file when its kinds include the kind, plus repo paths quoted in its text.
  let rules = [];
  try { rules = JSON.parse(readFileSync(join(root, ".xworkflows/rules.json"), "utf8")).rules || []; } catch { /* no rules yet */ }
  const known = new Set(live);
  const named = Object.fromEntries(KINDS.map((k) => [k.key, new Set()]));
  for (const r of rules) {
    const quoted = (String(r.text).match(/[\w@.-]+(?:\/[\w@.-]+)*/g) || []).map((t) => t.replace(/\.+$/, "")).filter((t) => known.has(t));
    for (const k of r.kinds || []) if (named[k]) for (const p of [r.file, ...quoted]) if (p) named[k].add(p);
  }
  const c = (f) => churn.get(f) || 0;
  for (const k of KINDS) kinds[k.key].ruleFiles = [...named[k.key]].sort();
  for (const k of KINDS) kinds[k.key].hits = kinds[k.key].hits.sort((a, b) => named[k.key].has(b.file) - named[k.key].has(a.file) || c(b.file) - c(a.file) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || a.line - b.line);
  // At most PER_FILE hits per file so one file cannot fill the 30; hits are already in order.
  for (const k of KINDS) {
    const n = new Map(), all = kinds[k.key].hits;
    kinds[k.key].files = new Set(all.map((h) => h.file)).size;
    kinds[k.key].hits = all.filter((h) => { const m = (n.get(h.file) || 0) + 1; n.set(h.file, m); return m <= PER_FILE; }).slice(0, MAX_HITS);
  }

  const lines = readLines(ignorePath);
  const add = [...dropped].sort().filter((l) => !lines.includes(l));
  const st = kindOf(ignorePath);
  if (add.length && (!st || st.isFile())) appendFileSync(ignorePath, (st && st.size && !readFileSync(ignorePath, "utf8").endsWith("\n") ? "\n" : "") + add.join("\n") + "\n");

  const layout = [...layoutBytes].map(([path, bytes]) => ({ path, bytes })).sort((a, b) => (a.path < b.path ? -1 : 1));
  const sqlFiles = live.filter((p) => /migration|\.sql$/i.test(p)).map((path) => ({ path, text: text.get(path) }));
  return {
    commit,
    layout,
    zones: proposeZones(layout),
    kinds,
    sql: sqlInventory(sqlFiles),
    checks: checks.sort(),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.argv[2] || ".";
  const s = scan(root);
  outDir(root);
  writeFileSync(join(root, ".xworkflows/scan.json"), JSON.stringify(s, null, 2) + "\n");
  for (const k of KINDS) console.log(`${k.key}: ${s.kinds[k.key].total}`);
}
