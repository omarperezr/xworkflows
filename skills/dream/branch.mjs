// Opens the branch of a dream run in a worktree, and closes the run. No model.
// Usage: node branch.mjs open
//        node branch.mjs close --worktree <folder> --name <last session name> --time <last session time>
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { shared } from "./shared.mjs";
import { mask } from "./extract.mjs";

const { load, memoryDir, DEFAULTS } = await shared("hooks/core/config.mjs");
const { buildIndex } = await shared("hooks/core/memory-index.mjs");
const { makeCtx, rangeFor } = await shared("checks/run.mjs");
const stale = await shared("checks/stale-memory.mjs");

const arg = (argv, k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);

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
    if (argv[0] === "open") {
      const d = new Date(), p = (n) => String(n).padStart(2, "0");
      const base = `dream/${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      let branch = base;
      for (let n = 2; tryGit(root, "rev-parse", "--verify", "--quiet", `refs/heads/${branch}`).code === 0; n++) branch = `${base}-${n}`;
      const worktree = realpathSync(mkdtempSync(join(tmpdir(), "dream-")));
      git(root, "worktree", "add", "-b", branch, worktree, main);
      return out({ branch, worktree, memory: join(worktree, dir), main });
    }
    if (argv[0] === "close") {
      const given = arg(argv, "--worktree"), name = arg(argv, "--name"), time = arg(argv, "--time");
      if (!given || name === undefined || time === undefined) return { code: 2, stdout: "close needs --worktree, --name and --time\n" };
      let real = null;
      try { real = realpathSync(given); } catch { /* not a folder: refused below */ }
      const entry = git(root, "worktree", "list", "--porcelain").split("\n\n")
        .map((b) => ({ path: /^worktree (.*)$/m.exec(b)?.[1], branch: /^branch refs\/heads\/(dream\/.*)$/m.exec(b)?.[1] }))
        .find((e) => e.branch && e.path === real);
      if (!entry) return { code: 2, stdout: `--worktree is not a worktree of this repository on a dream/ branch: ${given}\n` };
      const { branch } = entry, memory = join(real, dir);

      let masked = 0;
      for (const f of existsSync(memory) ? readdirSync(memory).filter((f) => f.endsWith(".md")) : []) {
        const [text, n] = mask(readFileSync(join(memory, f), "utf8"));
        masked += n;
        if (n) writeFileSync(join(memory, f), text);
      }
      if (existsSync(memory)) {
        const files = readdirSync(memory).filter((f) => f.endsWith(".md") && f !== "MEMORY.md").map((file) => ({ file, text: readFileSync(join(memory, file), "utf8") }));
        const index = join(memory, "MEMORY.md"), text = buildIndex(files);
        let old = null;
        try { old = readFileSync(index, "utf8"); } catch { /* no index yet */ }
        if (old !== text && (text || old !== null)) writeFileSync(index, text);
      }
      writeFileSync(join(memory, "dream.json"), JSON.stringify({ name, time }, null, 2) + "\n");

      const date = /^dream\/(\d{4}-\d\d-\d\d)/.exec(branch)?.[1] ?? branch;
      git(real, "add", "-A", "--", dir);
      if (git(real, "status", "--porcelain", "--", dir)) git(real, "commit", "-q", "-m", `dream: ${date}`, "--", dir);
      const outside = git(real, "status", "--porcelain", "-z", "--untracked-files=all").split("\0").filter(Boolean)
        .map((l) => l.slice(3)).filter((f) => !f.startsWith(`${dir}/`));

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
      return out({ branch, added: count("A"), changed: count("M"), removed: count("D"), masked, stale: lines, outside,
        see: `git diff ${main}...${branch} -- ${dir}`, adopt: `git merge --no-ff ${branch}`, discard: `git branch -D ${branch}` });
    }
    return { code: 2, stdout: "usage: branch.mjs open | close --worktree <folder> --name <name> --time <time>\n" };
  } catch (e) {
    return { code: 1, stdout: `${e.message}\n` };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = run(process.argv.slice(2), process.cwd());
  process.stdout.write(r.stdout);
  process.exitCode = r.code;
}
