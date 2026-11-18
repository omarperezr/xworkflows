const WRAPPERS = new Set(["sudo", "xargs", "command", "env", "nohup", "time"]);
const UNSAFE = /\$(?:\{(?!\w+:\?)|\w|\()|`/;
const LITERAL = "\u0000";

// Split into command segments of tokens. Single quotes and backslashes make `$` and backtick literal.
function segments(cmd) {
  const out = [[]];
  let tok = "", has = false, q = "";
  const push = () => { if (has) out.at(-1).push(tok); tok = ""; has = false; };
  const lit = (c) => (c === "$" || c === "`" ? LITERAL : c);
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q === "'") { if (c === "'") q = ""; else tok += lit(c); continue; }
    if (c === "\\" && i + 1 < cmd.length) { tok += lit(cmd[++i]); has = true; continue; }
    if (q === '"') { if (c === '"') q = ""; else tok += c; continue; }
    if (c === "'" || c === '"') { q = c; has = true; continue; }
    if (/\s/.test(c) && c !== "\n") { push(); continue; }
    if (c === "\n" || c === ";" || c === "|" || c === "&") {
      push();
      if (c !== "&" || cmd[i + 1] === "&" || cmd[i - 1] === "&") { if (out.at(-1).length) out.push([]); }
      continue;
    }
    tok += c; has = true;
  }
  push();
  return out;
}

export function decide(ev, ctx) {
  try {
    if (ev?.kind !== "shell" || typeof ev.command !== "string") return { decision: "allow" };
    for (const seg of segments(ev.command)) {
      let i = 0;
      while (i < seg.length && (WRAPPERS.has(seg[i]) || (i > 0 && seg[i].startsWith("-")))) i++;
      if (seg[i] !== "rm") continue;
      const args = seg.slice(i + 1);
      const recursive = args.some((a) => /^-[a-zA-Z]*[rR]/.test(a) || a === "--recursive");
      const bad = args.find((a) => !a.startsWith("-") && UNSAFE.test(a));
      if (recursive && bad) {
        return { decision: "deny", reason: `rm -r on "${bad}" can delete the wrong tree if the value is empty or odd. Write the path literally, or guard the variable as "\${NAME:?must be set}/x" so the shell stops when it is empty, and avoid $(...) or backticks in the path.` };
      }
    }
  } catch {}
  return { decision: "allow" };
}
// shortcut: no shell emulation; aliases, eval, bash -c "...", env assignments before rm and variables expanded inside $(...) are not followed, upgrade by parsing nested commands.
