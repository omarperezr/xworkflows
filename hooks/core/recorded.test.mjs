// Replays payloads recorded in real Claude Code sessions (hooks/fixtures/claude/*-real.json) through the adapter and each hook.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalize, answer } from "../adapters/claude.mjs";
import { DEFAULTS, merge } from "./config.mjs";
import * as orchestrator from "./orchestrator.mjs";
import * as handback from "./handback.mjs";
import * as memory from "./memory.mjs";
import * as modes from "./modes.mjs";

const load = (name) => JSON.parse(readFileSync(new URL(`../fixtures/claude/${name}.json`, import.meta.url), "utf8"));
const config = merge(DEFAULTS, { paths: { code: ["src"] } });
// the project of the recording: an approved summary, no stage mark, the product's agents installed
const ctx = (over = {}) => ({ config, home: "/home/user", now: () => 0, marked: () => false, state: () => null, save() {}, git: () => "h1", exists: () => true, listDir: () => [], mtime: () => null,
  readFile: (p) => (p.endsWith(".xworkflows/summary.md") ? "---\nstatus: approved\ndate: 2026-11-12\n---\n" : null), writeFile: () => true, exec: () => ({ code: 1, out: "", err: "" }), background() {}, ...over });
const replay = (name, hook, c = ctx()) => {
  const f = load(name);
  const ev = normalize(f.input, {});
  return { f, ev, out: answer(hook.decide(ev, c), ev) };
};
const denied = (stdout) => stdout !== "" && JSON.parse(stdout).hookSpecificOutput.permissionDecision === "deny";

test("recorded: orchestrator denies an Agent call before the stage mark", () => {
  const { f, ev, out } = replay("orchestrator-agent-deny-real", orchestrator);
  assert.deepEqual([ev.kind, ev.agent, ev.isSubagent], ["agent", "explore", false]);
  assert.ok(denied(f.output.stdout) && denied(out.stdout));
});

test("recorded: handback denies an implementer's report without its keys, and allows it with them", () => {
  const a = replay("handback-deny-real", handback);
  assert.deepEqual([a.ev.kind, a.ev.agent, a.ev.message, a.ev.isSubagent], ["handback", "implement", "done", true]);
  assert.ok(denied(a.f.output.stdout) && denied(a.out.stdout));
  const b = replay("handback-allow-real", handback);
  assert.equal(b.f.output.stdout, "");
  assert.equal(b.out.stdout, "");
});

for (const kind of ["user", "feedback"]) test(`recorded: memory denies a type: ${kind} write into the repository`, () => {
  const { f, ev, out } = replay(`memory-${kind}-deny-real`, memory);
  assert.equal(ev.kind, "write");
  assert.match(ev.writes[0].content, new RegExp(`type: ${kind}`));
  assert.ok(denied(f.output.stdout) && denied(out.stdout));
});

test("recorded: the session-start output of modes is the owner's profile, and nothing else", () => {
  const f = load("session-start-modes-real");
  const said = JSON.parse(f.output.stdout).hookSpecificOutput.additionalContext;
  const profile = said.split("\n").slice(1).join("\n");
  const { ev, out } = replay("session-start-modes-real", modes, ctx({ readFile: (p) => (p === "/home/user/.xworkflows/owner.md" ? profile : null) }));
  assert.deepEqual([ev.event, ev.source], ["sessionStart", "startup"]);
  assert.equal(out.stdout, f.output.stdout);
});
