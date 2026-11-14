#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { accessSync, chmodSync, constants, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, normalize, posix, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DEFAULTS, PROJECT_KEYS, load as loadConfig, memoryFolder, missing } from "../hooks/core/config.mjs";

export const PKG = dirname(dirname(fileURLToPath(import.meta.url)));
export let ROOT;

// a config value in a command doctor prints: plain stays as it is, anything else in single quotes
const sh = (v) => (/^[\w\/.-]+$/.test(v) ? v : `'${v.replaceAll("'", "'\\''")}'`);
const COMMANDS = ["install", "doctor", "uninstall", "pack", "check"];
const BOOL = ["--yes", "--dry-run", "--check", "--trace"];

export const hash = (text) => createHash("sha256").update(text.replaceAll("\r\n", "\n")).digest("hex");
export const digest = (files) =>
  hash(Object.keys(files).sort().map((p) => `${p} ${files[p]}\n`).join(""));
export const readManifest = () => JSON.parse(readFileSync(join(PKG, "manifest.json"), "utf8"));

const KEYS = ["id", "kind", "origin", "source", "version", "license", "modified", "scope", "tools", "claude", "earlierHooks", "retired", "files", "sha256"];

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
  const tracked = execFileSync("git", ["ls-files", "skills", "agents", "hooks", "checks"], { cwd: PKG, encoding: "utf8" }).split("\n").filter(Boolean);
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
  const flags = cmd === "check" ? {} : parse(rest);
  if ((flags["dry-run"] || flags.yes) && cmd !== "install") die(2, "--dry-run and --yes are for install only");
  if (flags.check && cmd !== "pack") die(2, "--check is for pack only");
  if (flags.trace && cmd !== "doctor") die(2, "--trace is for doctor only");
  if (flags.tool && flags.tool !== "claude") die(2, `not yet: ${flags.tool} comes in a later phase`);
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
  if (cmd === "doctor") return doctor(flags);
  return uninstall();
}

const EMPTY = { xworkflows: "", tools: ["claude"], pieces: {}, files: {}, merged: [], blocks: [], imports: [], created: [], dirs: [], declined: [], kept: [], renamed: {}, scalars: [], chained: [] };
// the file's own indent, so install and uninstall leave a project's layout as it was
const indentOf = (text) => text?.match(/^([ \t]+)\S/m)?.[1] ?? 2;
const json = (v, text) => JSON.stringify(v, null, indentOf(text)) + "\n";

function target(f) {
  if (f === "hooks/mark.mjs") return ".xworkflows/mark.mjs";
  if (f.startsWith("skills/")) return ".claude/" + f;
  if (f.startsWith("agents/")) return ".claude/" + f;
  if (f.startsWith("hooks/adapters/")) return f === "hooks/adapters/claude.mjs" ? ".xworkflows/" + f : null;
  return ".xworkflows/" + f;
}

const read = (root, p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), "utf8") : null);
const hookCmd = (id) => `node "$(git rev-parse --show-toplevel)/.xworkflows/hooks/run.mjs" claude ${id}`;
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

function mergeSettings(root, manifest, record) {
  const path = ".claude/settings.json";
  const { old, s } = readObject(root, path);
  const want = settingsWants(manifest);
  const merged = [], notes = [];
  let changed = false;
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
  if (!md || key in s) return none;
  if (spawnSync("git", ["ls-files", "--error-unmatch", path], { cwd: root, stdio: "ignore" }).status === 0) return { ...none, note: `${path} is tracked: ${key} not written, set it yourself` };
  const value = JSON.stringify(resolve(root, md));
  if (old === null) return { path, text: json({ [key]: resolve(root, md) }), rec: { scalars: [{ file: path, key: [key], dir }], created: [path] } };
  const nl = old.includes("\r\n") ? "\r\n" : "\n";
  const at = old.slice(0, old.lastIndexOf("}")).trimEnd().length;
  const multi = old.includes("\n");
  const insert = `${Object.keys(s).length ? "," : ""}${multi ? `${nl}  ` : ""}"${key}":${multi ? " " : ""}`;
  return { path, text: old.slice(0, at) + insert + value + old.slice(at), rec: { scalars: [{ file: path, key: [key], dir, insert }], created: [] } };
}

