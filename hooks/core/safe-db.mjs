import { resolve } from "node:path";
import { segments, commandWord } from "./shell-words.mjs";

const CLIENT = /^(?:psql|mysql|mariadb|sqlite3?|sqlcmd|duckdb|usql|clickhouse-client|supabase)$/;
const via = (tools) => new RegExp(`^(?:${tools}|npm|yarn|pnpm|bunx?|npx|node|deno|tsx)$`);
// [command word, the command from its word on]: a CLI form counts only when the command word is that tool or a runner of it
const CLI = [
  [/^dropdb$/, /./], [/^supabase$/, /\bdb\s+reset\b/],
  [via("prisma"), /\bprisma\s+migrate\s+reset\b|\bprisma\s+db\s+push\b.*(?:--force-reset|--accept-data-loss)/],
  [via("rake|rails|bundle|sequelize|sequelize-cli"), /\bdb:(?:drop|reset|schema:load)\b/],
  [/^(?:python[\d.]*|manage\.py)$/, /\bmanage\.py\s+flush\b/],
  [via("knex"), /\bknex\s+migrate:rollback\b.*--all\b/],
  [/^redis-cli$/, /\bflush(?:all|db)\b/i],
  [via("mongosh?"), /\bdropDatabase\s*\(|\bdeleteMany\(\s*\{\s*\}\s*\)/],
  [/^rm$/, /\.(?:db|sqlite3?)(?:\s|$)/],
];
const TRUE = /^\s*\(?\s*(?:1\s*=\s*1|true|'a'\s*=\s*'a')(?![\w.])(?!\s*and\b)/i;

const stripComments = (t, loose) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(loose ? /--[^\n]*/g : /(^|\s)--(?=\s|$)[^\n]*/gm, "$1");

// where the first WHERE outside any parentheses starts at or after `from`, or -1 (a WHERE in a subquery does not count)
function topWhere(st, from) {
  const re = /\bwhere\b/iy;
  for (let i = from, depth = 0; i < st.length; i++) {
    if (st[i] === "(") depth++;
    else if (st[i] === ")") depth--;
    else if (depth === 0 && (re.lastIndex = i, re.test(st))) return i;
  }
  return -1;
}

// the form of the SQL text that would delete all or part of the data, or null
function sqlForm(text, loose) {
  for (const st of stripComments(text, loose).split(";")) {
    if (/\bdrop\s+(?:database|schema|table)\b/i.test(st) || (/\btruncate\b/i.test(st) && !/\b(?:grant|revoke)\b/i.test(st))) return "DROP or TRUNCATE";
    for (const [re, name] of [[/\bdelete\s+from\s+\S+/i, "DELETE"], [/\bupdate\s+\S+\s+set\b/i, "UPDATE"]]) {
      const m = re.exec(st);
      if (!m) continue;
      const at = topWhere(st, m.index);
      if (at < 0 || TRUE.test(st.slice(at + 5))) return `${name} without a real WHERE`;
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
    const own = `${seg.words.join("\n")}\n${seg.doc}`, input = fed;
    fed = seg.pipe ? `${fed}\n${own}` : "";
    const cmd = commandWord(seg.words);
    if (!cmd) continue;
    const args = seg.words.slice(cmd.at + 1), line = seg.words.slice(cmd.at).join(" ");
    if (cmd.word === "cd") dir = resolve(dir, args.find((a) => !a.startsWith("-")) ?? ".");
    if (CLI.some(([word, re]) => word.test(cmd.word) && re.test(line))) form = "a database reset or delete command";
    else if (CLIENT.test(cmd.word)) {
      form = sqlForm(`${args.join("\n")}\n${seg.doc}\n${input}`, false);
      if (!form) for (const f of sqlFiles(args)) {
        const text = ctx.readFile(resolve(dir, f));
        if (typeof text === "string" && (form = sqlForm(text, true))) { form = `${form} in ${f}`; break; }
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
