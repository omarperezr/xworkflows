import { resolve } from "node:path";
import { segments, commandWord, base } from "./shell-words.mjs";
import { isRm } from "./safe-rm.mjs";

const CLIENT = /^(?:psql|mysql|mariadb|sqlite3?|sqlcmd|duckdb|usql|clickhouse-client|supabase)$/;
const SCRIPT = /^(?:rake|rails|bundle|sequelize|sequelize-cli|npm|yarn|pnpm|bunx?|npx|node|deno|tsx)$/;
// [a tool word, the words from it on]: a CLI form counts when an unquoted word is that tool, whatever runs it
const CLI = [
  [/^supabase$/, /\bdb\s+reset\b/],
  [/^prisma$/, /\bprisma\s+migrate\s+reset\b|\bprisma\s+db\s+push\b.*(?:--force-reset|--accept-data-loss)/],
  [SCRIPT, /\bdb:(?:drop|reset|schema:load)\b/],
  [/^manage\.py$/, /\bmanage\.py\s+flush\b/],
  [/^knex$/, /\bknex\s+migrate:rollback\b.*--all\b/],
  [/^redis-cli$/, /\bflush(?:all|db)\b/i],
  [/^mongosh?$/, /\bdropDatabase\s*\(|\bdeleteMany\(\s*\{\s*\}\s*\)/],
];
// a file named .db or .sqlite goes when a word rm names it (not `git rm --cached dev.db`)
const RM_DB = /\.(?:db|sqlite3?)(?:\s|$)/;
const TRUE = /^\s*(?:1\s*=\s*1|true)(?![\w.])(?!\s*and\b)/i;

// the words as SQL text: a word that holds whitespace (a quoted -c value) is a statement of its own
const sqlText = (words) => words.reduce((t, w, i) => (i ? `${t}${/\s/.test(w) || /\s/.test(words[i - 1]) ? ";\n" : " "}${w}` : w), "");

// the form of the SQL text that would delete all or part of the data, or null. Doubt asks: a DELETE or UPDATE passes only with a WHERE that is not always true, holds no OR or NOT, and no quote mark or bracket in the statement
function sqlForm(text) {
  for (const st of text.split(";")) {
    if (/\bdrop\s+(?:database|schema|table)\b/i.test(st) || (/\btruncate\b/i.test(st) && !/\b(?:grant|revoke)\b/i.test(st))) return "DROP or TRUNCATE";
    for (const [re, name] of [[/\bdelete\s+from\s+\S+/i, "DELETE"], [/\bupdate\s+\S+\s+set\b/i, "UPDATE"]]) {
      const m = re.exec(st);
      if (!m) continue;
      const at = st.slice(m.index).search(/\bwhere\b/i);
      const cond = st.slice(m.index + at + 5);
      if (at < 0 || TRUE.test(cond) || /\b(?:or|not)\b/i.test(cond)) return `${name} without a real WHERE`;
      if (/['"()]/.test(st)) return `${name} with a quote or a bracket`;
    }
  }
  return null;
}

// the files a client's words name as SQL input: -f x, -fx, --file=x, --file x, < x, <x
function sqlFiles(words) {
  const out = [];
  words.forEach((w, i) => {
    const m = /^(?:-f|--file=)(.+)$/.exec(w) ?? /^<([^<].*)$/.exec(w);
    if (m) out.push(m[1]);
    else if (w === "-f" || w === "--file" || w === "<") { if (words[i + 1]) out.push(words[i + 1]); }
  });
  return out;
}

export function decide(ev, ctx) {
  if (ev?.kind !== "shell" || typeof ev.command !== "string") return { decision: "allow" };
  let form = null, fed = "", dir = ev.cwd ?? ev.root;
  for (const seg of segments(ev.command)) {
    const own = `${sqlText(seg.words)};\n${seg.doc}`, input = fed;
    fed = seg.pipe ? `${fed};\n${own}` : "";
    const cmd = commandWord(seg.words);
    if (cmd?.word === "cd") dir = resolve(dir, seg.words.slice(cmd.at + 1).find((a) => !a.startsWith("-")) ?? ".");
    if (seg.words.some((_, i) => isRm(seg.words, i) && RM_DB.test(seg.words.slice(i).join(" ")))) form = "a database reset or delete command";
    for (let i = 0; i < seg.words.length && !form; i++) {
      const tool = base(seg.words[i]), args = seg.words.slice(i + 1), line = seg.words.slice(i).join(" ");
      if (CLI.some(([word, re]) => word.test(tool) && re.test(line)) || (tool === "dropdb" && (args.length || cmd?.at === i))) form = "a database reset or delete command";
      else if (CLIENT.test(tool)) {
        form = sqlForm(`${sqlText(args)};\n${seg.doc};\n${input}`);
        if (!form) for (const f of sqlFiles(args)) {
          const text = ctx.readFile(resolve(dir, f));
          if (typeof text === "string" && (form = sqlForm(text))) { form = `${form} in ${f}`; break; }
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
// shortcut: no shell or SQL parser; aliases, scripts that hold the SQL, eval, bash -c "...", variables holding SQL and a WHERE that is only true in a way other than 1=1, true or 'a'='a' are not followed, upgrade by parsing the nested command.
