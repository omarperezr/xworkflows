import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { load } from "../../hooks/core/config.mjs";
import { makeCtx, rangeFor } from "../../checks/run.mjs";

const SAFE = ["-c", "user.name=test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main"];

export function makeRepo({ config, files } = {}) {
  const dirs = [];
  const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "xwf-repo-"))); dirs.push(d); return d; };
  const root = tmp();
  let tick = 0;
  const gitIn = (cwd, args, extra = {}) => {
    const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", ...extra };
    for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) delete env[k];
    return execFileSync("git", [...SAFE, ...args], { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).replace(/\n$/, "");
  };
  // a new date per commit keeps shas and order stable
  const dated = () => {
    const d = new Date(Date.UTC(2026, 0, 1, 0, tick++)).toISOString();
    return { GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d };
  };
  const git = (...args) => gitIn(root, args);
  const write = (rel, text) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  const writeAll = (map = {}) => { for (const [rel, text] of Object.entries(map)) write(rel, text); };
  const commit = (message, { files, body } = {}) => {
    writeAll(files);
    git("add", "-A");
    gitIn(root, ["commit", "--allow-empty", "-m", message, ...(body ? ["-m", body] : [])], dated());
    return git("rev-parse", "HEAD");
  };

  git("init", "-q");
  git("checkout", "-q", "-B", "main");
  if (config) write(".xworkflows/config.json", JSON.stringify(config));
  writeAll(files);
  const first = commit("first");

  return {
    root, git, write, commit,
    branch: (name) => { git("checkout", "-q", "-b", name); },
    checkout: (name) => { git("checkout", "-q", name); },
    merge(name, message) {
      gitIn(root, ["merge", "--no-ff", "-m", message, name], dated());
      return git("rev-parse", "HEAD");
    },
    remote() {
      const bare = tmp();
      gitIn(bare, ["init", "-q", "--bare"]);
      git("remote", "add", "origin", bare);
      return bare;
    },
    async run(mod, { base = first, head = git("rev-parse", "HEAD"), ref, remote, manual } = {}) {
      const ctx = makeCtx(root, load(root));
      return await mod.run(rangeFor(ctx, { base, head, ref, remote, manual }), ctx);
    },
    cleanup() { for (const d of dirs) rmSync(d, { recursive: true, force: true }); },
  };
}
