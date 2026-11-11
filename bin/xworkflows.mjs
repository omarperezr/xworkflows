#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
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
  if ((flags["dry-run"] || flags.yes) && cmd !== "install") die(2, "--dry-run and --yes are for install only");
  if (flags.check && cmd !== "pack") die(2, "--check is for pack only");
  if (flags.tool && flags.tool !== "claude") die(2, `not yet: ${flags.tool} comes in a later phase`);
  if (cmd === "pack") return pack(flags.check);
  try {
    ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    die(1, "not inside a git repository");
  }
  if (cmd === "install") return install(flags);
  if (cmd === "doctor") return doctor();
  return uninstall();
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

const read = (root, p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), "utf8") : null);
const hookCmd = (id) => `node "$(git rev-parse --show-toplevel)/.xworkflows/hooks/run.mjs" claude ${id}`;
const isOurs = (e, id) => e?.hooks?.some((h) => `${h.command} `.includes(`/.xworkflows/hooks/run.mjs" claude ${id} `));
const MARK = "Bash(node .xworkflows/mark.mjs:*)";
const START = "<!-- xworkflows:start -->";
const END = "<!-- xworkflows:end -->";

// Each merge: { path, text (null when nothing changes), rec: new record entries }.
function mergeSettings(root, manifest, record) {
  const path = ".claude/settings.json";
  const old = read(root, path);
  let s = {};
  if (old !== null) {
    try { s = JSON.parse(old); } catch { die(1, `${path} does not parse; fix it`); }
    if (!s || typeof s !== "object" || Array.isArray(s)) die(1, `${path} is not a JSON object`);
  }
  const want = [];
  for (const p of manifest.pieces) {
    for (const c of p.claude ?? []) {
      const entry = { ...(c.matcher && { matcher: c.matcher }), hooks: [{ type: "command", command: hookCmd(p.id) }] };
      const ours = (e) => isOurs(e, p.id);
      want.push({ key: ["hooks", c.event], entry, ours });
    }
  }
  if (want.length) want.push({ key: ["permissions", "allow"], entry: MARK, ours: () => false });
  const merged = [];
  let changed = false;
  for (const { key, entry, ours } of want) {
    let o = s, createdKey = false;
    for (const k of key.slice(0, -1)) {
      if (!(k in o)) { o[k] = {}; createdKey = true; }
      o = o[k];
      if (!o || typeof o !== "object" || Array.isArray(o)) die(1, `${path}: ${k} is not an object`);
    }
    const last = key.at(-1);
    if (!(last in o)) { o[last] = []; createdKey = true; }
    if (!Array.isArray(o[last])) die(1, `${path}: ${key.join(".")} is not an array`);
    const found = o[last].find((e) => isDeepStrictEqual(e, entry) || ours(e));
    if (found) {
      // ours but unrecorded (installed.json lost): record it so uninstall can remove it
      const known = record.merged.some((m) => m.file === path && isDeepStrictEqual(m.key, key) && (isDeepStrictEqual(m.entry, found) || ours(m.entry)));
      if (ours(found) && !known) merged.push({ file: path, key, entry: found, createdKey: false });
      continue;
    }
    o[last].push(entry);
    changed = true;
    merged.push({ file: path, key, entry, createdKey });
  }
  return { path, text: changed ? json(s) : null, rec: { merged, created: old === null && changed ? [path] : [] } };
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

// Reads and parses every target file before any write (ruling P2) and refuses before any write.
// `ans` maps question id -> chosen label; an unanswered question is listed in `questions` and planned with its safe answer.
export function plan(manifest, root, record, ans = {}) {
  const tiers = readFileSync(join(PKG, "tiers.json"), "utf8");
  let writes = [{ path: ".xworkflows/tiers.json", text: tiers, piece: "installer", src: "tiers.json" }];
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
  const questions = [], kept = [], renamed = {}, notes = [];
  const ask = (id, text, labels) => {
    if (ans[id] === undefined) questions.push({ id, text, labels });
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
    if (!rename && !mine && existsSync(join(root, u)) && !ws.every((w) => read(root, w.path) === w.text)) {
      const kind = u.includes("/skills/") ? "skill" : "agent";
      const a = ask(`unit:${u}`, `${kind === "skill" ? "A skill" : "An agent"} ${id} exists. Keep theirs or install ours as xwf-${id}?`, ["keep theirs", `xwf-${id}`]);
      if (a === "keep theirs") { kept.push(u); continue; }
      rename = true;
    }
    if (rename) renamed[nu] = ws[0].piece;
    for (const w of ws) {
      const named = w.path === u || w.path.endsWith("/SKILL.md");
      writes.push(rename ? { ...w, path: nu + w.path.slice(u.length), text: named ? w.text.replace(/^name: .*$/m, `name: xwf-${id}`) : w.text } : w);
    }
  }
  for (const w of writes) {
    const cur = read(root, w.path);
    if (cur === null || cur === w.text) continue;
    const rec = record.files[w.path];
    if (!rec) die(1, `exists and is not ours: ${w.path}`);
    if (hash(cur) !== rec.sha256) { w.keep = true; notes.push(`kept (changed locally): ${w.path}  new: ${w.src}`); }
  }
  const merges = [mergeSettings(root, manifest, record), mergeAgents(root)];
  const claude = read(root, "CLAUDE.md");
  if (claude === null) {
    merges.push({ path: "CLAUDE.md", text: "@AGENTS.md\n", rec: { imports: [{ file: "CLAUDE.md", line: "@AGENTS.md" }], created: ["CLAUDE.md"] } });
  } else if (!/^@AGENTS\.md\s*$/m.test(claude) && !record.declined.some((d) => d.file === "CLAUDE.md" && d.what === "import")) {
    if (ask("import", IMPORT, ["no", "yes"]) === "yes") {
      merges.push({ path: "CLAUDE.md", text: claude + (claude.endsWith("\n") ? "" : "\n") + "@AGENTS.md\n", rec: { imports: [claude.endsWith("\n") ? { file: "CLAUDE.md", line: "@AGENTS.md" } : { file: "CLAUDE.md", line: "@AGENTS.md", addedNewline: true }] } });
    } else merges.push({ path: "CLAUDE.md", text: null, rec: { declined: [{ file: "CLAUDE.md", what: "import" }] } });
  }
  return { writes, merges, questions, kept, renamed, notes };
}

const differs = (root, w) => !existsSync(join(root, w.path)) || readFileSync(join(root, w.path), "utf8") !== w.text;
const put = (root, path, text) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};

