import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

test('skill copies match the source', () => {
  for (const dir of ['sandbox/.claude/skills/grill', 'sandbox/.agents/skills/grill'])
    for (const f of ['SKILL.md', 'LICENSE', 'SOURCE.md'])
      assert.equal(read(`${dir}/${f}`), read(`skills/grill/${f}`), `${dir}/${f}`);
});

test('mark script copy matches', () => {
  assert.equal(read('sandbox/.xworkflows/mark.mjs'), read('hooks/mark.mjs'));
});

test('skill marks itself first', () => {
  const [, front, body] = read('skills/grill/SKILL.md').split(/^---\n/m);
  assert.match(front, /^name: grill$/m);
  assert.ok(body.split('\n').find((l) => l.trim()).includes('node .xworkflows/mark.mjs grill'));
});

test('hook configs parse and call the runner', () => {
  const cfgs = [
    ['sandbox/.claude/settings.json', 'claude', 'Write|Edit|MultiEdit|Bash'],
    ['sandbox/.codex/hooks.json', 'codex', 'Bash|apply_patch'],
    ['sandbox/.cursor/hooks.json', 'cursor', 'Shell|Write'],
    ['sandbox/.gemini/settings.json', 'gemini', 'write_file|replace|run_shell_command'],
  ];
  for (const [p, tool, matcher] of cfgs) {
    const text = read(p);
    JSON.parse(text);
    assert.ok(text.includes(`hooks/run.mjs\\" ${tool} design-first`), p);
    assert.ok(text.includes(`"matcher": "${matcher}"`), p);
  }
});

test('agents carry the same instructions', () => {
  const body = read('agents/explore.md').split(/^---\n/m)[2].trim();
  const md = ['sandbox/.claude/agents/explore.md', 'sandbox/.gemini/agents/explore.md'];
  for (const p of md) {
    const t = read(p);
    assert.ok(t.includes(body), p);
    assert.match(t, /^name: explore$/m);
    assert.match(t, /^description:/m);
  }
  const toml = read('sandbox/.codex/agents/explore.toml');
  assert.ok(toml.includes(`developer_instructions = """${body}"""`) || toml.includes(`developer_instructions = """\n${body}\n"""`));
  assert.match(toml, /^name = "explore"$/m);
  assert.match(toml, /^description = /m);
});
