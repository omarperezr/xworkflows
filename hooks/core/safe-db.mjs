import { resolve } from "node:path";

const CLIENT = /\b(?:psql|mysql|mariadb|sqlite3?|sqlcmd|duckdb|usql|clickhouse-client|supabase)\b/;
const CLI = [
  /\bdropdb\b/, /\bsupabase\s+db\s+reset\b/, /\bprisma\s+migrate\s+reset\b/, /\bprisma\s+db\s+push\b.*(?:--force-reset|--accept-data-loss)/,
  /\bdb:(?:drop|reset|schema:load)\b/, /\bmanage\.py\s+flush\b/, /\bknex\s+migrate:rollback\b.*--all\b/,
  /\bredis-cli\b.*\bflush(?:all|db)\b/i, /\bdropDatabase\s*\(/, /\bdeleteMany\(\s*\{\s*\}\s*\)/,
  /\brm\s[^;|&\n]*\.(?:db|sqlite3?)["']?(?=\s|$|[;&|])/,
];
const TRUE = /^\s*\(?\s*(?:1\s*=\s*1|true|'a'\s*=\s*'a')(?![\w.])(?!\s*and\b)/i;

const stripComments = (t, loose) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(loose ? /--[^\n]*/g : /(^|\s)--(?=\s|$)[^\n]*/gm, "$1");

// the form of the SQL text that would delete all or part of the data, or null
function sqlForm(text, loose) {
  for (const st of stripComments(text, loose).split(";")) {
    if (/\b(?:drop\s+(?:database|schema|table)|truncate)\b/i.test(st)) return "DROP or TRUNCATE";
    for (const [re, name] of [[/\bdelete\s+from\s+\S+/i, "DELETE"], [/\bupdate\s+\S+\s+set\b/i, "UPDATE"]]) {
      const m = re.exec(st);
      if (!m) continue;
      const w = /\bwhere\b/i.exec(st.slice(m.index));
      if (!w || TRUE.test(st.slice(m.index + w.index + 5))) return `${name} without a real WHERE`;
    }
  }
  return null;
}

// the files the command names as SQL input: -f x, --file=x, --file x, < x
function sqlFiles(cmd) {
  const out = [];
  for (const re of [/(?:^|\s)(?:-f\s*|--file[=\s]\s*)(["']?)([^\s"';|&<>]+)\1/g, /(?<!<)<(?!<)\s*(["']?)([^\s"';|&<>()]+)\1/g])
    for (const m of cmd.matchAll(re)) out.push(m[2]);
  return out;
}

export function decide(ev, ctx) {
  try {
    if (ev?.kind !== "shell" || typeof ev.command !== "string") return { decision: "allow" };
    let form = CLI.some((re) => re.test(ev.command)) ? "a database reset or delete command" : sqlForm(ev.command, false);
    if (!form && CLIENT.test(ev.command)) {
      for (const f of sqlFiles(ev.command)) {
        const text = ctx.readFile(resolve(ev.root, f));
        if (typeof text === "string" && (form = sqlForm(text, true))) { form = `${form} in ${f}`; break; }
      }
    }
    if (!form) return { decision: "allow" };
    return ev.isSubagent
      ? { decision: "deny", reason: `This command would delete data (${form}). A subagent may not run it: hand the command to the main session, which asks the owner.` }
      : { decision: "ask", reason: `This command would delete data (${form}). Confirm with the owner before it runs.` };
  } catch {}
  return { decision: "allow" };
}
// shortcut: no shell or SQL parser; aliases, scripts that hold the SQL, eval, bash -c "...", variables holding SQL and a WHERE that is only true in a way other than 1=1, true or 'a'='a' are not followed, upgrade by parsing the nested command.
