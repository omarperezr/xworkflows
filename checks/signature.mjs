// Makers and coding tools an agent signs as. Names match as whole words, domains as whole labels.
const NAMES = ["claude", "anthropic", "openai", "chatgpt", "codex", "copilot", "gemini", "cursor", "aider", "devin", "windsurf", "codeium", "cody", "tabnine", "kiro", "amp"];
const DOMAINS = ["anthropic.com", "openai.com", "cursor.com", "cursor.sh", "codeium.com", "windsurf.com", "aider.chat", "cognition.ai", "tabnine.com", "sourcegraph.com"];

const nameRe = new RegExp(`(?<!\\w)(${NAMES.join("|")})(?!\\w)`, "i");
const trailerRe = /^\s*(co-authored-by|signed-off-by):|generated with/i;
const domainOf = (s) => (s.match(/@([^\s>@]+)/)?.[1] ?? "").toLowerCase();
const vendorDomain = (d) => DOMAINS.some((v) => d === v || d.endsWith(`.${v}`));

export function run(range, ctx) {
  const bad = [];
  for (const sha of range.commits) {
    const [head, ae, ce, body] = ctx.git("show", "-s", "--format=%h %s%x00%ae%x00%ce%x00%b", sha).split("\0");
    const why = [];
    if (vendorDomain(domainOf(ae))) why.push(`author email ${ae}`);
    if (vendorDomain(domainOf(ce))) why.push(`committer email ${ce}`);
    for (const line of body.split("\n")) {
      if (trailerRe.test(line) && (nameRe.test(line) || vendorDomain(domainOf(line)))) why.push(`line "${line.trim()}"`);
    }
    if (why.length) bad.push(`  ${head}: ${why.join("; ")}`);
  }
  if (!bad.length) return { ok: true, lines: [] };
  return { ok: false, lines: ["an AI signature is in a commit", ...bad, "Reword the commit (git rebase -i, or git commit --amend) to drop the line or set a human email, then push again."] };
}
