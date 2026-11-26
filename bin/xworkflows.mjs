#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { accessSync, chmodSync, constants, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, normalize, posix, relative, resolve, sep } from "node:path";
import { modelsIn } from "../hooks/core/memory-job.mjs";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DEFAULTS, PROJECT_KEYS, inPaths, load as loadConfig, memoryFolder, missing, pluginOn } from "../hooks/core/config.mjs";

export const PKG = dirname(dirname(fileURLToPath(import.meta.url)));
export let ROOT;

// a config value in a command doctor prints: plain stays as it is, anything else in single quotes
const sh = (v) => (/^[\w\/.-]+$/.test(v) ? v : `'${v.replaceAll("'", "'\\''")}'`);
const COMMANDS = ["install", "doctor", "uninstall", "pack", "check"];
const BOOL = ["--yes", "--dry-run", "--check"];

export const hash = (text) => createHash("sha256").update(text.replaceAll("\r\n", "\n")).digest("hex");
export const digest = (files) =>
  hash(Object.keys(files).sort().map((p) => `${p} ${files[p]}\n`).join(""));
export const readManifest = () => JSON.parse(readFileSync(join(PKG, "manifest.json"), "utf8"));

const KEYS = ["id", "kind", "origin", "source", "version", "license", "modified", "scope", "tools", "claude", "antigravity", "earlierHooks", "retired", "files", "sha256"];

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
  const tracked = gitList(["ls-files", "skills", "agents", "hooks", "checks"], PKG).split("\n").filter(Boolean);
  for (const f of tracked) {
    if (f.endsWith(".test.mjs") || f.startsWith("hooks/fixtures/") || listed.has(f)) continue;
    errs.push(`${f} belongs to no piece`);
  }
  // a hook id of the manifest at the merge-base with the main branch that this one drops must be listed as retired: a stale copy never unwires a hook it did not retire
  // (HEAD already holds the change once it is committed on the branch)
  const hooks = (x, k) => x.pieces.filter((p) => p[k]?.length).map((p) => p.id);
  const git = (...a) => spawnSync("git", a, { cwd: PKG, encoding: "utf8" });
  const warn = (t) => console.error(`warn: ${t}`);
  let main = DEFAULTS.mainBranch;
  try { main = loadConfig(PKG).mainBranch; } catch {} // a config that does not parse is said by the other readers
  if (git("rev-parse", "-q", "--verify", "HEAD").status === 0) { // no commit: nothing to compare
    const mb = git("merge-base", "HEAD", main);
    if (mb.status === 1) {} // no common commit: nothing to compare
    else if (mb.status !== 0) warn(`git merge-base HEAD ${main} failed: retired hooks are not checked`);
    else {
      const at = `${mb.stdout.trim()}:manifest.json`;
      const ls = git("ls-tree", "--name-only", mb.stdout.trim(), "--", "manifest.json");
      if (ls.status !== 0) warn("git ls-tree failed: retired hooks are not checked");
      else if (ls.stdout.trim()) { // no manifest there: nothing to compare
        try {
          const old = JSON.parse(git("show", at).stdout);
          for (const k of ["claude", "antigravity"]) {
            for (const id of hooks(old, k)) if (!hooks(m, k).includes(id) && !(m.retiredHooks ?? []).includes(id)) errs.push(`hook ${id} is in the manifest at the merge-base with ${main} and not in this one: list it in retiredHooks`);
          }
        } catch { warn(`${at} does not read: retired hooks are not checked`); }
      }
    }
  }
  if (errs.length) die(1, errs.join("\n"));
  const out = JSON.stringify({ name: m.name, version: pkgVersion, marketplaces: m.marketplaces, plugins: m.plugins, retiredHooks: m.retiredHooks, pieces }, null, 2) + "\n";
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

const SUPPORTED_TOOLS = ["claude", "antigravity"];
function parseTools(raw) {
  if (!raw) return null;
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (!list.length) die(2, "--tool needs a value");
  for (const t of list) if (!SUPPORTED_TOOLS.includes(t)) die(2, `not yet: ${t} comes in a later phase`);
  return SUPPORTED_TOOLS.filter((t) => list.includes(t));
}

export function main(argv) {
  const [cmd, ...rest] = argv;
  if (!COMMANDS.includes(cmd)) die(2, `usage: xworkflows <${COMMANDS.join("|")}> [--tool claude|antigravity] [--yes] [--dry-run]`);
  const flags = cmd === "check" ? {} : parse(rest);
  if ((flags["dry-run"] || flags.yes) && cmd !== "install") die(2, "--dry-run and --yes are for install only");
  if (flags.check && cmd !== "pack") die(2, "--check is for pack only");
  flags.tools = parseTools(flags.tool);
  if (cmd === "pack") return pack(flags.check);
  try {
    ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    die(1, "not inside a git repository");
  }
  if (cmd === "check") {
    const run = join(ROOT, ".xworkflows/checks/run.mjs");
    if (!existsSync(run)) die(2, "xworkflows is not installed here: run xworkflows install");
    process.exit(spawnSync("node", [run, ...rest], { stdio: "inherit" }).status ?? 2);
  }
  if (cmd === "install") return install(flags);
  if (cmd === "doctor") return doctor();
  return uninstall();
}

const EMPTY = { xworkflows: "", tools: ["claude"], pieces: {}, files: {}, merged: [], blocks: [], imports: [], created: [], dirs: [], declined: [], kept: [], renamed: {}, scalars: [], chained: [] };
// the file's own indent, so install and uninstall leave a project's layout as it was
const indentOf = (text) => text?.match(/^([ \t]+)\S/m)?.[1] ?? 2;
const json = (v, text) => JSON.stringify(v, null, indentOf(text)) + "\n";
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const SECTION_FIX = "make it an object, or take it out of .xworkflows/config.json";

function targets(f, tools = ["claude"]) {
  if (f === "hooks/mark.mjs") return [".xworkflows/mark.mjs"];
  if (f.startsWith("skills/")) {
    if (f.endsWith(".workflow.py")) return tools.includes("antigravity") ? [".agents/" + f] : [];
    if (f.endsWith(".workflow.js")) return tools.includes("claude") ? [".claude/" + f] : [];
    return [...(tools.includes("claude") ? [".claude/" + f] : []), ...(tools.includes("antigravity") ? [".agents/" + f] : [])];
  }
  if (f.startsWith("agents/")) {
    return [...(tools.includes("claude") ? [".claude/" + f] : []), ...(tools.includes("antigravity") ? [".agents/" + f] : [])];
  }
  if (f.startsWith("hooks/adapters/")) {
    if (f === "hooks/adapters/claude.mjs") return tools.includes("claude") ? [".xworkflows/" + f] : [];
    if (f === "hooks/adapters/antigravity.mjs") return tools.includes("antigravity") ? [".xworkflows/" + f] : [];
    return [];
  }
  return [".xworkflows/" + f];
}

// a list that grows with the repository (files, logs) is read through this: the default buffer of 1 MiB fails on a big one
const gitList = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 1 << 28 });
const read = (root, p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), "utf8") : null);
const hookCmd = (id) => `node "$(git rev-parse --show-toplevel)/.xworkflows/hooks/run.mjs" claude ${id}`;
const agHookCmd = (id) => `node "$(git rev-parse --show-toplevel)/.xworkflows/hooks/run.mjs" antigravity ${id}`;
const isOurs = (e, id) => e?.hooks?.some((h) => `${h.command} `.includes(`/.xworkflows/hooks/run.mjs" claude ${id} `));
const MARK = "Bash(node .xworkflows/mark.mjs:*)";
const START = "<!-- xworkflows:start -->";
const END = "<!-- xworkflows:end -->";

// A global core.hooksPath belongs to every repository of the machine: the hooks folder counts only inside this repository.
// Real paths: a hooks folder that is a symlink out of the repository is outside. Install and uninstall use this one test.
// A dangling symlink resolves to its target, not to a path under its parent.
const real = (p, depth = 0) => {
  const rest = [];
  for (let a = p; ; a = dirname(a)) {
    try { return join(realpathSync(a), ...rest); } catch {
      if (lstatSync(a, { throwIfNoEntry: false })?.isSymbolicLink()) return join(depth < 40 ? real(resolve(dirname(a), readlinkSync(a)), depth + 1) : "/", ...rest);
      rest.unshift(basename(a));
    }
  }
};
function ownHooks(root) {
  const dir = hooksFolder(root);
  // a dangling link, at the folder or above it, names a folder that is not there: no hook of ours can live in it
  for (let a = dir; ; a = dirname(a)) {
    const st = lstatSync(a, { throwIfNoEntry: false });
    if (st) { if (st.isSymbolicLink() && !existsSync(a)) return null; break; }
    if (a === dirname(a)) break;
  }
  const gitDirs =["--absolute-git-dir", "--git-common-dir"].map((f) => real(resolve(root, execFileSync("git", ["rev-parse", f], { cwd: root, encoding: "utf8" }).trim())));
  const rd = real(dir);
  return [realpathSync(root), ...gitDirs].some((d) => rd === d || rd.startsWith(d + sep)) ? dir : null;
}

// Each merge: { path, text (null when nothing changes), rec: new record entries }.
function readObject(root, path) {
  const old = read(root, path);
  let s = {};
  if (old !== null) {
    try { s = JSON.parse(old); } catch { die(1, `${path} does not parse; fix it`); }
    if (!s || typeof s !== "object" || Array.isArray(s)) die(1, `${path} is not a JSON object`);
  }
  return { old, s };
}

// A scalar is written only when its key is absent, and recorded so uninstall removes it only while unchanged.
function setScalar(s, path, key, value, scalars) {
  if (key in s) return false;
  s[key] = value;
  scalars.push({ file: path, key: [key], value });
  return true;
}

const ATTRIBUTION = { commit: "", pr: "" };
// The marketplaces and plugins the manifest declares that this project uses: a plugin with whenTracked only when git tracks a file of that extension.
const PLUGIN_MAPS = ["extraKnownMarketplaces", "enabledPlugins"];
// all: every plugin the manifest declares, what uninstall may take out
// warn: how a failed file-list read is said; doctor counts it
function pluginWants(manifest, root, all = false, warn = (t) => console.error(`warn: ${t}`)) {
  let tracked = [];
  try { tracked = gitList(["ls-files", "-z"], root).split("\0"); } catch (e) { warn(`git ls-files failed (${e.code ?? e.message}): plugins that depend on tracked files are not decided`); }
  let code = [];
  try { code = loadConfig(root).paths.code; } catch {} // a config that does not parse is said by the other readers
  // SQL and screen files count only under paths.code
  const exts = new Set(tracked.filter((f) => Array.isArray(code) && inPaths(f, code)).map((f) => extname(f).toLowerCase()));
  const on = (manifest.plugins ?? []).filter((p) => all || !p.whenTracked || p.whenTracked.some((e) => exts.has(e)));
  const markets = [...new Set(on.map((p) => p.id.split("@")[1]))].filter((n) => manifest.marketplaces?.[n]);
  return [
    ...markets.map((n) => ({ key: [PLUGIN_MAPS[0], n], value: { source: { source: "github", repo: manifest.marketplaces[n] } } })),
    ...on.map((p) => ({ key: [PLUGIN_MAPS[1], p.id], value: true })),
  ];
}
// What install puts in settings.json, from the manifest; uninstall removes exactly these.
function settingsWants(manifest) {
  const want = [];
  for (const p of manifest.pieces) {
    for (const c of p.claude ?? []) {
      const entry = { ...(c.matcher && { matcher: c.matcher }), hooks: [{ type: "command", command: hookCmd(p.id) }] };
      const ours = (e) => isOurs(e, p.id);
      const earlier = (c.earlier ?? []).map((x) => ({ ...(x.matcher && { matcher: x.matcher }), hooks: entry.hooks }));
      want.push({ key: ["hooks", c.event], entry, ours, id: p.id, earlier });
    }
  }
  if (want.length) want.push({ key: ["permissions", "allow"], entry: MARK, ours: () => false });
  return want;
}

// What install puts in .agents/hooks.json for Antigravity, grouped under named xworkflows-<id> keys.
function agHooksWants(manifest) {
  const want = [];
  for (const p of manifest.pieces) {
    if (!p.antigravity?.length) continue;
    const def = {};
    for (const c of p.antigravity) {
      const handler = { type: "command", command: agHookCmd(p.id) };
      const item = c.event === "PreToolUse" || c.event === "PostToolUse"
        ? { ...(c.matcher && { matcher: c.matcher }), hooks: [handler] }
        : handler;
      (def[c.event] ??= []).push(item);
    }
    want.push({ key: `xworkflows-${p.id}`, id: p.id, entry: def });
  }
  return want;
}

function mergeAntigravityHooks(root, manifest, record) {
  const path = AG_HOOKS;
  const { old, s } = readObject(root, path);
  const want = agHooksWants(manifest);
  const merged = [], notes = [];
  let changed = false;
  for (const id of orphanIds(manifest)) {
    const k = `xworkflows-${id}`;
    if (k in s) { delete s[k]; changed = true; }
  }
  for (const { key, id, entry } of want) {
    if (!(key in s)) {
      s[key] = entry;
      changed = true;
      merged.push({ file: path, key: [key], entry, createdKey: true });
      continue;
    }
    if (isDeepStrictEqual(s[key], entry)) {
      const known = record.merged.some((m) => m.file === path && isDeepStrictEqual(m.key, [key]) && isDeepStrictEqual(m.entry, entry));
      if (!known) merged.push({ file: path, key: [key], entry, createdKey: false });
      continue;
    }
    const recorded = record.merged.find((m) => m.file === path && isDeepStrictEqual(m.key, [key]));
    if (recorded && isDeepStrictEqual(s[key], recorded.entry)) {
      s[key] = entry;
      changed = true;
      merged.push({ file: path, key: [key], entry, createdKey: recorded.createdKey ?? false });
    } else {
      notes.push(`kept: ${path} hook ${id} differs from the package's entry; to get the package's entry, delete ${key} and run xworkflows install`);
    }
  }
  return { path, notes, text: changed ? json(s, old) : null, rec: { merged, created: old === null && changed ? [path] : [] } };
}

