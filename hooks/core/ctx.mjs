import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { markFile } from "./marks.mjs";

const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } };

export function makeCtx(ev, { env, config, stateDir }) {
  const at = (p) => resolve(ev.root, p);
  const skillName = (id) => { // the installed name: a renamed skill (xwf-grill) differs from its id
    try { const k = Object.entries(JSON.parse(read(join(ev.root, ".xworkflows", "installed.json"))).renamed ?? {}).find(([, v]) => v === id); return k ? k[0].split("/").pop() : id; } catch { return id; }
  };
  const exec = (cmd, args, { timeout = 8000, input } = {}) => {
    const r = spawnSync(cmd, args, { cwd: ev.root, encoding: "utf8", timeout, input, env });
    return { code: r.error ? null : r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
  };
  const stateFile = (key) => join(stateDir, `xwf-${key}-${ev.session.replace(/[^A-Za-z0-9_-]/g, "_")}`);
  return {
    config,
    readFile: read,
    skillName,
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
    writeFile: (p, text) => { mkdirSync(dirname(at(p)), { recursive: true }); writeFileSync(at(p), text); },
    git: (...args) => { const r = exec("git", args, { timeout: 5000 }); return r.code === 0 ? r.out.trim() : null; },
    exec,
    background: (cmd, args) => { try { spawn(cmd, args, { cwd: ev.root, env, detached: true, stdio: "ignore" }).on("error", () => {}).unref(); } catch { /* never throws */ } },
  };
}