const YML = ".qmd/index.yml";
const QMARK = ".qmd/xworkflows";
const MARK_TEXT = "written by xworkflows install: uninstall removes index.yml and its database here only while this file exists\n";
// qmd reads index.yaml before index.yml: either one is a local config
const localYml = (root) => [".qmd/index.yaml", YML].find((f) => existsSync(join(root, f)));
const IGNORE = [["graphify-out/", "graphify-out/x"], [".claude/settings.local.json", ".claude/settings.local.json"], [".qmd/", ".qmd/x"]];
// `.qmd/` is added only in a run that writes the yml
function mergeIgnore(root, qmd) {
  const path = ".gitignore";
  const old = read(root, path);
  let text = old ?? "";
  const imports = [];
  for (const [line, probe] of IGNORE) {
    if ((line === ".qmd/" && !qmd) || spawnSync("git", ["check-ignore", "-q", "--no-index", probe], { cwd: root }).status === 0) continue;
    const addedNewline = text !== "" && !text.endsWith("\n");
    imports.push({ file: path, line, ...(addedNewline && { addedNewline }) });
    text += (addedNewline ? "\n" : "") + line + "\n";
  }
  return { path, text: imports.length ? text : null, rec: { imports, created: old === null && imports.length ? [path] : [] } };
}

// .graphifyignore: the folders install writes, one line each, so the graph does not index the method's own files
const GI = ".graphifyignore";
// a skill folder, or an agent file, by its exact path
const giLine = (p) => p.match(/^\.claude\/skills\/[^/]+/)?.[0]?.concat("/") ?? p.match(/^\.claude\/agents\/[^/]+\.md$/)?.[0];
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

