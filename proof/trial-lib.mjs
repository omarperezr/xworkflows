// Pure-ish trial helpers (no SDK import): the tests load this file with a stubbed exec.
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { stripLeft, stripPlan } from "./answers.mjs";

// Files a run leaves in the copy's .xworkflows that the harness keeps.
export const KEPT_FILES = ["research.md", "research.json", "scan.json", "interview.log.jsonl", "screens.json", "details.md"];

// Copies what a run left in the trial copy `cwd` into `dir`; a file that is missing is skipped.
export function keepFiles(cwd, dir) {
  const copy = (from, to, opts) => { if (existsSync(from)) { mkdirSync(join(to, ".."), { recursive: true }); cpSync(from, to, opts); } };
  for (const f of KEPT_FILES) copy(join(cwd, ".xworkflows", f), join(dir, f));
  copy(join(cwd, "AGENTS.md"), join(dir, "AGENTS.md"));
  copy(join(cwd, ".claude/rules"), join(dir, ".claude/rules"), { recursive: true });
  copy(join(cwd, ".claude/agents/risk-review.md"), join(dir, ".claude/agents/risk-review.md"));
}

export const GIT = ["-c", "user.name=proof", "-c", "user.email=proof@example.invalid"];

// Order per spec 7: copy, strip, install, build the graph. exec(cmd, args, cwd, timeoutMs) returns stdout.
export function prepareCopy({ dir, source, commit, init, strip, repo, exec, copyDir }) {
  const git = (...a) => exec("git", a, dir);
  if (init) {
    copyDir(source, dir);
    rmSync(join(dir, ".git"), { recursive: true, force: true }); // a worktree's .git file would point git at the source repo
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

// Per-token billing needs the explicit --api-credits flag. Returns the error text, or null when allowed.
export function apiKeyGuard(env, apiCredits = false) {
  return !apiCredits && (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN)
    ? "proof: ANTHROPIC_API_KEY is set; trials would be billed per token. Unset it (e.g. env -u ANTHROPIC_API_KEY node proof/harness.mjs ...) so the SDK uses your claude.ai login, or pass --api-credits to use API credits."
    : null;
}

// Another trial may start only while spent plus one per-trial cap stays within the total cap. Returns a reason to stop, or null.
export function budgetStop(spent, perTrial, total) {
  return spent + perTrial > total ? `spent ${spent.toFixed(2)} USD plus the ${perTrial} USD per-trial cap would exceed the ${total} USD total cap` : null;
}

// "S5-next" ends a trial; so does adapt moving on to next-step or full-review (it skips S5-next when zones are empty).
export function stopFor(toolName, input) {
  if (toolName === "Skill" && /(^|:)(next-step|full-review)$/.test(String(input?.skill ?? input?.name ?? ""))) return "S5-skip";
  return null;
}

const backupOf = (home) => join(home, ".xworkflows", "owner.md.proof-backup");

// Put the owner's profile back from the on-disk backup (a trial's own owner.md is discarded). True when a backup existed.
export function restoreOwner(home) {
  const b = backupOf(home);
  if (!existsSync(b)) return false;
  renameSync(b, join(home, ".xworkflows", "owner.md"));
  return true;
}

// Move the owner's real profile aside (a rename, never held only in memory) while a trial runs, then put it back, also on error.
export async function withOwnerBackup(home, fn) {
  const f = join(home, ".xworkflows", "owner.md");
  if (existsSync(f)) renameSync(f, backupOf(home));
  try { return await fn(); } finally {
    if (!restoreOwner(home)) rmSync(f, { force: true });
  }
}

// Amount counted toward the total cap: the recorded cost only for a clean end, else at least the per-trial cap.
// A stream that ended with no result message counts as unclean: its cost was never reported.
export function countedCost(r, perTrial) {
  return r.failed || r.error || r.noResult || !["S5-next", "S5-skip", null].includes(r.stoppedAt) ? Math.max(r.costUsd, perTrial) : r.costUsd;
}

// Spending kept across harness runs, so the total cap holds over every invocation. A missing file is 0 spent;
// a file that is not a ledger throws (never reset silently).
export function readLedger(file) {
  if (!existsSync(file)) return { totalUsd: 0, trials: [] };
  const l = JSON.parse(readFileSync(file, "utf8"));
  if (typeof l?.totalUsd !== "number" || !Array.isArray(l.trials)) throw new Error(`${file} is not a spend ledger`);
  return l;
}

// The ledger file: --spend-file when given, else one fixed file of the repository in the git-ignored private proof folder.
export const spendFilePath = (repo, flag) => flag || join(repo, "docs", "proof", "private", "proof-spend.json");

// Adds one trial's counted cost to the ledger file and returns the new total.
export function addSpend(file, entry) {
  const l = readLedger(file);
  l.trials.push(entry);
  l.totalUsd = Math.round((l.totalUsd + entry.countedUsd) * 1e6) / 1e6;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(l, null, 2) + "\n");
  return l.totalUsd;
}

const lockOf = (home) => join(home, ".xworkflows", "owner.md.proof-lock");

// One harness run at a time: a lock file holding the pid. A dead pid's lock is taken over. Returns {ok} or {ok:false, pid}.
export function acquireLock(home) {
  mkdirSync(join(home, ".xworkflows"), { recursive: true });
  for (let i = 0; i < 2; i++) {
    try { writeFileSync(lockOf(home), String(process.pid), { flag: "wx" }); return { ok: true }; } catch (e) { if (e.code !== "EEXIST") throw e; }
    const pid = Number(readFileSync(lockOf(home), "utf8"));
    if (!Number.isInteger(pid) || pid <= 0) { rmSync(lockOf(home), { force: true }); continue; } // empty/0 lock: crash leftover, stale
    try { process.kill(pid, 0); return { ok: false, pid }; } catch (e) { if (e.code === "EPERM") return { ok: false, pid }; }
    rmSync(lockOf(home), { force: true });
  }
  return { ok: false, pid: NaN };
}

export const releaseLock = (home) => rmSync(lockOf(home), { force: true });

// The real path of p, following symlinks as far as it exists (a path not yet created is judged by its nearest existing parent).
function real(p) {
  const rest = [];
  for (let d = p; ; d = dirname(d)) {
    try { return join(realpathSync(d), ...rest.reverse()); } catch { if (dirname(d) === d) return p; rest.push(d.slice(dirname(d).length + 1)); }
  }
}

// A guard against a write outside the trial folder by accident: a file write or a shell command whose text names a path outside is denied. It reads the command's text and does not see a path the shell builds.
// Returns the reason to deny, or null. shortcut: a shell command is read token by token, so a path built by the shell itself
// (a variable, a substitution) is not seen; `~` and `$` words are denied outright for that reason.
export function outsideTrial(name, input, root) {
  const base = real(resolve(root));
  const out = (p) => {
    if (p === "/dev/null") return false;
    if (/^[~$]/.test(p)) return true;
    const r = real(resolve(base, p));
    return r !== base && !r.startsWith(base + sep);
  };
  const deny = (p) => `denied: ${p} is outside the trial folder; keep writes inside the trial folder (this guard reads the command text and does not see a path the shell builds)`;
  if (["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(name)) {
    const p = input?.file_path ?? input?.notebook_path;
    return typeof p === "string" && p && !out(p) ? null : deny(p);
  }
  if (name !== "Bash") return null;
  const cmd = String(input?.command ?? "");
  if (/(^|[;&|(]\s*)cd\s*($|[;&|)])/.test(cmd)) return deny("`cd` with no folder (your home)");
  const bad = cmd.split(/[\s;&|<>()`'"=]+/).filter(Boolean).find((t) => (isAbsolute(t) || /^[~$]/.test(t) || t.split("/").includes("..") || t.includes("/")) && out(t));
  return bad ? deny(bad) : null;
}

// P-23: the --out folder must be ignored by git, or private research output could land in a tracked path. `exec` is
// exec(cmd, args, cwd) that throws on a non-zero exit. Returns the refusal text, or null (ignored, or not inside a git repository).
export function outNotIgnored(out, exec) {
  const abs = resolve(out);
  let dir = abs;
  while (!existsSync(dir)) dir = dirname(dir);
  try { exec("git", ["check-ignore", "-q", "--", join(abs, "x")], dir); return null; } catch (e) {
    if (e.status === 128) return null;
    return `proof: --out ${out} is not ignored by git; add it to .gitignore (a line such as ${JSON.stringify(out.replace(/\/?$/, "/"))}) or choose a folder that is already ignored. Nothing was started.`;
  }
}
