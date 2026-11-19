import { segments, base, commandWord } from "./shell-words.mjs";

// the one rule for rm in both hooks: a word rm counts unless it is the subcommand of git, the segment's command word (`git rm` only touches the index and the tree it names; `sudo -u git rm` runs rm)
export const isRm = (words, i) => {
  const cmd = commandWord(words);
  return base(words[i]) === "rm" && !(cmd?.word === "git" && i === cmd.at + 1);
};

const UNSAFE = /\$(?:\{(?!\w+:\?)|[\w@*(])|`/;

// -r, -R in a short group, or any prefix of --recursive (GNU rm takes --r, --rec, ...)
const isRecursive = (a) => /^-[a-zA-Z]*[rR]/.test(a) || (/^--r/.test(a) && "--recursive".startsWith(a));

export function decide(ev, ctx) {
  if (ev?.kind !== "shell" || typeof ev.command !== "string") return { decision: "allow" };
  let piped = false;
  for (const { words, pipe } of segments(ev.command)) {
    const fed = piped;
    piped = pipe;
    for (let i = 0; i < words.length; i++) {
      if (!isRm(words, i)) continue;
      const args = words.slice(i + 1);
      const recursive = args.some(isRecursive);
      const bad = args.find((a) => !a.startsWith("-") && UNSAFE.test(a));
      if (recursive && bad) return { decision: "deny", reason: `rm -r on "${bad}" can delete the wrong tree if the value is empty or odd. Write the path literally, or guard the variable as "\${NAME:?must be set}/x" so the shell stops when it is empty, and avoid $(...) or backticks in the path.` };
      if (recursive && fed && words.slice(0, i).some((w) => base(w) === "xargs")) return { decision: "deny", reason: "xargs rm -r takes its paths from a pipe, and an empty or odd list can delete the wrong tree. Write the path literally, or guard the variable as \"${NAME:?must be set}/x\" so the shell stops when it is empty." };
    }
  }
  return { decision: "allow" };
}
// shortcut: no shell emulation; aliases, eval, bash -c "...", variables expanded inside $(...) and a command inside $(...) are not followed, upgrade by parsing nested commands.