const HOOKS = ["pre-push", "post-merge", "post-commit"];
const hooksFolder = (root) => resolve(root, execFileSync("git", ["rev-parse", "--git-path", "hooks"], { cwd: root, encoding: "utf8" }).trim());
// the record's name for a hook: .git/hooks/<name> in every checkout, unless core.hooksPath moved the folder
const hookKey = (root, name) => {
  const dir = hooksFolder(root);
  return dir === resolve(root, execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: root, encoding: "utf8" }).trim(), "hooks") ? `.git/hooks/${name}` : relative(root, resolve(dir, name));
};
const CHECK = 'node "$(git rev-parse --show-toplevel)/.xworkflows/checks/run.mjs" --pre-push "$1"';
// for the hook of a folder shared with repositories that have no xworkflows: runs only where the file is, and a failed check still ends the hook
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
  if (name === "pre-push") return `if awk 'f{r=1} / # xworkflows/{f=1} END{exit !(f && !r)}' "$0" 2>/dev/null; then\n${CHECK} || exit $?\nelse\nxwf_in=$(mktemp "\${TMPDIR:-/tmp}/xworkflows.XXXXXX") || exit 1\ntrap 'rm -f "$xwf_in"; exit 1' HUP INT TERM\ncat > "$xwf_in"\n${CHECK} < "$xwf_in" || { xwf_c=$?; rm -f "$xwf_in"; exit $xwf_c; }\nexec < "$xwf_in"\nrm -f "$xwf_in"\ntrap - HUP INT TERM\nunset xwf_in xwf_c\nfi\n`;
  return `#!/bin/sh\nc=0\ncd "$(git rev-parse --show-toplevel)" || exit $c\nmain=$(${MAIN}) || main=main\n[ "$(git symbolic-ref --short -q HEAD)" = "$main" ] || exit $c\ntool=$(${TOOL}) || tool=graphify\nfolder=$(${FOLDER}) || folder=graphify-out\ncommand -v "$tool" >/dev/null 2>&1 || exit $c\nmkdir -p "$folder"\n{ "$tool" update . && touch -c -h -- "$folder/graph.json"; } > "$folder/.update.log" 2>&1 < /dev/null &\nexit $c\n`;
}
// The one line install puts in a hook: the two post hooks run its file as a child that never fails them. It is silent only where the
// method is not installed; where the checks are and its file is not, pre-push refuses the push and a post hook says so on stderr.
const hookLine = (name) => {
  const x = `"$(git rev-parse --show-toplevel)/.xworkflows`, f = `${x}/git/${name}"`;
  const gone = `echo "xworkflows: .xworkflows/git/${name} is missing: run xworkflows install" >&2${name === "pre-push" ? "; exit 1" : " || :"}`;
  return `if [ -f ${f} ]; then ${name === "pre-push" ? `. ${f}` : `sh ${f} "$@" || :`}; elif [ -f ${x}/checks/run.mjs" ]; then ${gone}; fi # xworkflows`;
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
//   line      a hook of the user's holding the line as its first command, in a file a shell runs (husky's file one folder up)
//   add       a hook of the user's that can take the line and does not hold it there
//   declined  a hook whose line or chain the user declined at install
//   missing   own or line, while install's file under .xworkflows/git that the line runs is not there
//   outside   the hooks folder is outside the repository, and its hook does not hold the guarded line first
function hookState(manifest, root, record, name) {
  const path = relative(root, resolve(hooksFolder(root), name)), key = hookKey(root, name);
  if (ownHooks(root) === null) {
    let t = null;
    try { t = readFileSync(join(root, path), "utf8"); } catch {}
    return { path, key, outside: true, state: t !== null && SHELL.test(t) && firstCommand(t) === GUARDED ? "line" : "outside" };
  }
  const now = lstatSync(join(root, path), { throwIfNoEntry: false });
  const own = now?.isFile() ? read(root, path) : null;
  const mine = own !== null && (own === hookText(name) || own === chainText(name) || earlierHook(manifest, name, own) || (!!record.files[key] && hash(own) === record.files[key].sha256));
  // an install made before the line renamed the user's hook to <name>.before-xworkflows and ran it from its own, recorded or not:
  // ours is the only code that makes this name
  const before = `${path}.before-xworkflows`, old = lstatSync(join(root, before), { throwIfNoEntry: false });
  const pair = !!old && (mine || !now);
  const lst = pair ? old : now, cur = lst?.isFile() ? textOf(join(root, pair ? before : path)) : null;
  // husky's shim runs the file of its own name one folder up: that file is the user's hook, made by a yes when it is not there
  const husky = cur !== null && manager(cur) === "husky", chain = chains(lst, cur);
  const file = husky ? join(dirname(dirname(path)), name) : path, fkey = husky ? file : key;
  const at = husky ? lstatSync(join(root, file), { throwIfNoEntry: false }) : lst;
  const text = !husky ? cur : !at ? "" : at.isFile() ? textOf(join(root, file)) : null;
  const linked = husky && !(plain(file) && clean(root, file)), takes = !linked && text !== null && SHELL.test(text);
  // the old pair moves to the line only when the hook can take it: the user's file gets its name back, and the line with no question,
  // since its owner said yes then. Else the pair stays as it is, and works
  const back = pair && !chain && (!husky || takes) ? before : undefined;
  const declined = record.declined.some((d) => d.file === key && d.what === "chain");
  // husky runs its file with sh, whatever its #! line says
  const state = !now ? "none" : pair ? (!back && own === chainText(name) ? "chained" : "old") : mine ? (own === hookText(name) ? "own" : "old")
    : chain ? (old ? "blocked" : declined ? "declined" : "chain")
    : text !== null && (husky || takes) && firstCommand(text) === hookLine(name) ? "line" : declined && takes ? "declined" : "add";
  const gone = ["own", "line"].includes(state) && !existsSync(join(root, `.xworkflows/git/${name}`));
  return { path, key, before, old, pair, mine, lst, chain, husky, file, fkey, at, text, takes, linked, back, declined, state: gone ? "missing" : state };
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

const UNIT = /^\.claude\/(skills|agents)\/[^/]+/;
const IMPORT = "Add @AGENTS.md to CLAUDE.md?";

const plain = (p) => typeof p === "string" && p !== "" && p !== "." && !isAbsolute(p) && normalize(p) === p && !p.split("/").includes("..");
// no existing component of p, from the repository root down, is a symlink
const clean = (root, p) => {
  let a = root;
  for (const c of p.split("/")) {
    const st = lstatSync((a = join(a, c)), { throwIfNoEntry: false });
    if (!st) return true;
    if (st.isSymbolicLink()) return false;
  }
  return true;
};

// Reads and parses every target file before any write (ruling P2) and refuses before any write.
// `ans` maps question id -> chosen label; an unanswered question is listed in `questions` and planned with its safe answer.
// The two changes install makes to a package text it writes; published() undoes them.
const tierToModel = (text, tiers) => text.replace(/^tier: (\w+)$/m, (_, k) => `model: ${tiers.claude[k]}`);
const nameAs = (text, name) => text.replace(/^name: .*$/m, `name: ${name}`);
// the file of a unit that carries its name line: the agent file, or a skill's SKILL.md
const named = (p, u) => p === u || p.endsWith("/SKILL.md");
// Every file this package copies, with the text it copies (tier line included); plan() and uninstall share it.
function pkgWrites(manifest) {
  const tiers = readFileSync(join(PKG, "tiers.json"), "utf8");
  const writes = [{ path: ".xworkflows/tiers.json", text: tiers, piece: "installer", src: "tiers.json" }];
  for (const p of manifest.pieces) {
    for (const f of Object.keys(p.files)) {
      const t = target(f);
      if (!t) continue;
      let text = readFileSync(join(PKG, f), "utf8");
      if (f.startsWith("agents/")) text = tierToModel(text, JSON.parse(tiers));
      writes.push({ path: t, text, piece: p.id, src: f });
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
  const ks = p.startsWith(".claude/agents/") ? Object.keys(tiers.claude) : [];
  return [t, ...ks.map((k) => t.replace(/^model: .*$/m, `tier: ${k}`))];
}

// path -> the hashes the manifest lists for a retired file, at every place install may have written it, the xwf- one included
function retiredPaths(manifest) {
  const listed = new Map();
  for (const [f, hashes] of manifest.pieces.flatMap((p) => Object.entries(p.retired ?? {}))) {
    const t = target(f), u = t?.match(UNIT)?.[0];
    if (t) for (const p of u ? [t, renameWrite({ path: t, text: "" }, u).path] : [t]) listed.set(p, hashes);
  }
  return listed;
}

export function plan(manifest, root, record, ans = {}) {
  let writes = pkgWrites(manifest);
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
  for (const name of mine_ ? HOOKS : []) {
    writes.push({ path: `.xworkflows/git/${name}`, text: gitText(name), piece: "checks", src: `git/${name}` });
    const { path, key, before, old, pair, mine, lst, chain, husky, file, fkey, at, text, takes, linked, back, declined: no } = hookState(manifest, root, record, name);
    if (!pair && (!lst || mine)) { writes.push({ path, key, text: hookText(name), piece: "checks", src: name, mode: 0o755 }); continue; }
    if (pair && !back) {
      writes.push({ path, key, text: chainText(name), piece: "checks", src: name, mode: 0o755 });
      if (!record.chained.some((c) => c.file === key)) hookMerges.push({ path, text: null, rec: { chained: [{ file: key, to: `${key}.before-xworkflows` }] } });
      continue;
    }
    // the user's hook keeps its name and its place: it gets the line, or nothing, and the line is printed
    if (!back && no) continue;
    const line = hookLine(name), declined = { path, text: null, rec: { declined: [{ file: key, what: "chain" }] } };
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
    else if (!takes) {
      notes.push(`${file} is not a shell script: nothing written; to run the check, call this line from it as its first command: ${line}`);
      hookMerges.push(declined);
    } else if (text.split("\n").includes(line)) {
      if (back || !record.imports.some((i) => i.file === fkey && i.line === line)) merge(null, { imports: [{ file: fkey, line }] });
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
    if (hookPaths.has(p) || (plain(p) && clean(root, p))) return false;
    notes.push(`not written (symlink): ${p}`);
    return true;
  };
  writes = writes.filter((w) => !off(w.path));
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
  const listed = retiredPaths(manifest);
  const shipped = new Set(writes.map((w) => w.key ?? w.path));
  const retired = [], tiers = JSON.parse(readFileSync(join(PKG, "tiers.json"), "utf8"));
  for (const p of Object.keys(record.files)) {
    const hashes = listed.get(p), u = p.match(UNIT)?.[0];
    // a unit under kept, this plan's or the record's, is the user's: not judged, as uninstall does
    if (!hashes || kept.includes(u) || record.kept.includes(u) || shipped.has(p) || !plain(p) || !clean(root, p) || !lstatSync(join(root, p), { throwIfNoEntry: false })?.isFile()) continue;
    if (published(p, read(root, p), tiers).some((t) => hashes.includes(hash(t)))) retired.push(p);
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
    qmd = !mem.index && !localYml(root) && !off(YML);
    if (qmd) merges.push({ path: YML, text: `collections:\n  memory:\n    path: ${JSON.stringify(resolve(root, md))}\n    pattern: "**/*.md"\n`, verb: "write", rec: {} });
    // the marker passes the yml's test and is never written over something that is there
    if (qmd && !off(QMARK) && !lstatSync(join(root, QMARK), { throwIfNoEntry: false })) merges.push({ path: QMARK, text: MARK_TEXT, verb: "write", rec: {} });
  }
  if (!off(SETTINGS)) { const ms = mergeSettings(root, manifest, record); notes.push(...ms.notes); merges.push(ms); }
  if (!off(LOCAL)) { const local = mergeLocal(root); if (local.note) notes.push(local.note); merges.push(local); }
  if (!off(".gitignore")) merges.push(mergeIgnore(root, qmd));
  if (!off(GI)) merges.push(mergeGraphifyIgnore(root, writes));
  if (!off("AGENTS.md")) merges.push(mergeAgents(root));
  merges.push(...hookMerges);
  const link = off("CLAUDE.md");
  const claude = link ? undefined : read(root, "CLAUDE.md");
  if (link) { /* noted above */ } else if (claude === null) {
    merges.push({ path: "CLAUDE.md", text: "@AGENTS.md\n", rec: { imports: [{ file: "CLAUDE.md", line: "@AGENTS.md" }], created: ["CLAUDE.md"] } });
  } else if (!/^@AGENTS\.md\s*$/m.test(claude) && !record.declined.some((d) => d.file === "CLAUDE.md" && d.what === "import")) {
    if (ask("import", IMPORT, ["no", "yes"]) === "yes") {
      merges.push({ path: "CLAUDE.md", text: claude + (claude.endsWith("\n") ? "" : "\n") + "@AGENTS.md\n", rec: { imports: [claude.endsWith("\n") ? { file: "CLAUDE.md", line: "@AGENTS.md" } : { file: "CLAUDE.md", line: "@AGENTS.md", addedNewline: true }] } });
    } else merges.push({ path: "CLAUDE.md", text: null, rec: { declined: [{ file: "CLAUDE.md", what: "import" }] } });
  }
  return { writes, merges, questions, kept, renamed, notes, retired };
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
    for (let d = dirname(p); /^\.xworkflows\/|^\.claude\/(skills|agents)\/[^/]+/.test(d) && !readdirSync(join(root, d)).length; d = dirname(d)) { rmdirSync(join(root, d)); out.push(`removed ${d}/`); }
  }
  for (const w of pl.writes) if (!w.keep && differs(root, w)) {
    const hook = HOOKS.includes(w.src);
    linked(w.path, hook);
    if (w.rename) renameSync(join(root, w.path), join(root, w.rename));
    put(root, w.path, w.text, w.mode, hook);
    out.push(w.path);
  }
  const next = { ...record, xworkflows: manifest.version, tools: ["claude"], pieces: {}, files: {}, dirs: [...new Set([...(record.dirs ?? []), ...made])], kept: [...new Set([...record.kept, ...pl.kept])], renamed: { ...record.renamed, ...pl.renamed } };
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
      if (k === "merged") for (const x of list) { const gone = next[k].find((y) => x.entry?.hooks && x.file === y.file && isDeepStrictEqual(x.key, y.key) && x.entry.hooks[0].command === y.entry?.hooks?.[0]?.command); if (gone?.createdKey) { x.createdKey = true; x.levels = gone.levels; } }
      if (k === "merged") next[k] = next[k].filter((y) => !list.some((x) => x.entry?.hooks && x.file === y.file && isDeepStrictEqual(x.key, y.key) && x.entry.hooks[0].command === y.entry?.hooks?.[0]?.command));
      for (const x of list) if (!next[k].some((y) => (k === "merged" ? x.file === y.file && isDeepStrictEqual(x.key, y.key) && isDeepStrictEqual(x.entry, y.entry) : (k === "blocks" || k === "imports" ? x.file === y.file && x.line === y.line : isDeepStrictEqual(x, y))))) next[k].push(x);
    }
  }
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
  if (existsSync(rp)) {
    try {
      const parsed = JSON.parse(readFileSync(rp, "utf8"));
      record = { ...EMPTY, ...parsed };
      // a record of an earlier version has no dirs: it stays so, because an empty list would switch off the removal of empty parents
      if (!Array.isArray(parsed.dirs)) record.dirs = undefined;
    } catch {
      die(1, ".xworkflows/installed.json does not parse; fix or remove it");
    }
  }
  let pl = plan(m, ROOT, record);
  // a linked folder under .xworkflows would leave the hooks wired to files that were not written
  const linked = pl.notes.find((n) => n.startsWith("not written (symlink): .xworkflows/"));
  if (linked) die(1, linked);
  const ans = {}, auto = [];
  const rl = pl.questions.length && !flags.yes && !flags["dry-run"] && process.stdin.isTTY ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  for (const q of pl.questions) {
    if (flags.yes) ans[q.id] = q.labels[q.yes];
    else if (rl) {
      const r = (await rl.question(`${q.text} (${q.labels.join(" / ")}) `)).trim().toLowerCase();
      ans[q.id] = r && q.labels[1].toLowerCase().startsWith(r) ? q.labels[1] : q.labels[0];
    } else { ans[q.id] = q.labels[0]; auto.push(`answered for you: ${q.text} -> ${q.labels[0]}`); }
  }
  rl?.close();
  if (pl.questions.length) pl = plan(m, ROOT, record, ans);
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
    console.log("Next: open Claude Code and type /adapt");
  }
  for (const a of auto) console.log(a);
}

async function doctor(flags) {
  const out = [];
  let nf = 0, nw = 0;
  const INSTALL = "run xworkflows install";
  const say = (lvl, t) => { out.push(`${lvl === "ok" ? "ok  " : lvl} ${t}`); if (lvl === "fail") nf++; if (lvl === "warn") nw++; };
  const finish = () => {
    console.log(out.join("\n") + `\ndoctor: ${nf} fail, ${nw} warn`);
    process.exit(nf ? 1 : 0);
  };
  // one catch around the body: a throw anywhere is one fail line with its message, and doctor ends as it always does
  try { await checks(); } catch (e) {
    say("fail", `doctor stopped: ${e?.message ?? e}: run xworkflows doctor --trace to see the stack`);
    if (flags.trace) process.stderr.write(`${e?.stack ?? e}\n`);
  }
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
  for (const [f, { sha256 }] of Object.entries(rec.files)) {
    let t;
    // the record names the three git hooks under .git/, which is a file in a linked worktree: git says where they are
    try { t = readFileSync(f.startsWith(".git/hooks/") ? join(hooksFolder(ROOT), f.slice(".git/hooks/".length)) : join(ROOT, f), "utf8"); } catch { say("fail", `missing or unreadable: ${f}: ${INSTALL}`); continue; }
    say(hash(t) === sha256 ? "ok" : "warn", hash(t) === sha256 ? f : `changed locally: ${f}; to put the package's copy back, delete it, then ${INSTALL} (install keeps a changed file)`);
  }
  for (const k of rec.kept) {
    const gs = k === ".claude/skills/grill" && rec.pieces["design-first"] ? read(ROOT, `${k}/SKILL.md`) : null;
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
  const wants = settingsWants(readManifest()).filter((w) => w.id);
  for (const m of rec.merged) {
    const arr = readArr(m.file, m.key);
    const id = m.entry?.hooks?.[0]?.command?.match(/run\.mjs" claude (\S+)/)?.[1];
    const lbl = `${m.file} ${m.key.join(".")}`;
    const w = id && wants.find((x) => x.id === id && isDeepStrictEqual(x.key, m.key));
    if (w && differs(w, arr, lbl)) continue;
    if (arr.some((e) => isDeepStrictEqual(e, m.entry))) say("ok", `merged: ${lbl}`);
    else say("fail", `merged entry missing: ${lbl}: ${INSTALL}`);
  }
  for (const w of wants) if (!rec.merged.some((m) => isDeepStrictEqual(m.key, w.key) && w.ours(m.entry))) differs(w, readArr(".claude/settings.json", w.key), `.claude/settings.json ${w.key.join(".")}`);
  // 4
  if (!rec.blocks.length) say("fail", `AGENTS.md block was never written: ${INSTALL}`);
  else if ((read(ROOT, "AGENTS.md") ?? "").includes(agentsBlock())) say("ok", "AGENTS.md block matches the template");
  else say("fail", `AGENTS.md block differs from the template: ${INSTALL}`);
  // a CLAUDE.md that is a link to AGENTS.md is the same file
  const one = (() => { try { return realpathSync(join(ROOT, "CLAUDE.md")) === realpathSync(join(ROOT, "AGENTS.md")); } catch { return false; } })();
  if (one || /^@AGENTS\.md\s*$/m.test(read(ROOT, "CLAUDE.md") ?? "")) say("ok", "CLAUDE.md imports AGENTS.md");
  else if (rec.declined.some((d) => d.file === "CLAUDE.md" && d.what === "import")) say("warn", "CLAUDE.md does not import AGENTS.md: add the line @AGENTS.md");
  else say("fail", "CLAUDE.md does not import AGENTS.md: add the line @AGENTS.md");
  // config
  let cfg = {};
  // a file holding null is said by the config line below
  try { cfg = JSON.parse(readFileSync(join(ROOT, ".xworkflows/config.json"), "utf8")) ?? {}; } catch {}
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
    say(d === "deny" ? "ok" : "fail", d === "deny" ? "probe: design-first denies a spec write" : `probe: expected deny, got ${d ?? "no valid output"}: delete the files named "changed locally" above, then ${INSTALL}`);
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
      const m = l.trim().match(/^@(\S+)/);
      if (m) load(resolve(dirname(p), m[1]));
    }
  };
  load(join(ROOT, "CLAUDE.md"));
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
    } catch (e) {
      const m = e.message;
      say("fail", `config: ${m}: ${m.startsWith(".xworkflows/config.json does not parse") ? "fix the JSON of .xworkflows/config.json" : /^\.xworkflows\/config\.json: \S+ must be an object$/.test(m) ? "make it an object, or take it out of .xworkflows/config.json" : `if a file of the package is named "changed locally" above, delete it; then ${INSTALL}`}`);
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
    const hook = hookState(readManifest(), ROOT, rec, "pre-push"), at = (p) => p && sh(join(ROOT, p)), P = "pre-push hook";
    let exec = false;
    try { accessSync(join(ROOT, hook.path), constants.X_OK); exec = true; } catch {}
    const of = hook.outside ? " of the folder outside this repository" : "";
    const ours = [exec ? "ok" : "fail", exec ? `${P} is ours` : `${P} is ours but not executable, so git ignores it: chmod +x ${at(hook.path)}`];
    const SAY = {
      none: ["fail", `${P} is missing or not ours: ${INSTALL}`],
      own: ours,
      chained: ours,
      old: ["warn", `${P} holds an earlier text of the package: ${INSTALL} replaces it`],
      missing: ["fail", `${P} runs .xworkflows/git/pre-push, which is missing: ${INSTALL}`],
      line: [exec ? "ok" : "fail", exec ? `${P}${of} runs the check` : `${P}${of} holds the check but is not executable, so git ignores it: chmod +x ${at(hook.path)}`],
      add: ["fail", `${P} does not run the check: add this line to ${at(hook.file)} as its first command: ${hookLine("pre-push")}`],
      chain: ["fail", `${P} cannot take the xworkflows line and is not chained: ${INSTALL} and answer yes to chain it`],
      blocked: ["fail", `${P} cannot take the xworkflows line, and ${at(hook.before)} is in the way of chaining it: move that file out of the hooks folder, then ${INSTALL} and answer yes to chain it`],
      declined: ["fail", `${P} does not run the check: its line or its chain was declined at install; to be asked again, take the entry of ${hook.key} out of "declined" in .xworkflows/installed.json, then ${INSTALL} and answer yes`],
      outside: ["fail", `${P}: core.hooksPath points outside this repository, where install writes no hook; either add this line to the pre-push hook of that folder as its first command, which then runs it in every repository that uses the folder, and runs the check only where the file is: ${GUARDED} ; or point this repository at its own hooks folder, after which the hooks of the other folder no longer run here: run: git config core.hooksPath "$(git rev-parse --path-format=absolute --git-common-dir)/hooks"; then ${INSTALL}`],
    };
    say(...SAY[hook.state]);
    let st = {}, local = {};
    try { st = JSON.parse(readFileSync(join(ROOT, ".claude/settings.json"), "utf8")); } catch {}
    try { local = JSON.parse(readFileSync(join(ROOT, ".claude/settings.local.json"), "utf8")); } catch {}
    let bytes = 0;
    for (const h of (st.hooks?.SessionStart ?? []).flatMap((e) => e.hooks ?? [])) {
      if (!`${h.command} `.includes('/.xworkflows/hooks/run.mjs" claude ')) continue;
      bytes += Buffer.byteLength(fire(h.command, { session_id: `doctor-${process.pid}`, cwd: ROOT, hook_event_name: "SessionStart", source: "startup" }).stdout ?? "");
    }
    const sb = conf.tokens.sessionStartBytes;
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
      if (amd === undefined) say("warn", `autoMemoryDirectory is not set in .claude/settings.local.json: add "autoMemoryDirectory": "${abs}" to it`);
      else if (typeof amd !== "string" || !(resolve(ROOT, amd) + sep).startsWith(abs + sep)) say("warn", `autoMemoryDirectory is not the memory folder ${mem}: set it to "${abs}" in .claude/settings.local.json`);
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
  };
  await tooling();
  say("ok", "Claude Code: tested");
  }
}

