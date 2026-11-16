import { mkdtempSync, existsSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawn } from "node:child_process";
import { inPaths } from "../hooks/core/config.mjs";

export const needs = ["paths.code", "tests.files", "tests.run", "tests.notRunnable"];

const quote = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const START = /(?:^|[^\w.$])(?:test|it|describe|suite)(?:\.(?:only|skip|todo))?\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/;

// the tests of a file as name pattern -> text up to the next test; a template's ${...} matches any text
// shortcut: a test made by a helper of another name is not seen, its lines count to the test above; the whole file then decides at the parent
const testsOf = (text) => {
  const tests = new Map();
  let key = null;
  for (const line of (text ?? "").split(/(?<=\n)/)) {
    const m = START.exec(line);
    if (m) key = `^${(m[1] === "`" ? m[2].split(/\$\{[^}]*\}/) : [m[2]]).map(esc).join(".*")}$`;
    if (key) tests.set(key, (tests.get(key) ?? "") + line);
  }
  return tests;
};

export async function run(range, ctx) {
  const { paths: { code }, tests } = ctx.config;
  const seconds = ctx.config.brakes?.fixHasTest?.seconds; // an older installed config module may lack the section
  // a fix that loops forever on the parent must not hang the push
  // the timer of Node takes at most 2^31-1 ms; above 2147483 s it fires at once
  if (!Number.isInteger(seconds) || seconds <= 0 || seconds > 2147483) return { ok: false, cannotRun: true, lines: [`brakes.fixHasTest.seconds must be a whole number from 1 up to 2147483, it is ${JSON.stringify(seconds)}`] };
  const limitMs = seconds * 1000;
  const isTest = (f) => inPaths(f, tests.files) || inPaths(f, tests.notRunnable);
  const bad = [], notes = [];
  let wt = null, cannot = null, signal = null, child = null;
  // Ctrl-C reaches only the foreground group, not ours: kill the tests, clean up, then re-raise
  // shortcut: POSIX only (process groups, sh); Windows is not covered yet, cover it when the project does
  const sigs = ["SIGINT", "SIGTERM", "SIGHUP"];
  const onSig = (s) => { signal ??= s; try { process.kill(-child.pid, "SIGKILL"); } catch {} };
  for (const s of sigs) process.on(s, onSig);

  // exit: 0 pass, 1 red, null could not run; a run by names that ran no test exits 0
  const runTests = async (files, names) => {
    if (signal) return null;
    const list = files.map(quote).join(" ");
    const build = (ns) => {
      const run = ns ? tests.run.replace(/^\s*node --test/, () => `node --test ${ns.map((n) => quote(`--test-name-pattern=${n}`)).join(" ")}`) : tests.run;
      return run.includes("<files>") ? run.split("<files>").join(list) : `${run} ${list}`;
    };
    // Linux caps one argument at 128 KB: past 100000 bytes of command the whole file runs
    let cmd = build(names);
    if (names && Buffer.byteLength(cmd) > 100000) cmd = build(null);
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
      // only the parent runs: the push runs the whole suite on the last commit
      // with node --test, only the tests the fix adds or changes run; a red of those decides
      // a pass or no test run goes to the whole file, as before, so no verdict is stricter than before
      const names = /^\s*node --test(?: <files>)?\s*$/.test(tests.run) ? runnable.flatMap((f) => {
        const before = testsOf(ctx.show(`${c}^`, f));
        return [...testsOf(ctx.show(c, f))].filter(([k, text]) => before.get(k) !== text).map(([k]) => k);
      }) : [];
      let atParent = names.length ? await runTests(runnable, names) : 0;
      // shortcut: a test that needs an earlier test of its file fails alone at the parent, and that red counts as proof, though the whole file passes there; a gap, see docs/gaps.md
      if (atParent === 0) atParent = await runTests(runnable);
      if (atParent === null) { cannot = `${label}: its tests did not end within ${seconds}s or could not start at the parent; raise brakes.fixHasTest.seconds`; return; }
      if (atParent === 0) bad.push(`${label}: its tests also pass at the parent, so they prove nothing; make them fail without the fix`);
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
