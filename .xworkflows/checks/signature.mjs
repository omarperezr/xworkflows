// Makers and coding tools an agent signs as. Names match as whole words, domains as whole labels.
const NAMES = ["claude", "anthropic", "openai", "chatgpt", "codex", "copilot", "gemini", "cursor", "aider", "devin", "windsurf", "codeium", "cody", "tabnine", "kiro", "amp"];
const DOMAINS = ["anthropic.com", "openai.com", "cursor.com", "cursor.sh", "codeium.com", "windsurf.com", "aider.chat", "cognition.ai", "tabnine.com", "sourcegraph.com"];

const nameRe = new RegExp(`(?<!\\w)(${NAMES.join("|")})(?!\\w)`, "i");
const personRe = /^\s*(co-authored-by|signed-off-by):/i;
const generatedRe = /^\W*generated with/i;
const domainOf = (s) => (s.match(/@([^\s>@]+)/)?.[1] ?? "").toLowerCase();
// GitHub bot emails: judge the part after "+" (a bare tool name, or any name ending in [bot])
const botEmail = (e) => {
  const l = (e.match(/([^\s<>@]+)@users\.noreply\.github\.com/i)?.[1] ?? "").split("+").pop();
  return /\[bot\]$/i.test(l) ? nameRe.test(l) : new RegExp(`^(${NAMES.join("|")})$`, "i").test(l);
};
const vendorDomain = (d) => DOMAINS.some((v) => d === v || d.endsWith(`.${v}`));

export function run(range, ctx) {
  const bad = [];
  for (const sha of range.commits) {
    const [head, ae, ce, body] = ctx.git("show", "-s", "--format=%h %s%x00%ae%x00%ce%x00%B", sha).split("\0");
    const why = [];
    if (vendorDomain(domainOf(ae)) || botEmail(ae)) why.push(`author email ${ae}`);
    if (vendorDomain(domainOf(ce)) || botEmail(ce)) why.push(`committer email ${ce}`);
    for (const line of body.split("\n")) {
      // a person's line is judged by its e-mail: a person may share a tool's name; with no e-mail there is only the name
      const tool = personRe.test(line) ? (line.includes("@") ? vendorDomain(domainOf(line)) || botEmail(line) : nameRe.test(line))
        : generatedRe.test(line) && (nameRe.test(line) || vendorDomain(domainOf(line)));
      if (tool) why.push(`line "${line.trim()}"`);
    }
    if (why.length) bad.push(`  ${head}: ${why.join("; ")}`);
  }
  if (!bad.length) return { ok: true, lines: [] };
  return { ok: false, lines: ["an AI signature is in a commit", ...bad, "Reword the commit (git rebase -i, or git commit --amend) to drop the line or set a human email, then push again."] };
}
