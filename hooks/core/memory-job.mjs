// The memory job, run detached by the memory hook: the project's own step, then qmd update, embed, cleanup, in series, under a lock.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync, appendFileSync, statSync, unlinkSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLenient } from "./config.mjs";

const STEP_MS = 30 * 60000; // the limit of the project's step

const real = (cmd, args, o) => {
  const r = spawnSync(cmd, args, { ...o, stdio: "ignore", killSignal: "SIGKILL", detached: true }); // its own process group
  const timedOut = r.error?.code === "ETIMEDOUT";
  if (timedOut) try { process.kill(-r.pid, "SIGKILL"); } catch { /* the group is gone */ } // the limit kills the whole step, not only its child
  return { code: r.status, timedOut };
};

// shortcut: a pid the system gave to another process after the job died looks alive, and its lock stays until that process ends; upgrade if a lock is ever seen stuck.
const alive = (pid) => { if (!Number.isInteger(pid) || pid < 1) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };

// shortcut: the embed model is any file named embed*.gguf in qmd's models folder, so a renamed model is missed; upgrade if qmd names models otherwise. Doctor uses this same test.
export const modelsIn = (dir) => { try { return readdirSync(dir).some((f) => /embed.*\.gguf$/i.test(f)); } catch { return false; } };

export function runJob({ root, config, stateDir, modelsDir, run = real, beforeMs = STEP_MS }) {
  const before = config.memory?.before;
  const index = config.memory?.index;
  const own = !index && [".qmd/index.yml", ".qmd/index.yaml"].some((f) => existsSync(join(root, f)));
  const id = createHash("sha1").update(`${root}\0${index ?? ""}`).digest("hex").slice(0, 12);
  const lock = join(stateDir, `xwf-memory-${id}.lock`);
  const log = (step, what) => { try { appendFileSync(join(stateDir, `xwf-memory-${id}.log`), `${new Date().toISOString()} ${step} ${what}\n`); } catch { /* a log failure stops nothing */ } };
  const mine = () => { try { return readFileSync(lock, "utf8") === String(process.pid); } catch { return false; } };
  const take = () => {
    try { writeFileSync(lock, String(process.pid), { flag: "wx" }); return true; } catch (e) { if (e.code !== "EEXIST") return false; }
    try { if (alive(Number(readFileSync(lock, "utf8")))) return false; unlinkSync(lock); writeFileSync(lock, String(process.pid), { flag: "wx" }); return true; } catch { return false; }
  };
  mkdirSync(stateDir, { recursive: true });
  if (!take()) return { ran: false };
  try {
    const step = (name, cmd, args, o) => {
      const r = run(cmd, args, { cwd: root, ...o });
      log(name, r.timedOut ? `timed out after ${o?.timeout} ms` : `exit ${r.code}`);
    };
    const listed = Array.isArray(before) && before.every((a) => typeof a === "string" && a);
    if (listed && before.length) step("before", before[0], before.slice(1), { timeout: beforeMs });
    else if (!listed && before !== undefined) log("before", "skipped: memory.before must be a list of texts");
    const qmd = (name) => step(name, "qmd", [...(index ? ["--index", index] : []), name]);
    qmd("update");
    if (own) { // embed and cleanup change the whole index: only the project's own
      if (modelsIn(modelsDir)) qmd("embed"); else log("embed", "skipped: models missing, run qmd pull");
      qmd("cleanup");
    }
  } finally { if (mine()) try { unlinkSync(lock); } catch { /* already gone */ } }
  return { ran: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const root = process.argv[2];
    const { config } = loadLenient(root);
    const cache = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
    runJob({ root, config, stateDir: process.env.XWORKFLOWS_STATE_DIR ?? tmpdir(), modelsDir: join(cache, "qmd", "models") });
  } catch { /* never an error on a session */ }
}
