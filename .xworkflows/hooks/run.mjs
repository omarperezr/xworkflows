import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, dirname, sep } from "node:path";
import { markFrom, markFile } from "./core/marks.mjs";
import { load } from "./core/config.mjs";
import { makeCtx } from "./core/ctx.mjs";

const [tool, hook] = process.argv.slice(2);
const env = process.env;
const log = (stateDir, session, kind, reason) => { // a log failure never changes the answer
  try { appendFileSync(join(stateDir, "xwf-hooks.log"), `${new Date().toISOString()} ${session} ${hook} ${kind} ${String(reason).replace(/[\r\n]+/g, " ")}\n`); } catch { /* shortcut: lost on reboot */ }
};
let adapter;
let input;
let root;
const unrecorded = () => { if (hook === "adapt-record") process.stderr.write("xworkflows: adapt-record: the answers are not being recorded\n"); };
let out = { stdout: "", exitCode: 0 };

try {
  if (!/^[a-z-]+$/.test(tool) || !/^[a-z-]+$/.test(hook)) throw new Error("bad tool or hook name");
  adapter = await import(`./adapters/${tool}.mjs`);
  const core = await import(`./core/${hook}.mjs`);
  input = JSON.parse(readFileSync(0, "utf8"));
  const ev = adapter.normalize(input, env);
  root = ev.root;
  const stateDir = env.XWORKFLOWS_STATE_DIR ?? tmpdir();
  if (env.XWORKFLOWS_FREE) {
    process.stderr.write(`xworkflows: ${hook} skipped by XWORKFLOWS_FREE\n`);
    unrecorded();
    out = adapter.answer({ decision: "allow" }, ev);
    log(stateDir, ev.session, "free", ev.tool ?? ev.event);
  } else {
    if (ev.kind === "shell" && markFrom(ev.command)) writeFileSync(markFile(stateDir, markFrom(ev.command), ev.session), "");
    const ctx = makeCtx(ev, { env, config: load(ev.root), stateDir });
    const decision = core.decide(ev, ctx);
    out = adapter.answer(decision, ev);
    if (decision.decision === "deny" && ev.event === "preTool") log(stateDir, ev.session, "deny", decision.reason);
  }
} catch (e) {
  process.stderr.write(`xworkflows: ${hook} let the call through: ${e.message}\n`);
  unrecorded();
  out = adapter?.answer({ decision: "allow" }) ?? out;
}

process.stdout.write(out.stdout);
process.exitCode = out.exitCode;

if (env.XWORKFLOWS_RECORD && input) {
  try {
    const home = homedir();
    if ("user_email" in input) input.user_email = null; // Cursor's email is never stored
    const between = root && dirname(root).startsWith(home + sep) ? dirname(root) : home; // the folders between home and the project name its owner too
    const dash = (p) => p.replace(/[\\/]/g, "-");
    const lit = (p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const hide = (text, spellings, boundary, to) => spellings.reduce((t, p) => t.replace(new RegExp(lit(p) + boundary, "g"), to), text); // only a whole folder name: a lookalike stays
    const slash = String.raw`(?![\w.-])`; // anything but a character that goes on a file name; a lookalike stays
    const rel = between.slice(home.length); // "" when the project sits straight under home
    const json = JSON.stringify({ label: "recorded", input, output: out }, null, 2); // absolute stand-in, so replayed paths still resolve
    const text = hide(hide(hide(json, rel ? [`~${rel}`, `$HOME${rel}`, `\${HOME}${rel}`] : [], slash, "/home/user"), [between, home], slash, "/home/user"), [dash(between), dash(home)], String.raw`(?![\w.])`, "-home-user");
    mkdirSync(env.XWORKFLOWS_RECORD, { recursive: true });
    writeFileSync(join(env.XWORKFLOWS_RECORD, `${tool}-${Date.now()}.json`), text);
  } catch (e) {
    process.stderr.write(`xworkflows: record failed: ${e.message}\n`);
  }
}