export function apply(pl, root, manifest, record) {
  const out = [];
  for (const w of pl.writes) if (!w.keep && differs(root, w)) { put(root, w.path, w.text); out.push(w.path); }
  const next = { ...record, xworkflows: manifest.version, tools: ["claude"], pieces: {}, files: {}, kept: [...new Set([...record.kept, ...pl.kept])], renamed: { ...record.renamed, ...pl.renamed } };
  for (const m of pl.merges) {
    if (m.text !== null) { put(root, m.path, m.text); out.push(m.path); }
    for (const [k, list] of Object.entries(m.rec)) {
      next[k] = [...next[k]];
      for (const x of list) if (!next[k].some((y) => (k === "merged" ? x.file === y.file && isDeepStrictEqual(x.key, y.key) && isDeepStrictEqual(x.entry, y.entry) : (k === "blocks" || k === "imports" ? x.file === y.file && x.line === y.line : isDeepStrictEqual(x, y))))) next[k].push(x);
    }
  }
  for (const p of manifest.pieces) next.pieces[p.id] = { version: p.version, sha256: p.sha256 };
  for (const w of pl.writes) next.files[w.path] = w.keep ? record.files[w.path] : { piece: w.piece, sha256: hash(w.text) };
  const text = json(next);
  const rp = ".xworkflows/installed.json";
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
  if (existsSync(rp)) {
    try {
      record = { ...EMPTY, ...JSON.parse(readFileSync(rp, "utf8")) };
    } catch {
      die(1, ".xworkflows/installed.json does not parse; fix or remove it");
    }
  }
  let pl = plan(m, ROOT, record);
  const ans = {}, auto = [];
  const rl = pl.questions.length && !flags.yes && !flags["dry-run"] && process.stdin.isTTY ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  for (const q of pl.questions) {
    if (flags.yes) ans[q.id] = q.labels[1];
    else if (rl) {
      const r = (await rl.question(`${q.text} (${q.labels.join(" / ")}) `)).trim().toLowerCase();
      ans[q.id] = r && q.labels[1].toLowerCase().startsWith(r) ? q.labels[1] : q.labels[0];
    } else { ans[q.id] = q.labels[0]; auto.push(`answered for you: ${q.text} -> ${q.labels[0]}`); }
  }
  rl?.close();
  if (pl.questions.length) pl = plan(m, ROOT, record, ans);
  for (const n of pl.notes) console.log(n);
  if (flags["dry-run"]) {
    for (const w of pl.writes) if (!w.keep && differs(ROOT, w)) console.log(`would write ${w.path}`);
    for (const m of pl.merges) if (m.text !== null) console.log(`would merge ${m.path}`);
  } else {
    const done = apply(pl, ROOT, m, record);
    console.log(done.length ? done.join("\n") : "nothing to do");
    console.log("Next: open Claude Code and type /adapt");
  }
  for (const a of auto) console.log(a);
}

