import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, symlinkSync, truncateSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, extname } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { KINDS, scan, proposeZones, sqlInventory } from "./scan.mjs";

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

test("hits capped at 30, 3 per file, with the true total and file count", () => {
  const d = tmp();
  put(d, "many.js", "const o = ids.map(async (i) => q(i));\n".repeat(50));
  for (let n = 0; n < 10; n++) put(d, `f${n}.js`, "const o = ids.map(async (i) => q(i));\n".repeat(5));
  commit(d);
  put(d, ".xworkflows/rules.json", JSON.stringify({ rules: [{ id: "R1", text: "x", file: "f9.js", line: 1, kinds: ["batch"] }] }));
  const run = () => scan(d).kinds.batch;
  const b = run();
  assert.equal(b.hits.length, 30);
  assert.equal(b.total, 100);
  assert.equal(b.files, 11);
  const per = {};
  for (const h of b.hits) per[h.file] = (per[h.file] || 0) + 1;
  assert.ok(Object.values(per).every((n) => n <= 3));
  assert.equal(b.hits[0].file, "f9.js");
  assert.deepEqual(run(), b);
});

test("scan works without git history", () => {
  const d = tmp();
  put(d, "b.js", "x.toFixed(2);\n");
  put(d, "a.js", "x.toFixed(2);\n");
  const s = scan(d);
  assert.deepEqual(s.kinds.values.hits.map((h) => h.file), ["a.js", "b.js"]);
});

test("unknown language gives zero hits, but a zone", () => {
  const d = tmp();
  put(d, "api/main.go", "x.toFixed(2)\n");
  execFileSync("node", [join(HERE, "scan.mjs"), d]);
  const j = JSON.parse(readFileSync(join(d, ".xworkflows/scan.json"), "utf8"));
  for (const k of KEYS) assert.equal(j.kinds[k].total, 0);
  assert.equal(j.zones.filter((q) => inZone(q, "api/main.go")).length, 1);
});

