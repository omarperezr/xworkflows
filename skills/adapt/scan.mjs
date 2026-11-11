#!/usr/bin/env node
// No-LLM scan of a repository for evidence of twelve kinds of code mechanisms.
// Standalone: node: built-ins only (it is copied into projects).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { pathToFileURL } from "node:url";

const CODE = [".js", ".ts", ".mjs", ".py", ".sql"];
const E = (re, example, counter, ext = CODE) => ({ re, ext, example, counter });
// shortcut: regex signals are single-line (a loop and its query on two lines are missed), upgrade when a kind needs multi-line evidence.
export const KINDS = [
  { key: "values", name: "source of truth, units and precision", signals: [
    E(/\.toFixed\(|\bround\(|\bDecimal\(/i, "price.toFixed(2)", "// round trip to the server") ] },
  { key: "snap", name: "values frozen when a record is written", signals: [
    E(/\b\w+_at_sale\b|\bnew\.\w+\s*:?=/i, "new.unit_price := p.price;", "select renewal from plan;") ] },
  { key: "srvw", name: "data written only through server functions", signals: [
    E(/\.rpc\(|\.from\(\s*["']\w+["']\s*\)\s*\.(insert|update|delete|upsert)\(/, "await db.rpc(\"make\", {})", "db.from(\"item\").select(\"*\")") ] },
  { key: "delta", name: "changes as deltas, never absolute values", signals: [
    E(/\b(\w+)\s*=\s*\1\s*[+-]\s*[\w:]/, "set stock = stock - 1", "set stock = 5") ] },
  { key: "idem", name: "retried or offline writes applied once", signals: [
    E(/\bon conflict\b|idempotency[_-]?key|\boutbox\b/i, "on conflict (id) do nothing", "# a merge conflict in git") ] },
  { key: "txn", name: "a multi-row action is one transaction", signals: [
    E(/^\s*begin\s*;|\btransaction\s*\(|transaction\.atomic/i, "with transaction.atomic():", "// transactions are explained in the docs") ] },
  { key: "access", name: "access checked by the database or server", signals: [
    E(/enable row level security|\bcreate policy\b|\braise exception\b|\brequire_?auth\w*\(|\bcheck_?permission\w*\(/i, "alter table t enable row level security;", "-- see the policy document") ] },
  { key: "batch", name: "work over many rows done once", signals: [
    E(/\.map\(\s*async\b|\bfor\s*\([^)]*\)\s*\{?\s*await\b|\bfor\b.*:\s*\w+\.(execute|query)\(/, "ids.map(async (i) => q(i))", "for (const x of xs) { total += x; }"),
    E(/\bfor\s+\w+\s+in\b.*\bloop\b/i, "for r in select id from t loop", "for r in select id from t") ] },
  { key: "domain", name: "legal, tax or domain rules", signals: [
    E(/\b(tax|vat)[_ ]?rate\b|\b(TAX|VAT)_[A-Z_]+\b|\bregulations?\b/i, "TAX_RATE = 0.2", "const taxi = 1;") ] },
  { key: "compat", name: "what must not break for those who use it", signals: [
    E(/\bdeprecated\b|schema_?version|format_?version|\bAPI_VERSION\b/i, "SCHEMA_VERSION = 3", "# the version of node we use") ] },
  { key: "conc", name: "concurrency and order", signals: [
    E(/\bfor update\b|\bpg_advisory\w*\(|\bmutex\b|\bLock\(|\.lock\(/i, "lock = threading.Lock()", "const clock = now();") ] },
  { key: "input", name: "validation of outside input", signals: [
    E(/\bz\.object\(|\bjoi\.|\.safeParse\(|\bBaseModel\b|\bsanitize\w*\(|\bvalidate\w*\(/i, "class Req(BaseModel):", "# validation is hard") ] },
];

const DIRS = ["node_modules", "dist", "build", "vendor"]; // also written to .graphifyignore
const SILENT = ["graphify-out", ".xworkflows", ".git"];
const LOCK = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|Gemfile\.lock|composer\.lock|go\.sum)$/;
const CHECKS = /(^|\/)scripts\/check-|(^|\/)\.semgrep|(^|\/)(\.eslintrc[^/]*|eslint\.config\.[^/]*|ruff\.toml|\.flake8)$|^\.github\/workflows\//;
const MAX_HITS = 30;

const gitOut = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 28 });

function walk(root, rel = "") {
  return readdirSync(join(root, rel), { withFileTypes: true }).flatMap((e) => {
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.name === ".git" || e.name === "node_modules") return [];
    return e.isDirectory() ? walk(root, p) : e.isFile() ? [p] : [];
  });
}

const readLines = (p) => (existsSync(p) ? readFileSync(p, "utf8").split("\n").map((l) => l.trim()).filter(Boolean) : []);

export function scan(root) {
  const hasGit = existsSync(join(root, ".git"));
  let files = hasGit ? gitOut(root, ["ls-files", "-z"]).split("\0").filter(Boolean) : walk(root);
  files = [...new Set(files)].sort();

  let commit = "", churn = new Map();
  if (hasGit) {
    try {
      commit = gitOut(root, ["rev-parse", "HEAD"]).trim();
      for (const f of gitOut(root, ["log", "-n", "500", "--name-only", "--format=", "HEAD"]).split("\n")) if (f) churn.set(f, (churn.get(f) || 0) + 1);
    } catch { /* no commits yet */ }
  }

  const ignorePath = join(root, ".graphifyignore");
  const owner = readLines(ignorePath).filter((l) => !l.startsWith("#")).map((l) => l.replace(/^\//, ""));
  const ignored = (p) => owner.some((l) => (l.startsWith("*.") ? p.endsWith(l.slice(1)) : p.startsWith(l))); // shortcut: .graphifyignore read as prefixes and *.ext only, upgrade to full gitignore syntax if a project needs it
  let rec = {};
  try { rec = JSON.parse(readFileSync(join(root, ".xworkflows/installed.json"), "utf8")); } catch { /* not installed */ }
  const installed = new Set([...Object.keys(rec.files || {}), ...(rec.created || [])]);

  const dropped = new Set(), kept = [], checks = [];
  for (const p of files) {
    const segs = p.split("/");
    const dirAt = segs.slice(0, -1).findIndex((s) => DIRS.includes(s));
    if (p === ".graphifyignore" || segs.some((s) => SILENT.includes(s)) || installed.has(p) || LOCK.test(p) || /\.min\./.test(p) || ignored(p)) continue;
    if (dirAt >= 0) { dropped.add(segs.slice(0, dirAt + 1).join("/") + "/"); continue; }
    kept.push(p);
  }

  const text = new Map(), layoutBytes = new Map();
  const live = [];
  for (const p of kept) {
    let buf;
    try { buf = readFileSync(join(root, p)); } catch { continue; }
    if (buf.length <= 1 << 20 && buf.subarray(0, 8000).includes(0)) continue; // binary
    const s = buf.length <= 1 << 20 ? buf.toString("utf8") : "";
    const first = s.slice(0, s.indexOf("\n") < 0 ? undefined : s.indexOf("\n"));
    if (/@generated|DO NOT EDIT/.test(first)) { dropped.add(p); continue; }
    live.push(p);
    text.set(p, s);
    const segs = p.split("/");
    for (const d of [1, 2]) if (segs.length > d) { const k = segs.slice(0, d).join("/"); layoutBytes.set(k, (layoutBytes.get(k) || 0) + buf.length); }
  }

  const kinds = {};
  for (const k of KINDS) kinds[k.key] = { hits: [], total: 0 };
  for (const p of live) {
    if (CHECKS.test(p)) { checks.push(p); continue; }
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
  const c = (f) => churn.get(f) || 0;
  for (const k of KINDS) kinds[k.key].hits = kinds[k.key].hits.sort((a, b) => c(b.file) - c(a.file) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || a.line - b.line).slice(0, MAX_HITS);

  const lines = readLines(ignorePath);
  const next = [...new Set([...lines, ...[...dropped].sort()])];
  if (next.length !== lines.length) writeFileSync(ignorePath, next.join("\n") + "\n");

  return {
    commit,
    layout: [...layoutBytes].map(([path, bytes]) => ({ path, bytes })).sort((a, b) => (a.path < b.path ? -1 : 1)),
    zones: [], // T3: proposeZones
    kinds,
    sql: { triggers: [], policies: [], definers: [], uniques: [], checks: [] }, // T3: sqlInventory
    checks: checks.sort(),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.argv[2] || ".";
  const s = scan(root);
  mkdirSync(join(root, ".xworkflows"), { recursive: true });
  writeFileSync(join(root, ".xworkflows/scan.json"), JSON.stringify(s, null, 2) + "\n");
  for (const k of KINDS) console.log(`${k.key}: ${s.kinds[k.key].total}`);
}