// the hook id a recorded entry runs: orphan lookup, apply and doctor read it the same way
const hookId = (e) => e?.hooks?.[0]?.command?.match(/\/\.xworkflows\/hooks\/run\.mjs" claude (\S+)/)?.[1];
const agHookKeyId = (m) => (m?.file === AG_HOOKS && typeof m.key?.[0] === "string" && m.key[0].startsWith("xworkflows-") ? m.key[0].slice("xworkflows-".length) : undefined);
// the hook ids the manifest lists as retired (renamed or dropped by this version); a copy that merely lacks a hook retires nothing
const orphanIds = (manifest) => {
  const ids = new Set([...settingsWants(manifest).map((w) => w.id), ...agHooksWants(manifest).map((w) => w.id)]);
  return new Set((manifest.retiredHooks ?? []).filter((id) => !ids.has(id)));
};

function mergeSettings(root, manifest, record) {
  const path = ".claude/settings.json";
  const { old, s } = readObject(root, path);
  const want = settingsWants(manifest);
  const merged = [], notes = [];
  let changed = false;
  // our entries of a hook id the manifest no longer has; a container install made goes with its last entry
  for (const id of orphanIds(manifest)) for (const [event, arr] of isObj(s.hooks) ? Object.entries(s.hooks) : []) {
    // only our command leaves an entry; the entry goes when no command is left
    const left = Array.isArray(arr) ? arr.flatMap((e) => {
      if (!Array.isArray(e?.hooks) || !isOurs(e, id)) return [e];
      const rest = e.hooks.filter((h) => !isOurs({ hooks: [h] }, id));
      return rest.length ? [{ ...e, hooks: rest }] : [];
    }) : arr;
    if (isDeepStrictEqual(left, arr)) continue;
    changed = true;
    const was = record.merged.find((m) => m.key[1] === event && hookId(m.entry) === id);
    if (left.length || !was?.createdKey) s.hooks[event] = left; else delete s.hooks[event];
    if (!Object.keys(s.hooks).length && (was?.levels ?? 2) > 1) delete s.hooks;
  }
  for (const { key, entry, ours, id, earlier } of want) {
    let o = s, made = 0;
    for (const k of key.slice(0, -1)) {
      if (!(k in o)) { o[k] = {}; made++; }
      o = o[k];
      if (!o || typeof o !== "object" || Array.isArray(o)) die(1, `${path}: ${k} is not an object`);
    }
    const last = key.at(-1);
    if (!(last in o)) { o[last] = []; made++; }
    if (!Array.isArray(o[last])) die(1, `${path}: ${key.join(".")} is not an array`);
    const found = o[last].find((e) => isDeepStrictEqual(e, entry) || ours(e));
    if (found) {
      // an entry of ours: the present text stays, an earlier text the package published is replaced, anything else is the user's and is not recorded
      if (id && ours(found) && !isDeepStrictEqual(found, entry)) {
        if (earlier.some((x) => isDeepStrictEqual(x, found))) {
          const recorded = record.merged.find((m) => m.file === path && isDeepStrictEqual(m.key, key) && ours(m.entry));
          o[last][o[last].indexOf(found)] = entry; changed = true;
          merged.push({ file: path, key, entry, createdKey: recorded?.createdKey ?? false, ...(recorded?.levels && { levels: recorded.levels }) });
        }
        else notes.push(`kept: ${path} hook ${id} differs from every text the package published; to get the package's entry, delete it and run xworkflows install`);
        continue;
      }
      // ours but unrecorded (installed.json lost): record it so uninstall can remove it
      const known = record.merged.some((m) => m.file === path && isDeepStrictEqual(m.key, key) && (isDeepStrictEqual(m.entry, found) || ours(m.entry)));
      if (ours(found) && !known) merged.push({ file: path, key, entry: found, createdKey: false });
      continue;
    }
    o[last].push(entry);
    changed = true;
    merged.push({ file: path, key, entry, createdKey: made > 0, ...(made > 0 && { levels: made }) });
  }
  const scalars = [];
  changed = setScalar(s, path, "attribution", ATTRIBUTION, scalars) || changed;
  // a plugin sub-key is written only when absent, whatever the user's value; recorded so uninstall takes out only that
  for (const { key: [map, name], value } of pluginWants(manifest, root)) {
    if (map in s && !isObj(s[map])) die(1, `${path}: ${map} is not an object`);
    const createdKey = !(map in s);
    if (!createdKey && name in s[map]) continue;
    (s[map] ??= {})[name] = value;
    changed = true;
    scalars.push({ file: path, key: [map, name], value, ...(createdKey && { createdKey }) });
  }
  return { path, notes, text: changed ? json(s, old) : null, rec: { merged, scalars, created: old === null && changed ? [path] : [] } };
}

// Claude Code ignores this key in the shared file; the local one holds a path of this machine.
// An existing file gets the one key as a text insert before its closing brace, so uninstall can take out exactly that text.
// The record holds the dir as configured and the insert without its value: installed.json is committed and must hold no path of this machine.
function mergeLocal(root) {
  const path = ".claude/settings.local.json";
  const { old, s } = readObject(root, path);
  const key = "autoMemoryDirectory";
  let config;
  try { config = loadConfig(root); } catch (e) { die(1, e.message); }
  const dir = config.memory.dir, none = { path, text: null, rec: { scalars: [], created: [] } };
  // a refused memory folder gets no key, as it gets no folder: plan() says why
  const md = memoryFolder(config, root).dir;
  if (!md || key in s || config.memory?.autoDirectory === false) return none;
  if (spawnSync("git", ["ls-files", "--error-unmatch", path], { cwd: root, stdio: "ignore" }).status === 0) return { ...none, note: `${path} is tracked: ${key} not written, set it yourself` };
  const value = JSON.stringify(resolve(root, md));
  if (old === null) return { path, text: json({ [key]: resolve(root, md) }), rec: { scalars: [{ file: path, key: [key], dir }], created: [path] } };
  const nl = old.includes("\r\n") ? "\r\n" : "\n";
  const at = old.slice(0, old.lastIndexOf("}")).trimEnd().length;
  const multi = old.includes("\n");
  const insert = `${Object.keys(s).length ? "," : ""}${multi ? `${nl}  ` : ""}"${key}":${multi ? " " : ""}`;
  return { path, text: old.slice(0, at) + insert + value + old.slice(at), rec: { scalars: [{ file: path, key: [key], dir, insert }], created: [] } };
}

// the value that was there and differs from the memory folder: /dream reads that folder. A path of this machine, so the ignored file, never installed.json.
const EARLIER = ".xworkflows/local.json";
function mergeEarlier(root, md) {
  const { s } = readObject(root, ".claude/settings.local.json");
  const was = s.autoMemoryDirectory, { old, s: mine } = readObject(root, EARLIER);
  if (typeof was !== "string" || resolve(root, was) === resolve(root, md) || mine.memory?.earlierAutoDirectory !== undefined) return { path: EARLIER, text: null, rec: {} };
  if (mine.memory !== undefined && !isObj(mine.memory)) die(1, `${EARLIER}: memory is not an object`);
  (mine.memory ??= {}).earlierAutoDirectory = was;
  return { path: EARLIER, text: json(mine, old), rec: {} };
}

const YML = ".qmd/index.yml";
const QMARK = ".qmd/xworkflows";
const MARK_TEXT = "written by xworkflows install: uninstall removes index.yml and its database here only while this file exists\n";
// qmd reads index.yaml before index.yml: either one is a local config
const localYml = (root) => [".qmd/index.yaml", YML].find((f) => existsSync(join(root, f)));
const IGNORE = [["graphify-out/", "graphify-out/x"], [".claude/settings.local.json", ".claude/settings.local.json"], [".qmd/", ".qmd/x"], [".xworkflows/handoff.md", ".xworkflows/handoff.md"], [EARLIER, EARLIER]];
// `.qmd/` is added only in a run that writes the yml
function mergeIgnore(root, qmd, tools = ["claude"]) {
  const path = ".gitignore";
  const old = read(root, path);
  let text = old ?? "";
  const imports = [];
  for (const [line, probe] of IGNORE) {
    if ((line === ".qmd/" && !qmd) || (line === ".claude/settings.local.json" && !tools.includes("claude")) || spawnSync("git", ["check-ignore", "-q", "--no-index", probe], { cwd: root }).status === 0) continue;
    const addedNewline = text !== "" && !text.endsWith("\n");
    imports.push({ file: path, line, ...(addedNewline && { addedNewline }) });
    text += (addedNewline ? "\n" : "") + line + "\n";
  }
  return { path, text: imports.length ? text : null, rec: { imports, created: old === null && imports.length ? [path] : [] } };
}

// .graphifyignore: the folders install writes, one line each, so the graph does not index the method's own files
const GI = ".graphifyignore";
// a skill folder, or an agent file, by its exact path
const giLine = (p) => p.match(/^\.(?:claude|agents)\/skills\/[^/]+/)?.[0]?.concat("/") ?? p.match(/^\.(?:claude|agents)\/agents\/[^/]+\.md$/)?.[0];
function mergeGraphifyIgnore(root, writes) {
  const old = read(root, GI);
  let text = old ?? "";
  const imports = [];
  const want = [".xworkflows/", ...new Set(writes.filter((w) => !w.keep).map((w) => giLine(w.path)).filter(Boolean))];
  for (const line of want) {
    if (text.split("\n").includes(line)) continue;
    const addedNewline = text !== "" && !text.endsWith("\n");
    imports.push({ file: GI, line, ...(addedNewline && { addedNewline }) });
    text += (addedNewline ? "\n" : "") + line + "\n";
  }
  return { path: GI, text: imports.length ? text : null, rec: { imports, created: old === null && imports.length ? [GI] : [] } };
}

const HOOKS = ["pre-push", "pre-commit", "post-merge", "post-commit"];
// pre-push and pre-commit stop the git command when their check fails; the two post hooks never fail it
const STOPS = (name) => name.startsWith("pre-");
const hooksFolder = (root) => resolve(root, execFileSync("git", ["rev-parse", "--git-path", "hooks"], { cwd: root, encoding: "utf8" }).trim());
// the record's name for a hook: .git/hooks/<name> in every checkout, unless core.hooksPath moved the folder
const hookKey = (root, name) => {
  const dir = hooksFolder(root);
  return dir === resolve(root, execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: root, encoding: "utf8" }).trim(), "hooks") ? `.git/hooks/${name}` : relative(root, resolve(dir, name));
};
const CHECK = 'node "$(git rev-parse --show-toplevel)/.xworkflows/checks/run.mjs" --pre-push "$1"';
// the line an earlier version gave for the hook of a folder outside the repository: doctor still knows it, since it hands the rest of
// that hook no pushed refs
// .git/hooks is shared by every branch: a run.mjs of a branch made before this mode is never called with it
const PRE_COMMIT = 'f="$(git rev-parse --show-toplevel)/.xworkflows/checks/run.mjs"; if grep -q -- --pre-commit "$f" 2>/dev/null; then node "$f" --pre-commit || exit $?; fi';
const GUARDED = 'f="$(git rev-parse --show-toplevel)/.xworkflows/checks/run.mjs"; if [ -f "$f" ]; then node "$f" --pre-push "$1" || exit $?; fi';
// a value of .xworkflows/config.json read at hook time, `d` when the file or the key is not there
const CFG = (expr, d) => `node -e 'try{process.stdout.write(${expr}||"${d}")}catch{process.stdout.write("${d}")}'`;
const CONF = 'JSON.parse(require("fs").readFileSync(".xworkflows/config.json","utf8"))';
const MAIN = CFG(`${CONF}.mainBranch`, "main");
// the first word of lookup.index.command is the tool that builds the index, as the session-start hook runs it
const TOOL = CFG(`(${CONF}.lookup.index.command||"graphify query").split(" ")[0]`, "graphify");
const FOLDER = CFG(`${CONF}.lookup.index.folder`, "graphify-out");
// a git hook on disk that is an earlier text the package published: the manifest holds their hashes per hook
const earlierHook = (manifest, name, cur) => (manifest.pieces.find((p) => p.id === "checks")?.earlierHooks?.[name] ?? []).includes(hash(cur));
// The file of install's own that a hook's marked line runs. pre-push's is read into the hook's shell: a failed check ends the hook
// with its code; after a passed one the rest of the hook reads the same refs, from the saved file, whose name goes at once. A hook with
// nothing after the line needs no saved file; the file is made in the environment's temp folder and goes when a signal cuts the check.
function gitText(name) {
  if (name === "pre-push") return `if awk 'f{r=1} / # xworkflows/{f=1} END{exit !(f && !r)}' 2>/dev/null < "$0"; then\n${CHECK} || exit $?\nelse\nxwf_in=$(mktemp "\${TMPDIR:-/tmp}/xworkflows.XXXXXX") || exit 1\ntrap 'rm -f "$xwf_in"; exit 1' HUP INT TERM\ncat > "$xwf_in"\n${CHECK} < "$xwf_in" || { xwf_c=$?; rm -f "$xwf_in"; exit $xwf_c; }\nexec < "$xwf_in"\nrm -f "$xwf_in"\ntrap - HUP INT TERM\nunset xwf_in xwf_c\nfi\n`;
  if (name === "pre-commit") return `${PRE_COMMIT}\n`;
  return `#!/bin/sh\nc=0\ncd "$(git rev-parse --show-toplevel)" || exit $c\nmain=$(${MAIN}) || main=main\n[ "$(git symbolic-ref --short -q HEAD)" = "$main" ] || exit $c\ntool=$(${TOOL}) || tool=graphify\nfolder=$(${FOLDER}) || folder=graphify-out\ncommand -v "$tool" >/dev/null 2>&1 || exit $c\nmkdir -p "$folder"\n{ "$tool" update . && touch -c -h -- "$folder/graph.json"; } > "$folder/.update.log" 2>&1 < /dev/null &\nexit $c\n`;
}
// The one line install puts in a hook: the two post hooks run its file as a child that never fails them. It is silent only where the
// method is not installed; where the checks are and its file is not, pre-push refuses the push and a post hook says so on stderr.
const hookLine = (name) => {
  const x = `"$(git rev-parse --show-toplevel)/.xworkflows`, f = `${x}/git/${name}"`;
  const gone = `echo "xworkflows: .xworkflows/git/${name} is missing: run xworkflows install" >&2${name === "pre-push" ? "; exit 1" : " || :"}`;
  return `if [ -f ${f} ]; then ${STOPS(name) ? `. ${f}` : `sh ${f} "$@" || :`}; elif [ -f ${x}/checks/run.mjs" ]; then ${gone}; fi # xworkflows`;
};
// a hook manager is known by its hook's text: husky's shim reads the file h beside it; lefthook's and pre-commit's hooks name their tool
const manager = (t) => (/^\.\s+"?(\$\{0%\/\*\}|\$\(dirname "\$0"\))\/h"?\s*$/m.test(t) ? "husky" : /lefthook/i.test(t) ? "lefthook" : /pre-commit\.com/.test(t) ? "pre-commit" : null);
// a hook's text, or null when its bytes are not the UTF-8 bytes of that text or hold a NUL: such a hook is never rewritten as text
const textOf = (abs) => { const b = readFileSync(abs), t = b.toString(); return b.includes(0) || !Buffer.from(t).equals(b) ? null : t; };
// a shell runs the hook: its #! line names one, or it has none and is text
const SHELL = /^(?!#!)|^#!\s*(\S*\/)?(env\s+(-\S+\s+)*)?(sh|bash|dash|zsh|ksh)(\s|$)/;
// a hook that cannot take the line, and is chained as before it: a link, a file whose bytes are not a shell script, lefthook's or pre-commit's
const chains = (st, t) => !st?.isFile() || t === null || !SHELL.test(t) || ["lefthook", "pre-commit"].includes(manager(t));
// The chain of before the line, text for text: the project's hook, renamed <name>.before-xworkflows, runs first.
function chainText(name) {
  const old = `old="$(dirname "$0")/${name}.before-xworkflows"\n`;
  // git feeds the pushed refs on stdin once: keep them for both runs
  if (name === "pre-push") return `#!/bin/sh\nin=$(mktemp) || exit 1\ncat > "$in"\n${old}if [ -x "$old" ]; then "$old" "$@" < "$in" || { c=$?; rm -f "$in"; exit $c; }; fi\n${CHECK} < "$in"\nc=$?\nrm -f "$in"\nexit $c\n`;
  if (name === "pre-commit") return `#!/bin/sh\n${old}if [ -x "$old" ]; then "$old" "$@" || exit $?; fi\n${PRE_COMMIT}\n`;
  return gitText(name).replace("c=0\n", `c=0\n${old}[ -x "$old" ] && { "$old" "$@"; c=$?; }\n`);
}
// the line goes after the #! line, else first; uninstall takes that line out alone, which gives every one of these bytes back
const withLine = (t, line) => {
  const i = t.startsWith("#!") ? t.indexOf("\n") : -1;
  return !t.startsWith("#!") ? `${line}\n${t}` : i < 0 ? `${t}\n${line}` : `${t.slice(0, i + 1)}${line}\n${t.slice(i + 1)}`;
};
// install's own hook, where the project has none: the #! line and the marked line
const hookText = (name) => `#!/bin/sh\n${hookLine(name)}\n`;
// the first command of a hook's text: the line runs only there, since a command before it may use up the refs on standard input or end the hook
const firstCommand = (t) => t?.split("\n").map((l) => l.trim()).find((l) => l !== "" && !l.startsWith("#"));
// The state of a git hook, from the files and the record: install and doctor both decide from it, and these are its states.
//   none      no hook there
//   own       install's own hook
//   old       a text of the package that install replaces with no question: an earlier own hook, or a pair chained the old way
//   chained   a hook that cannot take the line, chained: install's chained hook runs it first
//   chain     a hook that cannot take the line (a link, bytes that are not a shell script, lefthook's or pre-commit's), not chained
//   blocked   such a hook, with a <name>.before-xworkflows that is not install's in the way of its chain
//   line      a hook of the user's holding the line as its first command, in a file a shell runs (husky's file one folder up), read
//             through a link: install writes no link, and a link that does not hold the line stays chained
//   add       a hook of the user's that can take the line and does not hold it there
//   declined  a hook whose line or chain the user declined at install
//   missing   own or line, while install's file under .xworkflows/git that the line runs is not there
//   changed   own or line, while that file holds neither the package's text nor the one install recorded
//   outside   the hooks folder is outside the repository, and its hook does not hold the line first, or holds the line an earlier
//             version gave for such a folder, which handed the rest of the hook no pushed refs
function hookState(manifest, root, record, name) {
  const path = relative(root, resolve(hooksFolder(root), name)), key = hookKey(root, name);
  const g = `.xworkflows/git/${name}`;
  let gt = null;
  try { gt = readFileSync(join(root, g), "utf8"); } catch {}
  // hash() drops the CR of a CRLF, and the shell cannot run a text that holds one: such a text is never the recorded one
  const ran = (state) => !["own", "line"].includes(state) ? state : !existsSync(join(root, g)) ? "missing" : gt === gitText(name) || (gt !== null && !gt.includes("\r") && hash(gt) === record.files[g]?.sha256) ? state : "changed";
  if (ownHooks(root) === null) {
    let t = null;
    try { t = readFileSync(join(root, path), "utf8"); } catch {}
    const guarded = !!t?.split("\n").some((l) => l.trim() === GUARDED);
    return { path, key, outside: true, guarded, state: ran(t !== null && !guarded && SHELL.test(t) && firstCommand(t) === hookLine(name) ? "line" : "outside") };
  }
  const now = lstatSync(join(root, path), { throwIfNoEntry: false });
  const own = now?.isFile() ? read(root, path) : null;
  const mine = own !== null && (own === hookText(name) || own === chainText(name) || earlierHook(manifest, name, own) || (!!record.files[key] && hash(own) === record.files[key].sha256));
  // an install made before the line renamed the user's hook to <name>.before-xworkflows and ran it from its own, recorded or not:
  // ours is the only code that makes this name
  const before = `${path}.before-xworkflows`, old = lstatSync(join(root, before), { throwIfNoEntry: false });
  const pair = !!old && (mine || !now);
  const lst = pair ? old : now;
  // the user's renamed file of an old pair that cannot be read is taken as one that cannot take the line: the pair stays, and works
  let cur = null, unread;
  try { cur = lst?.isFile() ? textOf(join(root, pair ? before : path)) : null; } catch (e) { if (!pair) throw e; unread = e.code; }
  // husky's shim runs the file of its own name one folder up: that file is the user's hook, made by a yes when it is not there
  const husky = cur !== null && manager(cur) === "husky", chain = chains(lst, cur);
  const file = husky ? join(dirname(dirname(path)), name) : path, fkey = husky ? file : key;
  const at = husky ? lstatSync(join(root, file), { throwIfNoEntry: false }) : lst;
  const text = !husky ? cur : !at ? "" : at.isFile() ? textOf(join(root, file)) : null;
  const linked = husky && !(plain(file) && clean(root, file)), takes = !linked && text !== null && SHELL.test(text);
  const link = !pair && !!(husky ? at : lst)?.isSymbolicLink();
  let seen = text;
  if (link) try { seen = statSync(join(root, file)).isFile() ? textOf(join(root, file)) : null; } catch { seen = null; }
  const holds = seen !== null && (husky || SHELL.test(seen)) && firstCommand(seen) === hookLine(name);
  // the old pair moves to the line only when the hook can take it: the user's file gets its name back, and the line with no question,
  // since its owner said yes then. Else the pair stays as it is, and works
  const back = pair && !chain && (!husky || takes) ? before : undefined;
  const declined = record.declined.some((d) => d.file === key && d.what === "chain");
  // husky runs its file with sh, whatever its #! line says
  const state = !now ? "none" : pair ? (!back && own === chainText(name) ? "chained" : "old") : mine ? (own === hookText(name) ? "own" : "old")
    : holds && (link || !chain) ? "line" : chain ? (old ? "blocked" : declined ? "declined" : "chain") : declined && takes ? "declined" : "add";
  return { path, key, before, old, pair, unread, mine, lst, chain, husky, file, fkey, at, text, takes, linked, back, declined, link, holds, state: ran(state) };
}

export function agentsBlock() {
  return `${START}\n${readFileSync(join(PKG, "templates/AGENTS.md"), "utf8").replace(/\n+$/, "")}\n${END}\n`;
}

function mergeAgents(root) {
  const path = "AGENTS.md";
  const old = read(root, path);
  const block = agentsBlock();
  let text;
  const a = old?.indexOf(START) ?? -1;
  if (a >= 0) {
    const b = old.indexOf(END, a);
    if (b < 0) die(1, `${path} has ${START} without ${END}; fix it`);
    const e = b + END.length + (old[b + END.length] === "\n" ? 1 : 0);
    text = old.slice(0, a) + block + old.slice(e);
  } else if (!old) text = block;
  else text = old + (old.endsWith("\n") ? "" : "\n") + "\n" + block;
  const nl = !!old && a < 0 && !old.endsWith("\n");
  return { path, text: text === old ? null : text, rec: { blocks: [nl ? { file: path, addedNewline: true } : { file: path }], created: old === null ? [path] : [] } };
}

const UNIT = /^\.(?:claude|agents)\/(skills|agents)\/[^/]+/;
const LITE_FILE = /^\.(?:claude|agents)\/agents\/[^/]+\.md$/;
const IMPORT = "Add @AGENTS.md to CLAUDE.md?";

const plain = (p) => typeof p === "string" && p !== "" && p !== "." && !isAbsolute(p) && normalize(p) === p && !p.split("/").includes("..");
// What is in the way of p, from the repository root down: null when nothing; { folder } for a folder made a file or one that
// cannot be searched (the folder is named, nothing is written into it); {} for a symlink.
const way = (root, p) => {
  let a = root;
  for (const c of p.split("/")) {
    let st;
    try { st = lstatSync((a = join(a, c)), { throwIfNoEntry: false }); } catch (e) {
      if (e.code === "ENOTDIR" || e.code === "EACCES") return { folder: dirname(a).slice(root.length + 1) };
      throw e;
    }
    if (!st) return null;
    if (st.isSymbolicLink()) return {};
  }
  return null;
};
// no existing component of p is a symlink, a file in place of a folder, or a folder that cannot be read
const clean = (root, p) => !way(root, p);

// Reads and parses every target file before any write (ruling P2) and refuses before any write.
// `ans` maps question id -> chosen label; an unanswered question is listed in `questions` and planned with its safe answer.
// The two changes install makes to a package text it writes; published() undoes them.
const tierToModel = (text, tiers, tool = "claude") => text.replace(/^tier: (\w+)$/m, (_, k) => `model: ${tiers[tool][k]}`);
const nameAs = (text, name) => text.replace(/^name: .*$/m, `name: ${name}`);
// the file of a unit that carries its name line: the agent file, or a skill's SKILL.md
const named = (p, u) => p === u || p.endsWith("/SKILL.md");
// The agent's file as this project has it: the config's agents.<id> block (a bad value is ignored), and a `plugin:skill` only where
// the plugin is on after install, else the skill check refuses every push.
const NAME = /^[\w.:-]+$/;
const AG_TOOL_MAP = { Read: "read_file", Write: "write_file", Edit: "edit_file", Bash: "run_command", WebSearch: "search_web", WebFetch: "read_url_content" };

function renderAgent(text, ov, on) {
  const o = isObj(ov) ? ov : {};
  return text.replace(/^---\n([\s\S]*?)\n---\n/, (_, fm) => {
    const lines = fm.split("\n"), at = lines.indexOf("skills:");
    let n = 0;
    while (at >= 0 && /^\s+- /.test(lines[at + 1 + n] ?? "")) n++;
    const have = at < 0 ? [] : lines.slice(at + 1, at + 1 + n).map((l) => l.replace(/^\s+- /, "").trim());
    const asked = Array.isArray(o.skills) && o.skills.every((k) => typeof k === "string" && NAME.test(k));
    const want = (asked ? o.skills : have).filter((k) => !k.includes(":") || on.has(k.split(":")[0]));
    if (!isDeepStrictEqual(want, have) || asked) {
      const list = want.length ? ["skills:", ...want.map((k) => `  - ${k}`)] : [];
      if (at < 0) lines.push(...list); else lines.splice(at, 1 + n, ...list);
    }
    if (typeof o.effort === "string" && NAME.test(o.effort)) {
      const e = lines.findIndex((l) => l.startsWith("effort:"));
      if (e < 0) lines.push(`effort: ${o.effort}`); else lines[e] = `effort: ${o.effort}`;
    }
    return `---\n${lines.join("\n")}\n---\n`;
  }) + (typeof o.append === "string" && o.append.trim() ? `\n${o.append.replace(/\s+$/, "")}\n` : "");
}

// Antigravity custom subagent render: tier -> flash|pro (never inherit: no agent depends on the main session), valid CLI tool names only (no unmapped Grep/Glob), subagent: true, mainAgent: false, no effort:, local skills only.
// An agent file takes only a tier keyword (a concrete model id makes agy drop the agent): a tier set to a model id renders `pro`; run-agent.mjs runs that model through agy -p.
const AG_KEYWORDS = new Set(["flash_lite", "flash", "pro"]);
function renderAntigravityAgent(text, tiers, ov) {
  const o = isObj(ov) ? ov : {};
  const agTiers = { ...tiers, antigravity: Object.fromEntries(Object.entries(tiers.antigravity ?? {}).map(([k, v]) => [k, AG_KEYWORDS.has(v) ? v : "pro"])) };
  const mapped = tierToModel(text, agTiers, "antigravity").replace(/^---\n([\s\S]*?)\n---\n/, (_, fm) => {
    const lines = fm.split("\n").filter((l) => !/^effort:/.test(l));
    const ti = lines.findIndex((l) => /^tools:/.test(l));
    if (ti >= 0) {
      let tn = 0;
      while (/^\s+- /.test(lines[ti + 1 + tn] ?? "")) tn++;
      const inline = lines[ti].slice("tools:".length).trim();
      const rawTools = inline
        ? inline.replace(/^\[(.*)\]$/, "$1").split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean)
        : lines.slice(ti + 1, ti + 1 + tn).map((l) => l.replace(/^\s+- /, "").trim());
      const agTools = [...new Set(rawTools.map((t) => AG_TOOL_MAP[t] ?? (Object.values(AG_TOOL_MAP).includes(t) ? t : null)).filter(Boolean))];
      const tList = agTools.length ? ["tools:", ...agTools.map((t) => `  - ${t}`)] : [];
      lines.splice(ti, 1 + tn, ...tList);
    }
    const at = lines.indexOf("skills:");
    let n = 0;
    while (at >= 0 && /^\s+- /.test(lines[at + 1 + n] ?? "")) n++;
    const have = at < 0 ? [] : lines.slice(at + 1, at + 1 + n).map((l) => l.replace(/^\s+- /, "").trim());
    const asked = Array.isArray(o.skills) && o.skills.every((k) => typeof k === "string" && NAME.test(k));
    const want = (asked ? o.skills : have).filter((k) => !k.includes(":"));
    if (at >= 0 || want.length) {
      const list = want.length ? ["skills:", ...want.map((k) => `  - ${k}`)] : [];
      if (at < 0) lines.push(...list); else lines.splice(at, 1 + n, ...list);
    }
    if (!lines.some((l) => /^subagent:/.test(l))) lines.push("subagent: true");
    if (!lines.some((l) => /^mainAgent:/.test(l))) lines.push("mainAgent: false");
    return `---\n${lines.join("\n")}\n---\n`;
  });
  const full = mapped + (typeof o.append === "string" && o.append.trim() ? `\n${o.append.replace(/\s+$/, "")}\n` : "");
  return full
    .replaceAll(".claude/rules/", ".agents/rules/")
    .replaceAll(".claude/skills/", ".agents/skills/")
    .replaceAll(".claude/agents/", ".agents/agents/");
}

