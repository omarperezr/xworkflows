#!/usr/bin/env node
// Adapt run file, citation check and deterministic render of research.md.
// Standalone: node: built-ins only (it is copied into projects).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
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

export function renderResearch(root, research, scan) {
  const errors = [];
  const dropped = [];
  const kinds = research.kinds || {};
  const skipped = research.skipped || {};
  const hitFiles = new Set([...Object.values(scan.kinds || {}).flatMap((k) => (k.hits || []).map((h) => h.file)), ...Object.values(scan.sql || {}).flat().map((x) => x.file)]);
  const byHeading = {};
  const add = (h, l) => ((byHeading[h] ||= []).push(l));
  const tag = (l) => `${l.text} (${l.tag})`;
  const config = [];
  const written = [];
  for (const t of Object.keys(research.topics || {}).sort()) {
    for (const l of (research.topics[t] && research.topics[t].lines) || []) {
      if (l.heading === "config") config.push(`- ${l.key ? `\`${l.key}\`: ` : ""}${tag(l)}`);
      else if (l.heading === "written") written.push(`- ${tag(l)}`);
      else add(l.heading, `- ${tag(l)}`);
    }
  }
  const blocks = [];
  for (const k of KINDS) {
    const r = kinds[k];
    if (!r) { errors.push(`${k}: agent returned nothing`); continue; }
    if (!["found", "absent", "not-present"].includes(r.status)) { errors.push(`${k}: invalid status ${JSON.stringify(r.status)}`); continue; }
    for (const p of r.notChecked || []) if (hitFiles.has(p)) errors.push(`${k}: notChecked lists ${p}, a file that matters for mechanisms`);
    if (r.status === "absent") { blocks.push(`- no rule found: ${k}`); continue; }
    if (r.status === "not-present") { blocks.push(`- ${k}: not-present${skipped[k] ? ` (skipped: ${skipped[k]})` : ""}`); continue; }
    let kept = 0;
    for (const x of r.rules || []) {
      if (verifyCitation(root, { file: x.file, line: x.line, quote: x.quote })) { kept++; blocks.push(`- ${x.rule} (code) ${x.file}:${x.line}`); }
      else dropped.push({ kind: k, file: x.file, line: x.line, quote: x.quote });
    }
    if (!kept) errors.push(`${k}: found, but no citation survived verification`);
  }
  const out = ["---", `commit: ${scan.commit}`, "---", ""];
  HEADINGS.forEach((h, i) => {
    out.push(`## ${i + 1}. ${h}`, "", ...(byHeading[i + 1] || []), ...(i === 4 ? blocks : []), "");
  });
  out.push("## Existing checks", "", ...(scan.checks || []).map((c) => `- ${c}`), "");
  out.push("## Config", "", ...config, "", "## Written down", "", ...written, "");
  if (dropped.length) out.push("## Dropped citations", "", ...dropped.map((d) => `- ${d.kind}: ${d.file}:${d.line} ${JSON.stringify(d.quote)}`), "");
  return { md: out.join("\n"), errors, dropped };
}

const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

function cli(cmd, root) {
  const dir = join(root, ".xworkflows");
  const runFile = join(dir, "adapt-run.json");
  const summary = join(dir, "summary.md");
  const prev = join(dir, "research.prev.json");
  if (cmd === "start") {
    mkdirSync(dir, { recursive: true });
    const commit = git(root, ["rev-parse", "HEAD"]);
    const status = existsSync(summary) ? (readFileSync(summary, "utf8").match(/^status:\s*(\w+)/m) || [])[1] : null;
    let old = null;
    try { old = readJson(runFile); } catch {}
    const run = status === "draft" && old ? { ...old, commit, startedAt: Date.now() }
      : { run: `${commit.slice(0, 8)}-${Date.now().toString(36)}`, commit, startedAt: Date.now(), mismatches: 0 };
    if (status === "approved" && existsSync(join(dir, "research.json"))) copyFileSync(join(dir, "research.json"), prev);
    if (!status) rmSync(prev, { force: true });
    writeFileSync(runFile, JSON.stringify(run, null, 2) + "\n");
    console.log(run.run);
  } else if (cmd === "done") {
    rmSync(runFile, { force: true });
  } else if (cmd === "render") {
    const research = readJson(join(dir, "research.json"));
    const scan = readJson(join(dir, "scan.json"));
    const { topics, kinds, skipped } = research;
    if (research.sum !== sum(JSON.stringify({ topics, kinds, skipped }))) {
      let n = 1;
      try { const r = readJson(runFile); n = (r.mismatches || 0) + 1; writeFileSync(runFile, JSON.stringify({ ...r, mismatches: n }, null, 2) + "\n"); } catch {}
      console.error(n >= 2 ? STOP : "research.json was altered after the Workflow returned it: rerun the Workflow and write its result unchanged.");
      process.exit(1);
    }
    const { md, errors } = renderResearch(root, research, scan);
    if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
    writeFileSync(join(dir, "research.md"), md);
  } else {
    console.error("usage: research.mjs start|done|render");
    process.exit(2);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let root = process.cwd();
  try { root = git(root, ["rev-parse", "--show-toplevel"]); } catch {}
  cli(process.argv[2], root);
}
