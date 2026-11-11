#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PKG = dirname(dirname(fileURLToPath(import.meta.url)));
export let ROOT;

const COMMANDS = ["install", "doctor", "uninstall", "pack"];
const BOOL = ["--yes", "--dry-run", "--check"];

export const hash = (text) => createHash("sha256").update(text.replaceAll("\r\n", "\n")).digest("hex");
export const digest = (files) =>
  hash(Object.keys(files).sort().map((p) => `${p} ${files[p]}\n`).join(""));
export const readManifest = () => JSON.parse(readFileSync(join(PKG, "manifest.json"), "utf8"));

const KEYS = ["id", "kind", "origin", "source", "version", "license", "modified", "scope", "tools", "claude", "files", "sha256"];

function pack(check) {
  const m = readManifest();
  const pkgVersion = JSON.parse(readFileSync(join(PKG, "package.json"), "utf8")).version;
  const errs = [];
  const listed = new Set();
  const pieces = m.pieces.map((p) => {
    const q = { ...p };
    if (q.origin === "own") q.version = pkgVersion;
    if (!q.version) errs.push(`${q.id}: no version`);
    if (!q.license) errs.push(`${q.id}: no license`);
    q.files = {};
    for (const f of Object.keys(p.files)) {
      listed.add(f);
      try {
        q.files[f] = hash(readFileSync(join(PKG, f), "utf8"));
      } catch {
        errs.push(`${f}: listed but missing`);
      }
    }
    q.sha256 = digest(q.files);
    return Object.fromEntries(KEYS.filter((k) => q[k] !== undefined).map((k) => [k, q[k]]));
  });
  const tracked = execFileSync("git", ["ls-files", "skills", "agents", "hooks"], { cwd: PKG, encoding: "utf8" }).split("\n").filter(Boolean);
  for (const f of tracked) {
    if (f.endsWith(".test.mjs") || f.startsWith("hooks/fixtures/") || listed.has(f)) continue;
    errs.push(`${f} belongs to no piece`);
  }
  if (errs.length) die(1, errs.join("\n"));
  const out = JSON.stringify({ name: m.name, version: pkgVersion, pieces }, null, 2) + "\n";
  const cur = readFileSync(join(PKG, "manifest.json"), "utf8");
  if (out === cur) return;
  if (check) die(1, "manifest.json is stale: run xworkflows pack");
  writeFileSync(join(PKG, "manifest.json"), out);
}

function die(code, msg) {
  process.stderr.write(msg + "\n");
  process.exit(code);
}

function parse(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--tool") {
      if (i + 1 >= args.length) die(2, "--tool needs a value");
      flags.tool = args[++i];
    } else if (BOOL.includes(a)) flags[a.slice(2)] = true;
    else die(2, `unknown flag: ${a}`);
  }
  return flags;
}

export function main(argv) {
  const [cmd, ...rest] = argv;
  if (!COMMANDS.includes(cmd)) die(2, `usage: xworkflows <${COMMANDS.join("|")}> [--tool claude] [--yes] [--dry-run]`);
  const flags = parse(rest);
  if (flags.check && cmd !== "pack") die(2, "--check is for pack only");
  if (flags.tool && flags.tool !== "claude") die(2, `not yet: ${flags.tool} comes in a later phase`);
  if (cmd === "pack") return pack(flags.check);
  try {
    ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    die(1, "not inside a git repository");
  }
  if (cmd === "install") return install(flags);
  die(1, "not built yet");
}

const EMPTY = { xworkflows: "", tools: ["claude"], pieces: {}, files: {}, merged: [], blocks: [], imports: [], created: [], declined: [], kept: [], renamed: {} };
const json = (v) => JSON.stringify(v, null, 2) + "\n";

function target(f) {
  if (f === "hooks/mark.mjs") return ".xworkflows/mark.mjs";
  if (f.startsWith("skills/")) return ".claude/" + f;
  if (f.startsWith("agents/")) return ".claude/" + f;
  if (f.startsWith("hooks/adapters/")) return f === "hooks/adapters/claude.mjs" ? ".xworkflows/" + f : null;
  return ".xworkflows/" + f;
}

// Reads and parses every target file before any write (ruling P2); Tasks 4-5 add settings.json, CLAUDE.md, AGENTS.md here.
export function plan(manifest, root, record) {
  const tiers = readFileSync(join(PKG, "tiers.json"), "utf8");
  const writes = [{ path: ".xworkflows/tiers.json", text: tiers, piece: "installer" }];
  for (const p of manifest.pieces) {
    for (const f of Object.keys(p.files)) {
      const t = target(f);
      if (!t) continue;
      let text = readFileSync(join(PKG, f), "utf8");
      if (f.startsWith("agents/")) {
        text = text.replace(/^tier: (\w+)$/m, (_, k) => `model: ${JSON.parse(tiers).claude[k]}`);
      }
      writes.push({ path: t, text, piece: p.id });
    }
  }
  return { writes, merges: [], questions: [] };
}

const differs = (root, w) => !existsSync(join(root, w.path)) || readFileSync(join(root, w.path), "utf8") !== w.text;
const put = (root, path, text) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};

export function apply(pl, root, manifest, record) {
  const out = [];
  for (const w of pl.writes) if (differs(root, w)) { put(root, w.path, w.text); out.push(w.path); }
  // merges (Task 4) go here, before the record
  const next = { ...record, xworkflows: manifest.version, tools: ["claude"], pieces: {}, files: {} };
  for (const p of manifest.pieces) next.pieces[p.id] = { version: p.version, sha256: p.sha256 };
  for (const w of pl.writes) next.files[w.path] = { piece: w.piece, sha256: hash(w.text) };
  const text = json(next);
  const rp = ".xworkflows/installed.json";
  if (!existsSync(join(root, rp)) || readFileSync(join(root, rp), "utf8") !== text) { put(root, rp, text); out.push(rp); }
  return out;
}

function install(flags) {
  const m = readManifest();
  for (const p of m.pieces) {
    for (const [f, h] of Object.entries(p.files)) {
      if (hash(readFileSync(join(PKG, f), "utf8")) !== h) die(1, `package file changed: ${f}; run pack`);
    }
  }
  let record = { ...EMPTY };
  const rp = join(ROOT, ".xworkflows/installed.json");
  if (existsSync(rp)) {
    try {
      record = { ...EMPTY, ...JSON.parse(readFileSync(rp, "utf8")) };
    } catch {
      die(1, ".xworkflows/installed.json does not parse; fix or remove it");
    }
  }
  const pl = plan(m, ROOT, record);
  if (flags["dry-run"]) {
    for (const w of pl.writes) if (differs(ROOT, w)) console.log(`would write ${w.path}`);
    return;
  }
  const done = apply(pl, ROOT, m, record);
  console.log(done.length ? done.join("\n") : "nothing to do");
  console.log("Next: open Claude Code and type /adapt");
}

main(process.argv.slice(2));
