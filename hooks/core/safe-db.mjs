import { resolve } from "node:path";
import { segments, commandWord, base } from "./shell-words.mjs";
import { isRm } from "./safe-rm.mjs";

const CLIENT = /^(?:psql|mysql|mariadb|sqlite3?|sqlcmd|duckdb|usql|clickhouse-client|supabase)$/;
const TEXT_FILTER = /^(?:grep|rg|awk|sed|head|tail|wc)$/;
const SCRIPT = /^(?:rake|rails|bundle|sequelize|sequelize-cli|npm|yarn|pnpm|bunx?|npx|node|deno|tsx)$/;
// [a tool word, the words from it on]: a CLI form counts when an unquoted word is that tool, whatever runs it
const CLI = [
  [/^supabase$/, /\bdb\s+reset\b/],
  [/^prisma$/, /\bprisma\s+migrate\s+reset\b|\bprisma\s+db\s+push\b.*(?:--force-reset|--accept-data-loss)/],
  [SCRIPT, /\bdb:(?:drop|reset|schema:load)\b/],
  [/^manage\.py$/, /\bmanage\.py\s+flush\b/],
  [/^knex$/, /\bknex\s+migrate:rollback\b.*--all\b/],
  [/^redis-cli$/, /\bflush(?:all|db)\b/i],
  [/^mongo(?:sh)?$/, /\.drop\s*\(|\bdropDatabase\b|\bdeleteMany\b|\bremove\s*\(/],
  [/^mysqladmin$/, /\bdrop\b/],
  [/^docker$/, /\bcompose\s.*\bdown\b.*(?:^|\s)(?:-v|--volumes)(?=\s|$)|\bvolume\s+(?:rm|remove|prune)\b/],
  [/^docker-compose$/, /\bdown\b.*(?:^|\s)(?:-v|--volumes)(?=\s|$)/],
  [/^find$/, /\.(?:db|sqlite3?)\*?(?![\w.]).*\s(?:-delete\b|-exec(?:dir)?\s+(?:\S*\/)?rm\b)/],
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
    const kept = st.replace(/\bon\s+(?:delete|update)\s+(?:cascade|restrict|no\s+action|set\s+(?:null|default))\b/gi, "");
    if (!/\b(?:delete|update|drop|truncate)\b/i.test(kept)) continue;
    const m = DELETE.exec(st) ?? UPDATE.exec(st);
    if (!m || !plainCond(m[1])) return "a DELETE, UPDATE, DROP or TRUNCATE that is not a plain DELETE or UPDATE with a real WHERE";
  }
  return null;
}

// the SQL files a statement reads: psql \i x, \include x, \ir x, mysql source x, \. x
const includes = (text) => text.split(/[;\n]/).flatMap((st) => { const m = /^\s*(?:\\(?:i|ir|include|include_relative|\.)|source)\s+(\S+)\s*$/i.exec(st); return m ? [m[1]] : []; });

// the files a client's words name as SQL input: -f x, -fx, --file=x, --file x, < x, <x, and sqlcmd -i x,y
function sqlFiles(tool, words) {
  const out = [];
  words.forEach((w, i) => {
    const m = /^(?:-f|--file=)(.+)$/.exec(w) ?? /^<([^<].*)$/.exec(w);
    if (m) out.push(m[1]);
    else if (w === "-f" || w === "--file" || w === "<") { if (words[i + 1]) out.push(words[i + 1]); }
    else if (tool === "sqlcmd" && w === "-i" && words[i + 1]) out.push(...words[i + 1].split(","));
  });
  return out;
}

// a redirect that truncates a file named .db or .sqlite: > x, >x, 2> x ( >> appends and a word holding spaces is text)
const truncates = (words) => words.some((w, i) => {
  const m = /^(?:\d*|&)>(?![>&])(.*)$/.exec(w);
  const target = m && (m[1] || words[i + 1] || "");
  return m && /\.(?:db|sqlite3?)$/.test(target) && !/\s/.test(target);
});

export function decide(ev, ctx) {
  if (ev?.kind !== "shell" || typeof ev.command !== "string") return { decision: "allow" };
  let form = null, fed = "", fedFiles = [], dir = ev.cwd ?? ev.root;
  const read = (f) => ctx.readFile(resolve(dir, f));
  for (const seg of segments(ev.command)) {
    const cmd = commandWord(seg.words);
    if (cmd?.word === "cd") dir = resolve(dir, seg.words.slice(cmd.at + 1).find((a) => !a.startsWith("-")) ?? ".");
    // a pipe carries what it holds to the next command: `cat x.sql | psql` feeds the file
    // the file names only: a file is read when a client takes the pipe, never for `cat /dev/urandom | head`
    const names = cmd?.word === "cat" && seg.pipe ? seg.words.slice(cmd.at + 1).filter((a) => !a.startsWith("-")) : [];
    const own = `${sqlText(seg.words)};\n${seg.doc}`, input = fed, inFiles = fedFiles;
    fed = seg.pipe ? `${fed};\n${own}` : "";
    fedFiles = seg.pipe ? [...fedFiles, ...names] : [];
    // the command word only reads: a text filter, or which, type and command -v looking a command up; no word in its arguments is a tool or a client
    const reads = TEXT_FILTER.test(cmd?.word) || /^(?:which|type)$/.test(cmd?.word) || (/^-[vV]$/.test(seg.words[cmd?.at - 1]) && base(seg.words[cmd.at - 2] ?? "") === "command");
    if (truncates(seg.words) || seg.words.some((_, i) => isRm(seg.words, i) && RM_DB.test(seg.words.slice(i).join(" ")))) form = "a database reset or delete command";
    for (let i = 0; i < seg.words.length && !form && !reads; i++) {
      const tool = base(seg.words[i]), args = seg.words.slice(i + 1), line = seg.words.slice(i).join(" ");
      if (CLI.some(([word, re]) => word.test(tool) && re.test(line)) || (tool === "dropdb" && (args.length || cmd?.at === i))) form = "a database reset or delete command";
      else if ((CLIENT.test(tool) || (tool === "prisma" && /\bdb\s+execute\b/.test(line)))) {
        const text = `${sqlText(args)};\n${seg.doc};\n${input};\n${inFiles.map(read).filter((t) => typeof t === "string").join(";\n")}`;
        form = sqlForm(text);
        if (!form) for (const f of [...sqlFiles(tool, args), ...includes(text)]) {
          const code = read(f);
          if (typeof code === "string" && (form = sqlForm(code))) { form = `${form} in ${f}`; break; }
        }
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
