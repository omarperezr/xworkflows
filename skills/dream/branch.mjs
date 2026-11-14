// Opens the branch of a dream run in a worktree, and closes the run. No model.
// Usage: node branch.mjs unseen | open
//        node branch.mjs close --worktree <folder> --out <the extract's folder> [--not-read <name,name>]
//        node branch.mjs drop [--worktree <folder>] [--out <the extract's folder>]
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, existsSync, realpathSync, rmdirSync, unlinkSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { shared } from "./shared.mjs";
import { shapes, suspect } from "./extract.mjs";

const { load, memoryDir, DEFAULTS } = await shared("hooks/core/config.mjs");
const { buildIndex, header } = await shared("hooks/core/memory-index.mjs");
const { makeCtx, rangeFor } = await shared("checks/run.mjs");
const stale = await shared("checks/stale-memory.mjs");

const MARK = "dream-open"; // in the worktree's own git folder: close takes only a worktree that open made
const arg = (argv, k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
const link = (p) => lstatSync(p, { throwIfNoEntry: false })?.isSymbolicLink() === true;
// the one gate of every read and write of open and close: the real path of p's folder is that folder itself, under the real path base (no link on
// the way, so never outside it), and p is no link. A file refused here stays out of the commit and is named in outside
const mine = (base, p) => { try { const d = dirname(p); return realpathSync(d) === d && (d + sep).startsWith(base + sep) && !link(p); } catch { return false; } };
// the extract's folder goes only when it holds nothing but extract.json and the text files that file lists, and lies under none of bases;
// any other is left and named. Returns the folders left
function dropOut(folder, bases) {
  if (!lstatSync(folder, { throwIfNoEntry: false })) return [];
  try {
    const real = realpathSync(folder), x = JSON.parse(readFileSync(join(real, "extract.json"), "utf8"));
    const names = new Set(["extract.json", ...x.sessions.map((s) => basename(s.file))]), entries = readdirSync(real, { withFileTypes: true });
    if (!link(resolve(folder)) && !bases.some((b) => (real + sep).startsWith(b + sep)) && entries.every((e) => e.isFile() && names.has(e.name))) {
      for (const e of entries) unlinkSync(join(real, e.name));
      rmdirSync(real);
      return [];
    }
  } catch { /* not the folder the extract made: left */ }
  return [folder];
}

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
  // a worktree that open made in this repository: listed by git on a dream/ branch, with open's mark; null for any other
  const marked = (given) => {
    let real = null;
    try { real = realpathSync(given); } catch { return null; }
    const e = git(root, "worktree", "list", "--porcelain").split("\n\n")
      .map((b) => ({ path: /^worktree (.*)$/m.exec(b)?.[1], branch: /^branch refs\/heads\/(dream\/.*)$/m.exec(b)?.[1] }))
      .find((w) => w.branch && w.path === real);
    return e && existsSync(join(git(real, "rev-parse", "--absolute-git-dir"), MARK)) ? e : null;
  };
  // a memory folder that is a link, or lies under one, could lead a run's writes outside its branch: refused before anything is written
  const linked = (base) => (mine(base, join(base, dir)) ? null : { code: 2, stdout: `the memory folder ${dir} is a link: /dream cannot run here, its writes could leave the branch\n` });

  try {
    if (argv[0] === "unseen") { // the notes the run will not see: the worktree starts from main
      const no = linked(realpathSync(root));
      if (no) return no;
      const list = (...a) => git(root, ...a, "-z", "--", dir).split("\0").filter(Boolean);
      return out([...list("diff", "--name-only", "--no-renames", "--diff-filter=d", main), ...list("ls-files", "--others", "--exclude-standard")]);
    }
    if (argv[0] === "open") {
      const d = new Date(), p = (n) => String(n).padStart(2, "0");
      const base = `dream/${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      let branch = base;
      for (let n = 2; tryGit(root, "rev-parse", "--verify", "--quiet", `refs/heads/${branch}`).code === 0; n++) branch = `${base}-${n}`;
      const no = linked(realpathSync(root));
      if (no) return no;
      const worktree = realpathSync(mkdtempSync(join(tmpdir(), "dream-")));
      try { git(root, "worktree", "add", "-b", branch, worktree, main); } catch (e) { rmdirSync(worktree); throw e; } // only the empty folder it made
      writeFileSync(join(git(worktree, "rev-parse", "--absolute-git-dir"), MARK), `${branch}\n`);
      return out({ branch, worktree, memory: join(worktree, dir), main });
    }
    if (argv[0] === "close") {
      const given = arg(argv, "--worktree"), dirOut = arg(argv, "--out"), notRead = (arg(argv, "--not-read") ?? "").split(",");
      if (!given || !dirOut) return { code: 2, stdout: "close needs --worktree and --out\n" };
      let extract = null;
      try { extract = JSON.parse(readFileSync(join(dirOut, "extract.json"), "utf8")); } catch { /* refused below */ }
      // the sessions read: those with text, and those with none (empty); a session named in --not-read keeps its position, to be read again
      const read = Array.isArray(extract?.sessions) && Array.isArray(extract.empty ?? []) ? [...extract.sessions, ...(extract.empty ?? [])] : null;
      if (!read?.every((s) => typeof s?.name === "string" && Number.isInteger(s.lines)))
        return { code: 2, stdout: `--out holds no readable extract.json: ${dirOut}\n` };
      const entry = marked(given);
      if (!entry) return { code: 2, stdout: `--worktree is not a worktree that open made in this repository: ${given}\n` };
      const { branch, path: real } = entry, no = linked(real);
      if (no) return no;
      const memory = join(real, dir), state = join(memory, "dream.json");
      const { sessions = {} } = existsSync(state) && mine(real, state) ? JSON.parse(readFileSync(state, "utf8")) : {};

      if (mine(real, state)) writeFileSync(state, JSON.stringify({ sessions: { ...sessions, ...Object.fromEntries(read.filter((s) => !notRead.includes(s.name)).map((s) => [s.name, s.lines])) } }, null, 2) + "\n");

      const date = /^dream\/(\d{4}-\d\d-\d\d)/.exec(branch)?.[1] ?? branch;
      git(real, "reset", "-q"); // the index holds only what this close stages
      git(real, "add", "-A", "--", dir);
      // what the commit takes against main: sure shapes are masked, the lines the wide rule would touch are named in look; a binary file cannot be
      // masked, a link is not followed and a note of type user or feedback is the owner's alone, so they stay out and are named in outside
      const masked = [], look = [], index = `${dir}/MEMORY.md`;
      for (const l of git(real, "diff", "--cached", "--merge-base", main, "--no-renames", "--diff-filter=AMT", "--numstat", "-z", "--", dir).split("\0").filter(Boolean)) {
        const [a, , file] = l.split("\t");
        if (a === "-" || !mine(real, join(real, file))) { git(real, "reset", "-q", "--", file); continue; }
        if (file === index) continue; // rebuilt below from the notes the commit takes
        const raw = readFileSync(join(real, file), "utf8");
        if (file.endsWith(".md") && ["user", "feedback"].includes(header(raw).type)) { git(real, "reset", "-q", "--", file); continue; }
        const [text, count] = shapes(raw);
        if (count) { writeFileSync(join(real, file), text); git(real, "add", "--", file); masked.push({ file, count }); }
        if (file !== `${dir}/dream.json`) look.push(...suspect(text).map((line) => ({ file, line }))); // close's own: the sessions' names
      }
      if (mine(real, join(real, index))) { // the index of the notes as the commit takes them
        const files = git(real, "ls-files", "-s", "-z", "--", dir).split("\0").filter(Boolean).map((l) => l.split("\t"))
          .filter(([m, f]) => m.startsWith("100") && f !== index && /^[^/]+\.md$/.test(f.slice(dir.length + 1)))
          .map(([, f]) => ({ file: f.slice(dir.length + 1), text: git(real, "show", `:${f}`) }));
        const text = buildIndex(files);
        let old = null;
        try { old = readFileSync(join(real, index), "utf8"); } catch { /* no index yet */ }
        if (old !== text && (text || old !== null)) { writeFileSync(join(real, index), text); git(real, "add", "--", index); }
      }
      if (tryGit(real, "diff", "--cached", "--quiet").code === 1) {
        const c = tryGit(real, "commit", "-q", "-m", `dream: ${date}`); // the project's commit hooks run: never --no-verify
        if (c.code !== 0) return { code: 1, stdout: `${c.err || c.out || "git commit failed"}\nthe commit was refused; the notes stay staged in ${real}: commit there, then run git worktree remove ${real}; the extract's folder ${dirOut} stays: drop --out removes it\n` };
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

      const left = dropOut(dirOut, [realpathSync(root), real]);
      git(root, "worktree", "remove", "--force", real); // the changes outside the memory folder are named above and go with it
      return out({ branch, added: count("A"), changed: count("M"), removed: count("D"), masked, look, stale: lines, outside, left,
        see: `git diff ${main}...${branch} -- ${dir}`, adopt: `git merge --no-ff ${branch}`, discard: `git branch -D ${branch}` });
    }
    if (argv[0] === "drop") { // every path that stops: the extract's folder by close's rule, and a worktree open made, with its branch when that holds no commit
      const given = arg(argv, "--worktree"), dirOut = arg(argv, "--out");
      if (given || dirOut) {
        const w = given ? marked(given) : null, left = dirOut ? dropOut(dirOut, [realpathSync(root), ...(w ? [w.path] : [])]) : [];
        let deleted = null;
        if (given && !w) left.push(given);
        if (w) {
          git(root, "worktree", "remove", "--force", w.path);
          if (git(root, "rev-list", "--count", `${main}..${w.branch}`) === "0") { git(root, "branch", "-q", "-D", w.branch); deleted = w.branch; }
        }
        return out({ left, deleted });
      }
    }
    return { code: 2, stdout: "usage: branch.mjs unseen | open | close --worktree <folder> --out <folder> [--not-read <name,name>] | drop [--worktree <folder>] [--out <folder>]\n" };
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
