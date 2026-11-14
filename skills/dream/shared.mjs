// The method's shared code, found from this file: the package root two folders up, or .xworkflows/ three up in a project.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function shared(rel) {
  const here = (p) => fileURLToPath(new URL(p, import.meta.url));
  const pkg = here(`../../${rel}`), proj = here(`../../../.xworkflows/${rel}`);
  const hit = [pkg, proj].find(existsSync);
  if (!hit) throw new Error(`shared code not found: ${pkg} or ${proj}`);
  return import(pathToFileURL(hit).href);
}
