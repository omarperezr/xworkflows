import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { markFrom, markFile } from "./core/marks.mjs";

const [tool, hook] = process.argv.slice(2);
const env = process.env;
const defaults = { owner: "the owner", paths: { specs: "docs/superpowers/specs", plans: "docs/superpowers/plans" } };
const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } };
let adapter;
let input;
let out = { stdout: "", exitCode: 0 };

try {
  if (!/^[a-z-]+$/.test(tool) || !/^[a-z-]+$/.test(hook)) throw new Error("bad tool or hook name");
  adapter = await import(`./adapters/${tool}.mjs`);
  const core = await import(`./core/${hook}.mjs`);
  input = JSON.parse(readFileSync(0, "utf8"));
  const ev = adapter.normalize(input, env);
  const stateDir = env.XWORKFLOWS_STATE_DIR ?? tmpdir();
  if (env.XWORKFLOWS_FREE) {
    process.stderr.write(`xworkflows: ${hook} skipped by XWORKFLOWS_FREE\n`);
    out = adapter.answer({ decision: "allow" });
  } else {
    if (ev.kind === "shell" && markFrom(ev.command)) writeFileSync(markFile(stateDir, markFrom(ev.command), ev.session), "");
    const user = JSON.parse(read(join(ev.root, ".xworkflows", "config.json")) ?? "{}");
    const config = { ...defaults, ...user, paths: { ...defaults.paths, ...user.paths } };
    const skillName = (id) => { // the installed name: a renamed skill (xwf-grill) differs from its id
      try { const k = Object.entries(JSON.parse(read(join(ev.root, ".xworkflows", "installed.json"))).renamed ?? {}).find(([, v]) => v === id); return k ? k[0].split("/").pop() : id; } catch { return id; }
    };
    const runCheck = (args) => { // the gate decides what a failed check means
      const r = spawnSync(process.execPath, [join(ev.root, ".claude", "skills", skillName("adapt"), "research.mjs"), "check", ...args], { cwd: ev.root, encoding: "utf8", timeout: 10000 });
      return { code: r.error ? null : r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
    };
    const ctx = { config, runCheck, readFile: read, skillName, marked: (skill) => existsSync(markFile(stateDir, skill, ev.session)) };
    out = adapter.answer(core.decide(ev, ctx));
  }
} catch (e) {
  process.stderr.write(`xworkflows: ${hook} let the call through: ${e.message}\n`);
  out = adapter?.answer({ decision: "allow" }) ?? out;
}

process.stdout.write(out.stdout);
process.exitCode = out.exitCode;

if (env.XWORKFLOWS_RECORD && input) {
  try {
    const home = homedir();
    if ("user_email" in input) input.user_email = null; // Cursor's email is never stored
    const text = JSON.stringify({ label: "recorded", input, output: out }, null, 2)
      .replaceAll(home, "/home/user").replaceAll(home.replace(/[\\/]/g, "-"), "-home-user"); // absolute stand-in, so replayed paths still resolve
    mkdirSync(env.XWORKFLOWS_RECORD, { recursive: true });
    writeFileSync(join(env.XWORKFLOWS_RECORD, `${tool}-${Date.now()}.json`), text);
  } catch (e) {
    process.stderr.write(`xworkflows: record failed: ${e.message}\n`);
  }
}