// Antigravity skill render: preserves Claude source intact while rendering .agents/skills/*/SKILL.md for Antigravity tools & Python workflows.
function renderAntigravitySkill(skillId, f, text) {
  if (!f.endsWith("/SKILL.md")) return text;
  let out = text
    .replaceAll(".claude/agents/", ".agents/agents/")
    .replaceAll(".claude/rules/", ".agents/rules/")
    .replaceAll(".claude/skills/", ".agents/skills/")
    .replaceAll("AskUserQuestion", "ask_question")
    .replaceAll("research.workflow.js", "research.workflow.py")
    .replaceAll("dream.workflow.js", "dream.workflow.py")
    .replaceAll("triage.workflow.js", "triage.workflow.py")
    .replaceAll("CLAUDE_CODE_SESSION_ID", "ANTIGRAVITY_CONVERSATION_ID")
    .replaceAll("Claude Code only.", "Antigravity and Claude Code.");
  if (skillId === "adapt") {
    out = out
      .replace("the `header` is the item id.", "prefix every question text with `[<id>] ` (Antigravity's `ask_question` has no `header` field, and `adapt-record` reads `[<id>] ` as the id).")
      .replaceAll("research.mjs queue", "research.mjs queue --tool antigravity")
      .replaceAll("research.mjs model", "research.mjs model --tool antigravity")
      .replace(
        'Call the `Workflow` tool with `scriptPath: "<base>/research.workflow.py"` and `args: { root: "<absolute repository root>", zeroHits: [...], agents: {...}, language: "<the owner\'s language>" }`',
        'Call the `run_workflow` tool with `ScriptPath: "<base>/research.workflow.py"` and `Args: { root: "<absolute repository root>", zeroHits: [...], agents: {...}, models: { medium: "<medium tier in .xworkflows/tiers.json under antigravity>", cheap: "<cheap tier in .xworkflows/tiers.json under antigravity>" }, language: "<the owner\'s language>" }`',
      )
      .replace("Front matter `paths:` lists the zone's paths as globs: a folder `src` or `src/` becomes `src/**`; `dir/*` and `*` stay as written.", "Front matter uses Antigravity glob rules: `trigger: glob`, `description: <one line>`, and `globs: \"<comma-separated globs>\"` (a folder `src` or `src/` becomes `src/**`; `dir/*` and `*` stay as written).")
      .replace("`tools: Read, Grep, Glob, Bash`; `effort: xhigh`, so its first review runs at xhigh.", "`tools: read_file, run_command`; `subagent: true`; `mainAgent: false` (omit `effort:`; the tier keyword carries the effort, and `inherit` is never used).");
  } else if (skillId === "dream") {
    out = out
      .replace("extract.mjs --current $ANTIGRAVITY_CONVERSATION_ID", "extract.mjs --tool antigravity --current $ANTIGRAVITY_CONVERSATION_ID")
      .replace('Call the `Workflow` tool with `scriptPath: "<base>/dream.workflow.py"` and `args:', 'Call the `run_workflow` tool with `ScriptPath: "<base>/dream.workflow.py"` and `Args:')
      .replace("The model of `cheap` is in `.xworkflows/tiers.json`.", "The model of `cheap` is in `.xworkflows/tiers.json` under `antigravity` (`flash`).");
  } else if (skillId === "pending") {
    out = out
      .replace('Call the `Workflow` tool with `scriptPath: "<base>/triage.workflow.py"` and `args:', 'Call the `run_workflow` tool with `ScriptPath: "<base>/triage.workflow.py"` and `Args:')
      .replace("`model` is `cheap` in `.xworkflows/tiers.json`.", "`model` is `cheap` in `.xworkflows/tiers.json` under `antigravity` (`flash`).");
  } else if (skillId === "full-review") {
    out = out.replace(
      /## Step 3: The Workflow[\s\S]*?```\n/,
      '## Step 3: The Workflow\n\nCall the `run_workflow` tool with `ScriptPath: "<base>/full-review.workflow.py"` and `Args: { zones, skills, agent }` (`<base>` is this skill\'s folder). `zones` is the `zones` array; `skills` maps each review (`thermo-nuclear-review`, `thermo-nuclear-code-quality-review`) to its installed folder `.agents/skills/<name>` (or `.agents/skills/xwf-<name>` if renamed in `.xworkflows/installed.json`); `agent` is `zone-review` (or `xwf-zone-review` if renamed).\n',
    );
  } else if (skillId === "orchestrate") {
    out = out
      .replace("One or two agents go with `Agent`, in one message when they are independent. Three or more in a stretch, parallel or serial, go in one `Workflow`", "One or two agents go with `invoke_subagent`, in one message when they are independent. Three or more in a stretch, parallel or serial, go in one `run_workflow`")
      .replace("In a `Workflow`, every `agent()` names its `agentType`", "In a `run_workflow` script, every `agent()` names its `type_name`")
      .replace("the risk reviewer's first review of a batch runs at effort `xhigh`.", "the risk reviewer's first review of a batch runs at effort `xhigh` (in Antigravity, dispatch `roles.reviewer`, `roles.riskReviewer` and `roles.riskReviewerLite` only with `node .xworkflows/hooks/run-agent.mjs <role> <prompt file>`, after writing the prompt to that file: it runs them on the `top` and `strongest` models of `.xworkflows/tiers.json`, never `inherit`, and the hook denies them through invoke_subagent).");
  }
  return out;
}
// the plugins on in settings.json once install has run: those it holds, and those install turns on
// the check's rule: <plugin>@<marketplace>: true in the settings install leaves (a plugin install adds only when the key is absent); a linked settings file is not written, so counts nothing
function pluginsOn(manifest, root) {
  if (!clean(root, SETTINGS)) return new Set();
  let held = {};
  try { held = JSON.parse(read(root, SETTINGS) ?? "{}").enabledPlugins ?? {}; } catch {}
  const left = { ...(isObj(held) ? held : {}) };
  for (const w of pluginWants(manifest, root, false, () => {})) if (w.key[0] === PLUGIN_MAPS[1] && !(w.key[1] in left)) left[w.key[1]] = true;
  return new Set(Object.entries(left).filter(([k, v]) => pluginOn(k, v)).map(([k]) => k.split("@")[0]));
}
// The risk reviewer /adapt wrote, as a second agent that differs by its name (seal line included) and its model: tier top where the first has strongest.
function liteOf(src, full, name, model) {
  const t = nameAs(src, name).replaceAll(`${full} ok at`, `${name} ok at`);
  return /^model: /m.test(t) ? t.replace(/^model: .*$/m, `model: ${model}`) : t.replace(/^name: .*$/m, `$&\nmodel: ${model}`);
}
// Every file this package copies, with the text it copies (tier line included, config applied to the agents); plan() and uninstall share it.
function pkgWrites(manifest, root, tools = ["claude"]) {
  const tiers = readFileSync(join(PKG, "tiers.json"), "utf8");
  const tiersObj = JSON.parse(tiers);
  let cfg = DEFAULTS;
  try { cfg = loadConfig(root); } catch {} // a config that does not parse is said by the other readers
  const on = tools.includes("claude") ? pluginsOn(manifest, root) : new Set();
  const writes = [{ path: ".xworkflows/tiers.json", text: tiers, piece: "installer", src: "tiers.json" }];
  for (const p of manifest.pieces) {
    for (const f of Object.keys(p.files)) {
      const dests = targets(f, tools);
      if (!dests.length) continue;
      const raw = readFileSync(join(PKG, f), "utf8");
      for (const t of dests) {
        let text = raw;
        if (f.startsWith("agents/")) {
          const ov = cfg.agents?.[basename(f, ".md")];
          text = t.startsWith(".agents/") ? renderAntigravityAgent(raw, tiersObj, ov) : renderAgent(tierToModel(raw, tiersObj, "claude"), ov, on);
        } else if (f.startsWith("skills/") && t.startsWith(".agents/")) {
          text = renderAntigravitySkill(p.id, f, raw);
        }
        writes.push({ path: t, text, piece: p.id, src: f });
      }
    }
  }
  const { riskReviewer: full, riskReviewerLite: lite } = cfg.roles;
  if (Array.isArray(cfg.paths.riskLite) && cfg.paths.riskLite.length && [full, lite].every((n) => NAME.test(n)) && full !== lite) {
    for (const [tool, dir] of [["claude", ".claude"], ["antigravity", ".agents"]]) {
      if (!tools.includes(tool)) continue;
      const from = `${dir}/agents/${full}.md`, source = read(root, from);
      if (source !== null) writes.push({ path: `${dir}/agents/${lite}.md`, text: liteOf(source, full, lite, tiersObj[tool].top), piece: "installer", src: from });
    }
  }
  return writes;
}
// The xwf- form of a file of unit u.
function renameWrite(w, u) {
  const id = basename(u, ".md");
  const nu = `${dirname(u)}/xwf-${basename(u)}`;
  return { ...w, path: nu + w.path.slice(u.length), text: named(w.path, u) ? nameAs(w.text, `xwf-${id}`) : w.text };
}
// The texts the package may have published for a file install wrote at p: the text on disk with install's changes undone. The name
// line of an xwf- unit goes back to `name: <id>`, as every named file of the package has it. An agent's model line is install's,
// written with the map of the version that installed it, so every tier of the map is a candidate.
function published(p, text, tiers) {
  const u = p.match(UNIT)?.[0], id = u && basename(u, ".md");
  const t = id?.startsWith("xwf-") && named(p, u) && nameAs(text, id) === text ? nameAs(text, id.slice(4)) : text;
  const ks = p.startsWith(".claude/agents/") ? Object.keys(tiers.claude) : p.startsWith(".agents/agents/") ? Object.keys(tiers.antigravity ?? {}) : [];
  return [t, ...ks.map((k) => t.replace(/^model: .*$/m, `tier: ${k}`))];
}

