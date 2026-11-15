import { memoryFolder } from "../hooks/core/config.mjs";
import { buildIndex } from "../hooks/core/memory-index.mjs";

export function run(range, ctx) {
  const { dir: d, line } = memoryFolder(ctx.config, ctx.root, () => null); // the commit is read, not the disk: no link to judge
  if (line) return { ok: false, cannotRun: true, lines: [line] };
  // a real git failure throws; an absent folder prints nothing
  const names = ctx.git("ls-tree", "-z", range.head, "--", d + "/").split("\0").filter(Boolean)
    .map((e) => /^\d+ blob \w+\t(.*)$/s.exec(e)?.[1]?.slice(d.length + 1)).filter((n) => n?.endsWith(".md") && !n.includes("/") && n !== "MEMORY.md");
  const files = names.map((file) => ({ file, text: ctx.show(range.head, `${d}/${file}`) ?? "" }));
  const want = buildIndex(files);
  const have = ctx.show(range.head, `${d}/MEMORY.md`);
  const fix = "run `node .xworkflows/checks/run.mjs index` and commit";
  if (have === null && !files.length) return { ok: true, lines: [] };
  if (have === null) return { ok: false, lines: [`${d}/MEMORY.md is missing`, fix] };
  if (have === want) return { ok: true, lines: [] };
  const a = have.split("\n"), b = want.split("\n");
  const i = a.findIndex((l, n) => l !== b[n]);
  const at = i < 0 ? a.length : i;
  return { ok: false, lines: [`${d}/MEMORY.md differs from the generated index at line ${at + 1}`,
    `committed: ${a[at] ?? "(end of file)"}`, `generated: ${b[at] ?? "(end of file)"}`, fix] };
}
