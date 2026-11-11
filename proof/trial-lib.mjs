// Pure-ish trial helpers (no SDK import): the tests load this file with a stubbed exec.
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stripLeft, stripPlan } from "./answers.mjs";

export const GIT = ["-c", "user.name=proof", "-c", "user.email=proof@example.invalid"];

// Order per spec 7: copy, strip, install, build the graph. exec(cmd, args, cwd, timeoutMs) returns stdout.
export function prepareCopy({ dir, source, commit, init, strip, repo, exec, copyDir }) {
  const git = (...a) => exec("git", a, dir);
  if (init) {
    copyDir(source, dir);
    git("init", "-q");
    git("add", "-A");
    git(...GIT, "commit", "-q", "-m", "proof: initial");
  } else {
    exec("git", ["clone", "-q", "--no-hardlinks", source, dir], undefined);
    git("checkout", "-q", commit);
    git("remote", "remove", "origin");
  }
  if (strip.length) {
    const files = () => git("ls-files").split("\n").filter(Boolean);
    for (const p of stripPlan(strip, files()).remove) git("rm", "-r", "-q", "--", p);
    git(...GIT, "commit", "-q", "--allow-empty", "-m", "proof: remove instruction files");
    const left = stripLeft(strip, files());
    if (left.length) throw new Error(`strip left: ${left.join(", ")}`);
  }
  exec("node", [join(repo, "bin/xworkflows.mjs"), "install", "--yes"], dir, 120_000);
  exec("graphify", ["update", "."], dir, 600_000);
  return git("rev-parse", "HEAD").trim();
}

// Owner rule: trials never bill per token. Returns the error text, or null when the environment is clean.
export function apiKeyGuard(env) {
  return env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN
    ? "proof: ANTHROPIC_API_KEY is set; trials would be billed per token. Unset it (e.g. env -u ANTHROPIC_API_KEY node proof/harness.mjs ...) so the SDK uses your claude.ai login."
    : null;
}

// "S5-next" ends a trial; so does adapt moving on to next-step or full-review (it skips S5-next when zones are empty).
export function stopFor(toolName, input) {
  if (toolName === "Skill" && /(^|:)(next-step|full-review)$/.test(String(input?.skill ?? input?.name ?? ""))) return "S5-skip";
  return null;
}

// Move the owner's real profile aside while a trial runs, then put it back (also on error).
export async function withOwnerBackup(home, fn) {
  const f = join(home, ".xworkflows", "owner.md");
  const had = existsSync(f) ? readFileSync(f) : null;
  if (had) rmSync(f);
  try { return await fn(); } finally {
    if (had) { mkdirSync(join(home, ".xworkflows"), { recursive: true }); writeFileSync(f, had); } else rmSync(f, { force: true });
  }
}
