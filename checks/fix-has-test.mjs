import { mkdtempSync, existsSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawn } from "node:child_process";
import { inPaths } from "../hooks/core/config.mjs";

export const needs = ["paths.code", "tests.files", "tests.run", "tests.notRunnable"];

// a fix that loops forever on the parent must not hang the push; the test shortens it
let limitMs = 120000;
export const setLimitMs = (ms) => { limitMs = ms; };

const quote = (s) => `'${s.replace(/'/g, `'\\''`)}'`;

export async function run(range, ctx) {
  const { paths: { code }, tests } = ctx.config;
  const isTest = (f) => inPaths(f, tests.files) || inPaths(f, tests.notRunnable);
  const bad = [], notes = [];
  let wt = null, cannot = null, signal = null, child = null;
  // Ctrl-C reaches only the foreground group, not ours: kill the tests, clean up, then re-raise
  // shortcut: POSIX only (process groups, sh); Windows is not covered yet, cover it when the project does
  const sigs = ["SIGINT", "SIGTERM", "SIGHUP"];
  const onSig = (s) => { signal ??= s; try { process.kill(-child.pid, "SIGKILL"); } catch {} };
  for (const s of sigs) process.on(s, onSig);

  // exit: 0 pass, 1 red, null could not run
  const runTests = async (files) => {
    if (signal) return null;
    const list = files.map(quote).join(" ");
    const cmd = tests.run.includes("<files>") ? tests.run.split("<files>").join(list) : `${tests.run} ${list}`;
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT; // a nested `node --test` would report to the outer run and always pass
    for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) delete env[k];
    // own process group, so a timeout kills the tests the shell started too
    child = spawn("sh", ["-c", cmd], { cwd: wt, env, stdio: "ignore", detached: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, "SIGKILL"); } catch {} }, limitMs);
    const code = await new Promise((res) => { child.on("error", () => res(null)); child.on("close", (c) => res(c)); });
    clearTimeout(timer);
    return signal || timedOut || code === null || code === 127 ? null : code === 0 ? 0 : 1;
  };

  try {
    for (const [i, c] of range.commits.entries()) await (async () => {
      if (cannot || signal) return;
      const [subject, ...rest] = ctx.git("log", "-1", "--format=%s%n%b", c).split("\n");
      const body = rest.join("\n");
      if (!/^fix[(:]/.test(subject)) return;
      const parents = ctx.git("show", "-s", "--format=%P", c).split(" ").filter(Boolean);
      if (parents.length !== 1) return; // a merge is not a fix; a root commit has no parent to fail on
      const changed = ctx.git("diff-tree", "-z", "--no-commit-id", "--name-only", "-r", c).split("\0").filter(Boolean);
      if (!changed.some((f) => inPaths(f, code) && !isTest(f))) return;
      if (/^no-test: \S/m.test(body)) return;
      const later = range.commits.slice(i + 1).map((l) => ctx.git("log", "-1", "--format=%b", l)).join("\n");
      for (const m of later.matchAll(/^no-test-for: (\S+) \S/gm)) if (m[1].length >= 7 && c.startsWith(m[1])) return;

      const label = `${c.slice(0, 7)} ${subject}`;
      const tfiles = changed.filter((f) => isTest(f) && ctx.tryGit("cat-file", "-e", `${c}:${f}`).code === 0);
      if (!tfiles.length) { bad.push(`${label}: it changes code and adds no test file`); return; }
      const runnable = tfiles.filter((f) => inPaths(f, tests.files) && !inPaths(f, tests.notRunnable));
      if (!runnable.length) { notes.push(`${label}: its tests are not run here (tests.notRunnable)`); return; }

      if (!wt) {
        wt = mkdtempSync(join(tmpdir(), "xwf-fix-"));
        ctx.git("worktree", "add", "-q", "--detach", wt, `${c}^`);
        for (const d of ["node_modules", ".venv"]) if (existsSync(join(ctx.root, d))) symlinkSync(join(ctx.root, d), join(wt, d));
      }
      const wtGit = (...a) => ctx.exec("git", a, { cwd: wt });
      wtGit("checkout", "-q", "--detach", "-f", `${c}^`);
      wtGit("clean", "-fdq", "-e", "node_modules", "-e", ".venv");
      // the root and every package of the parent link the node_modules the checkout has
      const pkgs = ctx.git("ls-tree", "-r", "-z", "--name-only", `${c}^`).split("\0").filter((f) => f === "package.json" || f.endsWith("/package.json"));
      for (const f of pkgs) {
        const n = join(dirname(f), "node_modules");
        if (existsSync(join(ctx.root, n)) && !existsSync(join(wt, n))) symlinkSync(join(ctx.root, n), join(wt, n));
      }
      wtGit("checkout", "-q", c, "--", ...runnable);
      const atParent = await runTests(runnable);
      if (atParent === null) { cannot = `${label}: its tests did not end within ${limitMs / 1000}s or could not start at the parent`; return; }
      if (atParent === 0) { bad.push(`${label}: its tests also pass at the parent, so they prove nothing; make them fail without the fix`); return; }
      wtGit("checkout", "-q", "--detach", "-f", c);
      const atFix = await runTests(runnable);
      if (atFix === null) { cannot = `${label}: its tests did not end within ${limitMs / 1000}s or could not start at the fix`; return; }
      if (atFix !== 0) bad.push(`${label}: its tests still fail at the fix commit`);
    })();
  } finally {
    if (wt) {
      ctx.tryGit("worktree", "remove", "--force", wt);
      rmSync(wt, { recursive: true, force: true });
      ctx.tryGit("worktree", "prune");
    }
    for (const s of sigs) process.removeListener(s, onSig);
  }
  if (signal) process.kill(process.pid, signal);
  if (cannot) return { ok: false, cannotRun: true, lines: [cannot] };
  if (bad.length) {
    return { ok: false, lines: ["a fix needs a test that fails before it and passes after it", ...bad,
      "add the test to the fix commit, or put `no-test: <reason>` in its body, or `no-test-for: <sha7+> <reason>` in a later commit"] };
  }
  return { ok: true, lines: notes };
}
