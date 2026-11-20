import { resolve, dirname } from "node:path";
import { segments, commandWord, base } from "./shell-words.mjs";
import { isRm } from "./safe-rm.mjs";

const CLIENT = /^(?:psql|mysql|mariadb|sqlite3?|sqlcmd|duckdb|usql|clickhouse-client|supabase)$/;
const TEXT_FILTER = /^(?:grep|rg|awk|sed|head|tail|wc)$/;
const SCRIPT = /^(?:rake|rails|bundle|sequelize|sequelize-cli|npm|yarn|pnpm|bunx?|npx|node|deno|tsx)$/;
// a database name or glob as find or a name list gives it: .db, .sqlite*, optionally *-ended
const FIND_DB = /\.(?:db|sqlite3?)\*?(?![\w.])/;
// [a tool word, the words from it on]: a CLI form counts when an unquoted word is that tool, whatever runs it
const CLI = [
  [/^supabase$/, /\bdb\s+reset\b/],
  [/^prisma$/, /\bprisma\s+migrate\s+reset\b|\bprisma\s+db\s+push\b.*(?:--force-reset|--accept-data-loss)/],
  [SCRIPT, /\bdb:(?:drop|reset|schema:load)\b/],
  [/^manage\.py$/, /\bmanage\.py\s+flush\b/],
  [/^knex$/, /\bknex\s+migrate:rollback\b.*--all\b/],
  [/^redis-cli$/, /\bflush(?:all|db)\b/i],
  [/^mongo(?:sh)?$/, /\.drop\s*\(|\bdropDatabase\b|\bdeleteMany\b|\bremove\s*\(|\bupdateMany\s*\(\s*\{\s*\}/],
  [/^mysqladmin$/, /\bdrop\b/],
  [/^docker$/, /\bcompose(?=\s).*(?:^|\s)down(?=\s).*(?:^|\s)(?:-v|--volumes)(?=\s|$)|\bvolume\s+(?:rm|remove|prune)\b|\bsystem\s+prune\b.*--volumes\b|\bcompose(?=\s).*(?:^|\s)rm(?=\s).*(?:^|\s)(?:-[a-zA-Z]*v[a-zA-Z]*|--volumes)(?=\s|$)/],
  [/^docker-compose$/, /(?:^|\s)(?:down|rm)(?=\s).*(?:^|\s)(?:-[a-zA-Z]*v[a-zA-Z]*|--volumes)(?=\s|$)/],
  [/^find$/, new RegExp(String.raw`${FIND_DB.source}.*\s(?:-delete\b|-exec(?:dir)?\s+(?:\S*\/)?(?:rm|unlink)\b)`)],
  [/^truncate$/, /\.(?:db|sqlite3?)(?:\s|$)/],
];
// a file named .db or .sqlite goes when a word rm names it (not `git rm --cached dev.db`)
const RM_DB = /\.(?:db|sqlite3?)(?:\s|$)/;

// the words as SQL text: a word that holds whitespace (a quoted -c value) is a statement of its own
const sqlText = (words) => words.reduce((t, w, i) => (i ? `${t}${/\s/.test(w) || /\s/.test(words[i - 1]) ? ";\n" : " "}${w}` : w), "");

// Allowlist. A statement that holds delete, update, drop or truncate passes only as one of two plain forms:
// DELETE FROM <name> WHERE <cond>, UPDATE <name> SET <name> = <value>[, ...] WHERE <cond>, with <cond> = <name> = <value> joined by AND,
// names and SET values only letters, digits, _ and . ; in a WHERE the left side is a name (not TRUE, FALSE or NULL) and the right side a number literal. Anything else asks.
const N = "[\\w.]+", SET = `${N}\\s*=\\s*${N}`;
const DELETE = new RegExp(`^\\s*delete\\s+from\\s+${N}\\s+where\\s+(.+?)\\s*$`, "is");
const UPDATE = new RegExp(`^\\s*update\\s+${N}\\s+set\\s+${SET}(?:\\s*,\\s*${SET})*\\s+where\\s+(.+?)\\s*$`, "is");
const TERM = /^([a-z_][\w.]*)\s*=\s*(\d+(?:\.\d+)?)$/i;
// a plain condition: only name = number terms joined by AND, no sign, no bare point, never zero (MySQL compares a text column with 0 as true)
const plainCond = (cond) => cond.split(/\s+and\s+/i).every((t) => { const m = TERM.exec(t); return m && !/^(?:true|false|null)$/i.test(m[1]) && !/^0+(?:\.0+)?$/.test(m[2]); });

// why the SQL text would delete data, or null: its statements split on ;
function sqlForm(text) {
  for (const st of text.split(";")) {
    // ON DELETE CASCADE and its kin name an action of a foreign key, not a delete
    if (/\bcreate\s+or\s+replace\s+table\b/i.test(st)) return "a CREATE OR REPLACE TABLE, which drops the table it replaces";
    const kept = st.replace(/\bon\s+(?:delete|update)\s+(?:cascade|restrict|no\s+action|set\s+(?:null|default))\b/gi, "");
    if (!/\b(?:delete|update|drop|truncate)\b/i.test(kept)) continue;
    const m = DELETE.exec(st) ?? UPDATE.exec(st);
    if (!m || !plainCond(m[1])) return "a DELETE, UPDATE, DROP or TRUNCATE that is not a plain DELETE or UPDATE with a real WHERE";
  }
  return null;
}

// the SQL files a statement reads, as [name, relative]: psql \i x, \include x, \ir x, \include_relative x (relative: from the including file's folder), mysql source x, \. x; quotes around the name go
const includes = (text) => text.split(/[;\n]/).flatMap((st) => { const m = /^\s*(?:\\(i|ir|include|include_relative|\.)|(\.read|source))\s+(\S+)\s*$/i.exec(st); return m ? [[m[3].replace(/^(["'])(.*)\1$/, "$2"), /^(?:ir|include_relative)$/i.test(m[1] ?? "")]] : []; });

// the files a client's words name as SQL input, as [name, stdin]: -f x, -fx, --file=x, --file x and sqlcmd -i x,y after the client at `at`, and < x, <x anywhere (stdin: psql resolves \ir from the working folder, not the file's)
function sqlFiles(tool, words, at) {
  const out = [];
  words.forEach((w, i) => {
    const after = i > at, f = after && /^(?:-f|--file=)(.+)$/.exec(w), r = /^\d*<([^<].*)$/.exec(w);
    if (f) out.push([f[1], false]);
    else if (r) out.push([r[1], true]);
    else if (after && /^mongo/.test(tool) && /\.js$/.test(w)) out.push([w, false]);
    else if (/^\d*<$/.test(w) || (after && (w === "-f" || w === "--file"))) { if (words[i + 1]) out.push([words[i + 1], w.endsWith("<")]); }
    else if (after && tool === "sqlcmd" && w === "-i" && words[i + 1]) out.push(...words[i + 1].split(",").map((n) => [n, false]));
  });
  return out;
}

const DB_FILE = /\.(?:db|sqlite3?)$/;
// a write onto a file named .db or .sqlite: a redirect > x, >x, >| x, 2> x ( >> appends and a word holding spaces is text), cp or mv to it, unlink of it, -o x or --output x of a client
const writesDb = (words, i, cmd, client) => {
  const w = words[i], m = /^(?:\d*|&)>\|?(?![>&])(.*)$/.exec(w);
  if (m) { const t = m[1] || words[i + 1] || ""; return DB_FILE.test(t) && !/\s/.test(t); }
  // -t DIR or --target-directory=DIR makes the last word a source, not the target
  if (i === cmd?.at && /^(?:cp|mv|install)$/.test(cmd.word)) return !words.slice(i).some((a) => /^-[a-zA-Z]*t|^--target-directory/.test(a)) && DB_FILE.test(words.filter((a, j) => j > i && !a.startsWith("-")).at(-1) ?? "");
  if (i === cmd?.at && cmd.word === "unlink") return DB_FILE.test(words[i + 1] ?? "");
  if (!client) return false;
  const o = /^(?:-o|--output=)(.+)$/.exec(w);
  return DB_FILE.test(o ? o[1] : /^(?:-o|--output)$/.test(w) ? words[i + 1] ?? "" : "");
};

export function decide(ev, ctx) {
  if (ev?.kind !== "shell" || typeof ev.command !== "string") return { decision: "allow" };
  let form = null, fed = "", fedWords = "", fedFiles = [], dir = ev.cwd ?? ev.root;
  const read = (f) => ctx.readFile(resolve(dir, f));
  // why the SQL text, or a file it includes (up to 5 levels, each file once), would delete data; an include that cannot be read is skipped
  const scan = (text, depth, seen, from = dir) => {
    const why = sqlForm(text);
    if (why || depth >= 5) return why;
    for (const [f, rel] of includes(text)) {
      const p = resolve(rel ? from : dir, f), code = seen.has(p) ? null : ctx.readFile(p);
      seen.add(p);
      const inner = typeof code === "string" && scan(code, depth + 1, seen, dirname(p));
      if (inner) return `${inner} in ${f}`;
    }
    return null;
  };
  for (const seg of segments(ev.command)) {
    const cmd = commandWord(seg.words);
    if (cmd?.word === "cd") dir = resolve(dir, seg.words.slice(cmd.at + 1).find((a) => !a.startsWith("-")) ?? ".");
    // a pipe carries what it holds to the next command: `cat x.sql | psql` feeds the file
    // the file names only: a file is read when a client takes the pipe, never for `cat /dev/urandom | head`
    const names = cmd?.word === "cat" && seg.pipe ? seg.words.slice(cmd.at + 1).filter((a) => !a.startsWith("-")) : [];
    const feeds = fedWords;
    const own = `${sqlText(seg.words)};\n${seg.doc}`, input = fed, inFiles = fedFiles;
    fed = seg.pipe ? `${fed};\n${own}` : "";
    // a stage that reads content (a client, cat) does not feed names; any other stage might, so its words count
    fedWords = seg.pipe ? `${fedWords} ${CLIENT.test(cmd?.word) || cmd?.word === "cat" ? "" : seg.words.join(" ")}` : "";
    fedFiles = seg.pipe ? [...fedFiles, ...names] : [];
    // the command word only reads: a text filter, or which, type and command -v looking a command up; no word in its arguments is a tool or a client
    const reads = TEXT_FILTER.test(cmd?.word) || /^(?:which|type)$/.test(cmd?.word) || (/^-[vV]$/.test(seg.words[cmd?.at - 1]) && base(seg.words[cmd.at - 2] ?? "") === "command");
    // `find -name '*.db' | xargs rm`: the rm takes the names the pipe carries
    if (seg.words.some((_, i) => writesDb(seg.words, i, cmd, false)) || seg.words.some((_, i) => isRm(seg.words, i) && (RM_DB.test(seg.words.slice(i).join(" ")) || (seg.words.slice(0, i).some((w) => base(w) === "xargs") && FIND_DB.test(feeds))))) form = "a database reset or delete command";
    for (let i = 0; i < seg.words.length && !form && !reads; i++) {
      const tool = base(seg.words[i]), args = seg.words.slice(i + 1), line = seg.words.slice(i).join(" ");
      if (CLI.some(([word, re]) => word.test(tool) && (re.test(line) || (/^mongo/.test(tool) && sqlFiles(tool, seg.words, i).some(([f]) => re.test(read(f) ?? ""))))) || (tool === "dropdb" && (args.length || cmd?.at === i))) form = "a database reset or delete command";
      else if ((CLIENT.test(tool) || (tool === "prisma" && /\bdb\s+execute\b/.test(line)))) {
        const text = `${sqlText(args)};\n${seg.doc};\n${input};\n${inFiles.map(read).filter((t) => typeof t === "string").join(";\n")}`;
        const seen = new Set();
        form = scan(text, 0, seen);
        // the whole segment, not the words after the tool: `<bad.sql psql` redirects before it
        if (!form) for (const [f, stdin] of sqlFiles(tool, seg.words, i)) { const code = read(f); if (typeof code === "string" && (form = scan(code, 1, seen, stdin ? dir : dirname(resolve(dir, f))))) { form = `${form} in ${f}`; break; } }
        if (!form && seg.words.some((_, j) => writesDb(seg.words, j, cmd, true))) form = "a database reset or delete command";
      }
    }
    if (form) break;
  }
  if (!form) return { decision: "allow" };
  return ev.isSubagent
    ? { decision: "deny", reason: `This command would delete data (${form}). A subagent may not run it: hand the command to the main session, which asks the owner.` }
    : { decision: "ask", reason: `This command would delete data (${form}). Confirm with the owner before it runs.` };
}
// shortcut: no shell or SQL parser; aliases, scripts that hold the SQL, eval, bash -c "...", variables holding SQL and a pipe that rebuilds a command are not followed, upgrade by parsing the nested command.
