import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, extname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { KINDS, scan } from "./scan.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../..");
const FIXTURE = join(REPO, "test/fixtures/mechanisms");
const KEYS = ["values", "snap", "srvw", "delta", "idem", "txn", "access", "batch", "domain", "compat", "conc", "input"];
const git = (cwd, ...a) => execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.invalid", ...a], { cwd, stdio: "pipe" });
const tmp = () => mkdtempSync(join(tmpdir(), "scan-"));
const put = (d, p, t) => { mkdirSync(dirname(join(d, p)), { recursive: true }); writeFileSync(join(d, p), t); };
function commit(d) { git(d, "init", "-q"); git(d, "add", "-A"); git(d, "commit", "-q", "-m", "x"); }
function fixture() { const d = tmp(); cpSync(FIXTURE, d, { recursive: true }); commit(d); return d; }
const allHits = (s) => KEYS.flatMap((k) => s.kinds[k].hits);

test("finds every kind in the fixture", () => {
  const s = scan(fixture());
  assert.deepEqual(Object.keys(s.kinds), KEYS);
  for (const k of KEYS) assert.ok(s.kinds[k].total >= 1, k);
  assert.ok(allHits(s).every((h) => !h.file.startsWith("lookalike-")));
});

test("checks never counted as a kind", () => {
  const s = scan(fixture());
  assert.ok(s.checks.includes("scripts/check-sample.mjs"));
  assert.ok(s.checks.includes(".github/workflows/ci.yml"));
  assert.ok(allHits(s).every((h) => !s.checks.includes(h.file)));
});

test("scan is byte-identical twice", () => {
  const d = fixture();
  const run = () => { execFileSync("node", [join(HERE, "scan.mjs"), d]); return readFileSync(join(d, ".xworkflows/scan.json")); };
  const a = run();
  assert.deepEqual(run(), a);
  assert.ok(a.toString().endsWith("}\n"));
});

test("CLI prints one line per kind", () => {
  const out = execFileSync("node", [join(HERE, "scan.mjs"), fixture()], { encoding: "utf8" }).trim().split("\n");
  assert.deepEqual(out.map((l) => l.split(":")[0]), KEYS);
  assert.match(out[0], /^values: \d+$/);
});

test("hits capped at 30 with the true total", () => {
  const d = tmp();
  put(d, "many.js", "const o = ids.map(async (i) => q(i));\n".repeat(40));
  commit(d);
  const b = scan(d).kinds.batch;
  assert.equal(b.hits.length, 30);
  assert.equal(b.total, 40);
});

test("scan works without git history", () => {
  const d = tmp();
  put(d, "b.js", "x.toFixed(2);\n");
  put(d, "a.js", "x.toFixed(2);\n");
  const s = scan(d);
  assert.deepEqual(s.kinds.values.hits.map((h) => h.file), ["a.js", "b.js"]);
});

test("unknown language gives zero hits, valid output", () => {
  const d = tmp();
  put(d, "main.go", "x.toFixed(2)\n");
  execFileSync("node", [join(HERE, "scan.mjs"), d]);
  const j = JSON.parse(readFileSync(join(d, ".xworkflows/scan.json"), "utf8"));
  for (const k of KEYS) assert.equal(j.kinds[k].total, 0);
});

test("binary files skipped", () => {
  const d = tmp();
  writeFileSync(join(d, "bin.js"), Buffer.from("x.toFixed(2)\n\0\n"));
  assert.equal(scan(d).kinds.values.total, 0);
});

test("graphifyignore written by the scan", () => {
  const d = tmp();
  put(d, "dist/a.js", "x.toFixed(2);\n");
  put(d, "gen.js", "// @generated\nx.toFixed(2);\n");
  put(d, "keep.js", "x.toFixed(2);\n");
  put(d, ".graphifyignore", "# mine\nowner/\n");
  commit(d);
  const s = scan(d);
  assert.deepEqual(s.kinds.values.hits.map((h) => h.file), ["keep.js"]);
  const lines = readFileSync(join(d, ".graphifyignore"), "utf8").split("\n");
  assert.deepEqual(lines.slice(0, 2), ["# mine", "owner/"]);
  assert.ok(lines.includes("dist/") && lines.includes("gen.js"));
});

test("existing graphifyignore lines applied", () => {
  const d = tmp();
  put(d, "gen/a.js", "x.toFixed(2);\n");
  put(d, "b.js", "x.toFixed(2);\n");
  put(d, ".graphifyignore", "gen/\n");
  commit(d);
  assert.deepEqual(scan(d).kinds.values.hits.map((h) => h.file), ["b.js"]);
});

test("installed files excluded", () => {
  const d = tmp();
  put(d, ".claude/skills/adapt/scan.mjs", "x.toFixed(2);\n");
  put(d, "b.js", "x.toFixed(2);\n");
  put(d, ".xworkflows/installed.json", JSON.stringify({ files: { ".claude/skills/adapt/scan.mjs": "h" }, created: [] }));
  commit(d);
  assert.deepEqual(scan(d).kinds.values.hits.map((h) => h.file), ["b.js"]);
});

test("fixture has one plant per kind in JS, Python and SQL", () => {
  const plants = readdirSync(FIXTURE).filter((f) => f.startsWith("plant-"));
  assert.deepEqual(plants.map((f) => f.split(/[-.]/)[1]).sort(), [...KEYS].sort());
  for (const e of [".js", ".py", ".sql"]) assert.ok(plants.filter((f) => extname(f) === e).length >= 2, e);
});

test("every signal has a matching example", () => {
  assert.deepEqual(KINDS.map((k) => k.key), KEYS);
  for (const k of KINDS) {
    assert.ok(k.signals.length >= 1, k.key);
    for (const s of k.signals) {
      assert.ok(s.re.test(s.example), `${k.key} example ${s.example}`);
      assert.ok(!s.re.test(s.counter), `${k.key} counter ${s.counter}`);
    }
  }
});

test("fixtures are never packed", () => {
  const m = JSON.parse(readFileSync(join(REPO, "manifest.json"), "utf8"));
  for (const p of m.pieces) assert.ok(Object.keys(p.files).every((f) => !f.startsWith("test/")), p.id);
  assert.ok(existsSync(FIXTURE));
});
