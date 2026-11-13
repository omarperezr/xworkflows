import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runFlow } from "./flow.mjs";

const made = [];
after(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "flow-")); made.push(d); return d; };
const setup = () => {
  const [home, repo, cwd, out] = [tmp(), tmp(), tmp(), join(tmp(), "out")];
  const lines = [];
  const deps = { home, repo, log: (l) => lines.push(l), err: (l) => lines.push(l) };
  const argv = (...more) => ["--cwd", cwd, "--prompt", "go", "--out", out, "--api-credits", ...more];
  return { home, repo, cwd, out, lines, deps, argv };
};
const spendOf = (repo) => join(repo, "docs", "proof", "private", "proof-spend.json");

test("flow answers each question with its first option, denies a write outside the folder, and records the session", async () => {
  const t = setup();
  let seen, denial;
  const query = async function* ({ prompt, options }) {
    seen = { prompt, cwd: options.cwd };
    const q = { header: "H", question: "Which?", options: [{ label: "first" }, { label: "second" }] };
    const r = await options.canUseTool("AskUserQuestion", { questions: [q] });
    assert.deepEqual(r.updatedInput.answers, { "Which?": "first" });
    denial = await options.canUseTool("Write", { file_path: "/etc/x" });
    const ok = await options.canUseTool("Write", { file_path: join(options.cwd, "a.md") });
    assert.equal(ok.behavior, "allow");
    yield { type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "adapt" } }, { type: "tool_use", name: "Bash", input: { command: "ls" } }] } };
    yield { type: "result", total_cost_usd: 1.5, result: "done", num_turns: 3 };
  };
  const code = await runFlow(t.argv(), { ...t.deps, query });
  assert.equal(code, 0);
  assert.deepEqual(seen, { prompt: "go", cwd: t.cwd });
  assert.equal(denial.behavior, "deny");
  const f = JSON.parse(readFileSync(join(t.out, "flow.json"), "utf8"));
  assert.equal(f.costUsd, 1.5);
  assert.deepEqual(f.asked.map((a) => a.answer), ["first"]);
  assert.deepEqual(f.events.map((e) => [e.tool, e.input]), [["Skill", "adapt"], ["Bash", "ls"]]);
  assert.match(t.lines.at(-1), /3 turns, 2 tool calls, 1 questions answered, recorded 1.50 USD, ledger total 1.50 USD/);
});

test("flow takes the harness's default ledger place when --spend-file is not given, and adds to it", async () => {
  const t = setup();
  const query = async function* () { yield { type: "result", total_cost_usd: 2, result: "done", num_turns: 1 }; };
  assert.equal(await runFlow(t.argv(), { ...t.deps, query }), 0);
  assert.equal(JSON.parse(readFileSync(spendOf(t.repo), "utf8")).totalUsd, 2);
  assert.equal(await runFlow(t.argv(), { ...t.deps, query }), 0);
  assert.equal(JSON.parse(readFileSync(spendOf(t.repo), "utf8")).totalUsd, 4);
  const own = join(tmp(), "mine.json");
  assert.equal(await runFlow(t.argv("--spend-file", own), { ...t.deps, query }), 0);
  assert.equal(JSON.parse(readFileSync(own, "utf8")).totalUsd, 2);
});

test("flow counts the cap when the run errors, and refuses to start without the credits flag or over the budget", async () => {
  const t = setup();
  const boom = async function* () { throw new Error("boom"); };
  assert.equal(await runFlow(t.argv("--max-usd", "3"), { ...t.deps, query: boom }), 0);
  assert.equal(JSON.parse(readFileSync(spendOf(t.repo), "utf8")).totalUsd, 3);
  let called = false;
  const never = async function* () { called = true; };
  const noFlag = t.argv().filter((a) => a !== "--api-credits");
  assert.equal(await runFlow(noFlag, { ...t.deps, query: never, env: { ANTHROPIC_API_KEY: "k" } }), 1);
  assert.equal(await runFlow(["--cwd", t.cwd], { ...t.deps, query: never }), 2);
  assert.equal(await runFlow(t.argv("--max-usd", "59"), { ...t.deps, query: never }), 2);
  assert.equal(called, false);
});

test("flow releases the owner profile lock when it ends", async () => {
  const t = setup();
  const query = async function* () { yield { type: "result", total_cost_usd: 0, result: "done", num_turns: 1 }; };
  await runFlow(t.argv(), { ...t.deps, query });
  assert.ok(!existsSync(join(t.home, ".xworkflows", "owner.md.proof-lock")));
});

test("flow refuses a cap that is not a positive number, with exit 2, before any model call or ledger write", async () => {
  for (const bad of ["6usd", "0", "-1", "abc"]) {
    const t = setup();
    let called = false;
    const never = async function* () { called = true; };
    assert.equal(await runFlow(t.argv("--max-usd", bad), { ...t.deps, query: never }), 2, `--max-usd ${bad}`);
    assert.equal(called, false, `--max-usd ${bad} started a run`);
    assert.equal(existsSync(spendOf(t.repo)), false, `--max-usd ${bad} wrote the ledger`);
  }
});

test("flow at start restores a profile backup an earlier killed run left behind", async () => {
  const t = setup();
  const dir = join(t.home, ".xworkflows");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "owner.md.proof-backup"), "REAL");
  writeFileSync(join(dir, "owner.md"), "NEWER");
  const query = async function* () { yield { type: "result", total_cost_usd: 0, result: "done", num_turns: 1 }; };
  await runFlow(t.argv(), { ...t.deps, query });
  assert.equal(readFileSync(join(dir, "owner.md"), "utf8"), "REAL");
});