// path -> the hashes the manifest lists for a retired file, at every place install may have written it, the xwf- one included
function retiredPaths(manifest, tools = ["claude"]) {
  const listed = new Map();
  for (const [f, hashes] of manifest.pieces.flatMap((p) => Object.entries(p.retired ?? {}))) {
    for (const t of targets(f, tools)) {
      const u = t.match(UNIT)?.[0];
      for (const p of u ? [t, renameWrite({ path: t, text: "" }, u).path] : [t]) listed.set(p, hashes);
    }
  }
  return listed;
}

export function plan(manifest, root, record, ans = {}, tools = Array.isArray(record?.tools) && record.tools.length ? record.tools : ["claude"]) {
  let writes = pkgWrites(manifest, root, tools);
  const questions = [], kept = [], renamed = {}, notes = [];
  const ask = (id, text, labels, yes = 1) => {
    if (ans[id] === undefined) questions.push({ id, text, labels, yes });
    return ans[id] ?? labels[0];
  };
  const units = {};
  for (const w of writes) { const u = w.path.match(UNIT)?.[0]; if (u) (units[u] ??= []).push(w); }
  writes = writes.filter((w) => !UNIT.test(w.path));
  for (const [u, ws] of Object.entries(units)) {
    const id = basename(u, ".md");
    const nu = `${dirname(u)}/xwf-${basename(u)}`;
    const mine = ws.some((w) => record.files[w.path]);
    let rename = !!record.renamed[nu];
    if (record.kept.includes(u)) continue;
    // a unit under a linked folder is dropped below with its note: no question, no record
    if (!(plain(u) && clean(root, u))) { writes.push(...ws); continue; }
    // an empty folder is no skill and no agent of the project
    const there = lstatSync(join(root, u), { throwIfNoEntry: false });
    if (!rename && !mine && there && !(there.isDirectory() && !readdirSync(join(root, u)).length) && !ws.every((w) => read(root, w.path) === w.text)) {
      const kind = u.includes("/skills/") ? "skill" : "agent";
      const a = ask(`unit:${u}`, `${kind === "skill" ? "A skill" : "An agent"} ${id} exists. Keep theirs or install ours as xwf-${id}?`, ["keep theirs", `xwf-${id}`]);
      if (a === "keep theirs") { kept.push(u); continue; }
      rename = true;
    }
    if (rename) renamed[nu] = ws[0].piece;
    for (const w of ws) writes.push(rename ? renameWrite(w, u) : w);
  }
  const hooksDir = hooksFolder(root);
  const hookMerges = [];
  const mine_ = ownHooks(root) !== null;
  if (!mine_) notes.push(`hooks folder ${relative(root, hooksDir)} is outside this repository: no hook installed, doctor will say so`);
  // the files the line runs live in the repository: a hook of a folder outside it runs them once its owner puts the line there
  for (const name of HOOKS) writes.push({ path: `.xworkflows/git/${name}`, text: gitText(name), piece: "checks", src: `git/${name}` });
  for (const name of mine_ ? HOOKS : []) {
    const { path, key, before, old, pair, unread, mine, lst, chain, husky, file, fkey, at, text, takes, linked, back, declined: no, link, holds } = hookState(manifest, root, record, name);
    if (!pair && (!lst || mine)) { writes.push({ path, key, text: hookText(name), piece: "checks", src: name, mode: 0o755 }); continue; }
    if (pair && !back) {
      if (unread) notes.push(`not migrated (${unread}): ${path} stays chained the old way`);
      writes.push({ path, key, text: chainText(name), piece: "checks", src: name, mode: 0o755 });
      if (!record.chained.some((c) => c.file === key)) hookMerges.push({ path, text: null, rec: { chained: [{ file: key, to: `${key}.before-xworkflows` }] } });
      continue;
    }
    // the user's hook keeps its name and its place: it gets the line, or nothing, and the line is printed
    // a link that holds the line runs the check, and install writes through no link; a declined hook is looked at only for a line
    // its owner added by hand, which is recorded so uninstall takes it out
    const line = hookLine(name), has = !chain && !linked && !!text?.split("\n").includes(line);
    if (!back && ((no && !has) || (link && holds))) continue;
    const declined = { path, text: null, rec: { declined: [{ file: key, what: "chain" }] } };
    // a migration is one merge, done whole or not at all; a line that cannot be written leaves the old pair, or declines a first one
    const merge = (t, rec) => hookMerges.push({ path: file, text: t, hook: !husky, rec, back, to: path, key, fail: back ? {} : declined.rec });
    if (chain) {
      // a hook that cannot take the line is chained as before it: renamed, and run first from install's hook
      if (ask(`chain:${name}`, `A ${name} hook exists. Chain it (it runs first, then ours)?`, ["no", "yes"]) === "no") { hookMerges.push(declined); continue; }
      if (old) die(1, `exists and is not ours: ${before}`);
      notes.push(`chained ${name}: a hook which depends on its own file name will not work chained`);
      hookMerges.push({ path, text: null, rec: { chained: [{ file: key, to: `${key}.before-xworkflows` }] } });
      writes.push({ path, key, text: chainText(name), piece: "checks", src: name, mode: 0o755, rename: before });
    } else if (linked) notes.push(`not written (symlink): ${file}`);
    // husky runs its file with sh, whatever its #! line says: there the line works also in a file that is not a shell script
    else if (has) {
      if (back || !record.imports.some((i) => i.file === fkey && i.line === line)) merge(null, { imports: [{ file: fkey, line }] });
    } else if (!takes) {
      notes.push(`${file} is not a shell script: nothing written; to run the check, call this line from it as its first command: ${line}`);
      hookMerges.push(declined);
    } else if (text.split("\n").some((l) => l.endsWith(" # xworkflows"))) {
      notes.push(`kept (changed locally): ${file}`);
      if (back) merge(null, {});
    } else if (!back && ask(`chain:${name}`, `A ${name} hook exists. Add the xworkflows line to ${file}? The line runs first, then the rest of the hook.`, ["no", "yes"]) === "no") {
      notes.push(`${file} left as it is; to run the check, add this line to it as its first command: ${line}`);
      hookMerges.push(declined);
    } else merge(withLine(text, line), { imports: [{ file: fkey, line }], created: at ? [] : [file] });
  }
  // install and uninstall share one test: a path with a symlink component is never written or merged
  const hookPaths = new Set(writes.filter((w) => w.src && HOOKS.includes(w.src)).map((w) => w.path));
  const off = (p) => {
    if (hookPaths.has(p)) return false;
    const w = plain(p) ? way(root, p) : {};
    if (!w) return false;
    const n = w.folder ? `not written (not a folder, or not readable): ${w.folder}` : `not written (symlink): ${p}`;
    if (!notes.includes(n)) notes.push(n);
    return true;
  };
  // a write dropped for a folder in the way keeps its record entry (a link does not): a second install and uninstall still know the file
  const gone = writes.filter((w) => off(w.path));
  writes = writes.filter((w) => !gone.includes(w));
  const dropped = gone.filter((w) => plain(w.path) && way(root, w.path)?.folder);
  for (const w of writes) {
    const cur = read(root, w.path);
    if (cur === null || cur === w.text || w.rename || (w.key && earlierHook(manifest, w.src, cur))) continue;
    const rec = record.files[w.key ?? w.path];
    if (!rec) {
      // --yes answers with label 0 here: a file that is not ours is never written over without a typed answer
      if (ask(`file:${w.path}`, `${w.path} exists and is not a text this package wrote. Keep it or write ours over it?`, ["keep mine", "overwrite"], 0) === "overwrite") continue;
      w.keep = true; notes.push(`kept (not ours): ${w.path}  new: ${w.src}`);
    } else if (hash(cur) !== rec.sha256) { w.keep = true; notes.push(`kept (changed locally): ${w.path}  new: ${w.src}`); }
  }
  // a file install wrote that this version no longer ships: found from the record, removed only when the manifest lists it as retired
  // with the hash of the text on disk as the package published it, kept and named once when edited, and then out of the record; the record's hash never decides
  const listed = retiredPaths(manifest, tools);
  const shipped = new Set(writes.map((w) => w.key ?? w.path));
  const retired = [], tiers = JSON.parse(readFileSync(join(PKG, "tiers.json"), "utf8"));
  for (const p of Object.keys(record.files)) {
    const hashes = listed.get(p), u = p.match(UNIT)?.[0];
    // the lite reviewer is install's own, rendered from the project's file: the record's hash says it is still the text install wrote
    const lite = record.files[p]?.piece === "installer" && LITE_FILE.test(p);
    // a unit under kept, this plan's or the record's, is the user's: not judged, as uninstall does
    if ((!hashes && !lite) || kept.includes(u) || record.kept.includes(u) || shipped.has(p) || !plain(p) || !clean(root, p) || !lstatSync(join(root, p), { throwIfNoEntry: false })?.isFile()) continue;
    if (lite ? hash(read(root, p)) === record.files[p].sha256 : published(p, read(root, p), tiers).some((t) => hashes.includes(hash(t)))) retired.push(p);
    // an agent is rendered from the config: its text is the record's hash and no published text, so it is neither deleted nor changed
    else notes.push(`kept (no longer shipped, ${/^\.(?:claude|agents)\/agents\//.test(p) && hash(read(root, p)) === record.files[p]?.sha256 ? "as install recorded it" : "changed locally"}): ${p}`);
  }
  // the module of a hook id the manifest no longer has: removed when it is the text install wrote, else kept and said
  const hasClaude = tools.includes("claude"), hasAg = tools.includes("antigravity");
  const settingsOn = hasClaude && !off(SETTINGS);
  const agHooksOn = hasAg && !off(AG_HOOKS);
  const hooksWiredOn = (!hasClaude || settingsOn) && (!hasAg || agHooksOn);
  const orphans = orphanIds(manifest);
  for (const id of orphans) {
    const p = `.xworkflows/hooks/core/${id}.mjs`, f = record.files[p];
    if (!f || shipped.has(p) || !plain(p) || !clean(root, p) || !lstatSync(join(root, p), { throwIfNoEntry: false })?.isFile()) continue;
    // the settings/hooks merge drops the entries: skipped, the module and its record line stay for a later install
    if (!hooksWiredOn) dropped.push({ path: p });
    else if (hash(read(root, p)) === f.sha256) retired.push(p);
    else notes.push(`kept (no longer shipped, changed locally): ${p}`);
  }
  const merges = [];
  let config;
  try { config = loadConfig(root); } catch (e) { die(1, e.message); }
  let qmd = false;
  const mem = config.memory, { dir: md, line: refused } = memoryFolder(config, root);
  if (!md) notes.push(`not written: ${refused}`);
  else {
    if (!existsSync(join(root, md)) && !off(md)) merges.push({ path: md, text: null, dir: true, verb: "create", rec: { created: [md] } });
    const keep = join(md, "MEMORY.md");
    if (mem.autoDirectory !== false && !existsSync(join(root, keep)) && !off(keep)) merges.push({ path: keep, text: "", verb: "create", rec: { created: [keep] } });
    if (hasClaude && mem.autoDirectory !== false && !off(EARLIER)) merges.push(mergeEarlier(root, md));
    qmd = !mem.index && !localYml(root) && !off(YML);
    if (qmd) merges.push({ path: YML, text: `collections:\n  memory:\n    path: ${JSON.stringify(resolve(root, md))}\n    pattern: "**/*.md"\n`, verb: "write", rec: {} });
    // the marker passes the yml's test and is never written over something that is there
    if (qmd && !off(QMARK) && !lstatSync(join(root, QMARK), { throwIfNoEntry: false })) merges.push({ path: QMARK, text: MARK_TEXT, verb: "write", rec: {} });
  }
  if (settingsOn) { const ms = mergeSettings(root, manifest, record); notes.push(...ms.notes); merges.push(ms); }
  if (agHooksOn) { const ma = mergeAntigravityHooks(root, manifest, record); notes.push(...ma.notes); merges.push(ma); }
  if (hasClaude && !off(LOCAL)) { const local = mergeLocal(root); if (local.note) notes.push(local.note); merges.push(local); }
  if (!off(".gitignore")) merges.push(mergeIgnore(root, qmd, tools));
  if (!off(GI)) merges.push(mergeGraphifyIgnore(root, writes));
  if (!off("AGENTS.md")) merges.push(mergeAgents(root));
  merges.push(...hookMerges);
  if (hasClaude) {
    const link = off("CLAUDE.md");
    const claude = link ? undefined : read(root, "CLAUDE.md");
    if (link) { /* noted above */ } else if (claude === null) {
      merges.push({ path: "CLAUDE.md", text: "@AGENTS.md\n", rec: { imports: [{ file: "CLAUDE.md", line: "@AGENTS.md" }], created: ["CLAUDE.md"] } });
    } else if (!/^@AGENTS\.md\s*$/m.test(claude) && !record.declined.some((d) => d.file === "CLAUDE.md" && d.what === "import")) {
      if (ask("import", IMPORT, ["no", "yes"]) === "yes") {
        merges.push({ path: "CLAUDE.md", text: claude + (claude.endsWith("\n") ? "" : "\n") + "@AGENTS.md\n", rec: { imports: [claude.endsWith("\n") ? { file: "CLAUDE.md", line: "@AGENTS.md" } : { file: "CLAUDE.md", line: "@AGENTS.md", addedNewline: true }] } });
      } else merges.push({ path: "CLAUDE.md", text: null, rec: { declined: [{ file: "CLAUDE.md", what: "import" }] } });
    }
  }
  return { writes, dropped, merges, questions, kept, renamed, notes, retired, orphans: hooksWiredOn ? orphans : new Set(), tools };
}

