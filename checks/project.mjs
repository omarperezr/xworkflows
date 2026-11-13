import { spawn } from "node:child_process";

export const needs = ["checks.project"];

// runs `sh -c cmd` in the root in its own process group; past the limit the whole group is killed
// shortcut: POSIX only (process groups, sh); Windows is not covered yet, cover it when the project does
export function runLimited(cmd, ctx) {
  const env = { ...process.env };
  for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) delete env[k];
  return new Promise((res) => {
    const child = spawn("sh", ["-c", cmd], { cwd: ctx.root, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "", timedOut = false;
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, "SIGKILL"); } catch {} }, ctx.config.checks.timeoutMinutes * 60000);
    child.on("error", (e) => { clearTimeout(timer); res({ code: null, out, err: e.message, timedOut }); });
    child.on("close", (code) => { clearTimeout(timer); res({ code, out, err, timedOut }); });
  });
}

export const cutLine = (name, cmd, ctx) =>
  `${name} was cut after ${ctx.config.checks.timeoutMinutes} minutes (checks.timeoutMinutes); run this by hand in the project's root to see what it does: ${cmd}`;

export async function run(range, ctx) {
  const list = ctx.config.checks.project;
  if (!Array.isArray(list) || list.some((e) => typeof e?.name !== "string" || typeof e.run !== "string")) {
    return { ok: false, cannotRun: true, lines: ["checks.project is not a list of { name, run }"] };
  }
  if (!list.length) return { ok: true, lines: [] };
  const fix = `check out ${range.ref ?? range.head.slice(0, 7)} or commit first`; // the commands test the working tree
  if (ctx.git("rev-parse", "HEAD") !== range.head || ctx.git("status", "--porcelain", "--untracked-files=no") !== "") {
    return { ok: false, lines: [fix] };
  }
  const lines = [];
  for (const { name, run: cmd } of list) {
    const r = await runLimited(`{ ${cmd}\n} 2>&1`, ctx); // one pipe keeps stdout and stderr in order
    if (r.timedOut) return { ok: false, lines: [...lines, cutLine(name, cmd, ctx)] };
    if (r.code === null) return { ok: false, cannotRun: true, lines: [`${name} did not run to the end: ${r.err.trim() || "killed"}`] };
    if (r.code !== 0) lines.push(`${name} failed (exit ${r.code})`, ...r.out.replace(/\n$/, "").split("\n").slice(-20));
  }
  return { ok: !lines.length, lines };
}
