// A bare skill name named by an agent must be committed; a plugin:skill name travels by the plugin declaration in settings.
const clean = (s) => s.trim().replace(/^(["'])(.*)\1$/, "$2");

function skillNames(text) {
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  const open = lines.indexOf("---");
  const close = open < 0 ? -1 : lines.indexOf("---", open + 1);
  if (close < 0) return [];
  const names = [];
  let list = false;
  for (const l of lines.slice(open + 1, close)) {
    const key = /^skills:(.*)$/.exec(l);
    const item = list && /^[ \t]*-(.*)$/.exec(l);
    if (key) {
      const inline = key[1].trim().replace(/^\[(.*)\]$/, "$1");
      list = inline === "";
      if (!list) names.push(...inline.split(","));
    } else if (item) names.push(item[1]);
    else list = false;
  }
  return names.map(clean).filter(Boolean);
}

export function run(range, ctx) {
  const tree = ctx.git("ls-tree", "-r", "-z", "--name-only", range.head).split("\0").filter(Boolean);
  const inTree = new Set(tree);
  const bad = [];
  for (const f of tree.filter((p) => /^\.claude\/agents\/[^/]+\.md$/.test(p))) {
    const agent = f.slice(f.lastIndexOf("/") + 1, -3);
    for (const n of skillNames(ctx.show(range.head, f) ?? "")) {
      if (/\s/.test(n)) bad.push(`${agent}: "${n}" is more than one name; give each skill its own list item`);
      else if (!n.includes(":") && !inTree.has(`.claude/skills/${n}/SKILL.md`)) bad.push(`${agent}: ${n} is not in git; commit .claude/skills/${n}/SKILL.md`);
    }
  }
  return bad.length ? { ok: false, lines: [`${bad.length} agent skill(s) do not travel with the repository`, ...bad] } : { ok: true, lines: [] };
}
