const KEYWORDS = new Set(["if", "then", "else", "elif", "do", "while", "until", "!", "{", "("]);
// wrappers that run the next command; the string holds the short options that take a value
const WRAPPERS = { sudo: "ughpCDRTU", xargs: "nIPLsdEa", env: "uCS", command: "", nohup: "", time: "" };
const LITERAL = "\u0000";

// Split a shell command into segments { words, doc, pipe }: words are the unquoted tokens, doc is the heredoc body
// the segment opened, pipe is true when its output feeds the next segment. Single quotes and a backslash make `$`
// and backtick literal (written as \u0000).
export function segments(cmd) {
  const out = [{ words: [], doc: "", pipe: false }];
  const cur = () => out.at(-1);
  const pending = [];
  let tok = "", has = false, q = "";
  const push = () => { if (has) cur().words.push(tok); tok = ""; has = false; };
  const lit = (c) => (c === "$" || c === "`" ? LITERAL : c);
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q === "'") { if (c === "'") q = ""; else tok += lit(c); continue; }
    // in double quotes a backslash escapes only $ ` " \ and newline; before any other character it stays
    if (c === "\\" && i + 1 < cmd.length && (q !== '"' || /["$`\\\n]/.test(cmd[i + 1]))) { tok += lit(cmd[++i]); has = true; continue; }
    if (q === '"') { if (c === '"') q = ""; else tok += c; continue; }
    if (c === "'" || c === '"') { q = c; has = true; continue; }
    const h = c === "<" && cmd[i - 1] !== "<" && /^<<(-?)\s*(["']?)([^\s"';|&<>()]+)\2/.exec(cmd.slice(i));
    if (h && cmd[i + 2] !== "<") { push(); pending.push({ seg: cur(), delim: h[3], dash: h[1] }); i += h[0].length - 1; continue; }
    if (/\s/.test(c) && c !== "\n") { push(); continue; }
    if (c === "|" && cmd[i - 1] === ">") { tok += c; continue; } // >| forces a truncating redirect: one word, not a pipe
    if (c === "\n" || c === ";" || c === "|" || c === "&") {
      push();
      if (c === "&" && (/[<>]/.test(cmd[i - 1] ?? "") || cmd[i + 1] === ">")) continue;
      if (c === "|" && cmd[i + 1] !== "|" && cmd[i - 1] !== "|") cur().pipe = true;
      if (c === "\n") {
        for (const { seg, delim, dash } of pending.splice(0)) {
          for (;;) {
            if (i >= cmd.length) break;
            const end = cmd.indexOf("\n", i + 1), line = cmd.slice(i + 1, end < 0 ? cmd.length : end);
            i = end < 0 ? cmd.length : end;
            if ((dash ? line.replace(/^\t+/, "") : line) === delim) break;
            seg.doc += `${line}\n`;
          }
        }
      }
      if (cur().words.length || cur().doc) out.push({ words: [], doc: "", pipe: false });
      continue;
    }
    tok += c; has = true;
  }
  push();
  return out;
}

// the last path part of a word, without leading brackets: /usr/bin/psql -> psql
export const base = (w) => w.replace(/^\(+/, "").split("/").pop();

// where the command runs in a segment's words, after keywords, `(`, NAME=value and wrapper options: { at, word } or null
export function commandWord(words) {
  let wrap = null;
  for (let i = 0; i < words.length; i++) {
    const t = words[i].replace(/^\(+/, "");
    if (!t || KEYWORDS.has(t) || /^\w+=/.test(t)) continue;
    if (wrap !== null && t.startsWith("-")) { if (t.length === 2 && wrap.includes(t[1])) i++; continue; }
    const word = base(t);
    if (Object.hasOwn(WRAPPERS, word)) { wrap = WRAPPERS[word]; continue; }
    return { at: i, word };
  }
  return null;
}
