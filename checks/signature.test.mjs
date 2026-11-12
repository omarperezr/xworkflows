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

test("Co-Authored-By naming an AI tool fails", async () => {
  const r = await check((repo) => repo.commit("add thing", { body: "Co-Authored-By: Claude Sonnet <noreply@example.org>" }));
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
    repo.commit("first bad", { body: "Co-Authored-By: Copilot <c@example.org>" });
    repo.commit("second bad", { body: "Generated with Codex" });
  });
  assert.equal(r.ok, false);
  const t = r.lines.join("\n");
  assert.match(t, /first bad/);
  assert.match(t, /second bad/);
});
