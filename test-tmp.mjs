// One temp folder per test process: every temp folder of a test lives under it, and it is removed when the process ends,
// whether the tests pass, fail or throw, or the process is killed (SIGINT, SIGTERM, SIGKILL): a watcher outside it waits for its end.
// Children inherit the folder as TMPDIR.
import { mkdtempSync, rmSync, realpathSync, chmodSync, readdirSync } from "node:fs";
import { tmpdir as sysTmp } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const root = realpathSync(mkdtempSync(join(sysTmp(), "xwf-tests-")));
// a folder a test left without permissions (mode 000, 555) makes rmSync throw: the owner gets the bits back and it is tried once more.
// Self-contained: the watcher gets its source.
const clean = (fs, dir) => {
  const open = (d) => { try { fs.chmodSync(d, 0o700); for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) open(d + "/" + e.name); } catch {} };
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { open(dir); fs.rmSync(dir, { recursive: true, force: true }); }
};
process.on("exit", () => clean({ rmSync, chmodSync, readdirSync }, root));
// a signal handler would wait for the end of a synchronous test; the default kills at once, and the watcher cleans after
const watch = `const clean = ${clean}; const [dir, pid] = process.argv.slice(1); const t = setInterval(() => { try { process.kill(+pid, 0); } catch { clean(require("node:fs"), dir); clearInterval(t); } }, 200);`;
spawn(process.execPath, ["-e", watch, root, String(process.pid)], { detached: true, stdio: "ignore" }).unref();
process.env.TMPDIR = root;

export const tmpdir = () => root;
