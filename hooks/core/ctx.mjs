import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, lstatSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, resolve, sep } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { markFile } from "./marks.mjs";

const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } };

// the line that refuses a write whose real folder leaves the repository, unless it is, or lies under, a real path of memory.outside; null when it may go
export function outsideLine(root, file, outside = []) {
  try {
    let dir = dirname(resolve(root, file));
    while (!existsSync(dir)) dir = dirname(dir);
    const real = realpathSync(dir), top = realpathSync(root);
    const under = (base) => real === base || real.startsWith(base.endsWith(sep) ? base : base + sep);
    if (under(top) || outside.some((o) => under(resolve(o)))) return null;
    return `${file} is written outside the repository (${real}): ask the owner; put the notes inside the project (replace the link with a folder), or have the owner list ${real} under memory.outside in .xworkflows/config.json`;
  } catch { return null; }
}

export function makeCtx(ev, { env, config, stateDir }) {
  const at = (p) => resolve(ev.root, p);
  const installed = (dir, id) => { // the installed name of piece id under dir: a renamed one (xwf-grill) differs from its id
    try { const k = Object.entries(JSON.parse(read(join(ev.root, ".xworkflows", "installed.json"))).renamed ?? {}).find(([f, v]) => v === id && f.startsWith(dir)); return k ? k[0].split("/").pop().replace(/\.md$/, "") : id; } catch { return id; }
  };
  const skillName = (id) => installed(".claude/skills/", id);
  const agentName = (id) => installed(".claude/agents/", id);
  const exec = (cmd, args, { timeout = 8000, input } = {}) => {
    const r = spawnSync(cmd, args, { cwd: ev.root, encoding: "utf8", timeout, input, env });
    return { code: r.error ? null : r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
  };
  const stateFile = (key) => join(stateDir, `xwf-${key}-${ev.session.replace(/[^A-Za-z0-9_-]/g, "_")}`);
  return {
    config,
    readFile: read,
    skillName,
    agentName,
    marked: (skill) => existsSync(markFile(stateDir, skill, ev.session)),
    runCheck: (args) => { // the gate decides what a failed check means
      const r = spawnSync(process.execPath, [join(ev.root, ".claude", "skills", skillName("adapt"), "research.mjs"), "check", ...args], { cwd: ev.root, encoding: "utf8", timeout: 10000 });
      return { code: r.error ? null : r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
    },
    state: (key) => read(stateFile(key)),
    save: (key, value) => { try { writeFileSync(stateFile(key), String(value)); } catch { /* the rule just does not hold next call */ } },
    now: () => Date.now(),
    home: homedir(),
    exists: (p) => existsSync(at(p)),
    mtime: (p) => { try { return statSync(at(p)).mtimeMs; } catch { return null; } },
    listDir: (p) => { try { return readdirSync(at(p)); } catch { return []; } },
    writeFile: (p, text) => { // never through a symlink: it could lead outside the tree
      try { if (lstatSync(at(p)).isSymbolicLink()) return false; } catch { /* absent: fine */ }
      if (outsideLine(ev.root, p, config?.memory?.outside)) return false;
      mkdirSync(dirname(at(p)), { recursive: true }); writeFileSync(at(p), text); return true;
    },
    git: (...args) => { const r = exec("git", args, { timeout: 5000 }); return r.code === 0 ? r.out.trim() : null; },
    exec,
    background: (cmd, args) => { if (env?.XWORKFLOWS_DRY) return; try { spawn(cmd, args, { cwd: ev.root, env, detached: true, stdio: "ignore" }).on("error", () => {}).unref(); } catch { /* never throws */ } },
  };
}