test("tsx screens land in a zone and their hits are found", () => {
  const d = tmp();
  const screen = "await db.from(\"orders\").insert({});\nids.map(async (i) => q(i));\n";
  for (const n of ["a", "b", "c"]) put(d, `src/screens/${n}.tsx`, screen.repeat(50));
  put(d, "src/lib/money.ts", "x.toFixed(2);\n");
  put(d, "api/main.go", "package main\n".repeat(100));
  commit(d);
  const s = scan(d);
  assert.ok(s.kinds.srvw.hits.some((h) => h.file === "src/screens/a.tsx"));
  assert.ok(s.kinds.batch.hits.some((h) => h.file === "src/screens/a.tsx"));
  for (const f of ["src/screens/a.tsx", "api/main.go"]) assert.equal(s.zones.filter((q) => inZone(q, f)).length, 1, f);
  for (const e of [".jsx", ".cjs", ".mts", ".cts"]) { const x = tmp(); put(x, `a${e}`, "x.toFixed(2);\n"); assert.equal(scan(x).kinds.values.total, 1, e); }
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

const L = (o) => Object.entries(o).map(([path, mb]) => ({ path, bytes: mb * 1e6 }));
const keysOf = (z) => z.map((x) => x.key);

test("zone rule splits, merges and bounds", () => {
  const a = proposeZones(L({ src: 60, "src/a": 35, "src/b": 25, db: 30, tools: 9, x: 1 }).map((e) => ({ ...e, bytes: e.bytes / 1e6 * 1000 })));
  for (const k of ["src-a", "src-b", "db", "tools"]) assert.ok(keysOf(a).includes(k), k);
  assert.ok(a.some((z) => z.paths.includes("x")));
  assert.ok(a.length >= 3 && a.length <= 6);
  const b = proposeZones(L({ big: 7, "big/a": 4, "big/b": 3, c: 8, d: 8, e: 8, f: 8 }));
  assert.ok(keysOf(b).includes("big-a") && keysOf(b).includes("big-b"));
  const c = proposeZones(L(Object.fromEntries("abcdefghi".split("").map((k) => [k, 10]))));
  assert.equal(c.length, 6);
  const d = proposeZones(L({ a: 30, "a/x": 20, "a/y": 10, b: 20 }));
  assert.equal(d.length, 3);
});

test("zone keys are valid", () => {
  const z = proposeZones(L({ "My App": 30, "my_app": 30, ".github": 10, "src/Core": 20, src: 20, "src/Core/": 1 }));
  assert.ok(z.every((x) => /^[a-z0-9-]+$/.test(x.key)));
  assert.equal(new Set(keysOf(z)).size, z.length);
  const all = z.flatMap((x) => x.paths);
  assert.equal(new Set(all).size, all.length);
});

const mig = () => ["001", "002"].map((n) => ({ path: `db/migrations/${n}.sql`, text: readFileSync(join(FIXTURE, `db/migrations/${n}.sql`), "utf8") }));

test("sql inventory keeps the last definition", () => {
  const t = sqlInventory(mig()).triggers;
  assert.deepEqual(t, [{ name: "account_touch on account", file: "db/migrations/002.sql", line: 2 }]);
});

test("sql inventory lists policies, security definer, uniques and checks", () => {
  const s = sqlInventory(mig());
  assert.deepEqual(s.policies.map((x) => x.file), ["db/migrations/001.sql"]);
  assert.match(s.policies[0].name, /owner reads/);
  assert.deepEqual(s.definers.map((x) => [x.name, x.line]), [["audit_log", 11]]);
  assert.deepEqual(s.uniques.map((x) => x.name), ["account_email_uq"]);
  assert.deepEqual(s.checks.map((x) => x.name), ["account_qty_ck"]);
});

test("scan wires zones and sql", () => {
  const s = scan(fixture());
  assert.ok(s.zones.length >= 1);
  assert.ok(s.sql.triggers.some((t) => t.name === "account_touch on account" && t.file.endsWith("002.sql")));
});

test("every spec 4.1 example signal exists", () => {
  const ex = { values: ["created_at at time zone 'utc'", "currency = 'EUR'"], conc: ["queue.consume(handle)", "version int not null"], compat: ["module.exports = { run };", "__version__ = \"1.2\""], input: ["if not request.user.is_authenticated:"] };
  for (const [k, xs] of Object.entries(ex)) for (const x of xs) assert.ok(KINDS.find((q) => q.key === k).signals.some((s) => s.re.test(x)), x);
  const dom = KINDS.find((q) => q.key === "domain").signals.find((s) => s.ext.includes(".md"));
  assert.ok(dom && dom.re.test("Tax rules by law"));
});

test("delta ignores plain counters", () => {
  const re = KINDS.find((k) => k.key === "delta").signals[0].re;
  for (const l of ["i = i + 1", "count += 1", "n = n - 1;"]) assert.ok(!re.test(l), l);
  for (const l of ["x.increment(1)", "F('stock') - 1", "stock = stock - :n", "set stock = stock - 1"]) assert.ok(re.test(l), l);
});

test("non-ASCII paths get their churn", () => {
  const d = tmp();
  put(d, "a.js", "x.toFixed(2);\n");
  put(d, "é.js", "x.toFixed(2);\n");
  commit(d);
  for (const n of [1, 2]) { put(d, "é.js", `x.toFixed(2);// ${n}\n`); git(d, "add", "é.js"); git(d, "commit", "-q", "-m", "y"); }
  assert.equal(scan(d).kinds.values.hits[0].file, "é.js");
});

test("hits ordered most-changed first", () => {
  const d = tmp();
  put(d, "a.js", "x.toFixed(2);\n");
  put(d, "b.js", "x.toFixed(2);\n");
  commit(d);
  for (const n of [1, 2]) { put(d, "b.js", `x.toFixed(2);// ${n}\n`); git(d, "add", "b.js"); git(d, "commit", "-q", "-m", "y"); }
  assert.deepEqual(scan(d).kinds.values.hits.map((h) => h.file), ["b.js", "a.js"]);
});

test("lockfiles and min files go to graphifyignore", () => {
  const d = tmp();
  put(d, "package-lock.json", "{}\n");
  put(d, "static/app.min.js", "x.toFixed(2);\n");
  put(d, "k.js", "x.toFixed(2);\n");
  commit(d);
  assert.deepEqual(scan(d).kinds.values.hits.map((h) => h.file), ["k.js"]);
  const l = readFileSync(join(d, ".graphifyignore"), "utf8").split("\n");
  assert.ok(l.includes("package-lock.json") && l.includes("static/app.min.js"));
});

test("checks recognise other CI and lint files", () => {
  const d = tmp();
  for (const p of [".gitlab-ci.yml", ".circleci/config.yml", "Jenkinsfile", ".pre-commit-config.yaml"]) put(d, p, "x.toFixed(2)\n");
  commit(d);
  assert.equal(scan(d).checks.length, 4);
});

const inZone = (z, f) => z.paths.some((p) => (p === "*" ? !f.includes("/") : p.endsWith("/*") ? f.startsWith(p.slice(0, -1)) && !f.slice(p.length - 1).includes("/") : f.startsWith(p + "/")));

test("every code file lands in exactly one zone", () => {
  const d = tmp();
  const big = "x.toFixed(2);\n".repeat(200);
  const files = ["src/index.js", "src/a/x.js", "src/b/y.js", "src/b/deep/z.js", "root.js", "db/m.sql", "tools/t.py"];
  for (const f of files) put(d, f, big);
  put(d, "src/a/more.js", big.repeat(3));
  put(d, "src/b/more.js", big.repeat(3));
  commit(d);
  const z = scan(d).zones;
  for (const f of [...files, "src/a/more.js", "src/b/more.js"]) assert.equal(z.filter((q) => inZone(q, f)).length, 1, f);
});

test("a flat repo gets a zone", () => {
  const d = tmp();
  for (const f of ["a.js", "b.js", "c.js"]) put(d, f, "x.toFixed(2);\n");
  commit(d);
  const z = scan(d).zones;
  assert.ok(z.length >= 1);
  assert.ok(["a.js", "b.js", "c.js"].every((f) => z.filter((q) => inZone(q, f)).length === 1));
});

test("docs and data do not make zones", () => {
  const d = tmp();
  put(d, "docs/guide.md", "words\n".repeat(50000));
  put(d, "data/x.json", "{}".repeat(50000));
  for (const f of ["src/a.js", "lib/b.js", "tools/c.js"]) put(d, f, "x.toFixed(2);\n");
  commit(d);
  const z = scan(d).zones;
  assert.ok(z.every((q) => q.paths.every((p) => !/^(docs|data)/.test(p))));
  assert.deepEqual(z.map((q) => q.key), ["lib", "src", "tools"]);
});

test("every spec 4.1 example category has a signal", () => {
  const table = {
    values: ["x.toFixed(2)", "round(x)", "Decimal(1)", "toCents(p)", "convertUnit(x)", "currency = 'EUR'", "created_at at time zone 'utc'"],
    snap: ["new.unit_price := p.price;", "price_at_sale numeric"],
    srvw: ["await db.rpc('x')", "create function make_item()", "db.from('t').insert({})"],
    delta: ["set x = x + 1", "x.increment(1)", "F('x') + 1"],
    idem: ["on conflict (id) do nothing", "idempotency_key", "request_id text unique", "enqueue(job)", "outbox"],
    txn: ["begin;", "db.transaction(fn)"],
    access: ["create policy p on t", "alter table t enable row level security;", "raise exception 'permission denied'", "require_auth()"],
    batch: ["xs.map(async (x) => f(x))", "for r in select 1 loop"],
    domain: ["TAX_RATE = 0.2"],
    compat: ["deprecated", "SCHEMA_VERSION = 3", "module.exports = { a }", "__version__ = \"1\"", "Update the CHANGELOG"],
    conc: ["select * from t for update", "pg_advisory_lock(1)", "mutex", "queue.consume(h)", "version int not null"],
    input: ["z.object({})", "validate(x)", "if not request.user.is_authenticated:"],
  };
  assert.deepEqual(Object.keys(table), KEYS);
  for (const [k, xs] of Object.entries(table)) for (const x of xs) assert.ok(KINDS.find((q) => q.key === k).signals.some((s) => s.re.test(x)), `${k}: ${x}`);
});

test("triggers are keyed by name and table; a definer clause stays with its statement", () => {
  const sql = [
    "create trigger set_updated_at before update on a for each row execute function f();",
    "create trigger set_updated_at before update on b for each row execute function f();",
    "create function f() returns int as $$ select 1 $$ language sql;",
    "alter function g() security definer;",
  ].join("\n");
  const r = sqlInventory([{ path: "m.sql", text: sql }]);
  assert.deepEqual(r.triggers.map((t) => t.name), ["set_updated_at on a", "set_updated_at on b"]);
  assert.deepEqual(r.definers.map((t) => t.name), ["g"]);
});

test("multi-line triggers are keyed per table; a definer after a body with a drop line is kept", () => {
  const sql = [
    "create trigger touch",
    "  before update on a",
    "  for each row execute function f();",
    "create trigger touch",
    "  before update on b",
    "  for each row execute function f();",
    "create function h() returns void as $fn$",
    "begin",
    "drop trigger if exists x on a;",
    "end $fn$ language plpgsql",
    "  security definer;",
  ].join("\n");
  const r = sqlInventory([{ path: "m.sql", text: sql }]);
  assert.deepEqual(r.triggers.map((t) => [t.name, t.line]), [["touch on a", 1], ["touch on b", 4]]);
  assert.deepEqual(r.definers.map((t) => [t.name, t.line]), [["h", 7]]);
});

test("hits from files named by a written rule come first", () => {
  const d = tmp();
  put(d, "a.js", "ids.map(async (i) => q(i));\n");
  put(d, "b.js", "ids.map(async (i) => q(i));\n");
  put(d, "c.js", "ids.map(async (i) => q(i));\n");
  commit(d);
  for (const n of [1, 2]) { put(d, "a.js", `ids.map(async (i) => q(i));// ${n}\n`); git(d, "add", "a.js"); git(d, "commit", "-q", "-m", "y"); }
  assert.deepEqual(scan(d).kinds.batch.hits.map((h) => h.file), ["a.js", "b.js", "c.js"]);
  put(d, ".xworkflows/rules.json", JSON.stringify({ rules: [
    { id: "R1", text: "Always batch.", file: "b.js", line: 1, kinds: ["batch"] },
    { id: "R2", text: "See c.js and docs/none.md for loops.", file: "README.md", line: 2, kinds: ["input"] },
    { id: "R3", text: "Batch work, see c.js.", file: "README.md", line: 3, kinds: ["batch"] },
  ] }));
  const k = scan(d).kinds;
  assert.deepEqual(k.batch.hits.map((h) => h.file), ["b.js", "c.js", "a.js"]);
  assert.deepEqual(k.batch.ruleFiles, ["README.md", "b.js", "c.js"]);
  assert.deepEqual(k.input.ruleFiles, ["README.md", "c.js"]);
  assert.deepEqual(k.values.ruleFiles, []);
});

test("signals need a mechanism-specific token", () => {
  const noise = {
    values: ["const value = price * 2", "// all times are UTC", "const currencyList = [];", "// set the time zone in the docs"],
    snap: ["new.updated_at := now();", "const x = new.target;"],
    srvw: ["create function helper() returns int", "db.from(\"t\").select(\"*\")"],
    delta: ["count += 1", "i = i + 1"],
    idem: ["on conflict (id) do update set a = 1", "queue.push(node)", "const q = queue.add(x);"],
    txn: ["begin", "// transaction ids are strings"],
    access: ["raise exception 'bad input';", "-- see the policy document"],
    batch: ["for (const x of xs) total += x;", "for (const x of xs) { await sleep(1); }"],
    domain: ["const legal = 1;", "This is the law of averages."],
    compat: ["const exports2 = 1;", "# the version of node we use"],
    conc: ["for update to authenticated", "stream.subscribe(render)", "const consumerCount = 1;"],
    input: ["const user = getUser();", "# validation is hard"],
  };
  const sig = (k, t) => KINDS.find((q) => q.key === k).signals.some((s) => s.re.test(t));
  for (const [k, ls] of Object.entries(noise)) for (const l of ls) assert.ok(!sig(k, l), `${k}: ${l}`);
});

test("test files never give kind hits", () => {
  const d = tmp();
  cpSync(FIXTURE, d, { recursive: true });
  const src = scan(fixture()).kinds.txn.hits[0].file;
  const T = ["tests/a.js", "src/a.test.js", "x/__tests__/a.js", "spec/a.js"];
  for (const p of T) put(d, p, readFileSync(join(FIXTURE, src), "utf8"));
  commit(d);
  const files = new Set(allHits(scan(d)).map((h) => h.file));
  for (const p of T) assert.ok(!files.has(p), p);
  assert.ok(files.has(src));
});

const cli = (d) => { try { execFileSync("node", [join(HERE, "scan.mjs"), d], { stdio: "pipe", timeout: 15000 }); return 0; } catch (e) { return e.status; } };

test("a .graphifyignore symlink is neither read nor written", () => {
  const d = tmp(), out = tmp();
  put(out, "outside", "keep\n");
  put(d, "node_modules/a/i.js", "x\n");
  put(d, "a.js", "x.toFixed(2);\n");
  symlinkSync(join(out, "outside"), join(d, ".graphifyignore"));
  commit(d);
  scan(d);
  assert.equal(readFileSync(join(out, "outside"), "utf8"), "keep\n");
});

test("an owner's .graphifyignore keeps its bytes; new entries are appended", () => {
  const d = tmp();
  const own = "# mine\n\n  docs/  \ndocs/\n\nvendor2";
  put(d, ".graphifyignore", own);
  put(d, "node_modules/a/i.js", "x\n");
  commit(d);
  scan(d);
  const got = readFileSync(join(d, ".graphifyignore"), "utf8");
  assert.ok(got.startsWith(own + "\n"));
  assert.ok(got.includes("node_modules/"));
});

test("scan refuses to write through a .xworkflows symlink", () => {
  const d = tmp(), out = tmp();
  put(d, "a.js", "x.toFixed(2);\n");
  symlinkSync(out, join(d, ".xworkflows"));
  assert.equal(cli(d), 1);
  assert.equal(existsSync(join(out, "scan.json")), false);
});

test("tracked symlinks are not read", () => {
  const d = tmp(), out = tmp();
  put(out, "o.js", "x.toFixed(2);\n");
  put(d, "a.js", "x.toFixed(2);\n");
  symlinkSync(join(out, "o.js"), join(d, "link.js"));
  commit(d);
  assert.deepEqual(scan(d).kinds.values.hits.map((h) => h.file), ["a.js"]);
  execFileSync("mkfifo", [join(out, "pipe")]);
  symlinkSync(join(out, "pipe"), join(d, "pipe.js"));
  git(d, "add", "-A");
  git(d, "commit", "-q", "-m", "y");
  assert.equal(cli(d), 0);
});

test("a package folder inside a repository honors git ignore and stays relative", () => {
  const top = tmp(), d = join(top, "pkg");
  put(top, ".gitignore", "secret.js\n");
  put(d, "a.js", "x.toFixed(2);\n");
  put(d, "secret.js", "x.toFixed(2);\n");
  put(top, "other.js", "x.toFixed(2);\n");
  git(top, "init", "-q"); git(top, "add", "-A"); git(top, "commit", "-q", "-m", "x");
  assert.deepEqual(scan(d).kinds.values.hits.map((h) => h.file), ["a.js"]);
});

test("scan refuses to write through a scan.json symlink", () => {
  const d = tmp(), out = tmp();
  put(d, "a.js", "x.toFixed(2);\n");
  put(out, "victim", "keep\n");
  mkdirSync(join(d, ".xworkflows"));
  symlinkSync(join(out, "victim"), join(d, ".xworkflows/scan.json"));
  assert.equal(cli(d), 1);
  assert.equal(readFileSync(join(out, "victim"), "utf8"), "keep\n");
});

test("a repository whose git fails is not walked: ignored secrets stay out", () => {
  const d = tmp();
  put(d, ".gitignore", "secret.js\n");
  put(d, "secret.js", "const k = price.toFixed(2); // SECRETLINE\n");
  put(d, "a.js", "x.toFixed(2);\n");
  commit(d);
  writeFileSync(join(d, ".git/config"), "[core]\n\tbogus line without section end [[\n", { flag: "a" });
  assert.throws(() => scan(d));
  assert.notEqual(cli(d), 0);
  assert.equal(existsSync(join(d, ".xworkflows/scan.json")), false);
});

test("a very long line gives no hit, a short one still does", () => {
  const d = tmp();
  put(d, "bundle.js", `${"x".repeat(3000)}; a.toFixed(2);\n`);
  put(d, "app.js", "a.toFixed(2);\n");
  commit(d);
  assert.deepEqual(scan(d).kinds.values.hits.map((h) => h.file), ["app.js"]);
});

test("a graphifyignore line is an exact path or a folder, never a name prefix", () => {
  const d = tmp();
  put(d, "src/a.js", "x.toFixed(2);\n");
  put(d, "src/a.js.bak.js", "x.toFixed(2);\n");
  put(d, "dist2/b.js", "x.toFixed(2);\n");
  put(d, "gen/c.js", "x.toFixed(2);\n");
  put(d, ".graphifyignore", "src/a.js\ngen/\n/dist\n");
  commit(d);
  const run = () => scan(d).kinds.values.hits.map((h) => h.file);
  assert.deepEqual(run(), ["dist2/b.js", "src/a.js.bak.js"]);
  assert.deepEqual(run(), ["dist2/b.js", "src/a.js.bak.js"]);
});

test("a sql file counts unless it sits under a test, seed or fixture folder", () => {
  const d = tmp();
  const trig = (n) => `create trigger ${n} before insert on t for each row execute function f();\n`;
  put(d, "db/schema.sql", trig("real"));
  put(d, "db/seeds/s.sql", trig("seeded"));
  put(d, "tests/t.sql", trig("tested"));
  put(d, "spec/fixtures/f.sql", trig("fixed"));
  commit(d);
  assert.deepEqual(scan(d).sql.triggers.map((t) => t.name), ["real on t"]);
  assert.deepEqual(sqlInventory([{ path: "db/seed/s.sql", text: trig("a") }]).triggers, []);
});

test("sizes come from the disk: a file too large to read whole still counts", () => {
  const d = tmp();
  put(d, "big.js", "a".repeat(9000));
  put(d, "small.js", "x.toFixed(2);\n");
  truncateSync(join(d, "big.js"), 2147483700); // sparse: no real disk used
  commit(d);
  const s = scan(d);
  assert.equal(s.layout.find((e) => e.path === "*").bytes, 2147483700 + 14);
  assert.deepEqual(s.kinds.values.hits.map((h) => h.file), ["small.js"]);
});

test("a folder with no repository of its own under another one gives one line and stops", () => {
  const top = tmp(), d = join(top, "pkg");
  put(top, "other.js", "x.toFixed(2);\n");
  commit(top);
  put(d, "a.js", "x.toFixed(2);\n");
  assert.throws(() => scan(d), /no repository of its own/);
  const r = spawnSync("node", [join(HERE, "scan.mjs"), d], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^[^\n]*no repository of its own[^\n]*\n$/);
  assert.equal(existsSync(join(d, ".xworkflows/scan.json")), false);
});