const differs = (root, w) => !existsSync(join(root, w.path)) || readFileSync(join(root, w.path), "utf8") !== w.text;
const putFile = (root, path, text, mode) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text, { mode });
};

export function apply(pl, root, manifest, record) {
  const out = [], made = [];
  // the folders install had to make, so uninstall stops at the ones that were there; the git folder is not ours to record
  const mk = (d) => { for (; plain(d) && d.split("/")[0] !== ".git" && !existsSync(join(root, d)); d = dirname(d)) made.push(d); };
  // plan() read the tree earlier: a link made since is not written through (a hook's folder was vetted by ownHooks)
  const linked = (path, hook) => { if (!hook && !clean(root, path)) throw new Error(`not written (symlink): ${path}`); };
  const put = (root, path, text, mode, hook) => { linked(path, hook); mk(dirname(path)); putFile(root, path, text, mode); };
  // a folder the removal empties goes with it when it is the package's own: a subfolder of .xworkflows/ or a skill's folder
  for (const p of pl.retired) {
    linked(p); rmSync(join(root, p)); out.push(`removed ${p}`);
    for (let d = dirname(p); /^\.xworkflows\/|^\.(?:claude|agents)\/(skills|agents)\/[^/]+/.test(d) && !readdirSync(join(root, d)).length; d = dirname(d)) { rmdirSync(join(root, d)); out.push(`removed ${d}/`); }
  }
  for (const w of pl.writes) if (!w.keep && differs(root, w)) {
    const hook = HOOKS.includes(w.src);
    linked(w.path, hook);
    if (w.rename) renameSync(join(root, w.path), join(root, w.rename));
    put(root, w.path, w.text, w.mode, hook);
    out.push(w.path);
  }
  const tools = pl.tools ?? (Array.isArray(record.tools) && record.tools.length ? record.tools : ["claude"]);
  const orphaned = record.merged.filter((m) => pl.orphans.has(hookId(m.entry) ?? agHookKeyId(m)));
  const next = { ...record, xworkflows: manifest.version, tools, pieces: {}, files: {}, merged: record.merged.filter((m) => !orphaned.includes(m)), dirs: [...new Set([...(record.dirs ?? []), ...made])], kept: [...new Set([...record.kept, ...pl.kept])], renamed: { ...record.renamed, ...pl.renamed } };
  const moved = [];
  for (const m of pl.merges) {
    let rec = m.rec;
    try {
      if (m.dir) { linked(m.path); mk(m.path); mkdirSync(join(root, m.path), { recursive: true }); out.push(m.path); }
      // a migration writes the line into the old file first and renames it over the hook after: a failed write leaves the old pair whole
      if (m.text !== null) put(root, m.back && m.path === m.to ? m.back : m.path, m.text, undefined, m.hook);
      if (m.back) {
        renameSync(join(root, m.back), join(root, m.to)); moved.push(m.key);
        out.push(`migrated ${basename(m.to)}: ${m.to} has its name back${m.rec.imports ? `; ${m.path} holds the xworkflows line` : ""}`);
      } else if (m.text !== null) out.push(m.path);
    } catch (e) {
      // the new writes of the memory folder and the yml: say so, record nothing, go on; a hook's line the same, in one line, without a stack
      if (!m.verb && !m.fail) throw e;
      out.push(m.verb ? `not written: ${m.path}` : m.back ? `not migrated (${e.code}): ${m.to} stays chained the old way` : `not written (${e.code ?? "symlink"}): ${m.path}`);
      if (!m.fail) continue;
      rec = m.fail;
    }
    for (const [k, list] of Object.entries(rec)) {
      next[k] = [...next[k]];
      // the replaced entry of a hook leaves the record
      if (k === "merged") for (const x of list) {
        const gone = next[k].find((y) => (x.entry?.hooks && x.file === y.file && isDeepStrictEqual(x.key, y.key) && x.entry.hooks[0].command === y.entry?.hooks?.[0]?.command) || (x.file === AG_HOOKS && y.file === AG_HOOKS && isDeepStrictEqual(x.key, y.key)));
        if (gone?.createdKey) { x.createdKey = true; if (gone.levels) x.levels = gone.levels; }
      }
      if (k === "merged") next[k] = next[k].filter((y) => !list.some((x) => (x.entry?.hooks && x.file === y.file && isDeepStrictEqual(x.key, y.key) && x.entry.hooks[0].command === y.entry?.hooks?.[0]?.command) || (x.file === AG_HOOKS && y.file === AG_HOOKS && isDeepStrictEqual(x.key, y.key))));
      for (const x of list) if (!next[k].some((y) => (k === "merged" ? x.file === y.file && isDeepStrictEqual(x.key, y.key) && isDeepStrictEqual(x.entry, y.entry) : (k === "blocks" || k === "imports" ? x.file === y.file && x.line === y.line : isDeepStrictEqual(x, y))))) next[k].push(x);
    }
  }
  // a dropped line's key stays with a remaining line of the same key, as for a replaced entry: uninstall then takes the container out
  for (const g of orphaned) if (g.createdKey) { const to = next.merged.find((y) => y.file === g.file && isDeepStrictEqual(y.key, g.key)); if (to && !to.createdKey) { to.createdKey = true; to.levels = g.levels; } }
  // a hook migrated from the old way is chained no more
  next.chained = next.chained.filter((c) => !moved.includes(c.file));
  // a unit whose folder or agent file is gone leaves its line of .graphifyignore, and the record its entry
  for (const line of new Set(pl.retired.map(giLine).filter((l) => l && !existsSync(join(root, l))))) {
    const t = read(root, GI), ls = t?.split("\n") ?? [];
    if (!next.imports.some((i) => i.file === GI && i.line === line) || !ls.includes(line)) continue;
    ls.splice(ls.indexOf(line), 1);
    put(root, GI, ls.join("\n")); out.push(GI);
    next.imports = next.imports.filter((i) => !(i.file === GI && i.line === line));
  }
  for (const p of manifest.pieces) next.pieces[p.id] = { version: p.version, sha256: p.sha256 };
  for (const w of pl.dropped) if (record.files[w.key ?? w.path]) next.files[w.key ?? w.path] = record.files[w.key ?? w.path];
  for (const w of pl.writes) next.files[w.key ?? w.path] = w.keep ? record.files[w.key ?? w.path] : { piece: w.piece, sha256: hash(w.text) };
  const rp = ".xworkflows/installed.json";
  mk(dirname(rp));
  if (record.dirs) next.dirs = [...new Set([...next.dirs, ...made])]; else delete next.dirs;
  const text = json(next);
  if (!existsSync(join(root, rp)) || readFileSync(join(root, rp), "utf8") !== text) { put(root, rp, text); out.push(rp); }
  return out;
}

async function install(flags) {
  const m = readManifest();
  for (const p of m.pieces) {
    for (const [f, h] of Object.entries(p.files)) {
      if (hash(readFileSync(join(PKG, f), "utf8")) !== h) die(1, `package file changed: ${f}; run pack`);
    }
  }
  let record = { ...EMPTY };
  const rp = join(ROOT, ".xworkflows/installed.json");
  // uninstall refuses a linked record, so install must not read or write through one
  if (!clean(ROOT, ".xworkflows/installed.json")) die(1, "not written (symlink): .xworkflows/installed.json");
  let existingTools = null;
  if (existsSync(rp)) {
    try {
      const parsed = JSON.parse(readFileSync(rp, "utf8"));
      record = { ...EMPTY, ...parsed };
      if (Array.isArray(parsed.tools) && parsed.tools.length) existingTools = parsed.tools.filter((t) => SUPPORTED_TOOLS.includes(t));
      // a record of an earlier version has no dirs: it stays so, because an empty list would switch off the removal of empty parents
      if (!Array.isArray(parsed.dirs)) record.dirs = undefined;
    } catch {
      die(1, ".xworkflows/installed.json does not parse; fix or remove it");
    }
  }
  const tools = flags.tools
    ? (existingTools ? SUPPORTED_TOOLS.filter((t) => existingTools.includes(t) || flags.tools.includes(t)) : flags.tools)
    : (existingTools?.length ? existingTools : ["claude"]);
  let pl = plan(m, ROOT, record, {}, tools);
  // a linked folder, or a file or unreadable folder in the way, under .xworkflows would leave the hooks wired to files that were not written
  const linked = pl.notes.find((n) => /^not written \((symlink\)|not a folder, or not readable\)): \.xworkflows\//.test(n));
  if (linked) die(1, linked);
  const ans = {}, auto = [];
  const rl = pl.questions.length && !flags.yes && !flags["dry-run"] && process.stdin.isTTY ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  // Ctrl-C at a question stops install: every write comes after the questions; 130 is a shell's code for a stop by Ctrl-C
  rl?.on("SIGINT", () => die(130, "\ninstall stopped: nothing written"));
  let ended = false;
  for (const q of pl.questions) {
    if (flags.yes) ans[q.id] = q.labels[q.yes];
    else if (rl && !ended) {
      // end of input rejects the question, an empty answer as Enter is; the ones after are never shown, so they are listed
      let r = "";
      try { r = (await rl.question(`${q.text} (${q.labels.join(" / ")}) `)).trim().toLowerCase(); } catch { ended = true; console.log(); }
      ans[q.id] = r && q.labels[1].toLowerCase().startsWith(r) ? q.labels[1] : q.labels[0];
    } else { ans[q.id] = q.labels[0]; auto.push(`answered for you: ${q.text} -> ${q.labels[0]}`); }
  }
  rl?.close();
  if (pl.questions.length) pl = plan(m, ROOT, record, ans, tools);
  for (const n of pl.notes) console.log(n);
  if (flags["dry-run"]) {
    for (const w of pl.writes) if (!w.keep && differs(ROOT, w)) console.log(`${w.rename ? `would rename ${w.path} to ${w.rename}\n` : ""}would write ${w.path}`);
    for (const p of pl.retired) console.log(`would remove ${p}`);
    for (const m of pl.merges) {
      const line = m.text !== null && m.fail ? `would add the line to ${m.path}` : null;
      if (m.back) console.log(`would migrate ${basename(m.to)}: ${m.to} gets its name back${line ? `; ${line}` : ""}`);
      else if (line) console.log(line);
      else if (m.text !== null || m.dir) console.log(`would ${m.verb ?? "merge"} ${m.path}`);
    }
  } else {
    const done = apply(pl, ROOT, m, record);
    console.log(done.length ? done.join("\n") : "nothing to do");
    const approved = /^status:\s*approved\s*$/m.test(read(ROOT, ".xworkflows/summary.md") ?? "");
    const targetName = tools.length === 2 ? "Claude Code or Antigravity" : tools[0] === "antigravity" ? "Antigravity" : "Claude Code";
    console.log(approved && tools.includes("antigravity") ? `Next: open ${targetName} and type /next-step (already adapted)` : `Next: open ${targetName} and type /adapt`);
  }
  for (const a of auto) console.log(a);
}