const SETTINGS = ".claude/settings.json", LOCAL = ".claude/settings.local.json", LOCAL_KEY = "autoMemoryDirectory";
const FIVE = [SETTINGS, LOCAL, ".gitignore", GI, "AGENTS.md", "CLAUDE.md"];
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
  const manifest = readManifest();
  const out = [], gone = [];
  // the package's own folders go when empty, listed or not; the shared parents only when the record lists them, or has no list at all
  const units = pkgWrites(manifest).map((w) => w.path.match(UNIT)?.[0]).filter(Boolean).flatMap((u) => [u, `${dirname(u)}/xwf-${basename(u)}`]);
  const own = (d) => d === ".xworkflows" || d.startsWith(".xworkflows/") || units.some((u) => d === u || d.startsWith(`${u}/`));
  if (rec.xworkflows !== manifest.version) out.push(`record written by xworkflows ${rec.xworkflows || "unknown"}; this is ${manifest.version}`);

  const hooksDir = ownHooks(ROOT);
  const hookRel = new Map(hooksDir ? HOOKS.map((n) => [n, hookKey(ROOT, n)]) : []);
  const hookSet = new Set(hookRel.values());
  const wanted = new Map(HOOKS.map((n) => [`.xworkflows/git/${n}`, gitText(n)])); // path -> the text plan() writes there, renamed units included
  for (const w of pkgWrites(manifest)) {
    wanted.set(w.path, w.text);
    const u = w.path.match(UNIT)?.[0];
    if (u) { const x = renameWrite(w, u); wanted.set(x.path, x.text); }
  }
  const wants = settingsWants(manifest);
  // a retired unit's line too: install wrote it, and it stays while a changed file keeps the unit's folder
  const giLines = new Set([".xworkflows/", ...[...wanted.keys(), ...retiredPaths(manifest).keys()].map(giLine).filter(Boolean)]);
  let md = null;
  try { md = memoryFolder(loadConfig(ROOT), ROOT).dir; } catch {}

  // the marker, not the record, says this checkout's install wrote the yml: only install's exact text is the marker
  let marked = false;
  try { marked = lstatSync(join(ROOT, QMARK), { throwIfNoEntry: false })?.isFile() && clean(ROOT, QMARK) && read(ROOT, QMARK) === MARK_TEXT; } catch {} // .qmd is a plain file

  const named = {
    files: (_, p) => wanted.has(p) || hookSet.has(p),
    merged: (m) => m.file === SETTINGS && wants.some((w) => isDeepStrictEqual(w.key, m.key)),
    scalars: (x) => (x.file === SETTINGS && isDeepStrictEqual(x.key, ["attribution"])) || (x.file === LOCAL && isDeepStrictEqual(x.key, [LOCAL_KEY])),
    blocks: (b) => b.file === "AGENTS.md",
    imports: (i) => !!LINES.get(i.file)?.includes(i.line) || (i.file === GI && giLines.has(i.line)) || i.line === hookLine(basename(i.file)),
    // a hook file install made for husky: the record holds the line it put there
    created: (p) => FIVE.includes(p) || p === md || (p === YML && marked) || rec.imports.some((i) => i.file === p && i.line === hookLine(basename(p))),
    chained: (c) => hookSet.has(c.file) && c.to === c.file + ".before-xworkflows",
  };
  const said = new Set();
  const keep = (kind, e, p) => {
    if ((hookSet.has(p) ? ["files", "chained", "imports"].includes(kind) : plain(p) && clean(ROOT, p)) && named[kind](e, p)) return true;
    if (!said.has(p)) { said.add(p); out.push(`kept (not ours): ${p}`); }
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
    if (hash(read(ROOT, p)) === hash(text)) { rm(p); out.push(`deleted ${p}`); }
    else out.push(`kept (changed locally): ${p}`);
  }
  for (const [name, p] of hookRel) {
    const abs = join(hooksDir, name), before = abs + ".before-xworkflows";
    if (!lstatSync(abs, { throwIfNoEntry: false })?.isFile()) continue;
    const cur = readFileSync(abs, "utf8");
    if (cur !== hookText(name) && cur !== chainText(name) && !earlierHook(manifest, name, cur)) { if (recFiles.has(p)) out.push(hash(cur) === rec.files[p].sha256 ? `kept (not ours): ${p}` : `kept (changed locally): ${p}`); continue; }
    rmSync(abs); out.push(`deleted ${p}`);
    if (lstatSync(before, { throwIfNoEntry: false })) { renameSync(before, abs); out.push(`restored ${p}`); }
  }
  const merged = rec.merged;
  const text = merged.length ? read(ROOT, SETTINGS) : null;
  if (text !== null) {
    let s;
    try { s = JSON.parse(text); } catch { out.push(`kept (does not parse): ${SETTINGS}`); }
    if (s && typeof s === "object") {
      let changed = false;
      const recorded = ({ key }) => merged.some((m) => isDeepStrictEqual(m.key, key));
      for (const w of wants.filter(recorded)) {
        const arr = w.key.reduce((o, k) => o?.[k], s);
        if (!Array.isArray(arr)) continue;
        const i = arr.findIndex((e) => isDeepStrictEqual(e, w.entry) || w.earlier?.some((x) => isDeepStrictEqual(x, e)));
        if (i >= 0) { arr.splice(i, 1); changed = true; }
        else if (arr.some(w.ours)) out.push(`kept (changed locally): ${SETTINGS} ${w.key.join(".")}`);
      }
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
  let memory;
  // the folder install wrote there; a record of an earlier version may hold a value that names none
  try { memory = resolve(ROOT, md ?? loadConfig(ROOT).memory.dir); } catch {}
  for (const [file, key, was] of [[SETTINGS, "attribution", ATTRIBUTION], [LOCAL, LOCAL_KEY, memory]]) {
    const x = rec.scalars.find((e) => e.file === file);
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
    const file = hookSet.has(key) ? relative(ROOT, join(hooksDir, basename(key))) : key;
    if (hookSet.has(key) && !lstatSync(join(ROOT, file), { throwIfNoEntry: false })?.isFile()) continue;
    // a hook's bytes are never rewritten as text
    const there = existsSync(join(ROOT, file)), t = there && line === hookLine(basename(key)) ? textOf(join(ROOT, file)) : read(ROOT, file);
    if (there && t === null) { out.push(`kept (not text): ${key}`); continue; }
    const ls = t?.split("\n") ?? [], i = ls.lastIndexOf(line);
    // a line of a hook that the user changed still holds the mark: it stays, and is named
    if (i < 0 && line === hookLine(basename(key)) && ls.some((l) => l.endsWith(" # xworkflows"))) out.push(`kept (changed locally): ${key}`);
    if (i < 0) continue;
    ls.splice(i, 1);
    const out2 = ls.join("\n");
    write(file, addedNewline && out2.endsWith("\n") ? out2.slice(0, -1) : out2);
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
    for (const f of [YML, ".qmd/index.sqlite", ".qmd/index.sqlite-wal", ".qmd/index.sqlite-shm", QMARK]) if (lstatSync(join(ROOT, f), { throwIfNoEntry: false })?.isFile()) rm(f);
  }
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