function doctor() {
  const out = [];
  let nf = 0, nw = 0;
  const say = (lvl, t) => { out.push(`${lvl === "ok" ? "ok  " : lvl} ${t}`); if (lvl === "fail") nf++; if (lvl === "warn") nw++; };
  const finish = () => {
    console.log(out.join("\n") + `\ndoctor: ${nf} fail, ${nw} warn`);
    process.exit(nf ? 1 : 0);
  };
  say("ok", "git repository");
  let rec;
  try { rec = { ...EMPTY, ...JSON.parse(readFileSync(join(ROOT, ".xworkflows/installed.json"), "utf8")) }; }
  catch (e) { say("fail", e.code === "ENOENT" ? "not installed" : "installed.json does not parse"); return finish(); }
  say("ok", "installed.json parses");
  const major = Number(process.versions.node.split(".")[0]);
  say(major >= 22 ? "ok" : "fail", `node ${process.versions.node}`);
  const g = spawnSync("git", ["--version"], { encoding: "utf8" });
  say(g.status === 0 ? "ok" : "fail", g.status === 0 ? g.stdout.trim() : "git does not answer");
  // 2
  for (const [f, { sha256 }] of Object.entries(rec.files)) {
    let t;
    try { t = readFileSync(join(ROOT, f), "utf8"); } catch { say("fail", `missing or unreadable: ${f}`); continue; }
    say(hash(t) === sha256 ? "ok" : "warn", hash(t) === sha256 ? f : `changed locally: ${f}`);
  }
  for (const k of rec.kept) {
    const gs = k === ".claude/skills/grill" && rec.pieces["design-first"] ? read(ROOT, `${k}/SKILL.md`) : null;
    if (gs !== null && !gs.includes("node .xworkflows/mark.mjs grill")) say("fail", 'kept grill never marks itself: spec writes will be denied. Add the line "node .xworkflows/mark.mjs grill" to its first step');
    else say("warn", `kept theirs: ${k}`);
  }
  // 3
  for (const m of rec.merged) {
    let arr;
    try { arr = m.key.reduce((o, k) => o[k], JSON.parse(readFileSync(join(ROOT, m.file), "utf8"))); } catch { arr = null; }
    arr = Array.isArray(arr) ? arr : [];
    const id = m.entry?.hooks?.[0]?.command?.match(/run\.mjs" claude (\S+)/)?.[1];
    const lbl = `${m.file} ${m.key.join(".")}`;
    if (arr.some((e) => isDeepStrictEqual(e, m.entry))) say("ok", `merged: ${lbl}`);
    else if (id && arr.some((e) => isOurs(e, id))) say("warn", `changed locally: ${lbl}`);
    else say("fail", `merged entry missing: ${lbl}`);
  }
  // 4
  if (!rec.blocks.length) say("fail", "AGENTS.md block was never written");
  else say((read(ROOT, "AGENTS.md") ?? "").includes(agentsBlock()) ? "ok" : "fail", "AGENTS.md block matches the template");
  if (/^@AGENTS\.md\s*$/m.test(read(ROOT, "CLAUDE.md") ?? "")) say("ok", "CLAUDE.md imports AGENTS.md");
  else if (rec.declined.some((d) => d.file === "CLAUDE.md" && d.what === "import")) say("warn", "CLAUDE.md does not import AGENTS.md: add the line @AGENTS.md");
  else say("fail", "CLAUDE.md does not import AGENTS.md");
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
  if (!command) say("fail", "probe: no design-first hook entry");
  else {
    const state = mkdtempSync(join(tmpdir(), "xwf-doctor-"));
    const env = { ...process.env, CLAUDE_PROJECT_DIR: ROOT, XWORKFLOWS_STATE_DIR: state };
    delete env.XWORKFLOWS_FREE; delete env.XWORKFLOWS_RECORD;
    const event = { session_id: `doctor-${process.pid}`, cwd: ROOT, hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: join(ROOT, specs, "xwf-doctor-probe.md"), content: "# probe\n" } };
    const r = spawnSync(command, { shell: true, cwd: ROOT, env, input: JSON.stringify(event), encoding: "utf8", timeout: Number(process.env.XWORKFLOWS_PROBE_TIMEOUT_MS) || 10000 });
    rmSync(state, { recursive: true, force: true });
    let d; try { d = JSON.parse(r.stdout).hookSpecificOutput?.permissionDecision; } catch {}
    say(d === "deny" ? "ok" : "fail", d === "deny" ? "probe: design-first denies a spec write" : `probe: expected deny, got ${d ?? "no valid output"}`);
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
  say(bytes > budget ? "fail" : "ok", `always-loaded: ${bytes} bytes of ${budget}`);
  say("ok", "Claude Code: tested");
  finish();
}

function uninstall() {
  let rec;
  try { rec = { ...EMPTY, ...JSON.parse(readFileSync(join(ROOT, ".xworkflows/installed.json"), "utf8")) }; }
  catch (e) { die(1, e.code === "ENOENT" ? "not installed" : ".xworkflows/installed.json does not parse; fix or remove it"); }
  const out = [], gone = [];
  // installed.json is committed, so its paths are untrusted: stay inside the repo, never config.json
  const realRoot = realpathSync(ROOT);
  const inside = (p) => {
    const f = resolve(ROOT, p);
    if (!f.startsWith(resolve(ROOT) + sep) || f === resolve(ROOT, ".xworkflows/config.json")) return false;
    let a = f; // nearest existing ancestor, symlinks resolved; a dangling link counts as outside
    for (;;) {
      try { lstatSync(a); break; } catch { a = dirname(a); }
    }
    try { return (realpathSync(a) + sep).startsWith(realRoot + sep); } catch { return false; }
  };
  const bad = new Set();
  for (const p of [...Object.keys(rec.files), ...rec.merged.map((m) => m.file), ...rec.blocks.map((b) => b.file), ...rec.imports.map((i) => i.file), ...rec.created])
    if (!inside(p) && !bad.has(p)) { bad.add(p); out.push(`kept (not ours): ${p}`); }
  rec.files = Object.fromEntries(Object.entries(rec.files).filter(([p]) => !bad.has(p)));
  rec.merged = rec.merged.filter((m) => !bad.has(m.file));
  rec.blocks = rec.blocks.filter((b) => !bad.has(b.file));
  rec.imports = rec.imports.filter((i) => !bad.has(i.file));
  rec.created = rec.created.filter((p) => !bad.has(p));
  const rm = (p) => { rmSync(join(ROOT, p)); gone.push(p); };
  const write = (p, text) => { writeFileSync(join(ROOT, p), text); out.push(`changed ${p}`); };
  for (const [p, { sha256 }] of Object.entries(rec.files)) {
    if (rec.kept.includes(p) || !existsSync(join(ROOT, p))) continue;
    if (hash(read(ROOT, p)) === sha256) { rm(p); out.push(`deleted ${p}`); }
    else out.push(`kept (changed locally): ${p}`);
  }
  const sp = ".claude/settings.json";
  const merged = rec.merged.filter((m) => m.file === sp);
  if (merged.length && read(ROOT, sp) !== null) {
    let s;
    try { s = JSON.parse(read(ROOT, sp)); } catch { out.push(`kept (does not parse): ${sp}`); }
    if (s) {
      let changed = false;
      for (const m of merged) {
        const parents = [s];
        for (const k of m.key) parents.push(parents.at(-1)?.[k]);
        const arr = parents.at(-1);
        if (!Array.isArray(arr)) continue;
        const i = arr.findIndex((e) => isDeepStrictEqual(e, m.entry));
        const id = m.entry?.hooks?.[0]?.command?.match(/run\.mjs" claude (\S+)/)?.[1];
        if (i >= 0) { arr.splice(i, 1); changed = true; }
        else if (id && arr.some((e) => isOurs(e, id))) { out.push(`kept (changed locally): ${sp} ${m.key.join(".")}`); continue; }
      }
      // prune per key path once every entry is gone, whichever record entry carried createdKey
      for (const m of merged) {
        if (!merged.some((x) => x.createdKey && isDeepStrictEqual(x.key, m.key))) continue;
        const parents = [s];
        for (const k of m.key) parents.push(parents.at(-1)?.[k]);
        for (let d = m.key.length; d > 0 && parents[d] && Object.keys(parents[d]).length === 0; d--) { delete parents[d - 1][m.key[d - 1]]; changed = true; }
      }
      if (changed) write(sp, json(s));
    }
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
    const t = read(ROOT, p);
    let empty = t !== null && t.trim() === "";
    try { empty ||= t !== null && isDeepStrictEqual(JSON.parse(t), {}); } catch {}
    if (empty && !rec.kept.includes(p)) { rm(p); out.push(`deleted ${p}`); }
  }
  rm(".xworkflows/installed.json");
  for (const p of gone) {
    for (let d = dirname(p); d !== "."; d = dirname(d)) {
      if (!existsSync(join(ROOT, d))) continue;
      if (readdirSync(join(ROOT, d)).length) break;
      rmdirSync(join(ROOT, d));
      out.push(`deleted ${d}/`);
    }
  }
  console.log(out.join("\n") + (out.length ? "\n" : "") + "uninstalled");
}

main(process.argv.slice(2));
