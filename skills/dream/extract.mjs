// The text of each session from where the last dream run stopped, masked, for the analyzers. No model.
// Usage: node extract.mjs [--sessions <folder>] [--current <id>]
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync, existsSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { shared } from "./shared.mjs";

const { DEFAULTS, load, memoryDir } = await shared("hooks/core/config.mjs");
const { NOISE, REPORT } = await shared("hooks/core/memory.mjs");

const M = "[masked]";
// Every pattern here matches in time proportional to the text: each repeat is bounded or cannot be retried from inside a run it failed on.
// a secret by its own form; a key block keeps its line breaks, so the line numbers after it hold (an end-less block goes to the end)
const SHAPES = [
  [/-----BEGIN [A-Z ]{0,20}PRIVATE KEY-----(?:[\s\S]*?-----END [A-Z ]{0,20}PRIVATE KEY-----|[\s\S]*)/g, (b) => M + "\n".repeat(b.split("\n").length - 1)],
  [/(\b[a-z][\w+.-]{0,19}:\/\/[^\s:@/]*:)(?!\[masked\]@)[^\s@/]+(?=@)/gi, (_, key) => key + M],
  [/\bsk-[\w-]{20,}/g, () => M],
  [/\b[sr]k_(?:live|test)_\w{10,}/g, () => M],
  [/\b(?:gh[pousr]_|github_pat_)\w{20,}/g, () => M],
  [/\bAKIA[A-Z0-9]{16}\b/g, () => M],
  [/\bxox[baprs]-[\w-]+/g, () => M],
  [/\beyJ\w+\.[\w-]+\.[\w-]+/g, () => M],
];
// the wide rule, one line at a time: after a credential word (also inside a longer name), every value-like run; anywhere, a random-looking run
const WORD = /pass|pwd|secret|token|key|auth|credential|bearer/i;
const NAME = /[\w-]*/y; // the rest of the name that holds the word
const RUN = /\[masked\]|<[^<>\n]*>|[^\s"'`\\*,;=:<>(){}[\]|&][^\s"'`\\*,;<>(){}[\]|&]*/g;
const TYPE = /^(?:string|number|boolean|null|undefined|true|false)$/i;
const value = (r) => r !== M && r[0] !== "<" && r.length >= 4 && !TYPE.test(r);
// random-looking: 20 or more letters, digits and + / = _ - in a row, with a letter right beside a digit in at least three places
const LONG = /[A-Za-z0-9+/=_-]{20,}/g;
const random = (r) => (r.match(/[A-Za-z](?=\d)|\d(?=[A-Za-z])/g)?.length ?? 0) >= 3;

const each = (text, rules) => {
  let n = 0;
  for (const [re, to] of rules) text = text.replace(re, (...a) => (n++, to(...a)));
  return [text, n];
};
function wide(line) {
  let n = 0, head = line, tail = "";
  const w = WORD.exec(line);
  if (w) {
    NAME.lastIndex = w.index + w[0].length;
    NAME.exec(line);
    head = line.slice(0, NAME.lastIndex);
    tail = line.slice(NAME.lastIndex).replace(RUN, (r) => (value(r) ? (n++, M) : r));
  }
  head = head.replace(LONG, (r) => (random(r) ? (n++, M) : r));
  return [head + tail, n];
}

// what is a secret by its own form: safe to write back into a file. Returns [text, count]
export const shapes = (text) => each(text, SHAPES);

// the numbers (from 1) of the lines the wide rule would touch beyond shapes
export const suspect = (text) => shapes(text)[0].split("\n").flatMap((l, i) => (wide(l)[1] ? [i + 1] : []));

// shapes plus the wide rule, for the extract, where a wrong hit costs nothing. Returns [text, count]
export function mask(text) {
  const [shaped, n] = shapes(text);
  let total = n;
  const out = shaped.split("\n").map((l) => { const [m, c] = wide(l); total += c; return m; });
  return [out.join("\n"), total];
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
  const dir = memoryDir(config.memory.dir) ?? DEFAULTS.memory.dir, memory = join(root, dir);
  const notes = existsSync(memory) ? readdirSync(memory).filter((f) => f.endsWith(".md") && f !== "MEMORY.md").length : 0;
  const folder = arg(argv, "--sessions") ?? join(home, ".claude", "projects", root.replace(/[^A-Za-z0-9]/g, "-"));

  // the state of the adopted runs is on the main branch, the commit `branch.mjs open` starts from; the working folder is not read
  const genv = { ...process.env };
  for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) delete genv[k];
  const git = (...a) => spawnSync("git", a, { cwd: root, env: genv, encoding: "utf8", maxBuffer: 1 << 28 });
  const main = config.mainBranch;
  if (git("rev-parse", "--verify", "--quiet", `${main}^{commit}`).status !== 0) return refuse(`no branch ${main} to read the state from: ${root} is no git repository, or ${main} has no commit`);
  const shown = git("cat-file", "-p", `${main}:./${dir}/dream.json`);
  let state = {}; // session name (its file without .jsonl) -> lines read; no file on main: a first run
  if (shown.status === 0) {
    try { state = JSON.parse(shown.stdout).sessions; } catch { state = null; }
    if (!state || typeof state !== "object" || Array.isArray(state) || !Object.values(state).every((n) => Number.isInteger(n) && n >= 0))
      return refuse(`${dir}/dream.json on ${main} is not {"sessions": {"<session>": <lines read>}}: fix it on ${main}`);
  }
  const waiting = git("for-each-ref", "--format=%(refname:short)", `--no-merged=${main}`, "refs/heads/dream/").stdout.split("\n").filter(Boolean);

  const result = { out: null, sessions: [], bytes: 0, tokens: 0, left: 0, cut: false, notes, skipped: 0, waiting };
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
    const name = e.name.slice(0, -6), from = Number.isInteger(state[name]) && state[name] > 0 ? state[name] : 0;
    if (all.length <= from) continue;
    const lines = all.slice(from).map(line);
    found.push({ name, from, lines, time: lines.find((l) => l.time)?.time ?? statSync(file).mtime.toISOString() });
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