async function doctor() {
  const out = [];
  let nf = 0, nw = 0;
  const INSTALL = "run xworkflows install";
  const say = (lvl, t) => { out.push(`${lvl === "ok" ? "ok  " : lvl} ${t}`); if (lvl === "fail") nf++; if (lvl === "warn") nw++; };
  const finish = () => {
    console.log(out.join("\n") + `\ndoctor: ${nf} fail, ${nw} warn`);
    process.exit(nf ? 1 : 0);
  };
  // one catch around the body: a throw anywhere is one fail line with its message, and doctor ends as it always does
  try { await checks(); } catch (e) { say("fail", `doctor stopped: ${e?.message ?? e}`); }
  finish();
  async function checks() {
  say("ok", "git repository");
  // a hook run the way Claude Code runs it: the settings command, the event on standard input
  const TIMEOUT = Number(process.env.XWORKFLOWS_PROBE_TIMEOUT_MS) || 10000;
  const fire = (command, event) => {
    const state = mkdtempSync(join(tmpdir(), "xwf-doctor-"));
    const env = { ...process.env, CLAUDE_PROJECT_DIR: ROOT, XWORKFLOWS_STATE_DIR: state, XWORKFLOWS_DRY: "1" };
    delete env.XWORKFLOWS_FREE; delete env.XWORKFLOWS_RECORD;
    const r = spawnSync(command, { shell: true, cwd: ROOT, env, input: JSON.stringify(event), encoding: "utf8", timeout: TIMEOUT });
    rmSync(state, { recursive: true, force: true });
    return r;
  };
  let rec;
  try { rec = { ...EMPTY, ...JSON.parse(readFileSync(join(ROOT, ".xworkflows/installed.json"), "utf8")) }; }
  catch (e) { say("fail", e.code === "ENOENT" ? `not installed: ${INSTALL}` : `installed.json does not parse: fix or remove .xworkflows/installed.json, then ${INSTALL}`); return finish(); }
  say("ok", "installed.json parses");
  const major = Number(process.versions.node.split(".")[0]);
  say(major >= 22 ? "ok" : "fail", `node ${process.versions.node}${major >= 22 ? "" : ": install Node 22 or newer"}`);
  const g = spawnSync("git", ["--version"], { encoding: "utf8" });
  say(g.status === 0 ? "ok" : "fail", g.status === 0 ? g.stdout.trim() : "git does not answer: install git and put it on PATH");
  // 2
  const gitHooks = new Map(HOOKS.map((n) => [hookKey(ROOT, n), n]));
  for (const [f, { sha256 }] of Object.entries(rec.files)) {
    let t;
    // the record names the three git hooks under .git/, which is a file in a linked worktree: git says where they are
    const abs = f.startsWith(".git/hooks/") ? join(hooksFolder(ROOT), f.slice(".git/hooks/".length)) : join(ROOT, f);
    // install writes over no folder and no file it cannot read
    try { t = readFileSync(abs, "utf8"); } catch (e) { say("fail", `missing or unreadable: ${f}: ${e.code === "ENOTDIR" || e.code === "ENOENT" && !lstatSync(abs, { throwIfNoEntry: false }) ? "" : `delete ${f}, then `}${INSTALL}`); continue; }
    // a git hook that holds no text of the package is the project's own: install records it as such, and nothing of it is deleted
    // hash() drops the CR of a CRLF, and the shell cannot run a file the line runs that holds one
    const n = gitHooks.get(f), same = hash(t) === sha256 && !(f.startsWith(".xworkflows/git/") && t.includes("\r"));
    say(same ? "ok" : "warn", same ? f : n && !hookState(readManifest(), ROOT, rec, n).mine ? `changed locally: ${f}, the project's own hook now: ${INSTALL}` : `changed locally: ${f}; to put the package's copy back, delete it, then ${INSTALL} (install keeps a changed file)`);
  }
  const tools = Array.isArray(rec.tools) && rec.tools.length ? rec.tools : ["claude"];
  const hasClaude = tools.includes("claude"), hasAg = tools.includes("antigravity");
  for (const k of rec.kept) {
    const gs = (k === ".claude/skills/grill" || k === ".agents/skills/grill") && rec.pieces["design-first"] ? read(ROOT, `${k}/SKILL.md`) : null;
    if (gs !== null && !gs.includes("node .xworkflows/mark.mjs grill")) say("fail", 'kept grill never marks itself: spec writes will be denied. Add the line "node .xworkflows/mark.mjs grill" to its first step');
    else say("warn", `kept theirs: ${k}; to use the package's copy, delete ${k}, take it out of "kept" in .xworkflows/installed.json and ${INSTALL}`);
  }
  // 3
  const readArr = (file, key) => { try { const a = key.reduce((o, k) => o[k], JSON.parse(readFileSync(join(ROOT, file), "utf8"))); return Array.isArray(a) ? a : []; } catch { return []; } };
  // an entry at the package's place that is not the present text: said from the manifest, whether the record holds it or not
  const differs = (w, arr, lbl) => {
    const mine = arr.find((e) => w.ours(e));
    if (!mine || isDeepStrictEqual(mine, w.entry)) return false;
    say("warn", w.earlier.some((x) => isDeepStrictEqual(x, mine)) ? `${lbl} hook ${w.id} holds an earlier text of the package: ${INSTALL} replaces it` : `${lbl} hook ${w.id} differs from every text the package published; to get the package's entry, delete it and ${INSTALL}`);
    return true;
  };
  const manifest = readManifest();
  const wants = hasClaude ? settingsWants(manifest).filter((w) => w.id) : [];
  const agWants = hasAg ? agHooksWants(manifest) : [];
  let agObj = null;
  if (hasAg) try { agObj = JSON.parse(readFileSync(join(ROOT, AG_HOOKS), "utf8")); } catch {}
  for (const m of rec.merged) {
    if (m.file === AG_HOOKS) {
      if (!hasAg) continue;
      const k = m.key[0], lbl = `${m.file} ${k}`;
      const w = agWants.find((x) => x.key === k);
      const cur = isObj(agObj) ? agObj[k] : undefined;
      if (cur === undefined) say("fail", `merged entry missing: ${lbl}: ${INSTALL}`);
      else if (w && !isDeepStrictEqual(cur, w.entry)) say("warn", `${lbl} hook ${w.id} differs from the package's entry; to get the package's entry, delete ${k} and ${INSTALL}`);
      else say("ok", `merged: ${lbl}`);
      continue;
    }
    if (!hasClaude) continue;
    const arr = readArr(m.file, m.key);
    const id = hookId(m.entry);
    const lbl = `${m.file} ${m.key.join(".")}`;
    const w = id && wants.find((x) => x.id === id && isDeepStrictEqual(x.key, m.key));
    if (w && differs(w, arr, lbl)) continue;
    if (arr.some((e) => isDeepStrictEqual(e, m.entry))) say("ok", `merged: ${lbl}`);
    else say("fail", `merged entry missing: ${lbl}: ${INSTALL}`);
  }
  for (const w of wants) if (!rec.merged.some((m) => m.file === SETTINGS && isDeepStrictEqual(m.key, w.key) && w.ours(m.entry))) differs(w, readArr(SETTINGS, w.key), `${SETTINGS} ${w.key.join(".")}`);
  for (const w of agWants) if (!rec.merged.some((m) => m.file === AG_HOOKS && m.key[0] === w.key)) {
    const cur = isObj(agObj) ? agObj[w.key] : undefined;
    if (cur === undefined) say("fail", `merged entry missing: ${AG_HOOKS} ${w.key}: ${INSTALL}`);
    else if (!isDeepStrictEqual(cur, w.entry)) say("warn", `${AG_HOOKS} ${w.key} hook ${w.id} differs from the package's entry; to get the package's entry, delete ${w.key} and ${INSTALL}`);
  }
  if (hasClaude) {
    const inSettings = (key) => { try { return key.reduce((o, k) => o?.[k], JSON.parse(readFileSync(join(ROOT, ".claude/settings.json"), "utf8"))); } catch { return undefined; } };
    for (const { key } of pluginWants(manifest, ROOT, false, (t) => say("warn", t))) {
      const lbl = `.claude/settings.json ${key.join(".")}`;
      if (inSettings(key) !== undefined) say("ok", `merged: ${lbl}`);
      else say("fail", `merged entry missing: ${lbl}: ${INSTALL}`);
    }
  }
  // 4
  if (!rec.blocks.length) say("fail", `AGENTS.md block was never written: ${INSTALL}`);
  else if ((read(ROOT, "AGENTS.md") ?? "").includes(agentsBlock())) say("ok", "AGENTS.md block matches the template");
  else say("fail", `AGENTS.md block differs from the template: ${INSTALL}`);
  if (hasClaude) {
    // a CLAUDE.md that is a link to AGENTS.md is the same file
    const one = (() => { try { return realpathSync(join(ROOT, "CLAUDE.md")) === realpathSync(join(ROOT, "AGENTS.md")); } catch { return false; } })();
    if (one || /^@AGENTS\.md\s*$/m.test(read(ROOT, "CLAUDE.md") ?? "")) say("ok", "CLAUDE.md imports AGENTS.md");
    else if (rec.declined.some((d) => d.file === "CLAUDE.md" && d.what === "import")) say("warn", "CLAUDE.md does not import AGENTS.md: add the line @AGENTS.md");
    else say("fail", "CLAUDE.md does not import AGENTS.md: add the line @AGENTS.md");
  }
  // config
  let cfg = {}, unparsed = false;
  // a file holding null is said by the config line below
  try { cfg = JSON.parse(readFileSync(join(ROOT, ".xworkflows/config.json"), "utf8")); unparsed = !isObj(cfg); cfg ??= {}; } catch (e) { unparsed = e.code !== "ENOENT"; }
  const FIXJSON = "fix the JSON of .xworkflows/config.json";
  const specs = cfg.paths?.specs ?? "docs/superpowers/specs";
  // a memory.dir that is not a text reads as the default, as the hooks read it
  const memSet = cfg.memory?.dir === undefined ? DEFAULTS.memory.dir : cfg.memory.dir;
  if (typeof memSet !== "string") say("fail", `memory.dir must be text: set it in .xworkflows/config.json to a folder inside the repository (the default is "${DEFAULTS.memory.dir}")`);
  // the folder the hooks use, or their line refusing it: then no line below names that folder
  const MEMFIX = `set memory.dir in .xworkflows/config.json to a folder inside the repository, then ${INSTALL}`;
  const { dir: mem, line: memRefused } = memoryFolder(cfg, ROOT);
  if (memRefused) say("fail", `${memRefused}: ${MEMFIX}`);
  const budget = cfg.tokens?.alwaysLoadedBytes ?? 24000;
  // 5
  if (hasClaude) {
    let command;
    try {
      const s = JSON.parse(readFileSync(join(ROOT, ".claude/settings.json"), "utf8"));
      command = Object.values(s.hooks ?? {}).flat().find((e) => isOurs(e, "design-first"))?.hooks.find((h) => `${h.command} `.includes('claude design-first '))?.command;
    } catch {}
    if (!command) say("fail", `probe: no design-first hook entry: ${INSTALL}`);
    else {
      const event = { session_id: `doctor-${process.pid}`, cwd: ROOT, hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: join(ROOT, specs, "xwf-doctor-probe.md"), content: "# probe\n" } };
      const r = fire(command, event);
      let d; try { d = JSON.parse(r.stdout).hookSpecificOutput?.permissionDecision; } catch {}
      say(d === "deny" ? "ok" : "fail", d === "deny" ? "probe: design-first denies a spec write" : `probe: expected deny, got ${d ?? "no valid output"}: ${unparsed ? FIXJSON : `delete the files named "changed locally" above, then ${INSTALL}`}`);
    }
  }
  if (hasAg) {
    const pfx = hasClaude ? "probe (antigravity)" : "probe";
    const command = agObj?.["xworkflows-design-first"]?.PreToolUse?.[0]?.hooks?.[0]?.command;
    if (!command) say("fail", `${pfx}: no design-first hook entry: ${INSTALL} --tool antigravity`);
    else {
      const event = { conversationId: `doctor-${process.pid}`, workspacePaths: [ROOT], cwd: ROOT, hookEventName: "PreToolUse", toolCall: { name: "write_file", args: { Path: join(ROOT, specs, "xwf-doctor-probe.md"), Content: "# probe\n" } } };
      const r = fire(command, event);
      let d; try { d = JSON.parse(r.stdout).decision; } catch {}
      say(d === "deny" ? "ok" : "fail", d === "deny" ? `${pfx}: design-first denies a spec write` : `${pfx}: expected deny, got ${d ?? "no valid output"}: ${unparsed ? FIXJSON : `delete the files named "changed locally" above, then ${INSTALL} --tool antigravity`}`);
    }
  }
  // 6
  const seen = new Set();
  let bytes = 0;
  const load = (p) => {
    if (seen.has(p)) return;
    let text;
    try { if (!statSync(p).isFile()) return; text = readFileSync(p, "utf8"); } catch { return; }
    seen.add(p);
    bytes += statSync(p).size;
    for (const l of text.split("\n")) {
      const mdLink = l.trim().match(/^@\[[^\]]*\]\(([^)]+)\)/);
      const plainImp = !mdLink && l.trim().match(/^@(\S+)/);
      const target = mdLink?.[1] ?? plainImp?.[1];
      if (target) load(resolve(dirname(p), target));
    }
  };
  if (hasClaude) load(join(ROOT, "CLAUDE.md"));
  if (hasAg) { load(join(ROOT, "AGENTS.md")); load(join(ROOT, "GEMINI.md")); }
  const memFile = mem && join(ROOT, mem, "MEMORY.md");
  if (memFile && existsSync(memFile) && !seen.has(memFile)) { seen.add(memFile); bytes += statSync(memFile).size; }
  say(bytes > budget ? "fail" : "ok", `always-loaded: ${bytes} bytes of ${budget}${bytes > budget ? ": shorten CLAUDE.md, AGENTS.md and what they import, or raise tokens.alwaysLoadedBytes in .xworkflows/config.json" : ""}`);
  // 7
  const has = (cmd) => spawnSync("sh", ["-c", `command -v ${cmd}`]).status === 0;
  // the installed copy first: the project runs that one; the package's when a piece is not installed there
  const mod = (rel) => import(pathToFileURL(existsSync(join(ROOT, ".xworkflows", rel)) ? join(ROOT, ".xworkflows", rel) : join(PKG, rel)).href);
  const tooling = async () => {
    let conf = DEFAULTS, run = { TABLE: [], PACKS: [] };
    try {
      conf = loadConfig(ROOT);
      run = await mod("checks/run.mjs");
      const needs = {};
      for (const b of run.TABLE) for (const k of [].concat((await mod(`checks/${b}.mjs`)).needs ?? [])) (needs[k] ??= []).push(b);
      const gone = missing(conf, PROJECT_KEYS);
      for (const k of gone) say("fail", `not configured: ${k}${needs[k] ? ` (needed by ${needs[k].join(", ")})` : ""}, run /adapt`);
      if (!gone.length) say("ok", "config: every project key is set");
      // a value one level down whose default is an object stops the checks that read it, as a section does
      for (const [sec, d] of Object.entries(DEFAULTS)) for (const k in isObj(d) ? d : {}) if (isObj(d[k]) && cfg[sec]?.[k] !== undefined && !isObj(cfg[sec][k])) say("fail", `config: .xworkflows/config.json: ${sec}.${k} must be an object: ${SECTION_FIX}`);
    } catch (e) {
      const m = e.message;
      say("fail", `config: ${m}: ${m.startsWith(".xworkflows/config.json does not parse") ? FIXJSON : /^\.xworkflows\/config\.json: \S+ must be an object$/.test(m) ? SECTION_FIX : `if a file of the package is named "changed locally" above, delete it; then ${INSTALL}`}`);
    }
    if (conf.paths.code?.length) {
      const dir = conf.lookup.index.folder;
      // an empty command is the default, as in the git hooks
      const cmd = conf.lookup.index.command || DEFAULTS.lookup.index.command;
      if (typeof cmd !== "string") say("fail", `lookup.index.command must be text: set it in .xworkflows/config.json (the default is "${DEFAULTS.lookup.index.command}")`);
      else {
        // the tool is the first word of lookup.index.command, as the git hooks read it
        const tool = cmd.split(" ")[0];
        say(has(sh(tool)) ? "ok" : "fail", has(sh(tool)) ? `${tool} command` : `${tool} command is missing${tool === "graphify" ? ": uv tool install graphifyy" : ""}`);
        say(existsSync(join(ROOT, dir, "graph.json")) ? "ok" : "fail", existsSync(join(ROOT, dir, "graph.json")) ? `${tool} index` : `${dir}/graph.json is missing: ${sh(tool)} update .`);
      }
    }
    // a memory.index that is not text would reach qmd as an argument: say so, and use qmd's default index
    let idx = conf.memory.index;
    if (idx && typeof idx !== "string") { say("fail", "memory.index must be text: set it in .xworkflows/config.json, or take it out for qmd's default index"); idx = undefined; }
    if (!has("qmd")) say("fail", "qmd command is missing: npm install -g @tobilu/qmd");
    else if (mem && !existsSync(join(ROOT, mem))) say("warn", `no memory folder yet: ${mem}: ${INSTALL}`);
    else if (mem) {
      const abs = resolve(ROOT, mem);
      const q = (...a) => spawnSync("qmd", [...(idx ? ["--index", idx] : []), "collection", ...a], { cwd: ROOT, encoding: "utf8", timeout: TIMEOUT });
      const qcmd = `qmd${idx ? ` --index ${sh(idx)}` : ""}`;
      // no minimum is compared: the line only says which qmd this is
      const v = spawnSync("qmd", ["--version"], { cwd: ROOT, encoding: "utf8", timeout: TIMEOUT });
      const ver = v.error || v.status !== 0 ? "" : (v.stdout ?? "").trim().split("\n")[0];
      say(ver ? "ok" : "warn", ver || "qmd does not answer --version: run qmd --version to see why");
      const cache = join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "qmd", "models");
      if (!modelsIn(cache)) say("warn", `qmd models are missing from ${cache}: run qmd pull`);
      const l = q("list");
      if (l.error || l.status !== 0) say("warn", `qmd did not answer: collections of ${mem} not checked: run ${qcmd} collection list to see why`);
      else {
        // only `collection show <name>` prints the path
        const names = [...(l.stdout ?? "").matchAll(/^(\S+) \(qmd:\/\//gm)].map((m) => m[1]);
        const covers = names.some((n) => {
          const t = q("show", n).stdout?.match(/^\s*Path:\s+(.+?)\s*$/m)?.[1]?.replace(/\/$/, "");
          return t && (abs === t || abs.startsWith(t + "/"));
        });
        const yml = localYml(ROOT);
        const why = idx ? `${qcmd} collection add ${sh(mem)}` : !yml ? INSTALL : (read(ROOT, yml) ?? "").includes(abs) ? `this qmd does not read ${yml}, which names it: npm install -g @tobilu/qmd@latest` : `${yml} names no collection with the path ${abs}; add one, or delete .qmd and run install again`;
        say(covers ? "ok" : "fail", covers ? `qmd collection covers ${mem}` : `no qmd collection covers ${mem}: ${why}`);
      }
    }
    // one sentence per state of the hook git runs; it says ok only where a push runs the check, and every other one names a step that works
    for (const name of ["pre-push", "pre-commit"]) {
    const hook = hookState(readManifest(), ROOT, rec, name), at = (p) => p && sh(join(ROOT, p)), P = `${name} hook`;
    let exec = false;
    try { accessSync(join(ROOT, hook.path), constants.X_OK); exec = true; } catch {}
    const of = hook.outside ? " of the folder outside this repository" : "";
    const UNDECLINE = `take the entry of ${hook.key} out of "declined" in .xworkflows/installed.json`;
    const ours = [exec ? "ok" : "fail", exec ? `${P} is ours` : `${P} is ours but not executable, so git ignores it: chmod +x ${at(hook.path)}`];
    const SAY = {
      none: ["fail", `${P} is missing or not ours: ${INSTALL}`],
      own: ours,
      chained: ours,
      old: ["warn", `${P} holds an earlier text of the package: ${INSTALL} replaces it`],
      missing: ["fail", `${P} runs .xworkflows/git/${name}, which is missing: ${INSTALL}`],
      changed: ["fail", `${P} runs .xworkflows/git/${name}, which no longer holds the package's text: delete .xworkflows/git/${name}, then ${INSTALL}`],
      line: [exec ? "ok" : "fail", exec ? `${P}${of} runs the check` : `${P}${of} holds the check but is not executable, so git ignores it: chmod +x ${at(hook.path)}`],
      add: ["fail", `${P} does not run the check: add this line to ${at(hook.file)} as its first command: ${hookLine(name)}${hook.link ? " ; it is a link, which uninstall does not write through: the line is yours to take out after uninstall" : ""}`],
      chain: ["fail", `${P} cannot take the xworkflows line and is not chained: ${INSTALL} and answer yes to chain it`],
      blocked: ["fail", `${P} cannot take the xworkflows line, and ${at(hook.before)} is in the way of chaining it: move that file out of the hooks folder, ${hook.declined ? `${UNDECLINE}, ` : ""}then ${INSTALL} and answer yes to chain it`],
      declined: ["fail", `${P} does not run the check: its line or its chain was declined at install; to be asked again, ${UNDECLINE}, then ${INSTALL} and answer yes${hook.takes && !hook.chain ? `; or add this line to ${at(hook.file)} as its first command: ${hookLine(name)}` : ""}`],
      outside: ["fail", `${P}: core.hooksPath points outside this repository, where install writes no hook; either add this line to ${at(hook.path)} as its first command${hook.guarded ? ", in place of the line an earlier xworkflows gave, which hands the rest of the hook no pushed refs" : ""}: ${hookLine(name)} ;${hook.guarded ? ` then ${INSTALL}, here and in every other project on the folder that an earlier xworkflows installed, since until then the line refuses every push there;` : ""} it runs in every repository that uses the folder, silent where xworkflows is not installed, and is yours to take out after uninstall; or point this repository at its own hooks folder, after which the hooks of the other folder no longer run here: run: git config core.hooksPath "$(git rev-parse --path-format=absolute --git-common-dir)/hooks"; then ${INSTALL}`],
    };
    say(...SAY[hook.state]);
    }
    // the lite reviewer is a copy of the project's risk reviewer: it follows its source only when install runs again
    const allWrites = conf.paths.riskLite?.length ? pkgWrites(manifest, ROOT, tools) : [];
    for (const dir of [...(hasClaude ? [".claude"] : []), ...(hasAg ? [".agents"] : [])]) {
      const lw = allWrites.find((w) => w.src === `${dir}/agents/${conf.roles.riskReviewer}.md`);
      // a recorded file that is missing or changed is said by the files loop: one step for the file
      const recLite = rec.files[lw?.path], curLite = lw && read(ROOT, lw.path);
      if (lw && curLite !== lw.text && (!recLite || (curLite !== null && hash(curLite) === recLite.sha256))) say("warn", `${lw.path} is not the render of ${lw.src}: ${INSTALL}`);
    }
    const sb = conf.tokens.sessionStartBytes;
    if (hasClaude) {
      let st = {}, local = {};
      try { st = JSON.parse(readFileSync(join(ROOT, ".claude/settings.json"), "utf8")); } catch {}
      try { local = JSON.parse(readFileSync(join(ROOT, ".claude/settings.local.json"), "utf8")); } catch {}
      let bytes = 0;
      // a session file with as many sessions beside it as make the memory hook suggest dream, as the hook reads the threshold
      // shortcut: a threshold over 1000 is probed with 1000 sessions, so its line is not measured; raise it when a project sets one
      const after = conf.dream?.suggestAfterSessions, sessions = mkdtempSync(join(tmpdir(), "xwf-doctor-sessions-"));
      for (let i = 0; i <= Math.min(Number.isInteger(after) && after > 0 ? after : DEFAULTS.dream.suggestAfterSessions, 1000); i++) writeFileSync(join(sessions, `${i}.jsonl`), "");
      for (const h of (st.hooks?.SessionStart ?? []).flatMap((e) => e.hooks ?? [])) {
        if (!`${h.command} `.includes('/.xworkflows/hooks/run.mjs" claude ')) continue;
        const out = fire(h.command, { session_id: `doctor-${process.pid}`, cwd: ROOT, hook_event_name: "SessionStart", source: "startup", transcript_path: join(sessions, "0.jsonl") }).stdout ?? "";
        // the hand-off is the last session's text, not the hook's: its bytes stay out of the measure, and the hook alone says whether it loads
        if (!isOurs({ hooks: [h] }, "handoff-load")) { bytes += Buffer.byteLength(out); continue; }
        // the hook's notice alone, never its context, which holds the hand-off text itself
        let note; try { note = JSON.parse(out).systemMessage; } catch {}
        if (typeof note === "string" && note.startsWith("The hand-off .xworkflows/handoff.md was not loaded")) say("warn", ".xworkflows/handoff.md was not loaded: it is over tokens.handoffBytes; shorten it");
      }
      rmSync(sessions, { recursive: true, force: true });
      say(bytes > sb ? "fail" : "ok", `session-start text: ${bytes} bytes of ${sb}${bytes > sb ? ": raise tokens.sessionStartBytes in .xworkflows/config.json or cut what the hook prints" : ""}`);
      const ai = st.attribution && typeof st.attribution === "object" ? [st.attribution.commit, st.attribution.pr].some((x) => x) : !!st.attribution;
      if (ai) say("warn", 'attribution in .claude/settings.json shows an AI line: set "attribution" to {"commit": "", "pr": ""} there');
      const amd = local.autoMemoryDirectory, abs = mem && resolve(ROOT, mem);
      if (mem) {
        // a link out that memory.outside lists
        try {
          const where = real(abs), base = real(ROOT);
          if (where !== base && !where.startsWith(base + sep)) say("warn", 'the memory folder is outside the repository: qmd indexes it only after "qmd trust" is run here');
        } catch {}
        if (conf.memory?.autoDirectory === false) {} // the owner turned the key off
        else if (amd === undefined) say("warn", `autoMemoryDirectory is not set in .claude/settings.local.json: add "autoMemoryDirectory": "${abs}" to it`);
        else if (typeof amd !== "string" || !(resolve(ROOT, amd) + sep).startsWith(abs + sep)) say("warn", `autoMemoryDirectory is not the memory folder ${mem}: set it to "${abs}" in .claude/settings.local.json`);
      }
    }
    if (hasAg) {
      let agBytes = 0;
      for (const [k, def] of isObj(agObj) ? Object.entries(agObj) : []) {
        for (const h of Array.isArray(def?.SessionStart) ? def.SessionStart : []) {
          if (!`${h?.command} `.includes('/.xworkflows/hooks/run.mjs" antigravity ')) continue;
          const out = fire(h.command, { conversationId: `doctor-${process.pid}`, workspacePaths: [ROOT], cwd: ROOT, hookEventName: "SessionStart", transcriptPath: "" }).stdout ?? "";
          if (k !== "xworkflows-handoff-load") { agBytes += Buffer.byteLength(out); continue; }
          let note; try { note = JSON.parse(out).injectSteps?.[0]?.systemMessage?.systemMessage; } catch {}
          if (typeof note === "string" && note.startsWith("The hand-off .xworkflows/handoff.md was not loaded")) say("warn", ".xworkflows/handoff.md was not loaded: it is over tokens.handoffBytes; shorten it");
        }
      }
      const lbl = hasClaude ? "session-start text (antigravity)" : "session-start text";
      say(agBytes > sb ? "fail" : "ok", `${lbl}: ${agBytes} bytes of ${sb}${agBytes > sb ? ": raise tokens.sessionStartBytes in .xworkflows/config.json or cut what the hook prints" : ""}`);
      if (!hasClaude && mem) {
        const abs = resolve(ROOT, mem);
        try {
          const where = real(abs), base = real(ROOT);
          if (where !== base && !where.startsWith(base + sep)) say("warn", 'the memory folder is outside the repository: qmd indexes it only after "qmd trust" is run here');
        } catch {}
      }
    }
    for (const n of Object.keys(conf.packs).filter((n) => run.PACKS.includes(n))) {
      let tool;
      try { tool = (await mod(`checks/packs/${n}.mjs`)).TOOL; } catch { continue; }
      if (!tool) continue;
      if (!has(tool.command)) { say("fail", `pack ${n}: ${tool.command} command is missing: install ${tool.command}, or take "${n}" out of packs in .xworkflows/config.json`); continue; }
      const v = spawnSync(tool.command, ["--version"], { encoding: "utf8", timeout: TIMEOUT });
      const got = `${v.stdout}${v.stderr}`.match(/\d+\.\d+\.\d+/)?.[0];
      say(got === tool.version ? "ok" : "warn", got === tool.version ? `pack ${n}: ${got}` : `pack ${n}: version ${got ?? "unknown"}, tested with ${tool.version}: install ${tool.command} ${tool.version}`);
    }
    if (hasClaude) {
      // shortcut: reads the whole session file, when sessions grow past a few MB read only the first lines
      const sess = join(homedir(), ".claude/projects", ROOT.replace(/[^a-zA-Z0-9]/g, "-"));
      let first;
      try {
        const newest = readdirSync(sess).filter((f) => f.endsWith(".jsonl")).map((f) => [statSync(join(sess, f)).mtimeMs, f]).sort((a, b) => b[0] - a[0])[0];
        for (const line of readFileSync(join(sess, newest[1]), "utf8").split("\n")) {
          let u; try { u = JSON.parse(line)?.message?.usage; } catch {}
          if (u) { first = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0); break; }
        }
      } catch {}
      say("ok", first === undefined ? "first turn: no session recorded" : `first turn: ${first} input tokens (newest session)`);
    }
    if (hasAg) {
      let first;
      try {
        const sessions = JSON.parse(readFileSync(join(ROOT, EARLIER), "utf8"))?.antigravity?.sessions ?? [];
        const newest = (Array.isArray(sessions) ? sessions : [])
          .filter((s) => typeof s?.transcript === "string" && existsSync(s.transcript))
          .map((s) => [statSync(s.transcript).mtimeMs, s.transcript])
          .sort((a, b) => b[0] - a[0])[0];
        if (newest) {
          for (const line of readFileSync(newest[1], "utf8").split("\n")) {
            let o; try { o = JSON.parse(line); } catch {}
            if (o?.type === "PLANNER_RESPONSE" && Number.isFinite(o.input_tokens)) { first = o.input_tokens + (o.cache_read_tokens ?? 0); break; }
          }
        }
      } catch {}
      const lbl = hasClaude ? "first turn (antigravity)" : "first turn";
      say("ok", first === undefined ? `${lbl}: no session recorded` : `${lbl}: ${first} input tokens (newest session)`);
    }
  };
  await tooling();
  if (hasClaude) say("ok", "Claude Code: tested");
  if (hasAg) say("ok", "Antigravity: tested");
  }
}

