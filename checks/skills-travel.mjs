import { pluginOn } from "../hooks/core/config.mjs";

// A bare skill name named by an agent must be committed; a plugin:skill name travels by the plugin enabled in the committed settings.
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

// null: the file is in the tree but cannot be read as settings; the declared plugin names otherwise
function enabled(range, ctx, inTree) {
  if (!inTree.has(".claude/settings.json")) return new Set();
  try {
    const all = JSON.parse(ctx.show(range.head, ".claude/settings.json"));
    if (!all || typeof all !== "object" || Array.isArray(all)) return null;
    const plugins = all.enabledPlugins ?? {};
    if (!plugins || typeof plugins !== "object" || Array.isArray(plugins)) return null;
    return new Set(Object.entries(plugins).filter(([k, v]) => pluginOn(k, v)).map(([k]) => k.split("@")[0]));
  } catch { return null; }
}

export function run(range, ctx) {
  const tree = ctx.git("ls-tree", "-r", "-z", "--name-only", range.head).split("\0").filter(Boolean);
  const inTree = new Set(tree);
  const bad = [];
  let on;
  for (const f of tree.filter((p) => /^\.(?:claude|agents)\/agents\/[^/]+\.md$/.test(p))) {
    const dir = f.startsWith(".agents/") ? ".agents" : ".claude";
    const agent = f.slice(f.lastIndexOf("/") + 1, -3);
    for (const n of skillNames(ctx.show(range.head, f) ?? "")) {
      if (/\s/.test(n)) bad.push(`${agent}: "${n}" is more than one name; give each skill its own list item`);
      else if (n.includes(":")) {
        on ??= enabled(range, ctx, inTree);
        if (!on) return { ok: false, cannotRun: true, lines: [".claude/settings.json at the pushed commit cannot be read as settings with an enabledPlugins object"] };
        if (!on.has(n.split(":")[0])) bad.push(`${agent}: ${n} is not enabled; declare the plugin as "<plugin>@<marketplace>": true in enabledPlugins of .claude/settings.json`);
      } else {
        const skillPath = dir === ".agents" && n.startsWith(".agents/skills/") ? `${n}/SKILL.md`
          : dir === ".agents" && n.startsWith("skills/") ? `.agents/${n}/SKILL.md`
          : `${dir}/skills/${n}/SKILL.md`;
        if (!inTree.has(skillPath)) bad.push(`${agent}: ${n} is not in git; commit ${skillPath}`);
      }
    }
  }
  return bad.length ? { ok: false, lines: [`${bad.length} agent skill(s) do not travel with the repository`, ...bad] } : { ok: true, lines: [] };
}
