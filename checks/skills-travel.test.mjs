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

const settings = (o) => ({ ".claude/settings.json": typeof o === "string" ? o : JSON.stringify(o) });
const plugAgent = { ".claude/agents/a.md": agent("skills:\n  - plug:thing\n  - one\n"), ...skill("one") };

test("plugin:skill passes when the committed settings enable the plugin, a bare name still must be committed", async () => {
  const ok = await check({ ...plugAgent, ...settings({ enabledPlugins: { "plug@market": true } }) });
  assert.deepEqual(ok, { ok: true, lines: [] });
  const r = await check({ ".claude/agents/a.md": agent("skills:\n  - plug:thing\n  - gone\n"), ...settings({ enabledPlugins: { "plug@market": true } }) });
  assert.equal(r.ok, false);
  assert.match(r.lines.join("\n"), /gone/);
  assert.doesNotMatch(r.lines.join("\n"), /plug:thing/);
});

test("plugin:skill fails when the plugin is not enabled in the committed settings, and the line names the key form", async () => {
  for (const files of [{}, settings({ enabledPlugins: { "other@market": true } }), settings({ enabledPlugins: { "plug@market": false } }), settings({}), settings({ enabledPlugins: { plug: true } })]) {
    const r = await check({ ...plugAgent, ...files });
    assert.equal(r.ok, false);
    assert.notEqual(r.cannotRun, true);
    assert.match(r.lines.join("\n"), /plug:thing/);
    assert.match(r.lines.join("\n"), /<plugin>@<marketplace>/);
  }
});

test("a settings file that cannot be read is not a pass", async () => {
  for (const text of ["{not json", "[]", JSON.stringify({ enabledPlugins: [] })]) {
    const r = await check({ ...plugAgent, ...settings(text) });
    assert.equal(r.ok, false, text);
    assert.equal(r.cannotRun, true, text);
  }
});

test("a bare skill needs no settings file, even a broken one", async () => {
  const r = await check({ ".claude/agents/a.md": agent("skills:\n  - one\n"), ...skill("one"), ...settings("{not json") });
  assert.equal(r.ok, true);
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
  for (const name of ["revïew", "my agent"]) {
    const r = await check({ [`.claude/agents/${name}.md`]: agent("skills:\n  - gone\n") });
    assert.equal(r.ok, false, name);
    assert.match(r.lines.join("\n"), /gone/);
  }
});

test("one list item holding two names fails, plugin:skill form or not", async () => {
  for (const item of ["plug:a plug:b", "one two"]) {
    const r = await check({ ".claude/agents/a.md": agent(`skills:\n  - ${item}\n`), ...skill("one"), ...skill("two") });
    assert.equal(r.ok, false, item);
    assert.match(r.lines.join("\n"), new RegExp(item));
  }
});

test("Antigravity .agents/agents/*.md skills resolve against .agents/skills/", async () => {
  const ok = await check({ ".agents/agents/a.md": agent("skills:\n  - tdd\n  - skills/ponytail-review\n"), ".agents/skills/tdd/SKILL.md": "x\n", ".agents/skills/ponytail-review/SKILL.md": "x\n" });
  assert.deepEqual(ok, { ok: true, lines: [] });
  const bad = await check({ ".agents/agents/a.md": agent("skills:\n  - tdd\n  - missing\n"), ".agents/skills/tdd/SKILL.md": "x\n" });
  assert.equal(bad.ok, false);
  assert.match(bad.lines.join("\n"), /\.agents\/skills\/missing\/SKILL\.md/);
});
