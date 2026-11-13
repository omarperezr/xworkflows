import { statSync } from "node:fs";
import { join } from "node:path";

export const mainOnly = true;
export const needs = ["paths.code"];

const WAIT_MS = 30000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mtimeOf = (path) => { try { return statSync(path).mtimeMs; } catch { return null; } };

export async function run(range, ctx) {
  if (ctx.config.paths.code.length === 0) return { ok: true, lines: [] };
  const { command, folder } = ctx.config.lookup.index;
  const rel = `${folder}/graph.json`;
  // graphify leaves graph.json untouched when the code's shape did not change, so the fix sets the time too
  const fix = `run \`${command.split(/\s+/)[0]} update . && touch -c ${rel}\``;
  const graph = join(ctx.root, rel);
  const head = Number(ctx.git("log", "-1", "--format=%ct", range.head)) * 1000;
  // the post-commit hook updates in the background and logs to .update.log: a log written after the commit means that update may still run, so wait for it
  const log = join(ctx.root, folder, ".update.log");
  const started = Date.now();
  while ((mtimeOf(graph) ?? 0) < head && (mtimeOf(log) ?? 0) >= head && Date.now() - started < WAIT_MS) await sleep(100);
  const mtime = mtimeOf(graph);
  if (mtime === null) return { ok: false, lines: [`${rel} is missing`, fix] };
  if (mtime < head) return { ok: false, lines: [`${rel} is older than the pushed head's commit`, fix] };
  return { ok: true, lines: [] };
}
