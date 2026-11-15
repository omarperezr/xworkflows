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
// key material on the line of a BEGIN mark: runs of base64 or escaped line breaks, each with a digit, + / = or \ in it, so a word of prose is none
const KEYRUN = String.raw`(?=[A-Za-z]*[0-9+/=\\])(?:\\[nr]|[A-Za-z0-9+/=])+`;
const KEYLINE = String.raw`[ \t>]*[A-Za-z0-9+/=]+[ \t]*`; // a line of key material, indented, quoted with ">" or ending in white space
const BEGIN = "-----BEGIN [A-Z ]{0,20}PRIVATE KEY-----", END = "-----END [A-Z ]{0,20}PRIVATE KEY-----";
// key length: 64 base64 characters in a row, a PEM body line and the whole body of the shortest key (Ed25519); a commit hash (40), a UUID or a number is shorter
const KEYLEN = /[A-Za-z0-9+/=]{64}/;
const block = (b) => M + "\n".repeat(b.split("\n").length - 1);
// No repeat here is retried from inside another; but each BEGIN mark with no END mark after it scans to the end of the text, and each "Name: value" line
// that holds a mark scans the header lines under it, so the time grows with the square of the number of either.
// a secret by its own form; a key block keeps its line breaks, so the line numbers after it hold. First, a block that holds a run of key length goes whole:
// up to the END mark, or the rest of the mark's line and the key lines under it. Then, in a block with none, a BEGIN mark takes the rest of its line only when
// it is key material, and only then the lines under it: up to an END mark, through key lines, "Name: value" headers and blank lines; or, with no END mark,
// the key lines that follow
const SHAPES = [
  [new RegExp(String.raw`${BEGIN}(?:[\s\S]*?${END}|[^\r\n]*(?:\r?\n${KEYLINE}(?=\r?\n|\r$|$))*)`, "g"), (b) => (KEYLEN.test(b) ? block(b) : b)],
  [new RegExp(String.raw`${BEGIN}(?:[ \t]*(?:${KEYRUN}(?:[ \t]+${KEYRUN})*[ \t]*)?(?:${END}|(?=\r?\n|\r?$)(?:(?:\r?\n(?:[ \t>]*[A-Za-z][\w-]*:[^\r\n]*|${KEYLINE}|[ \t>]*))*?\r?\n[ \t>]*${END}|(?:\r?\n${KEYLINE}(?=\r?\n|\r$|$))*)))?`, "g"), block],
  [/(\b[a-z][\w+.-]{0,19}:\/\/[^\s:@/]*:)(?!\[masked\]@)[^\s@/]+(?=@)/gi, (_, key) => key + M],
  [/\bsk-[\w-]{20,}/g, () => M],
  [/\b[sr]k_(?:live|test)_\w{10,}/g, () => M],
  [/\b(?:gh[pousr]_|github_pat_)\w{20,}/g, () => M],
  [/\bAKIA[A-Z0-9]{16}\b/g, () => M],
  [/\bxox[baprs]-[\w-]+/g, () => M],
  [/\beyJ\w+\.[\w-]+\.[\w-]+/g, () => M],
];
// the wide rule, one line at a time: after a credential word (also inside a longer name), its value whole and every value-like run; a flag's value; anywhere, a random-looking run
const WORD = /pass|pwd|secret|token|key|auth|credential|bearer/i;
const NAME = /[\w-]*/y; // the rest of the name that holds the word
const RUN = /\[masked\]|<[^<>\n]*>|[^\s"'`\\*,;=:<>(){}[\]|&][^\s"'`\\*,;<>(){}[\]|&]*/g;
const TYPE = /^(?:string|number|boolean|null|undefined|true|false)$/i;
const value = (r) => r !== M && r[0] !== "<" && r.length >= 4 && !TYPE.test(r);
// a value taken whole: quoted parts and any other characters up to the next space outside quotes
const CHUNKS = String.raw`(?:"[^"\n]*"|'[^'\n]*'|${"`"}[^${"`"}\n]*${"`"}|<[^<>\n]*>|\S)+`;
const VALUE = new RegExp(String.raw`(?:["'${"`"}]?[ \t]*[=:][ \t]*|[ \t]+(?=["'${"`"}]))(${CHUNKS})`, "y"); // right after the name
const FLAG = new RegExp(String.raw`(?<!\S)(-u[ \t]*[^\s:]+:|-p[ \t]*)(${CHUNKS})`, "g"); // -u name:value, -p value, -pvalue
// the masked form of a whole value, or null for a placeholder, a type word, a masked value or nothing; one pair of quotes stays
function whole(s) {
  const q = /^(["'`])([^\n]*)\1$/.exec(s), inner = q && !q[2].includes(q[1]) ? q[2] : null, r = inner ?? s;
  if (!r || r === M || /^<[^<>\n]*>$/.test(r) || TYPE.test(r)) return null;
  return inner === null ? M : q[1] + M + q[1];
}
// random-looking: 20 or more letters, digits and + / = _ - in a row, with a letter right beside a digit in at least three places
const LONG = /[A-Za-z0-9+/=_-]{20,}/g;
const random = (r) => (r.match(/[A-Za-z](?=\d)|\d(?=[A-Za-z])/g)?.length ?? 0) >= 3;

const each = (text, rules) => {
  let n = 0;
  for (const [re, to] of rules) text = text.replace(re, (...a) => { const r = to(...a); n += r !== a[0]; return r; }); // a match left as it was is not counted
  return [text, n];
};
// one line: [masked line, count, whether a credential word has no value after it on the line]
function wide(line) {
  let n = 0, tail = "", open = false;
  let head = line.replace(FLAG, (all, flag, s) => { const m = whole(s); return m ? (n++, flag + m) : all; });
  const w = WORD.exec(head);
  if (w) {
    NAME.lastIndex = w.index + w[0].length;
    NAME.exec(head);
    tail = head.slice(NAME.lastIndex);
    head = head.slice(0, NAME.lastIndex);
    let first = "", t = 0;
    VALUE.lastIndex = 0;
    const v = VALUE.exec(tail);
    if (v) {
      const m = whole(v[1]);
      if (m) t++;
      first = v[0].slice(0, v[0].length - v[1].length) + (m ?? v[1]);
      tail = tail.slice(v[0].length);
    }
    tail = first + tail.replace(RUN, (r) => (value(r) ? (t++, M) : r));
    open = !t && !/[\p{L}\p{N}]/u.test(tail);
    n += t;
  }
  head = head.replace(LONG, (r) => (random(r) ? (n++, M) : r));
  return [head + tail, n, open];
}
// the wide rule on each line of a shaped text: [line, count] each; after a credential word with no value, the next line that is not empty goes whole
function widen(shaped) {
  let open = false;
  return shaped.split("\n").map((l) => {
    if (!l.trim()) return [l, 0];
    const [m, n, o] = wide(l), r = open ? [M, 1] : [m, n];
    open = o;
    return r;
  });
}

// what is a secret by its own form: safe to write back into a file. Returns [text, count]
export const shapes = (text) => each(text, SHAPES);

// the numbers (from 1) of the lines the wide rule would touch beyond shapes
export const suspect = (text) => widen(shapes(text)[0]).flatMap(([, n], i) => (n ? [i + 1] : []));

// shapes plus the wide rule, for the extract, where a wrong hit costs nothing. Returns [text, count]
export function mask(text) {
  const [shaped, n] = shapes(text), lines = widen(shaped);
  return [lines.map(([l]) => l).join("\n"), lines.reduce((s, [, c]) => s + c, n)];
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
    let ran; try { ({ sessions: state, ran } = JSON.parse(shown.stdout)); } catch { state = null; }
    if (!state || (ran !== undefined && typeof ran !== "string") || typeof state !== "object" || Array.isArray(state) || !Object.values(state).every((n) => Number.isInteger(n) && n >= 0))
      return refuse(`${dir}/dream.json on ${main} is not {"sessions": {"<session>": <lines read>}, "ran": "<time>" (optional)}: fix it on ${main}`);
  }
  const waiting = git("for-each-ref", "--format=%(refname:short)", `--no-merged=${main}`, "refs/heads/dream/").stdout.split("\n").filter(Boolean);

  const result = { out: null, sessions: [], bytes: 0, tokens: 0, left: 0, cut: false, notes, skipped: 0, waiting, empty: [] };
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
    if (n && !kept.length) result.empty.push({ name: s.name, lines: s.from + n }); // no text: no file and no analyzer, its lines still count as read
    else if (n) {
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
