import { test } from "node:test";
import assert from "node:assert/strict";
import { utimesSync } from "node:fs";
import { join } from "node:path";
import { makeRepo } from "../test/helpers/repo.mjs";
import * as mod from "./graph-current.mjs";

const CODE = { paths: { code: ["src/"] } };
const at = (repo, rel, iso) => { const t = new Date(iso); utimesSync(join(repo.root, rel), t, t); };

test("declares its needs and mainOnly", () => {
  assert.deepEqual(mod.needs, ["paths.code"]);
  assert.equal(mod.mainOnly, true);
});

test("a project with no code passes without a graph", async () => {
  const repo = makeRepo({ config: { paths: { code: [] } } });
  try { assert.deepEqual(await repo.run(mod), { ok: true, lines: [] }); } finally { repo.cleanup(); }
});

test("a graph newer than the head commit passes", async () => {
  const repo = makeRepo({ config: CODE });
  try {
    repo.commit("code", { files: { "src/a.js": "1" } });
    repo.write("graphify-out/graph.json", "{}");
    at(repo, "graphify-out/graph.json", "2026-06-01T00:00:00Z");
    assert.deepEqual(await repo.run(mod), { ok: true, lines: [] });
  } finally { repo.cleanup(); }
});

test("a graph older than the head commit fails with the fix", async () => {
  const repo = makeRepo({ config: CODE });
  try {
    repo.commit("code", { files: { "src/a.js": "1" } });
    repo.write("graphify-out/graph.json", "{}");
    at(repo, "graphify-out/graph.json", "2025-06-01T00:00:00Z");
    const r = await repo.run(mod);
    assert.equal(r.ok, false);
    assert.match(r.lines[0], /older/);
    assert.match(r.lines.join("\n"), /run `graphify update \.`/);
  } finally { repo.cleanup(); }
});

test("a missing graph fails", async () => {
  const repo = makeRepo({ config: CODE });
  try {
    const r = await repo.run(mod);
    assert.equal(r.ok, false);
    assert.match(r.lines[0], /missing/);
    assert.match(r.lines.join("\n"), /graphify update/);
  } finally { repo.cleanup(); }
});

test("the folder and command come from config", async () => {
  const repo = makeRepo({ config: { ...CODE, lookup: { index: { command: "mapper query", folder: "maps" } } } });
  try {
    repo.write("graphify-out/graph.json", "{}");
    at(repo, "graphify-out/graph.json", "2026-06-01T00:00:00Z");
    const r = await repo.run(mod);
    assert.equal(r.ok, false);
    assert.match(r.lines.join("\n"), /maps\/graph\.json/);
    assert.match(r.lines.join("\n"), /run `mapper update \.`/);
    repo.write("maps/graph.json", "{}");
    at(repo, "maps/graph.json", "2026-06-01T00:00:00Z");
    assert.equal((await repo.run(mod)).ok, true);
  } finally { repo.cleanup(); }
});
