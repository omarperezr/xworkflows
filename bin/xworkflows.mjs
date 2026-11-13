#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, normalize, posix, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DEFAULTS, PROJECT_KEYS, load as loadConfig, missing } from "../hooks/core/config.mjs";

export const PKG = dirname(dirname(fileURLToPath(import.meta.url)));
export let ROOT;

const COMMANDS = ["install", "doctor", "uninstall", "pack", "check"];
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
  if (cmd === "doctor") return doctor();
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
  let dir;
  try { dir = loadConfig(root).memory.dir; } catch (e) { die(1, e.message); }
  const none = { path, text: null, rec: { scalars: [], created: [] } };
  if (key in s) return none;
  if (spawnSync("git", ["ls-files", "--error-unmatch", path], { cwd: root, stdio: "ignore" }).status === 0) return { ...none, note: `${path} is tracked: ${key} not written, set it yourself` };
  const value = JSON.stringify(resolve(root, dir));
  if (old === null) return { path, text: json({ [key]: resolve(root, dir) }), rec: { scalars: [{ file: path, key: [key], dir }], created: [path] } };
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
// memory.dir as checks/index-current.mjs reads it; null when it is not a folder name inside the repository
const memName = (d) => {
  const n = typeof d === "string" ? posix.normalize(d.trim()).replace(/^\.\/|\/+$/g, "") : "";
  return n === "" || n === "." || n.startsWith("/") || n === ".." || n.startsWith("../") ? null : n;
};
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
// a value of .xworkflows/config.json read at hook time, `d` when the file or the key is not there
const CFG = (expr, d) => `node -e 'try{process.stdout.write(${expr}||"${d}")}catch{process.stdout.write("${d}")}'`;
const CONF = 'JSON.parse(require("fs").readFileSync(".xworkflows/config.json","utf8"))';
const MAIN = CFG(`${CONF}.mainBranch`, "main");
// the first word of lookup.index.command is the tool that builds the index, as the session-start hook runs it
const TOOL = CFG(`(${CONF}.lookup.index.command||"graphify query").split(" ")[0]`, "graphify");
const FOLDER = CFG(`${CONF}.lookup.index.folder`, "graphify-out");
// the folder inside the hooks folder where install keeps the project's own hooks, each under its own file name
const CHAINED = "xworkflows-chained";
const HOOK_TEXTS = [false, true, "earlier"];
// With `chain` the project's own hook runs first. "earlier" is the text of a project chained by renaming it <name>.before-xworkflows.
function hookText(name, chain) {
  const old = chain === "earlier" ? `old="$(dirname "$0")/${name}.before-xworkflows"\n` : `d="$(dirname "$0")"\nold="$d/${CHAINED}/${name}"\n[ -x "$old" ] || old="$d/${name}.before-xworkflows"\n`;
  if (name === "pre-push") {
    if (!chain) return `#!/bin/sh\n${CHECK}\nexit $?\n`;
    // git feeds the pushed refs on stdin once: keep them for both runs
    return `#!/bin/sh\nin=$(mktemp) || exit 1\ncat > "$in"\n${old}if [ -x "$old" ]; then "$old" "$@" < "$in" || { c=$?; rm -f "$in"; exit $c; }; fi\n${CHECK} < "$in"\nc=$?\nrm -f "$in"\nexit $c\n`;
  }
  return `#!/bin/sh\nc=0\n${chain ? `${old}[ -x "$old" ] && { "$old" "$@"; c=$?; }\n` : ""}cd "$(git rev-parse --show-toplevel)" || exit $c\nmain=$(${MAIN}) || main=main\n[ "$(git symbolic-ref --short -q HEAD)" = "$main" ] || exit $c\ntool=$(${TOOL}) || tool=graphify\nfolder=$(${FOLDER}) || folder=graphify-out\ncommand -v "$tool" >/dev/null 2>&1 || exit $c\nmkdir -p "$folder"\n{ "$tool" update . && touch -c "$folder/graph.json"; } > "$folder/.update.log" 2>&1 < /dev/null &\nexit $c\n`;
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
// Every file this package copies, with the text it copies (tier line included); plan() and uninstall share it.
function pkgWrites(manifest) {
  const tiers = readFileSync(join(PKG, "tiers.json"), "utf8");
  const writes = [{ path: ".xworkflows/tiers.json", text: tiers, piece: "installer", src: "tiers.json" }];
  for (const p of manifest.pieces) {
    for (const f of Object.keys(p.files)) {
      const t = target(f);
      if (!t) continue;
      let text = readFileSync(join(PKG, f), "utf8");
      if (f.startsWith("agents/")) {
        text = text.replace(/^tier: (\w+)$/m, (_, k) => `model: ${JSON.parse(tiers).claude[k]}`);
      }
      writes.push({ path: t, text, piece: p.id, src: f });
    }
  }
  return writes;
}
// The xwf- form of a file of unit u.
function renameWrite(w, u) {
  const id = basename(u, ".md");
  const nu = `${dirname(u)}/xwf-${basename(u)}`;
  const named = w.path === u || w.path.endsWith("/SKILL.md");
  return { ...w, path: nu + w.path.slice(u.length), text: named ? w.text.replace(/^name: .*$/m, `name: xwf-${id}`) : w.text };
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
    if (!rename && !mine && existsSync(join(root, u)) && !ws.every((w) => read(root, w.path) === w.text)) {
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
    const path = relative(root, resolve(hooksDir, name)), key = hookKey(root, name);
    const lst = lstatSync(join(root, path), { throwIfNoEntry: false });
    const cur = lst?.isFile() ? read(root, path) : null;
    const mine = cur !== null && (HOOK_TEXTS.some((c) => cur === hookText(name, c)) || (!!record.files[key] && hash(cur) === record.files[key].sha256));
    let chain = record.chained.some((c) => c.file === key) || (cur !== null && [true, "earlier"].some((c) => cur === hookText(name, c))), rename;
    const chainedDir = `${dirname(path)}/${CHAINED}`, to = `${chainedDir}/${name}`, toKey = `${dirname(key)}/${CHAINED}/${name}`;
    const before = `${path}.before-xworkflows`;
    const needDir = () => {
      const d = lstatSync(join(root, chainedDir), { throwIfNoEntry: false });
      if (d && !d.isDirectory()) die(1, `exists and is not a folder: ${chainedDir}`);
      if (lstatSync(join(root, to), { throwIfNoEntry: false })) die(1, `exists and is not ours: ${to}`);
    };
    // the user's hook renamed beside ours by an earlier install: ours is the only code that makes this name, the hook moves to the folder
    if ((!lst || mine) && lstatSync(join(root, before), { throwIfNoEntry: false })) {
      needDir();
      chain = true;
      rename = [before, to];
      hookMerges.push({ path, text: null, rec: { chained: [{ file: key, to: toKey }] } });
    } else if (chain && !record.chained.some((c) => c.file === key) && lstatSync(join(root, to), { throwIfNoEntry: false })) {
      // the record was lost: the folder still holds their hook
      hookMerges.push({ path, text: null, rec: { chained: [{ file: key, to: toKey }] } });
    }
    if (lst && !mine) {
      if (record.declined.some((d) => d.file === key && d.what === "chain")) continue;
      if (ask(`chain:${name}`, `A ${name} hook exists. Chain it (it runs first, then ours)?`, ["no", "yes"]) === "no") {
        hookMerges.push({ path, text: null, rec: { declined: [{ file: key, what: "chain" }] } });
        continue;
      }
      needDir();
      rename = [path, to];
      chain = true;
      hookMerges.push({ path, text: null, rec: { chained: [{ file: key, to: toKey }] } });
    }
    writes.push({ path, key, text: hookText(name, chain), piece: "checks", src: name, mode: 0o755, rename });
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
    if (cur === null || cur === w.text || w.rename) continue;
    const rec = record.files[w.key ?? w.path];
    if (!rec) {
      // --yes answers with label 0 here: a file that is not ours is never written over without a typed answer
      if (ask(`file:${w.path}`, `${w.path} exists and is not a text this package wrote. Keep it or write ours over it?`, ["keep mine", "overwrite"], 0) === "overwrite") continue;
      w.keep = true; notes.push(`kept (not ours): ${w.path}  new: ${w.src}`);
    } else if (hash(cur) !== rec.sha256) { w.keep = true; notes.push(`kept (changed locally): ${w.path}  new: ${w.src}`); }
  }
  const merges = [];
  let mem;
  try { mem = loadConfig(root).memory; } catch (e) { die(1, e.message); }
  let qmd = false;
  const md = memName(mem.dir);
  if (!md) notes.push(`not written: memory.dir must be a folder inside the repository: ${mem.dir}`);
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
  return { writes, merges, questions, kept, renamed, notes };
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
  const put = (root, path, text, mode) => { mk(dirname(path)); putFile(root, path, text, mode); };
  for (const w of pl.writes) if (!w.keep && differs(root, w)) {
    if (w.rename) { mkdirSync(dirname(join(root, w.rename[1])), { recursive: true }); renameSync(join(root, w.rename[0]), join(root, w.rename[1])); }
    put(root, w.path, w.text, w.mode);
    out.push(w.path);
  }
  const next = { ...record, xworkflows: manifest.version, tools: ["claude"], pieces: {}, files: {}, dirs: [...new Set([...(record.dirs ?? []), ...made])], kept: [...new Set([...record.kept, ...pl.kept])], renamed: { ...record.renamed, ...pl.renamed } };
  for (const m of pl.merges) {
    try {
      if (m.dir) { mk(m.path); mkdirSync(join(root, m.path), { recursive: true }); out.push(m.path); }
      if (m.text !== null) { put(root, m.path, m.text); out.push(m.path); }
    } catch (e) {
      // the new writes of the memory folder and the yml: say so, record nothing, go on
      if (!m.verb) throw e;
      out.push(`not written: ${m.path}`);
      continue;
    }
    for (const [k, list] of Object.entries(m.rec)) {
      next[k] = [...next[k]];
      // the replaced entry of a hook leaves the record
      if (k === "merged") for (const x of list) { const gone = next[k].find((y) => x.entry?.hooks && x.file === y.file && isDeepStrictEqual(x.key, y.key) && x.entry.hooks[0].command === y.entry?.hooks?.[0]?.command); if (gone?.createdKey) { x.createdKey = true; x.levels = gone.levels; } }
      if (k === "merged") next[k] = next[k].filter((y) => !list.some((x) => x.entry?.hooks && x.file === y.file && isDeepStrictEqual(x.key, y.key) && x.entry.hooks[0].command === y.entry?.hooks?.[0]?.command));
      for (const x of list) if (!next[k].some((y) => (k === "merged" ? x.file === y.file && isDeepStrictEqual(x.key, y.key) && isDeepStrictEqual(x.entry, y.entry) : (k === "blocks" || k === "imports" ? x.file === y.file && x.line === y.line : isDeepStrictEqual(x, y))))) next[k].push(x);
    }
  }
  for (const p of manifest.pieces) next.pieces[p.id] = { version: p.version, sha256: p.sha256 };
  for (const w of pl.writes) next.files[w.key ?? w.path] = w.keep ? record.files[w.key ?? w.path] : { piece: w.piece, sha256: hash(w.text) };
  const rp = ".xworkflows/installed.json";
  mk(dirname(rp));
  next.dirs = [...new Set([...next.dirs, ...made])];
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
      record = { ...EMPTY, ...JSON.parse(readFileSync(rp, "utf8")) };
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
    for (const w of pl.writes) if (!w.keep && differs(ROOT, w)) console.log(`${w.rename ? `would rename ${w.rename[0]} to ${w.rename[1]}\n` : ""}would write ${w.path}`);
    for (const m of pl.merges) if (m.text !== null || m.dir) console.log(`would ${m.verb ?? "merge"} ${m.path}`);
  } else {
    const done = apply(pl, ROOT, m, record);
    console.log(done.length ? done.join("\n") : "nothing to do");
    console.log("Next: open Claude Code and type /adapt");
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
    say(hash(t) === sha256 ? "ok" : "warn", hash(t) === sha256 ? f : `changed locally: ${f}; to put the package's copy back ${INSTALL} (it overwrites your change)`);
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
  try { cfg = JSON.parse(readFileSync(join(ROOT, ".xworkflows/config.json"), "utf8")); } catch {}
  const specs = cfg.paths?.specs ?? "docs/superpowers/specs";
  const memDir = cfg.memory?.dir ?? "docs/memory";
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
    say(d === "deny" ? "ok" : "fail", d === "deny" ? "probe: design-first denies a spec write" : `probe: expected deny, got ${d ?? "no valid output"}: ${INSTALL} to put the hook files back`);
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
  const mem = join(ROOT, memDir, "MEMORY.md");
  if (existsSync(mem) && !seen.has(mem)) { seen.add(mem); bytes += statSync(mem).size; }
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
    } catch (e) { say("fail", `config: ${e.message}: ${e.message.startsWith(".xworkflows/config.json does not parse") ? "fix the JSON of .xworkflows/config.json" : INSTALL}`); }
    if (conf.paths.code?.length) {
      const dir = conf.lookup.index.folder;
      say(has("graphify") ? "ok" : "fail", has("graphify") ? "graphify command" : "graphify command is missing: uv tool install graphifyy");
      say(existsSync(join(ROOT, dir, "graph.json")) ? "ok" : "fail", existsSync(join(ROOT, dir, "graph.json")) ? "graphify index" : `${dir}/graph.json is missing: graphify update .`);
    }
    const mem = memName(conf.memory.dir) ?? conf.memory.dir;
    if (!has("qmd")) say("fail", "qmd command is missing: npm install -g @tobilu/qmd");
    else if (!existsSync(join(ROOT, mem))) say("warn", `no memory folder yet: ${mem}: ${INSTALL}`);
    else {
      const abs = resolve(ROOT, mem);
      const q = (...a) => spawnSync("qmd", [...(conf.memory.index ? ["--index", conf.memory.index] : []), "collection", ...a], { cwd: ROOT, encoding: "utf8", timeout: TIMEOUT });
      const qcmd = `qmd${conf.memory.index ? ` --index ${conf.memory.index}` : ""}`;
      // no minimum is compared: the line only says which qmd this is
      const v = spawnSync("qmd", ["--version"], { cwd: ROOT, encoding: "utf8", timeout: TIMEOUT });
      const ver = v.error || v.status !== 0 ? "" : (v.stdout ?? "").trim().split("\n")[0];
      say(ver ? "ok" : "warn", ver || "qmd does not answer --version: run qmd --version to see why");
      const l = q("list");
      if (l.error) say("warn", `qmd did not answer: collections of ${mem} not checked: run ${qcmd} collection list to see why`);
      else {
        // only `collection show <name>` prints the path
        const names = [...(l.stdout ?? "").matchAll(/^(\S+) \(qmd:\/\//gm)].map((m) => m[1]);
        const covers = names.some((n) => {
          const t = q("show", n).stdout?.match(/^\s*Path:\s+(.+?)\s*$/m)?.[1]?.replace(/\/$/, "");
          return t && (abs === t || abs.startsWith(t + "/"));
        });
        const yml = localYml(ROOT);
        const why = conf.memory.index ? `${qcmd} collection add ${mem}` : !yml ? INSTALL : (read(ROOT, yml) ?? "").includes(abs) ? `this qmd does not read ${yml}, which names it: npm install -g @tobilu/qmd@latest` : `${yml} names no collection with the path ${abs}; add one, or delete .qmd and run install again`;
        say(covers ? "ok" : "fail", covers ? `qmd collection covers ${mem}` : `no qmd collection covers ${mem}: ${why}`);
      }
    }
    const hp = relative(ROOT, resolve(hooksFolder(ROOT), "pre-push"));
    const cur = lstatSync(join(ROOT, hp), { throwIfNoEntry: false })?.isFile() ? read(ROOT, hp) : null;
    // the record's key for it: .git/hooks/pre-push whichever checkout this is, unless core.hooksPath moved the folder
    const key = hookKey(ROOT, "pre-push");
    if (cur !== null && HOOK_TEXTS.some((c) => cur === hookText("pre-push", c))) say("ok", "pre-push hook is ours");
    else if (cur !== null && rec.files[key]) say("warn", `pre-push hook changed locally: it may no longer run the check; make it run: ${CHECK}`);
    else if (rec.declined.some((d) => d.file === key && d.what === "chain")) say("warn", `pre-push hook is yours: chaining declined at install; add this line to it: ${CHECK}`);
    else say("fail", `pre-push hook is missing or not ours: ${INSTALL}`);
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
    const amd = local.autoMemoryDirectory, abs = resolve(ROOT, mem);
    try {
      const where = real(abs), base = real(ROOT);
      if (where !== base && !where.startsWith(base + sep)) say("warn", 'the memory folder is outside the repository: qmd indexes it only after "qmd trust" is run here');
    } catch {}
    if (amd === undefined) say("warn", `autoMemoryDirectory is not set in .claude/settings.local.json: add "autoMemoryDirectory": "${abs}" to it`);
    else if (typeof amd !== "string" || !(resolve(ROOT, amd) + sep).startsWith(abs + sep)) say("warn", `autoMemoryDirectory is not the memory folder ${mem}: set it to "${abs}" in .claude/settings.local.json`);
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
  finish();
}

const SETTINGS = ".claude/settings.json", LOCAL = ".claude/settings.local.json", LOCAL_KEY = "autoMemoryDirectory";
const FIVE = [SETTINGS, LOCAL, ".gitignore", GI, "AGENTS.md", "CLAUDE.md"];
// The lines install adds to the files it merges into.
const LINES = new Map([[".gitignore", IGNORE.map(([l]) => l)], ["CLAUDE.md", ["@AGENTS.md"]]]);

// installed.json is the project's text, so it is never the package's word: uninstall removes only what this package version
// writes (manifest, target(), the fixed lines, keys and hook texts above). The record answers yes-or-no questions about those.
function uninstall() {
  let rec;
  try { rec = { ...EMPTY, ...JSON.parse(readFileSync(join(ROOT, ".xworkflows/installed.json"), "utf8")) }; }
  catch (e) { die(1, e.code === "ENOENT" ? "not installed" : ".xworkflows/installed.json does not parse; fix or remove it"); }
  for (const k of ["merged", "blocks", "imports", "scalars", "chained"]) rec[k] = Array.isArray(rec[k]) ? rec[k].filter((e) => e && typeof e === "object") : [];
  for (const k of ["created", "kept", "dirs"]) rec[k] = Array.isArray(rec[k]) ? rec[k] : [];
  if (!rec.files || typeof rec.files !== "object" || Array.isArray(rec.files)) rec.files = {};
  const manifest = readManifest();
  const out = [], gone = [];
  if (rec.xworkflows !== manifest.version) out.push(`record written by xworkflows ${rec.xworkflows || "unknown"}; this is ${manifest.version}`);

  const hooksDir = ownHooks(ROOT);
  const hookRel = new Map(hooksDir ? HOOKS.map((n) => [n, hookKey(ROOT, n)]) : []);
  const hookSet = new Set(hookRel.values());
  const wanted = new Map(); // path -> the text plan() writes there, renamed units included
  for (const w of pkgWrites(manifest)) {
    wanted.set(w.path, w.text);
    const u = w.path.match(UNIT)?.[0];
    if (u) { const x = renameWrite(w, u); wanted.set(x.path, x.text); }
  }
  const wants = settingsWants(manifest);
  const giLines = new Set([".xworkflows/", ...[...wanted.keys()].map(giLine).filter(Boolean)]);
  let md = null;
  try { md = memName(loadConfig(ROOT).memory.dir); } catch {}

  // the marker, not the record, says this checkout's install wrote the yml: only install's exact text is the marker
  let marked = false;
  try { marked = lstatSync(join(ROOT, QMARK), { throwIfNoEntry: false })?.isFile() && clean(ROOT, QMARK) && read(ROOT, QMARK) === MARK_TEXT; } catch {} // .qmd is a plain file

  const named = {
    files: (_, p) => wanted.has(p) || hookSet.has(p),
    merged: (m) => m.file === SETTINGS && wants.some((w) => isDeepStrictEqual(w.key, m.key)),
    scalars: (x) => (x.file === SETTINGS && isDeepStrictEqual(x.key, ["attribution"])) || (x.file === LOCAL && isDeepStrictEqual(x.key, [LOCAL_KEY])),
    blocks: (b) => b.file === "AGENTS.md",
    imports: (i) => !!LINES.get(i.file)?.includes(i.line) || (i.file === GI && giLines.has(i.line)),
    created: (p) => FIVE.includes(p) || p === md || (p === YML && marked),
    chained: (c) => hookSet.has(c.file) && [c.file + ".before-xworkflows", `${dirname(c.file)}/${CHAINED}/${basename(c.file)}`].includes(c.to),
  };
  const said = new Set();
  const keep = (kind, e, p) => {
    if ((hookSet.has(p) ? kind === "files" || kind === "chained" : plain(p) && clean(ROOT, p)) && named[kind](e, p)) return true;
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
    const abs = join(hooksDir, name), dir = join(hooksDir, CHAINED), moved = join(dir, name);
    const before = lstatSync(dir, { throwIfNoEntry: false })?.isDirectory() && lstatSync(moved, { throwIfNoEntry: false }) ? moved : abs + ".before-xworkflows";
    if (!lstatSync(abs, { throwIfNoEntry: false })?.isFile()) continue;
    const cur = readFileSync(abs, "utf8");
    if (!HOOK_TEXTS.some((c) => cur === hookText(name, c))) { if (recFiles.has(p)) out.push(hash(cur) === rec.files[p].sha256 ? `kept (not ours): ${p}` : `kept (changed locally): ${p}`); continue; }
    rmSync(abs); out.push(`deleted ${p}`);
    if (lstatSync(before, { throwIfNoEntry: false })) { renameSync(before, abs); out.push(`restored ${p}`); }
    try { rmdirSync(dir); } catch {} // only an empty folder goes
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
        const i = arr.findIndex((e) => isDeepStrictEqual(e, w.entry));
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
  try { memory = resolve(ROOT, loadConfig(ROOT).memory.dir); } catch {}
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
  for (const { file, line, addedNewline } of rec.imports) {
    const t = read(ROOT, file), ls = t?.split("\n") ?? [], i = ls.lastIndexOf(line);
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
      if (!rec.dirs.includes(d) || readdirSync(join(ROOT, d)).length) break;
      rmdirSync(join(ROOT, d));
      out.push(`deleted ${d}/`);
    }
  }
  console.log(out.join("\n") + (out.length ? "\n" : "") + "uninstalled");
}

main(process.argv.slice(2));
