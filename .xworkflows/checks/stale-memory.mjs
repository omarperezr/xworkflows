import { memoryDir } from "../hooks/core/config.mjs";

const NOT_PATH = /[\s*<>$]|:\/\//;

function looksLikePath(s) {
  return s.includes("/") && !NOT_PATH.test(s) && !/^[/~-]/.test(s);
}

export function run(range, ctx) {
  const d = memoryDir(ctx.config.memory?.dir);
  if (d === null) return { ok: false, cannotRun: true, lines: ["memory.dir must be a folder name"] };
  const prefix = `${d}/`;
  const entries = ctx.git("ls-tree", "-r", "-z", range.head).split("\0").filter(Boolean).map((e) => ({ mode: e.slice(0, 6), name: e.slice(e.indexOf("\t") + 1) }));
  const files = entries.map((e) => e.name);
  const exists = new Set(files);
  for (const f of files) for (let i = f.indexOf("/"); i >= 0; i = f.indexOf("/", i + 1)) exists.add(f.slice(0, i));
  const missing = [];
  for (const file of entries.filter((e) => e.mode !== "160000" && e.name.startsWith(prefix) && e.name.endsWith(".md")).map((e) => e.name)) {
    let fence = null;
    ctx.git("cat-file", "blob", `${range.head}:${file}`).split("\n").forEach((text, i) => {
      const f = text.match(/^ {0,3}(`{3,}(?!.*`)|~{3,})/)?.[1]; // a longer fence closes only on a fence as long
      if (fence) { if (f && f[0] === fence[0] && f.length >= fence.length) fence = null; return; }
      if (f) { fence = f; return; }
      for (const [, span] of text.matchAll(/(?<!`)`([^`]+)`(?!`)/g)) {
        if (!looksLikePath(span)) continue;
        const path = span.replace(/:\d+(-\d+)?$/, "").replace(/\/$/, "").replace(/^(\.\/)+/, "");
        if (path && !exists.has(path)) missing.push(`${file}:${i + 1}: ${path}`);
      }
    });
  }
  if (!missing.length) return { ok: true, lines: [] };
  return { ok: false, lines: [`${missing.length} path(s) in memory do not exist at head`, ...missing, "correct the memory or delete it"] };
}
