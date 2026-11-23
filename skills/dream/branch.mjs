// Opens the branch of a dream run in a worktree, and closes the run. No model.
// Usage: node branch.mjs unseen | forget [--keep <n,n>] | open [--out <the extract's folder>]
//        node branch.mjs close --worktree <folder> --out <the extract's folder> [--not-read <name,name>] [--remove <name,name>]
//        node branch.mjs drop [--worktree <folder>] [--out <the extract's folder>]
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, existsSync, realpathSync, rmdirSync, unlinkSync, lstatSync, mkdirSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { createHash } from "node:crypto";
import { join, dirname, basename, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { shared, outsideFolders } from "./shared.mjs";
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

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const note = (n) => typeof n === "string" && /^[^/\\]+\.md$/.test(n) && n !== "MEMORY.md"; // a note's file name, never a path

export function run(argv, root, home = homedir()) {
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
  // the worktrees that open made in this repository and that still stand: listed by git on a dream/ branch, with open's mark
  const runs = () => git(root, "worktree", "list", "--porcelain").split("\n\n")
    .map((b) => ({ path: /^worktree (.*)$/m.exec(b)?.[1], branch: /^branch refs\/heads\/(dream\/.*)$/m.exec(b)?.[1] }))
    .filter((w) => { const g = w.branch && tryGit(w.path, "rev-parse", "--absolute-git-dir"); return g?.code === 0 && existsSync(join(g.out, MARK)); });
  // the one of them at given; null for any other
  const marked = (given) => {
    let real = null;
    try { real = realpathSync(given); } catch { return null; }
    return runs().find((w) => w.path === real) ?? null;
  };
  // a memory folder that is a link, or lies under one, could lead a run's writes outside its branch: refused before anything is written
  const linked = (base) => {
    let p = join(base, dir);
    while (p !== base && !lstatSync(p, { throwIfNoEntry: false })) p = dirname(p); // the deepest folder that exists: a missing one is no link
    return p === base || mine(base, p) ? null : linkedLine;
  };
  const linkedLine = { code: 2, stdout: `the memory folder ${dir} is a link: /dream cannot run here, its writes could leave the branch\n` };
  const folderOf = (kind) => outsideFolders(join(root, dir), root, home).find((f) => f.kind === kind)?.folder;
  // the originals main's dream.json records that still stand in their folder, numbered; changed when the file is no longer the one copied, noCopy when no file of main's tree named like it (or with -old) holds the recorded sha256
  const originals = () => {
    let brought = [];
    try { brought = JSON.parse(git(root, "show", `${main}:${dir}/dream.json`)).brought ?? []; } catch { /* no record */ }
    // a brought note that close left out (user, feedback) or removed never entered main: marked noCopy, still deletable after the owner is asked
    const tree = new Set(git(root, "ls-tree", "--name-only", "-z", main, "--", `${dir}/`).split("\0").map((f) => f.slice(dir.length + 1)));
    const blob = (f) => spawnSync("git", ["show", `${main}:${dir}/${f}`], { cwd: root, env, maxBuffer: 1 << 28 }).stdout ?? Buffer.alloc(0); // raw bytes: git() trims and decodes
    const list = [];
    for (const b of Array.isArray(brought) ? brought : []) {
      const folder = folderOf(b?.kind), p = folder && note(b.name) ? join(folder, b.name) : null;
      if (!p || !lstatSync(p, { throwIfNoEntry: false })?.isFile()) continue;
      list.push({ n: list.length + 1, kind: b.kind, name: b.name, p, ...(sha256(readFileSync(p)) !== b.sha256 && { changed: true }),
        ...(![...tree].some((f) => f.replace(/(-old)+\.md$/, ".md") === b.name && sha256(blob(f)) === b.sha256) && { noCopy: true }) });
    }
    return list;
  };

  try {
    if (argv[0] === "unseen") { // the notes main lacks, which the run will not see (the worktree starts from main), and the runs close did not finish
      const no = linked(realpathSync(root));
      if (no) return no;
      const list = (...a) => git(root, ...a, "-z", "--", dir).split("\0").filter(Boolean);
      const diff = (...a) => list("diff", "--name-only", "--no-renames", "--diff-filter=d", ...a);
      // differs from main, and changed on this side since it left main (committed or not): a note main holds newer is not one main lacks
      const ours = new Set(diff("--merge-base", main));
      return out({ notes: [...diff(main).filter((f) => ours.has(f)), ...list("ls-files", "--others", "--exclude-standard")],
        unfinished: runs().map((w) => ({ branch: w.branch, worktree: w.path })),
        originals: originals().map(({ p, ...o }) => o) });
    }
    if (argv[0] === "forget") { // each original of unseen but those kept by number: unlink of one literal file, only when it is still the one copied
      const list = originals(), raw = arg(argv, "--keep"), keep = new Set(raw ? raw.split(",") : []), deleted = [], changed = [];
      const bad = [...keep].filter((k) => !list.some((o) => String(o.n) === k)); // a typo must not delete what the owner meant to keep
      if (bad.length) return { code: 2, stdout: `--keep takes the numbers of the listed originals (1 to ${list.length}), not: ${bad.join(",")}\n` };
      for (const o of list) {
        if (keep.has(String(o.n))) continue;
        if (o.changed) changed.push(o.name); else { unlinkSync(o.p); deleted.push(o.name); }
      }
      return out({ deleted, changed });
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
      const bad = linked(worktree); // main's own tree could hold a link
      if (bad) { git(root, "worktree", "remove", "--force", worktree); git(root, "branch", "-q", "-D", branch); return bad; }
      const memory = join(worktree, dir), state = join(memory, "dream.json"), dirOut = arg(argv, "--out"), names = [], recs = [];
      mkdirSync(memory, { recursive: true });
      let extract = null;
      try { extract = JSON.parse(readFileSync(join(dirOut, "extract.json"), "utf8")); } catch { /* no extract: nothing to bring */ }
      for (const { kind, files } of Array.isArray(extract?.outside) ? extract.outside : []) {
        const folder = folderOf(kind); // the folder is never the extract's word: only its names
        for (const f of folder && Array.isArray(files) ? files : []) {
          if (!note(f) || !lstatSync(join(folder, f), { throwIfNoEntry: false })?.isFile()) continue;
          const buf = readFileSync(join(folder, f)), sum = sha256(buf);
          let name = f; // a name taken by another text gets -old; the same text is already there
          for (let at = lstatSync(join(memory, name), { throwIfNoEntry: false }); at; at = lstatSync(join(memory, name), { throwIfNoEntry: false })) {
            if (at.isFile() && sha256(readFileSync(join(memory, name))) === sum) break;
            name = name.replace(/\.md$/, "-old.md");
          }
          if (!lstatSync(join(memory, name), { throwIfNoEntry: false })) { writeFileSync(join(memory, name), buf); names.push(name); }
          recs.push({ kind, name: f, sha256: sum });
        }
      }
      if (recs.length && mine(worktree, state)) {
        const prev = existsSync(state) ? JSON.parse(readFileSync(state, "utf8")) : {};
        writeFileSync(state, JSON.stringify({ ...prev, brought: [...(prev.brought ?? []).filter((b) => !recs.some((r) => r.kind === b.kind && r.name === b.name)), ...recs] }, null, 2) + "\n");
      }
      return out({ branch, worktree, memory, main, ...(dirOut && { brought: names }) });
    }
    if (argv[0] === "close") {
      const given = arg(argv, "--worktree"), dirOut = arg(argv, "--out"), notRead = (arg(argv, "--not-read") ?? "").split(","), remove = (arg(argv, "--remove") ?? "").split(",").filter(Boolean);
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
      mkdirSync(memory, { recursive: true });
      // a removal is a note directly in the memory folder, by its bare name or by a path that resolves to it, and no link: any other entry is skipped, never removed, and named in skipped
      const take = remove.map((n) => [n, basename(resolve(memory, n)), dirname(resolve(memory, n)) === memory]).map(([n, b, inside]) => ({ n, b, ok: inside && note(b) && mine(real, join(memory, b)) }));
      const gone = take.filter((t) => t.ok).map((t) => t.b), skipped = take.filter((t) => !t.ok).map((t) => t.n);
      for (const n of gone) {
        const p = join(memory, n);
        if (lstatSync(p, { throwIfNoEntry: false }) && tryGit(real, "rm", "-q", "-f", "--", `${dir}/${n}`).code !== 0) unlinkSync(p); // untracked: not in git's index
      }
      const prev = existsSync(state) && mine(real, state) ? JSON.parse(readFileSync(state, "utf8")) : {}, { sessions = {} } = prev;

      if (mine(real, state)) writeFileSync(state, JSON.stringify({ ...prev, sessions: { ...sessions, ...Object.fromEntries(read.filter((s) => !notRead.includes(s.name)).map((s) => [s.name, s.lines])) }, ran: new Date().toISOString() }, null, 2) + "\n");

      const date = /^dream\/(\d{4}-\d\d-\d\d)/.exec(branch)?.[1] ?? branch;
      git(real, "reset", "-q"); // the index holds only what this close stages
      git(real, "add", "-A", "--", dir);
      // what the commit takes against main: sure shapes are masked, the lines the run wrote that the wide rule would touch are named in look; a binary file cannot be
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
        if (file === `${dir}/dream.json`) continue; // close's own: the sessions' names
        // only the lines the run added or changed: the added side of each hunk of the staged diff against main, with no context
        const added = new Set(), hunks = git(real, "diff", "--cached", "--merge-base", main, "--no-ext-diff", "--no-textconv", "--no-color", "-U0", "--", file);
        for (const [, from, n = "1"] of hunks.matchAll(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm)) for (let i = 0; i < Number(n); i++) added.add(Number(from) + i);
        look.push(...suspect(text).filter((line) => added.has(line)).map((line) => ({ file, line })));
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
      let refused = null;
      if (tryGit(real, "diff", "--cached", "--quiet").code === 1) {
        const c = tryGit(real, "commit", "-q", "-m", `dream: ${date}`); // the project's commit hooks run: never --no-verify
        if (c.code !== 0) refused = c.err || c.out || "git commit failed";
      }
      // what the commit leaves out: a change not staged or a file not tracked; after a refused commit, the staged notes are not in it
      const outside = git(real, "status", "--porcelain", "-z", "--untracked-files=all", "--no-renames").split("\0").filter((l) => l && l[1] !== " ").map((l) => l.slice(3));
      if (refused !== null) return { code: 1, stdout: JSON.stringify({ refused, worktree: real, masked, look, outside, skipped,
        finish: `the commit was refused; the notes stay staged in ${real}: commit there, then run git worktree remove --force ${real}, which removes the files of outside with it; the extract's folder ${dirOut} stays: drop --out removes it` }) + "\n" };

      const st = git(root, "diff", "--no-renames", "--name-status", "-z", `${main}...${branch}`, "--", dir).split("\0").filter(Boolean); // -z: a name outside ASCII comes unquoted
      const notes = st.filter((_, i) => i % 2 === 0).map((x, i) => [x, st[2 * i + 1]]).filter(([, f]) => f.endsWith(".md") && f.slice(dir.length + 1) !== "MEMORY.md" && !f.slice(dir.length + 1).includes("/"));
      const count = (s) => notes.filter(([x]) => x === s).length;

      let lines;
      try {
        const ctx = makeCtx(root, config), head = git(real, "rev-parse", "HEAD");
        const range = rangeFor(ctx, { base: git(root, "merge-base", main, head), head });
        lines = stale.run(range, ctx).lines;
      } catch (e) { lines = [`could not run: ${e.message}`]; }

      const left = dropOut(dirOut, [realpathSync(root), real]);
      git(root, "worktree", "remove", "--force", real); // the changes outside the memory folder are named above and go with it
      return out({ branch, added: count("A"), changed: count("M"), removed: count("D"), skipped, masked, look, stale: lines, outside, left,
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
    return { code: 2, stdout: "usage: branch.mjs unseen | forget [--keep <n,n>] | open [--out <folder>] | close --worktree <folder> --out <folder> [--not-read <name,name>] [--remove <name,name>] | drop [--worktree <folder>] [--out <folder>]\n" };
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
