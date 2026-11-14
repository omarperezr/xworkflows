// The text of each session from where the last dream run stopped, masked, for the analyzers. No model.
// Usage: node extract.mjs [--sessions <folder>] [--current <id>]
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync, existsSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { shared } from "./shared.mjs";

const { DEFAULTS, load, memoryDir } = await shared("hooks/core/config.mjs");
const { NOISE, REPORT } = await shared("hooks/core/memory.mjs");

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

// one line of a session file: its kept text ("user: ..." / "assistant: ..."), its timestamp, and whether it was not JSON
function line(raw) {
  if (!raw.trim()) return { text: "", time: null, bad: false };
  let o;
  try { o = JSON.parse(raw); } catch { return { text: "", time: null, bad: true }; }
  const time = typeof o?.timestamp === "string" && !Number.isNaN(Date.parse(o.timestamp)) ? o.timestamp : null;
  const side = o?.type;
  const c = (side === "user" || side === "assistant") && !o.isMeta && !o.isCompactSummary && o.isSidechain !== true ? o.message?.content : null;
  const parts = typeof c === "string" ? [c] : Array.isArray(c) ? c.filter((b) => b?.type === "text" && typeof b.text === "string").map((b) => b.text) : [];
  const out = [];
  for (const p of parts) {
    const t = p.replace(NOISE, "").trim();
    if (t && !(side === "user" && REPORT.test(t))) out.push(`${side}: ${t}`);
  }
  return { text: out.join("\n"), time, bad: false };
}

const arg = (argv, k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);

export function run(argv, env, root, home) {
  const refuse = (why) => ({ code: 2, stdout: "", stderr: `dream extract: ${why}\n` });
  const current = arg(argv, "--current") || env.CLAUDE_CODE_SESSION_ID;
  if (!current) return refuse("the id of the running session is unknown: pass --current <id> or set CLAUDE_CODE_SESSION_ID");
  const config = load(root);
  const cap = config.dream?.maxExtractBytes;
  if (!Number.isInteger(cap) || cap <= 0) return refuse(`dream.maxExtractBytes is ${JSON.stringify(cap)}, not a whole number above zero: fix it in .xworkflows/config.json`);
  const memory = join(root, memoryDir(config.memory.dir) ?? DEFAULTS.memory.dir);
  const notes = existsSync(memory) ? readdirSync(memory).filter((f) => f.endsWith(".md") && f !== "MEMORY.md").length : 0;
  const folder = arg(argv, "--sessions") ?? join(home, ".claude", "projects", root.replace(/[^A-Za-z0-9]/g, "-"));
  let state = {}; // session file name -> lines read
  try {
    const s = JSON.parse(readFileSync(join(memory, "dream.json"), "utf8")).sessions;
    if (s && typeof s === "object" && !Array.isArray(s)) state = s;
  } catch { /* no file, or a broken one: no state */ }

  const result = { out: null, sessions: [], bytes: 0, tokens: 0, left: 0, cut: false, notes, skipped: 0 };
  const done = (reason) => {
    const text = JSON.stringify(reason ? { ...result, reason } : result);
    if (result.out) writeFileSync(join(result.out, "extract.json"), text + "\n");
    return { code: 0, stdout: text + "\n", stderr: "" };
  };
  if (!notes) return done("no memory notes");

  const found = [];
  for (const e of existsSync(folder) ? readdirSync(folder, { withFileTypes: true }) : []) {
    if (!e.isFile() || !e.name.endsWith(".jsonl") || e.name === `${current}.jsonl`) continue;
    const file = join(folder, e.name), all = readFileSync(file, "utf8").split("\n");
    all.pop(); // after the last newline: nothing, or a line still being written, read at a later run
    const from = Number.isInteger(state[e.name]) && state[e.name] > 0 ? state[e.name] : 0;
    if (all.length <= from) continue;
    const lines = all.slice(from).map(line);
    found.push({ name: e.name.slice(0, -6), from, lines, time: lines.find((l) => l.time)?.time ?? statSync(file).mtime.toISOString() });
  }
  found.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  if (!found.length) return done("no new session");

  result.out = mkdtempSync(join(tmpdir(), "dream-"));
  let full = 0, stop = false;
  for (const s of found) {
    const kept = [];
    let size = 0, masked = 0, n = 0;
    for (const l of s.lines) {
      const [m, count] = mask(l.text);
      const add = m ? Buffer.byteLength(m) + (kept.length ? 1 : 0) : 0;
      if (result.bytes + size + add > cap) {
        stop = true;
        // a line longer than the whole cap, first in the run: its start is taken, else no run would ever get past it
        if (result.bytes + size === 0) { kept.push(m); masked += count; n++; result.cut = true; }
        break;
      }
      if (m) kept.push(m);
      size += add; masked += count; n++;
      if (l.bad) result.skipped++;
    }
    if (n) {
      const file = join(result.out, `${s.name}.txt`), buf = Buffer.from(kept.join("\n")).subarray(0, cap);
      writeFileSync(file, buf);
      result.sessions.push({ file, name: s.name, bytes: buf.length, masked, lines: s.from + n });
      result.bytes += buf.length;
      if (n < s.lines.length) result.cut = true;
    }
    if (n === s.lines.length) full++;
    if (stop) break;
  }
  result.left = found.length - full;
  result.tokens = Math.ceil(result.bytes / 4);
  return done();
}

// real paths: started through a path that holds a symbolic link, the script still runs
const direct = (() => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (direct) {
  const r = run(process.argv.slice(2), process.env, process.cwd(), homedir());
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  process.exitCode = r.code;
}
