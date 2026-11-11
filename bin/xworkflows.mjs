#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
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
  die(1, "not built yet");
}

main(process.argv.slice(2));