const SETTINGS = ".claude/settings.json", LOCAL = ".claude/settings.local.json", LOCAL_KEY = "autoMemoryDirectory", AG_HOOKS = ".agents/hooks.json";
const FIVE = [SETTINGS, LOCAL, AG_HOOKS, ".gitignore", GI, "AGENTS.md", "CLAUDE.md"];
// The lines install adds to the files it merges into.
const LINES = new Map([[".gitignore", IGNORE.map(([l]) => l)], ["CLAUDE.md", ["@AGENTS.md"]]]);

// installed.json is the project's text, so it is never the package's word: uninstall removes only what this package version
// writes (manifest, target(), the fixed lines, keys and hook texts above). The record answers yes-or-no questions about those.
function uninstall() {
  let rec, noDirs;
  try { const raw = JSON.parse(readFileSync(join(ROOT, ".xworkflows/installed.json"), "utf8")); noDirs = !Array.isArray(raw?.dirs); rec = { ...EMPTY, ...raw }; }
  catch (e) { die(1, e.code === "ENOENT" ? "not installed" : ".xworkflows/installed.json does not parse; fix or remove it"); }
  for (const k of ["merged", "blocks", "imports", "scalars", "chained"]) rec[k] = Array.isArray(rec[k]) ? rec[k].filter((e) => e && typeof e === "object") : [];
  for (const k of ["created", "kept", "dirs"]) rec[k] = Array.isArray(rec[k]) ? rec[k] : [];
  if (!rec.files || typeof rec.files !== "object" || Array.isArray(rec.files)) rec.files = {};
  const tools = Array.isArray(rec.tools) && rec.tools.length ? rec.tools : ["claude"];
  const manifest = readManifest();
  const out = [], gone = [];
  // the package's own folders go when empty, listed or not; the shared parents only when the record lists them, or has no list at all
  const units = pkgWrites(manifest, ROOT, tools).map((w) => w.path.match(UNIT)?.[0]).filter(Boolean).flatMap((u) => [u, `${dirname(u)}/xwf-${basename(u)}`]);
  const own = (d) => d === ".xworkflows" || d.startsWith(".xworkflows/") || units.some((u) => d === u || d.startsWith(`${u}/`));
  if (rec.xworkflows !== manifest.version) out.push(`record written by xworkflows ${rec.xworkflows || "unknown"}; this is ${manifest.version}`);

  const hooksDir = ownHooks(ROOT);
  const hookRel = new Map(hooksDir ? HOOKS.map((n) => [n, hookKey(ROOT, n)]) : []);
  const hookSet = new Set(hookRel.values());
  const wanted = new Map(HOOKS.map((n) => [`.xworkflows/git/${n}`, gitText(n)])); // path -> the text plan() writes there, renamed units included
  for (const w of pkgWrites(manifest, ROOT, tools)) {
    wanted.set(w.path, w.text);
    const u = w.path.match(UNIT)?.[0];
    if (u) { const x = renameWrite(w, u); wanted.set(x.path, x.text); }
  }
  // the lite reviewer file is named by the record (install's own agent file), never by today's config
  for (const [p, f] of Object.entries(rec.files)) if (f?.piece === "installer" && LITE_FILE.test(p) && !wanted.has(p)) wanted.set(p, "");
  const wants = settingsWants(manifest);
  const agWants = agHooksWants(manifest);
  // a recorded entry belongs to a want by its key and its hook id, not by the event alone
  const theirs = (w, m) => isDeepStrictEqual(w.key, m.key) && (w.id ? w.ours(m.entry) : isDeepStrictEqual(w.entry, m.entry));
  // a plugin sub-key goes only when the manifest declares it: the record never names one on its own
  const declared = pluginWants(manifest, ROOT, true);
  const planted = (x) => x.file === SETTINGS && declared.find((w) => isDeepStrictEqual(w.key, x.key));
  // a retired unit's line too: install wrote it, and it stays while a changed file keeps the unit's folder
  const giLines = new Set([".xworkflows/", ...[...wanted.keys(), ...retiredPaths(manifest, tools).keys()].map(giLine).filter(Boolean)]);
  // the raw value: a section the loader refuses must not keep what install wrote for the memory folder
  let raw = {};
  try { raw = JSON.parse(readFileSync(join(ROOT, ".xworkflows/config.json"), "utf8")) ?? {}; } catch {}
  const mf = memoryFolder(raw, ROOT), md = mf.dir ?? mf.linked; // a default folder made a link out of the repository is still the one install wrote

  // the marker, not the record, says this checkout's install wrote the yml: only install's exact text is the marker
  let marked = false;
  try { marked = lstatSync(join(ROOT, QMARK), { throwIfNoEntry: false })?.isFile() && clean(ROOT, QMARK) && read(ROOT, QMARK) === MARK_TEXT; } catch {} // .qmd is a plain file

  const named = {
    files: (_, p) => wanted.has(p) || hookSet.has(p),
    merged: (m) => (m.file === SETTINGS && wants.some((w) => theirs(w, m))) || (m.file === AG_HOOKS && agWants.some((w) => w.key === m.key?.[0])),
    scalars: (x) => (x.file === SETTINGS && (isDeepStrictEqual(x.key, ["attribution"]) || planted(x))) || (x.file === LOCAL && isDeepStrictEqual(x.key, [LOCAL_KEY])),
    blocks: (b) => b.file === "AGENTS.md",
    imports: (i) => !!LINES.get(i.file)?.includes(i.line) || (i.file === GI && giLines.has(i.line)) || i.line === hookLine(basename(i.file)),
    // a hook file install made for husky: the record holds the line it put there
    created: (p) => FIVE.includes(p) || (md !== undefined && (p === md || p === join(md, "MEMORY.md"))) || (p === YML && marked) || rec.imports.some((i) => i.file === p && i.line === hookLine(basename(p))),
    chained: (c) => hookSet.has(c.file) && c.to === c.file + ".before-xworkflows",
  };
  const said = new Set();
  const keep = (kind, e, p) => {
    const w = hookSet.has(p) || !plain(p) ? null : way(ROOT, p);
    if ((hookSet.has(p) ? ["files", "chained", "imports"].includes(kind) : plain(p) && !w) && named[kind](e, p)) return true;
    const n = w?.folder ?? p;
    if (!said.has(n)) { said.add(n); out.push(`kept (not ours): ${n}`); }
    return false;
  };
  const recFiles = new Set(Object.keys(rec.files).filter((p) => keep("files", rec.files[p], p)));
  for (const [k, f] of [["merged", (m) => m.file], ["blocks", (b) => b.file], ["imports", (i) => i.file], ["scalars", (x) => x.file], ["chained", (c) => c.file], ["created", (p) => p]])
    rec[k] = rec[k].filter((e) => keep(k, e, String(f(e))));

  const rm = (p) => { rmSync(join(ROOT, p)); gone.push(p); };
  const write = (p, text) => { writeFileSync(join(ROOT, p), text); out.push(`changed ${p}`); };
  for (const [p, text] of wanted) {
    if (!recFiles.has(p) || rec.kept.includes(p) || rec.kept.includes(p.match(UNIT)?.[0])) continue;
    if (!lstatSync(join(ROOT, p), { throwIfNoEntry: false })?.isFile()) continue;
    // an agent is rendered from the config and the plugins: it is install's when it holds the text the record has, never by today's render
    if (hash(read(ROOT, p)) === hash(text) || (/^\.(?:claude|agents)\/agents\//.test(p) && hash(read(ROOT, p)) === rec.files[p]?.sha256)) { rm(p); out.push(`deleted ${p}`); }
    else out.push(`kept (changed locally): ${p}`);
  }
  for (const [name, p] of hookRel) {
    const abs = join(hooksDir, name), before = abs + ".before-xworkflows";
    if (!lstatSync(abs, { throwIfNoEntry: false })?.isFile()) continue;
    // a hook it cannot read or delete stays, said in one line without a stack; a hook of the user's is named by the loop of the lines
    try {
      const cur = readFileSync(abs, "utf8");
      if (cur !== hookText(name) && cur !== chainText(name) && !earlierHook(manifest, name, cur)) { if (recFiles.has(p)) out.push(hash(cur) === rec.files[p].sha256 ? `kept (not ours): ${p}` : `kept (changed locally): ${p}`); continue; }
      rmSync(abs); out.push(`deleted ${p}`);
      if (lstatSync(before, { throwIfNoEntry: false })) { renameSync(before, abs); out.push(`restored ${p}`); }
    } catch (e) { if (recFiles.has(p)) out.push(`not deleted (${e.code}): ${p}`); }
  }
  const merged = rec.merged.filter((m) => m.file === SETTINGS);
  const agMerged = rec.merged.filter((m) => m.file === AG_HOOKS);
  const plugs = rec.scalars.filter(planted);
  const text = merged.length || plugs.length ? read(ROOT, SETTINGS) : null;
  if (text !== null) {
    let s;
    try { s = JSON.parse(text); } catch { out.push(`kept (does not parse): ${SETTINGS}`); }
    if (s && typeof s === "object") {
      let changed = false;
      const recorded = (w) => merged.some((m) => theirs(w, m));
      for (const w of wants.filter(recorded)) {
        const arr = w.key.reduce((o, k) => o?.[k], s);
        if (!Array.isArray(arr)) continue;
        const i = arr.findIndex((e) => isDeepStrictEqual(e, w.entry) || w.earlier?.some((x) => isDeepStrictEqual(x, e)));
        if (i >= 0) { arr.splice(i, 1); changed = true; }
        else if (arr.some(w.ours)) out.push(`kept (changed locally): ${SETTINGS} ${w.key.join(".")}`);
      }
      for (const x of plugs) {
        const { key: [map, name] } = x, { value } = planted(x); // the value the manifest writes, not the record's
        if (!(name in (s[map] ?? {}))) continue;
        if (isDeepStrictEqual(s[map][name], value)) { delete s[map][name]; changed = true; }
        else out.push(`kept (changed locally): ${SETTINGS} ${map}.${name}`);
      }
      for (const map of PLUGIN_MAPS) if (plugs.some((x) => x.key[0] === map && x.createdKey) && isObj(s[map]) && !Object.keys(s[map]).length) { delete s[map]; changed = true; }
      // a container install created goes once it is empty; a record without the count of levels holds them all
      const made = new Set();
      for (const m of merged) if (m.createdKey) for (let d = m.key.length; d > m.key.length - (m.levels ?? m.key.length); d--) made.add(JSON.stringify(m.key.slice(0, d)));
      for (const { key } of wants) {
        const parents = [s];
        for (const k of key) parents.push(parents.at(-1)?.[k]);
        for (let d = key.length; d > 0 && made.has(JSON.stringify(key.slice(0, d))) && parents[d] && typeof parents[d] === "object" && Object.keys(parents[d]).length === 0; d--) { delete parents[d - 1][key[d - 1]]; changed = true; }
      }
      if (changed) write(SETTINGS, json(s, text));
    }
  }
  const agText = agMerged.length ? read(ROOT, AG_HOOKS) : null;
  if (agText !== null) {
    let s;
    try { s = JSON.parse(agText); } catch { out.push(`kept (does not parse): ${AG_HOOKS}`); }
    if (isObj(s)) {
      let changed = false;
      for (const m of agMerged) {
        const k = m.key[0];
        if (!(k in s)) continue;
        const w = agWants.find((x) => x.key === k);
        if (isDeepStrictEqual(s[k], m.entry) || (w && isDeepStrictEqual(s[k], w.entry))) { delete s[k]; changed = true; }
        else out.push(`kept (changed locally): ${AG_HOOKS} ${k}`);
      }
      if (changed) write(AG_HOOKS, json(s, agText));
    }
  }
  let memory;
  // the folder install wrote there; a record of an earlier version may hold a value that names none
  try { memory = resolve(ROOT, md ?? raw.memory?.dir); } catch {}
  for (const [file, key, was] of [[SETTINGS, "attribution", ATTRIBUTION], [LOCAL, LOCAL_KEY, memory]]) {
    const x = rec.scalars.find((e) => e.file === file && isDeepStrictEqual(e.key, [key]));
    if (!x) continue;
    const text = read(ROOT, file);
    let s;
    try { s = JSON.parse(text); } catch { continue; }
    if (!s || typeof s !== "object" || Array.isArray(s) || !(key in s)) continue;
    if (!isDeepStrictEqual(s[key], was)) { out.push(`kept (changed locally): ${file} ${key}`); continue; }
    // the recorded text is only a candidate cut: it is used when the result is the file without our key
    const ins = typeof x.insert === "string" ? x.insert + JSON.stringify(was) : null, at = ins === null ? -1 : text.lastIndexOf(ins);
    const cut = at >= 0 ? text.slice(0, at) + text.slice(at + ins.length) : null;
    const { [key]: _, ...rest } = s;
    let ok = false;
    try { ok = cut !== null && isDeepStrictEqual(JSON.parse(cut), rest); } catch {}
    write(file, ok ? cut : json(rest, text));
  }
  for (const b of rec.blocks) {
    const t = read(ROOT, b.file), a = t?.indexOf(START) ?? -1, e = a < 0 ? -1 : t.indexOf(END, a);
    if (e < 0) continue;
    let from = a;
    if (t.slice(0, a).endsWith("\n\n")) from--; // the blank line install added
    let head = t.slice(0, from);
    if (b.addedNewline && head.endsWith("\n")) head = head.slice(0, -1);
    write(b.file, head + t.slice(e + END.length + (t[e + END.length] === "\n" ? 1 : 0)));
  }
  for (const { file: key, line, addedNewline } of rec.imports) {
    // the line of a hook is in the hooks folder git uses, which a linked worktree has under the common git dir; a link there is not followed
    const file = hookSet.has(key) ? relative(ROOT, join(hooksDir, basename(key))) : key, hook = line === hookLine(basename(key));
    // a file uninstall cannot read or write keeps its line, said in one line without a stack, as apply does for install
    try {
      if (hookSet.has(key)) {
        const st = lstatSync(join(ROOT, file), { throwIfNoEntry: false });
        // no link is written through: install's line behind one stays, and is named
        if (st?.isSymbolicLink() && statSync(join(ROOT, file), { throwIfNoEntry: false })?.isFile() && read(ROOT, file).split("\n").includes(line)) out.push(`not written (symlink): ${key}: the xworkflows line stays in it; take it out yourself`);
        if (!st?.isFile()) continue;
      }
      // a hook's bytes are never rewritten as text
      const there = existsSync(join(ROOT, file)), t = there && hook ? textOf(join(ROOT, file)) : read(ROOT, file);
      if (there && t === null) { out.push(`kept (not text): ${key}`); continue; }
      const ls = t?.split("\n") ?? [], i = ls.lastIndexOf(line);
      // a line of a hook that the user changed still holds the mark: it stays, and is named
      if (i < 0 && hook && ls.some((l) => l.endsWith(" # xworkflows"))) out.push(`kept (changed locally): ${key}`);
      if (i < 0) continue;
      ls.splice(i, 1);
      const out2 = ls.join("\n");
      write(file, addedNewline && out2.endsWith("\n") ? out2.slice(0, -1) : out2);
    } catch (e) { out.push(`not written (${e.code}): ${key}: ${hook ? "the xworkflows line" : `the line ${line}`} stays in it; take it out yourself`); }
  }
  for (const p of rec.created) {
    if (p === md) {
      if (!lstatSync(join(ROOT, p), { throwIfNoEntry: false })?.isDirectory()) continue;
      if (readdirSync(join(ROOT, p)).length) out.push(`left in place: ${p}`);
      else { rmdirSync(join(ROOT, p)); gone.push(p); out.push(`deleted ${p}/`); }
      continue;
    }
    const t = read(ROOT, p);
    let empty = t !== null && t.trim() === "";
    try { empty ||= t !== null && isDeepStrictEqual(JSON.parse(t), {}); } catch {}
    if (empty && !rec.kept.includes(p)) { rm(p); out.push(`deleted ${p}`); }
  }
  if (marked) {
    for (const f of [YML, ".qmd/index.sqlite", ".qmd/index.sqlite-wal", ".qmd/index.sqlite-shm", QMARK, ".qmd/.qmd-embed.lock"]) if (lstatSync(join(ROOT, f), { throwIfNoEntry: false })?.isFile()) rm(f);
  }
  const hand = ".xworkflows/handoff.md"; // only the skill handoff writes it; nothing of the user's
  if (clean(ROOT, hand) && lstatSync(join(ROOT, hand), { throwIfNoEntry: false })?.isFile()) { rm(hand); out.push(`deleted ${hand}`); }
  if (clean(ROOT, EARLIER) && lstatSync(join(ROOT, EARLIER), { throwIfNoEntry: false })?.isFile()) { rm(EARLIER); out.push(`deleted ${EARLIER}`); }
  const ir = ".xworkflows/installed.json";
  if (clean(ROOT, ir)) rm(ir); else out.push(`kept (not ours): ${ir}`);
  for (const p of gone) {
    for (let d = dirname(p); d !== "."; d = dirname(d)) {
      if (!lstatSync(join(ROOT, d), { throwIfNoEntry: false })?.isDirectory()) continue;
      if (!(own(d) || noDirs || rec.dirs.includes(d)) || readdirSync(join(ROOT, d)).length) break;
      rmdirSync(join(ROOT, d));
      out.push(`deleted ${d}/`);
    }
  }
  console.log(out.join("\n") + (out.length ? "\n" : "") + "uninstalled");
}

// not on import: a test calls plan() and apply() itself
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
