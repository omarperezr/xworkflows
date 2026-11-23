// The method's shared code, found from this file: the package root two folders up, or .xworkflows/ three up in a project.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function shared(rel) {
  const here = (p) => fileURLToPath(new URL(p, import.meta.url));
  const pkg = here(`../../${rel}`), proj = here(`../../../.xworkflows/${rel}`);
  const hit = [pkg, proj].find(existsSync);
  if (!hit) throw new Error(`shared code not found: ${pkg} or ${proj}`);
  return import(pathToFileURL(hit).href);
}

// the folders outside the repository that hold memory notes: the default one of the session logs and the earlier one install recorded
export function outsideFolders(mem, root, home = homedir()) {
  const found = [["default", join(home, ".claude", "projects", root.replace(/[^a-zA-Z0-9]/g, "-"), "memory")]];
  try { found.push(["earlier", JSON.parse(readFileSync(join(root, ".xworkflows/local.json"), "utf8")).memory.earlierAutoDirectory]); } catch {}
  const seen = new Set([resolve(mem)]), out = [];
  for (const [kind, folder] of found) {
    if (typeof folder !== "string" || seen.has(resolve(folder))) continue;
    seen.add(resolve(folder));
    try {
      out.push({ kind, folder, files: readdirSync(folder).filter((f) => f.endsWith(".md") && f !== "MEMORY.md").sort() });
    } catch {}
  }
  return out;
}
