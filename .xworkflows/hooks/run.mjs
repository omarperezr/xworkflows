import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
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
