// One temp folder per test process: every temp folder of a test lives under it, and it is removed when the process ends,
// whether the tests pass, fail or throw, or the process is killed (SIGINT, SIGTERM, SIGKILL): a watcher outside it waits for its end.
// Children inherit the folder as TMPDIR.
import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir as sysTmp } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const root = realpathSync(mkdtempSync(join(sysTmp(), "xwf-tests-")));
process.on("exit", () => rmSync(root, { recursive: true, force: true }));
// a signal handler would wait for the end of a synchronous test; the default kills at once, and the watcher cleans after
const watch = 'const [dir, pid] = process.argv.slice(1); const t = setInterval(() => { try { process.kill(+pid, 0); } catch { require("node:fs").rmSync(dir, { recursive: true, force: true }); clearInterval(t); } }, 200);';
spawn(process.execPath, ["-e", watch, root, String(process.pid)], { detached: true, stdio: "ignore" }).unref();
process.env.TMPDIR = root;

export const tmpdir = () => root;
