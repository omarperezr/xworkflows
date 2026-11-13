import { lstatSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadConfig, missing } from "../hooks/core/config.mjs";
import { buildIndex } from "../hooks/core/memory-index.mjs";

export const TABLE = ["signature", "review-seal", "goal-cited", "pending", "fix-has-test", "change-size",
  "comment-ratio", "skills-travel", "patterns", "ratchet", "graph-current", "stale-memory", "index-current", "project"];
export const PACKS = ["lint", "semgrep", "trivy"];

const noNl = (s) => s.replace(/\n$/, "");
const isZero = (s) => /^0+$/.test(s);

export function makeCtx(root, config) {
  // git exports these inside hooks when pushing from a worktree; they would point every call at the wrong repository
  const env = { ...process.env };
  for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) delete env[k];
  const exec = (cmd, args, opts = {}) => {
    const r = spawnSync(cmd, args, { cwd: root, env, encoding: "utf8", maxBuffer: 1 << 28, ...opts });
    return { code: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
  };
  const tryGit = (...args) => { const r = exec("git", args); return { ...r, out: noNl(r.out) }; };
  const git = (...args) => {
    const r = tryGit(...args);
    if (r.code !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.err.trim()}`);
    return r.out;
  };
  const read = (rel) => { try { return readFileSync(join(root, rel), "utf8"); } catch { return null; } };
  const show = (rev, rel) => { const r = exec("git", ["show", `${rev}:${rel}`]); return r.code === 0 ? r.out : null; };
  return { root, config, git, tryGit, exec, read, show };
}

export function rangeFor(ctx, { base, head, ref = null, remote = null, manual = true }) {
  const diffBase = base ?? ctx.git("hash-object", "-t", "tree", "/dev/null");
  const list = base
    ? ctx.git("rev-list", "--reverse", `${base}..${head}`)
    : ctx.git("rev-list", "--reverse", head, "--not", remote ? `--remotes=${remote}` : "--remotes");
  return { base, diffBase, head, commits: list.split("\n").filter(Boolean), ref, remote,
    mainPush: ref === `refs/heads/${ctx.config.mainBranch}`, manual };
}

// after a full review the push judges only what came after the commit the newest review names; any doubt leaves the range as it is
function afterReview(ctx, range, print) {
  const dir = ctx.config.paths.reviews.replace(/\/+$/, "");
  const files = ctx.tryGit("ls-tree", "--name-only", range.head, "--", `${dir}/`).out.split("\n")
    .map((f) => [f, /^(\d{4}-\d\d-\d\d)-full-review(?:-(\d+))?\.md$/.exec(f.slice(dir.length + 1))])
    .filter(([, m]) => m).map(([f, m]) => [f, m[1], Number(m[2] ?? 1)])
    .sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : b[2] - a[2]));
  if (!files.length) return range;
  const sha = /^Reviewed commit: ([0-9a-f]{7,40})\s*$/m.exec(ctx.show(range.head, files[0][0]) ?? "")?.[1];
  const named = sha && ctx.tryGit("rev-parse", "--verify", "--quiet", `${sha}^{commit}`);
  if (!named || named.code !== 0 || !range.commits.includes(named.out)) return range;
  const later = new Set(ctx.git("rev-list", range.head, "--not", named.out).split("\n"));
  print(`xworkflows check: full review ${files[0][0].split("/").pop()} names ${named.out.slice(0, 7)}: the history up to it is not judged`);
  return { ...range, base: named.out, diffBase: named.out, commits: range.commits.filter((c) => later.has(c)) };
}

export async function main(argv, io = {}) {
  const { cwd = process.cwd(), stdin = "", print = console.log, load = (n) => import(`./${n}.mjs`) } = io;
  if (argv[0] === "index") {
    try {
      const top = makeCtx(cwd, null).tryGit("rev-parse", "--show-toplevel");
      if (top.code !== 0) throw new Error("not a git repository");
      const dir = join(top.out, loadConfig(top.out).memory.dir);
      const files = readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "MEMORY.md")
        .map((file) => ({ file, text: readFileSync(join(dir, file), "utf8") }));
      const target = join(dir, "MEMORY.md");
      if (lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`${target} is a symlink, not writing through it`);
      writeFileSync(target, buildIndex(files));
    } catch (e) {
      if (e.code !== "ENOENT") { print(`xworkflows check: ${e.message}`); return 2; }
    }
    return 0;
  }
  let ctx, only = null, ranges = [];
  try {
    let remote = null;
    const pos = [];
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === "--pre-push") remote = argv[++i] ?? (() => { throw new Error("--pre-push needs a remote"); })();
      else if (a === "--only") only = (argv[++i] ?? "").split(",");
      else if (a.startsWith("-")) throw new Error(`unknown flag ${a}`);
      else pos.push(a);
    }
    if (pos.length > 2 || (remote !== null && pos.length)) throw new Error(`unexpected argument ${pos.at(-1)}`);
    const top = makeCtx(cwd, null).tryGit("rev-parse", "--show-toplevel");
    if (top.code !== 0) throw new Error("not a git repository");
    ctx = makeCtx(top.out, loadConfig(top.out));
    const p = ctx.config.packs;
    if (p === null || typeof p !== "object" || Array.isArray(p)) throw new Error("packs in the config is not an object");
    const bad = only?.findIndex((n) => !TABLE.includes(n) && !PACKS.includes(n)) ?? -1; // an empty name is unknown too: "--only ," must not run nothing and pass
    if (bad >= 0) throw new Error(`unknown brake ${only[bad] || "(empty)"}`);
    const rev = (r) => {
      const x = ctx.tryGit("rev-parse", "--verify", "--quiet", `${r}^{commit}`);
      if (x.code !== 0) throw new Error(`cannot resolve ${r}`);
      return x.out;
    };
    const mergeBase = (head, other) => { const x = ctx.tryGit("merge-base", head, other); return x.code === 0 ? x.out : null; };
    const main = ctx.config.mainBranch;
    if (remote === null) {
      const head = rev(pos[1] ?? "HEAD");
      ranges = [afterReview(ctx, rangeFor(ctx, { head, base: pos[0] ? rev(pos[0]) : mergeBase(head, main) }), print)];
    } else {
      for (const line of stdin.split("\n")) {
        const [, local, ref, remoteSha] = line.trim().split(/\s+/);
        if (!local || isZero(local)) continue;
        const head = rev(local);
        let base = isZero(remoteSha) ? mergeBase(head, `${remote}/${main}`) : rev(remoteSha);
        // a first push to a remote with no branch yet has nothing to compare against: as in the reference, what is already written is not judged
        if (isZero(remoteSha) && base === null && !ctx.git("for-each-ref", "--count=1", `refs/remotes/${remote}`)) {
          base = head;
          print(`xworkflows check: first push to ${remote}: the history already written is not judged`);
        }
        ranges.push(afterReview(ctx, rangeFor(ctx, { head, base, ref, remote, manual: false }), print));
      }
    }
  } catch (e) {
    print(`xworkflows check: ${e.message}`);
    return 2;
  }

  let due = 0, failed = 0, cannot = false;
  const show = (name, first, lines) => {
    print(`${name}: ${first}`);
    for (const l of lines) print(`  ${l}`);
  };
  const couldNot = (name, reason) => { failed++; cannot = true; print(`${name}: could not run: ${reason}`); };
  for (const range of ranges) {
    const on = Object.keys(ctx.config.packs).filter((n) => !only || only.includes(n));
    const todo = [...TABLE.filter((n) => !only || only.includes(n)).map((n) => [n, n]),
      ...PACKS.filter((n) => on.includes(n)).map((n) => [n, `packs/${n}`]),
      ...on.filter((n) => !PACKS.includes(n)).map((n) => [n, null])];
    for (const n of only ?? []) if (PACKS.includes(n) && !(n in ctx.config.packs)) { due++; couldNot(n, "not on in packs"); }
    for (const [name, file] of todo) {
      if (file === null) { due++; couldNot(name, `not a check pack (known: ${PACKS.join(", ")})`); continue; }
      let mod;
      try { mod = await load(file); } catch (e) {
        due++;
        couldNot(name, e?.code === "ERR_MODULE_NOT_FOUND" ? `checks/${file}.mjs is missing, reinstall xworkflows` : String(e?.message ?? e));
        continue;
      }
      if (mod.mainOnly && !range.manual && !range.mainPush) continue;
      due++;
      let keys;
      try { keys = missing(ctx.config, [].concat(mod.needs ?? [])); } catch { couldNot(name, "its needs must be config key names"); continue; }
      if (keys.length) {
        failed++; cannot = true;
        for (const k of keys) print(`${name}: not configured: ${k}, run /adapt`);
        continue;
      }
      let r;
      try { r = await mod.run(range, ctx); } catch (e) { couldNot(name, String(e?.message ?? e)); continue; }
      if (!r || !Array.isArray(r.lines)) { couldNot(name, "it returned no { ok, lines }"); continue; }
      if (r.cannotRun) { failed++; cannot = true; show(name, `could not run: ${r.lines[0]}`, r.lines.slice(1)); }
      else if (!r.ok) { failed++; show(name, r.lines[0] ?? "failed", r.lines.slice(1)); }
      else for (const l of r.lines) print(`${name}: note: ${l}`);
    }
  }
  if (failed) print(`xworkflows check: ${failed} of ${due} failed`);
  return cannot ? 2 : failed ? 1 : 0;
}

const direct = (() => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (direct) {
  const argv = process.argv.slice(2);
  process.exitCode = await main(argv, { stdin: argv.includes("--pre-push") ? readFileSync(0, "utf8") : "" });
}
