import { statSync } from "node:fs";
import { join } from "node:path";

export const mainOnly = true;
export const needs = ["paths.code"];

export function run(range, ctx) {
  if (ctx.config.paths.code.length === 0) return { ok: true, lines: [] };
  const { command, folder } = ctx.config.lookup.index;
  const rel = `${folder}/graph.json`;
  const fix = `run \`${command.split(/\s+/)[0]} update .\``;
  let mtime;
  try { mtime = statSync(join(ctx.root, rel)).mtimeMs; } catch { return { ok: false, lines: [`${rel} is missing`, fix] }; }
  const head = Number(ctx.git("log", "-1", "--format=%ct", range.head));
  if (mtime < head * 1000) return { ok: false, lines: [`${rel} is older than the pushed head's commit`, fix] };
  return { ok: true, lines: [] };
}
