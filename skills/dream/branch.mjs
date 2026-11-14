// Opens the branch of a dream run in a worktree, and closes the run. No model.
// Usage: node branch.mjs unseen | open
//        node branch.mjs close --worktree <folder> --out <the extract's folder>
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, existsSync, realpathSync, rmSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { shared } from "./shared.mjs";
import { mask } from "./extract.mjs";

const { load, memoryDir, DEFAULTS } = await shared("hooks/core/config.mjs");
const { buildIndex } = await shared("hooks/core/memory-index.mjs");
const { makeCtx, rangeFor } = await shared("checks/run.mjs");
const stale = await shared("checks/stale-memory.mjs");

const MARK = "dream-open"; // in the worktree's own git folder: close takes only a worktree that open made
const arg = (argv, k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
// a link under the memory folder is never read or written through: it stays out of the commit and is named in outside
const link = (p) => lstatSync(p, { throwIfNoEntry: false })?.isSymbolicLink() === true;

export function run(argv, root) {
  const env = { ...process.env };
  for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) delete env[k];
  const tryGit = (cwd, ...args) => {
    const r = spawnSync("git", args, { cwd, env, encoding: "utf8", maxBuffer: 1 << 28 });
    return { code: r.status, out: (r.stdout ?? "").replace(/\n$/, ""), err: (r.stderr ?? "").trim() };
  };
  const git = (cwd, ...args) => {
    const r = tryGit(cwd, ...args);
    if (r.code !== 0) throw new Error(r.err || `git ${args[0]} failed`);
    return r.out;
  };
  const config = load(root);
  const main = config.mainBranch;
  const dir = memoryDir(config.memory.dir) ?? DEFAULTS.memory.dir;
  const out = (o) => ({ code: 0, stdout: JSON.stringify(o) + "\n" });

  try {
    if (argv[0] === "unseen") { // the notes the run will not see: the worktree starts from main
      const list = (...a) => git(root, ...a, "-z", "--", dir).split("\0").filter(Boolean);
      return out([...list("diff", "--name-only", "--no-renames", "--diff-filter=d", main), ...list("ls-files", "--others", "--exclude-standard")]);
    }
    if (argv[0] === "open") {
      const d = new Date(), p = (n) => String(n).padStart(2, "0");
      const base = `dream/${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      let branch = base;
      for (let n = 2; tryGit(root, "rev-parse", "--verify", "--quiet", `refs/heads/${branch}`).code === 0; n++) branch = `${base}-${n}`;
      const worktree = realpathSync(mkdtempSync(join(tmpdir(), "dream-")));
      git(root, "worktree", "add", "-b", branch, worktree, main);
      writeFileSync(join(git(worktree, "rev-parse", "--absolute-git-dir"), MARK), `${branch}\n`);
      return out({ branch, worktree, memory: join(worktree, dir), main });
    }
    if (argv[0] === "close") {
      const given = arg(argv, "--worktree"), dirOut = arg(argv, "--out");
      if (!given || !dirOut) return { code: 2, stdout: "close needs --worktree and --out\n" };
      let extract = null;
      try { extract = JSON.parse(readFileSync(join(dirOut, "extract.json"), "utf8")); } catch { /* refused below */ }
      if (!Array.isArray(extract?.sessions) || !extract.sessions.every((s) => typeof s?.name === "string" && Number.isInteger(s.lines)))
        return { code: 2, stdout: `--out holds no readable extract.json: ${dirOut}\n` };
      let real = null;
      try { real = realpathSync(given); } catch { /* not a folder: refused below */ }
      const entry = git(root, "worktree", "list", "--porcelain").split("\n\n")
        .map((b) => ({ path: /^worktree (.*)$/m.exec(b)?.[1], branch: /^branch refs\/heads\/(dream\/.*)$/m.exec(b)?.[1] }))
        .find((e) => e.branch && e.path === real);
      if (!entry || !existsSync(join(git(real, "rev-parse", "--absolute-git-dir"), MARK)))
        return { code: 2, stdout: `--worktree is not a worktree that open made in this repository: ${given}\n` };
      const { branch } = entry, memory = join(real, dir), state = join(memory, "dream.json");
      const { sessions = {} } = existsSync(state) && !link(state) ? JSON.parse(readFileSync(state, "utf8")) : {};

      const index = join(memory, "MEMORY.md");
      if (existsSync(memory) && !link(index)) {
        const files = readdirSync(memory, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith(".md") && e.name !== "MEMORY.md")
          .map(({ name: file }) => ({ file, text: readFileSync(join(memory, file), "utf8") }));
        const text = buildIndex(files);
        let old = null;
        try { old = readFileSync(index, "utf8"); } catch { /* no index yet */ }
        if (old !== text && (text || old !== null)) writeFileSync(index, text);
      }
      if (!link(state)) writeFileSync(state, JSON.stringify({ sessions: { ...sessions, ...Object.fromEntries(extract.sessions.map((s) => [s.name, s.lines])) } }, null, 2) + "\n");

      const date = /^dream\/(\d{4}-\d\d-\d\d)/.exec(branch)?.[1] ?? branch;
      git(real, "reset", "-q"); // the index holds only what this close stages
      git(real, "add", "-A", "--", dir);
      // the mask runs on what the commit takes against main; a binary file cannot be masked and a link is not followed, so they stay out and are named in outside
      const masked = [];
      for (const l of git(real, "diff", "--cached", "--merge-base", main, "--no-renames", "--diff-filter=AMT", "--numstat", "-z", "--", dir).split("\0").filter(Boolean)) {
        const [a, , file] = l.split("\t");
        if (a === "-" || link(join(real, file))) { git(real, "reset", "-q", "--", file); continue; }
        const [text, count] = mask(readFileSync(join(real, file), "utf8"));
        if (count) { writeFileSync(join(real, file), text); git(real, "add", "--", file); masked.push({ file, count }); }
      }
      if (tryGit(real, "diff", "--cached", "--quiet").code === 1) {
        const c = tryGit(real, "commit", "-q", "-m", `dream: ${date}`); // the project's commit hooks run: never --no-verify
        if (c.code !== 0) return { code: 1, stdout: `${c.err || c.out || "git commit failed"}\nthe commit was refused; the notes stay staged in ${real}: commit there, then run git worktree remove ${real}\n` };
      }
      const outside = git(real, "status", "--porcelain", "-z", "--untracked-files=all").split("\0").filter(Boolean).map((l) => l.slice(3));

      const notes = git(root, "diff", "--no-renames", "--name-status", `${main}...${branch}`, "--", dir).split("\n").filter(Boolean)
        .map((l) => l.split("\t")).filter(([, f]) => f.endsWith(".md") && f.slice(dir.length + 1) !== "MEMORY.md" && !f.slice(dir.length + 1).includes("/"));
      const count = (s) => notes.filter(([x]) => x === s).length;

      let lines;
      try {
        const ctx = makeCtx(root, config), head = git(real, "rev-parse", "HEAD");
        const range = rangeFor(ctx, { base: git(root, "merge-base", main, head), head });
        lines = stale.run(range, ctx).lines;
      } catch (e) { lines = [`could not run: ${e.message}`]; }

      git(root, "worktree", "remove", "--force", real); // the changes outside the memory folder are named above and go with it
      rmSync(dirOut, { recursive: true, force: true });
      return out({ branch, added: count("A"), changed: count("M"), removed: count("D"), masked, stale: lines, outside,
        see: `git diff ${main}...${branch} -- ${dir}`, adopt: `git merge --no-ff ${branch}`, discard: `git branch -D ${branch}` });
    }
    return { code: 2, stdout: "usage: branch.mjs unseen | open | close --worktree <folder> --out <folder>\n" };
  } catch (e) {
    return { code: 1, stdout: `${e.message}\n` };
  }
}

const direct = (() => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (direct) {
  const r = run(process.argv.slice(2), process.cwd());
  process.stdout.write(r.stdout);
  process.exitCode = r.code;
}
