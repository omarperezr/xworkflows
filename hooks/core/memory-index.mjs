const unquote = (v) => v.trim().replace(/^(["'])(.*)\1$/, "$2");

export function header(text) {
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  const start = lines.findIndex((l) => l.trim() === "---");
  const end = start < 0 ? -1 : lines.findIndex((l, i) => i > start && l.trim() === "---");
  const out = {};
  if (end < 0) return out;
  let under = false;
  for (const l of lines.slice(start + 1, end)) {
    const m = /^(\s*)([A-Za-z_-]+):\s*(.*)$/.exec(l);
    if (!m) continue;
    const [, indent, key, value] = m;
    if (!indent) under = key === "metadata";
    if (!indent && ["name", "description", "type"].includes(key)) out[key] = unquote(value);
    else if (indent && under && key === "type") out.type ??= unquote(value);
  }
  return out;
}

export function buildIndex(files) {
  const lines = [...files].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0)).map(({ file, text }) => {
    const h = header(text);
    return `- [${h.name || file.replace(/\.md$/, "")}](${file}) — ${h.description ?? ""}`;
  });
  return lines.length ? lines.join("\n") + "\n" : "";
}
