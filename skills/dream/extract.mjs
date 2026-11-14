// The text of the sessions since the last dream run, masked, for the analyzers. No model.
// Usage: node extract.mjs [--sessions <folder>] [--current <id>] [--out <folder>]
import { readFileSync, readdirSync, statSync, mkdirSync, mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { shared } from "./shared.mjs";

const { DEFAULTS, load, memoryDir } = await shared("hooks/core/config.mjs");

// NOISE and REPORT are copied from hooks/core/memory.mjs (typed), which does not export them
const NOISE = /<(system-reminder|local-command-[\w-]+|command-[\w-]+|bash-stdout|bash-stderr)>[\s\S]*?<\/\1>/g;
const REPORT = /^(<task-notification>|Another Claude session sent a message)/;

const M = "[masked]";
// a placeholder, a type or an empty value is no secret
const SAFE = /^(?:<[^<>]*>|string|number|boolean|null|undefined|true|false|)[,;]?$/i;
// key: what stays before the value; q: its quote, if any; v: the value
const keep = (key, q, v) => (SAFE.test(v) ? null : `${key}${q}${M}${q}`);
const RULES = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, () => M],
  [/(Authorization:\s*Bearer\s+)(<[^<>\n]*>|[^\s"'`]+)/gi, (_, key, v) => keep(key, "", v)],
  [/([\w-]*(?:password|passwd|secret|token|api[_-]?key|access_key)[\w-]*["']?\s*[=:]\s*)(?:(["'])(.*?)\2|(<[^<>\n]*>|[^\s"'`]+))/gi,
    (_, key, q, qv, bare) => keep(key, q ?? "", q ? qv : bare)],
  [/(\b[a-z][\w+.-]*:\/\/[^\s:@/]+:)[^\s@/]+(?=@)/gi, (_, key) => key + M],
  [/\bsk-[\w-]{20,}/g, () => M],
  [/\b[sr]k_(?:live|test)_\w{10,}/g, () => M],
  [/\b(?:gh[pousr]_|github_pat_)\w{20,}/g, () => M],
  [/\bAKIA[A-Z0-9]{16}\b/g, () => M],
  [/\bxox[baprs]-[\w-]+/g, () => M],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, () => M],
];

// returns [masked text, count of replacements]
export function mask(text) {
  let n = 0;
  for (const [re, to] of RULES) text = text.replace(re, (...a) => { const r = to(...a); if (r === null) return a[0]; n++; return r; });
  return [text, n];
}

// the kept turns of one session file: ["user: ...", "assistant: ..."], and how many lines were not JSON
function turns(raw) {
  const out = []; let skipped = 0, time = null;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch { skipped++; continue; }
    time ??= typeof o?.timestamp === "string" && !Number.isNaN(Date.parse(o.timestamp)) ? o.timestamp : null;
    const side = o?.type;
    const c = (side === "user" || side === "assistant") && !o.isMeta && !o.isCompactSummary ? o.message?.content : null;
    const parts = typeof c === "string" ? [c] : Array.isArray(c) ? c.filter((b) => b?.type === "text" && typeof b.text === "string").map((b) => b.text) : [];
    for (const p of parts) {
      const t = p.replace(NOISE, "").trim();
      if (t && !(side === "user" && REPORT.test(t))) out.push(`${side}: ${t}`);
    }
  }
  return { out, skipped, time };
}

const arg = (argv, k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);

export function run(argv, env, root, home) {
  const out = arg(argv, "--out");
  if (out) {
    const r = relative(root, resolve(out));
    if (r === "" || (!r.startsWith("..") && !isAbsolute(r))) return { code: 2, stdout: "--out is inside the repository: give a folder outside it\n" };
  }
  const config = load(root);
  const memory = join(root, memoryDir(config.memory.dir) ?? DEFAULTS.memory.dir);
  const cap = Number.isInteger(config.dream?.maxExtractBytes) ? config.dream.maxExtractBytes : DEFAULTS.dream.maxExtractBytes;
  const notes = existsSync(memory) ? readdirSync(memory).filter((f) => f.endsWith(".md") && f !== "MEMORY.md").length : 0;
  const folder = arg(argv, "--sessions") ?? join(home, ".claude", "projects", root.replace(/[^A-Za-z0-9]/g, "-"));
  const current = arg(argv, "--current") ?? env.CLAUDE_CODE_SESSION_ID;
  let last = null;
  try { last = Date.parse(JSON.parse(readFileSync(join(memory, "dream.json"), "utf8")).time); } catch { /* no file, or a broken one: start at the oldest */ }

  const result = { out: out ?? null, sessions: [], bytes: 0, tokens: 0, left: 0, cut: false, last: null, notes, skipped: 0 };
  const done = (reason) => ({ code: 0, stdout: JSON.stringify(reason ? { ...result, reason } : result) + "\n" });
  if (!notes) return done("no memory notes");

  const found = [];
  for (const e of existsSync(folder) ? readdirSync(folder, { withFileTypes: true }) : []) {
    if (!e.isFile() || !e.name.endsWith(".jsonl") || e.name === `${current}.jsonl`) continue;
    const file = join(folder, e.name), t = turns(readFileSync(file, "utf8"));
    result.skipped += t.skipped;
    const time = t.time ?? statSync(file).mtime.toISOString();
    if (last === null || !(Date.parse(time) <= last)) found.push({ name: e.name.slice(0, -6), time, out: t.out });
  }
  found.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  if (!found.length) return done("no new session");

  const dir = out ? resolve(out) : mkdtempSync(join(tmpdir(), "dream-"));
  mkdirSync(dir, { recursive: true });
  result.out = dir;
  let i = 0;
  for (; i < found.length; i++) {
    const [masked, count] = mask(found[i].out.join("\n"));
    let buf = Buffer.from(masked);
    if (result.bytes + buf.length > cap) {
      if (i > 0) break;
      buf = buf.subarray(0, cap); result.cut = true;
    }
    const file = join(dir, `${found[i].name}.txt`);
    writeFileSync(file, buf);
    result.sessions.push({ file, name: found[i].name, bytes: buf.length, masked: count });
    result.bytes += buf.length;
    result.last = { name: found[i].name, time: found[i].time };
    if (result.cut) { i++; break; }
  }
  result.left = found.length - i;
  result.tokens = Math.ceil(result.bytes / 4);
  return done();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = run(process.argv.slice(2), process.env, process.cwd(), homedir());
  process.stdout.write(r.stdout);
  process.exitCode = r.code;
}
