import { test } from "node:test";
import assert from "node:assert/strict";
import { makeRepo } from "../test/helpers/repo.mjs";
import * as mod from "./signature.mjs";

async function check(setup) {
  const repo = makeRepo();
  try {
    const base = repo.git("rev-parse", "HEAD");
    setup(repo);
    return await repo.run(mod, { base });
  } finally { repo.cleanup(); }
}
test("human commit passes", async () => {
  const r = await check((repo) => repo.commit("add thing", { body: "plain body" }));
  assert.deepEqual(r, { ok: true, lines: [] });
});

test("human Signed-off-by passes; look-alike words pass", async () => {
  const r = await check((repo) => repo.commit("add thing", {
    body: "Signed-off-by: Ana Lopez <ana@example.org>\nCo-Authored-By: Cursory Geminis Jr <cg@geminis.example.org>\nGenerated without help",
  }));
  assert.equal(r.ok, true);
});

test("a person who shares a tool's name, with a person's e-mail, passes", async () => {
  const r = await check((repo) => repo.commit("add thing", { body: "Co-Authored-By: Claude Martin <claude@example.org>\nCo-Authored-By: Aider Khan <aider.khan@example.org>" }));
  assert.deepEqual(r, { ok: true, lines: [] });
});

test("a co-author with a tool's e-mail fails whatever its name", async () => {
  const r = await check((repo) => repo.commit("add thing", { body: "Co-Authored-By: Ana Lopez <noreply@anthropic.com>" }));
  assert.equal(r.ok, false);
  assert.match(r.lines[0], /AI/);
});

test("Co-Authored-By naming an AI tool fails", async () => {
  const r = await check((repo) => repo.commit("add thing", { body: "Co-Authored-By: Claude Sonnet <noreply@anthropic.com>" }));
  assert.equal(r.ok, false);
  assert.match(r.lines[0], /AI/);
  assert.match(r.lines.join("\n"), /add thing/);
});

test("Generated with line fails", async () => {
  const r = await check((repo) => repo.commit("add thing", { body: "Generated with [Aider](https://aider.chat)" }));
  assert.equal(r.ok, false);
});

test("author email at a vendor domain fails", async () => {
  const r = await check((repo) => {
    repo.write("a.txt", "a");
    repo.git("add", "-A");
    repo.git("-c", "user.email=ok@example.org", "commit", "-q", "-m", "by bot", "--author=Bot <bot@mail.anthropic.com>");
  });
  assert.equal(r.ok, false);
});

test("committer email at a vendor domain fails", async () => {
  const r = await check((repo) => {
    repo.write("a.txt", "a");
    repo.git("add", "-A");
    repo.git("-c", "user.email=agent@openai.com", "commit", "-q", "-m", "by committer", "--author=Ok <ok@example.org>");
  });
  assert.equal(r.ok, false);
});

test("two bad commits are both listed", async () => {
  const r = await check((repo) => {
    repo.commit("first bad", { body: "Co-Authored-By: Copilot <c@github.com>\nCo-Authored-By: Copilot <12345+copilot@users.noreply.github.com>" });
    repo.commit("second bad", { body: "Generated with Codex" });
  });
  assert.equal(r.ok, false);
  const t = r.lines.join("\n");
  assert.match(t, /first bad/);
  assert.match(t, /second bad/);
});

test("trailer with no blank line, and a subject-only Generated with, fail", async () => {
  let r = await check((repo) => repo.commit("feat: x\nCo-Authored-By: Claude <noreply@anthropic.com>"));
  assert.equal(r.ok, false);
  r = await check((repo) => repo.commit("Generated with Claude Code"));
  assert.equal(r.ok, false);
});

test("GitHub bot identities at users.noreply.github.com fail; a human there passes", async () => {
  const by = (author) => check((repo) => {
    repo.write("a.txt", "a");
    repo.git("add", "-A");
    repo.git("-c", "user.email=ok@example.org", "commit", "-q", "-m", "by bot", `--author=${author}`);
  });
  assert.equal((await by("claude[bot] <209825114+claude[bot]@users.noreply.github.com>")).ok, false);
  assert.equal((await by("Copilot <198982749+Copilot@users.noreply.github.com>")).ok, false);
  assert.equal((await by("Ana <1234+ana-lopez@users.noreply.github.com>")).ok, true);
});

test("prose with 'generated with' mid-line passes; emoji-prefixed line fails", async () => {
  let r = await check((repo) => repo.commit("fix rows", { body: "The rows are generated with the cursor at the end." }));
  assert.equal(r.ok, true);
  r = await check((repo) => repo.commit("x", { body: "🤖 Generated with [Claude Code](https://claude.com/claude-code)" }));
  assert.equal(r.ok, false);
});
