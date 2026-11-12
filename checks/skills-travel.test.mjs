import { test } from "node:test";
import assert from "node:assert/strict";
import { makeRepo } from "../test/helpers/repo.mjs";
import * as mod from "./skills-travel.mjs";

const agent = (header, body = "text\n") => `---\nname: a\n${header}---\n${body}`;
const skill = (n) => ({ [`.claude/skills/${n}/SKILL.md`]: "x\n" });

async function check(files, extra) {
  const repo = makeRepo();
  try {
    repo.commit("add", { files });
    if (extra) repo.write(extra[0], extra[1]);
    return await repo.run(mod, { base: null });
  } finally { repo.cleanup?.(); }
}

test("no agents folder passes", async () => {
  assert.deepEqual(await check({ "a.txt": "x" }), { ok: true, lines: [] });
});

test("skills all in git pass (list form)", async () => {
  const r = await check({ ".claude/agents/a.md": agent("skills:\n  - one\n  - two\n"), ...skill("one"), ...skill("two") });
  assert.equal(r.ok, true);
});

test("missing skill fails naming agent and skill", async () => {
  const r = await check({ ".claude/agents/a.md": agent("skills:\n  - one\n  - gone\n"), ...skill("one") });
  assert.equal(r.ok, false);
  assert.match(r.lines.join("\n"), /a/);
  assert.match(r.lines.join("\n"), /gone/);
  assert.doesNotMatch(r.lines.join("\n"), /\bone\b/);
});

test("plugin:name fails", async () => {
  const r = await check({ ".claude/agents/a.md": agent("skills:\n  - plug:thing\n") });
  assert.equal(r.ok, false);
  assert.match(r.lines.join("\n"), /plug:thing/);
});

test("skill on disk but not committed fails", async () => {
  const r = await check({ ".claude/agents/a.md": agent("skills:\n  - one\n") }, [".claude/skills/one/SKILL.md", "x"]);
  assert.equal(r.ok, false);
});

test("inline forms are read", async () => {
  for (const h of ["skills: one, gone\n", "skills: [one, gone]\n", "skills: [\"one\", 'gone']\n"]) {
    const r = await check({ ".claude/agents/a.md": agent(h), ...skill("one") });
    assert.equal(r.ok, false, h);
    assert.match(r.lines.join("\n"), /gone/);
  }
  const ok = await check({ ".claude/agents/a.md": agent("skills: [one]\n"), ...skill("one") });
  assert.equal(ok.ok, true);
});

test("agent without skills passes; list ends at the next key", async () => {
  assert.equal((await check({ ".claude/agents/a.md": agent("tools: x\n") })).ok, true);
  const r = await check({ ".claude/agents/a.md": agent("skills:\n  - one\ntools:\n  - other\n"), ...skill("one") });
  assert.equal(r.ok, true);
});

test("skills: in the body is ignored", async () => {
  const r = await check({ ".claude/agents/a.md": agent("tools: x\n", "skills:\n  - gone\nskills: gone\n") });
  assert.equal(r.ok, true);
});

test("list at the key's own indentation is read", async () => {
  const r = await check({ ".claude/agents/a.md": agent("skills:\n- one\n- gone\n"), ...skill("one") });
  assert.equal(r.ok, false);
  assert.match(r.lines.join("\n"), /gone/);
});

test("agent files with accented letters or spaces are read", async () => {
  for (const name of ["revisión", "my agent"]) {
    const r = await check({ [`.claude/agents/${name}.md`]: agent("skills:\n  - gone\n") });
    assert.equal(r.ok, false, name);
    assert.match(r.lines.join("\n"), /gone/);
  }
});
