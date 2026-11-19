import { segments, commandWord } from "./shell-words.mjs";

const UNSAFE = /\$(?:\{(?!\w+:\?)|[\w@*(])|`/;

export function decide(ev, ctx) {
  if (ev?.kind !== "shell" || typeof ev.command !== "string") return { decision: "allow" };
  for (const { words } of segments(ev.command)) {
    const cmd = commandWord(words);
    if (cmd?.word !== "rm") continue;
    const args = words.slice(cmd.at + 1);
    const recursive = args.some((a) => /^-[a-zA-Z]*[rR]/.test(a) || a === "--recursive");
    const bad = args.find((a) => !a.startsWith("-") && UNSAFE.test(a));
    if (recursive && bad) {
      return { decision: "deny", reason: `rm -r on "${bad}" can delete the wrong tree if the value is empty or odd. Write the path literally, or guard the variable as "\${NAME:?must be set}/x" so the shell stops when it is empty, and avoid $(...) or backticks in the path.` };
    }
  }
  return { decision: "allow" };
}
// shortcut: no shell emulation; aliases, eval, bash -c "...", variables expanded inside $(...) and a command inside $(...) are not followed, upgrade by parsing nested commands.
