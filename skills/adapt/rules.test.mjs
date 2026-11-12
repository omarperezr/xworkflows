import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { collectRules } from "./rules.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "../../test/fixtures/mechanisms");
const git = (cwd, ...a) => execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.invalid", ...a], { cwd, stdio: "pipe" });
const tmp = () => mkdtempSync(join(tmpdir(), "rules-"));
const put = (d, p, t) => { mkdirSync(dirname(join(d, p)), { recursive: true }); writeFileSync(join(d, p), t); };
function commit(d) { git(d, "init", "-q"); git(d, "add", "-A"); git(d, "commit", "-q", "-m", "x"); }
function fixture() { const d = tmp(); cpSync(FIXTURE, d, { recursive: true }); commit(d); return d; }
const find = (r, re) => r.rules.find((x) => re.test(x.text));

test("finds English and Spanish rules with file and line", () => {
  const r = collectRules(fixture());
  const en = find(r, /one transaction/);
  assert.equal(en.file, "docs/product.md");
  assert.equal(en.line, 4);
  const es = find(r, /redondeo/);
  assert.equal(es.file, "docs/product.md");
  assert.equal(es.line, 6);
  assert.ok(find(r, /Amounts must always/));
  assert.ok(r.rules.map((x) => x.id).join() .startsWith("W1,W2,W3"));
});

test("a sentence without a normative word is skipped", () => {
  const r = collectRules(fixture());
  assert.ok(!find(r, /no rule in it/));
});

test("a code comment rule is found", () => {
  const c = find(collectRules(fixture()), /integer cents/);
  assert.equal(c.file, "plant-values.js");
  assert.ok(c.line > 1);
});

test("kinds are tagged from the keyword table", () => {
  const r = collectRules(fixture());
  assert.ok(find(r, /Amounts must/).kinds.includes("values"));
  assert.ok(find(r, /retry must never/).kinds.includes("idem"));
  assert.ok(find(r, /one transaction/).kinds.includes("txn"));
  assert.ok(find(r, /N\+1/).kinds.includes("batch"));
  assert.ok(find(r, /redondeo/).kinds.includes("values"));
  assert.ok(find(r, /reintento/).kinds.includes("idem"));
  assert.ok(find(r, /rol\b/).kinds.includes("access"));
});

test("output is byte-identical twice and the CLI prints the count", () => {
  const d = fixture();
  const run = () => execFileSync("node", [join(HERE, "rules.mjs"), d], { encoding: "utf8" });
  const out = run();
  const a = readFileSync(join(d, ".xworkflows/rules.json"));
  assert.match(out, /^rules: \d+\n$/);
  run();
  assert.deepEqual(readFileSync(join(d, ".xworkflows/rules.json")), a);
  assert.ok(a.toString().endsWith("}\n"));
});

test("capped at 400 with docs first", () => {
  const d = tmp();
  for (let f = 0; f < 10; f++) {
    put(d, `docs/a${f}.md`, Array.from({ length: 30 }, (_, i) => `- Rule ${i} must hold.`).join("\n") + "\n");
    put(d, `src${f}.js`, Array.from({ length: 30 }, (_, i) => `// code ${i} must hold\nconst v${i} = 1;`).join("\n") + "\n");
  }
  commit(d);
  const r = collectRules(d).rules;
  assert.equal(r.length, 400);
  assert.equal(r.filter((x) => x.file.startsWith("docs/")).length, 300);
  assert.ok(r[299].file.startsWith("docs/"));
  assert.ok(r[300].file.startsWith("src"));
});

test("generated, vendored and .xworkflows paths are skipped", () => {
  const d = tmp();
  put(d, "docs/ok.md", "It must stay.\n");
  put(d, "vendor/x.md", "Vendored must go.\n");
  put(d, "docs/gen.md", "<!-- @generated -->\nGenerated must go.\n");
  put(d, ".xworkflows/notes.md", "Own must go.\n");
  put(d, "node_modules/p/README.md", "Dep must go.\n");
  commit(d);
  assert.deepEqual(collectRules(d).rules.map((x) => x.file), ["docs/ok.md"]);
});

test("most-changed docs first, then path, then line", () => {
  const d = tmp();
  put(d, "docs/a.md", "A must.\n");
  put(d, "docs/b.md", "B must.\n");
  commit(d);
  put(d, "docs/b.md", "B must.\nB2 must.\n");
  git(d, "add", "docs/b.md"); git(d, "commit", "-q", "-m", "y");
  assert.deepEqual(collectRules(d).rules.map((x) => x.text), ["B must.", "B2 must.", "A must."]);
});

test("long sentences are trimmed to 300 characters", () => {
  const d = tmp();
  put(d, "README.md", `${"word ".repeat(100)}must end.\n`);
  commit(d);
  const t = collectRules(d).rules[0].text;
  assert.ok(t.length <= 300 && t.endsWith("…") && !t.endsWith(" …"));
});

test("no docs gives an empty list", () => {
  const d = tmp();
  put(d, "a.js", "const x = 1;\n");
  commit(d);
  assert.deepEqual(collectRules(d), { rules: [] });
});

test("wrapped paragraph, Spanish bullet and two-line comment give one whole rule each", () => {
  const d = tmp();
  put(d, "docs/wrap.md", "Totals are stored in cents and\nthe app must never use floats\nfor money.\n\n- El stock debe ser\n  siempre un entero\n  al escribir.\n");
  put(d, "a.js", "const a = 1;\n// A retry must never\n// create a duplicate.\nconst b = 2;\n");
  commit(d);
  const r = collectRules(d).rules;
  assert.deepEqual(r.map((x) => [x.text, x.line]), [
    ["Totals are stored in cents and the app must never use floats for money.", 1],
    ["El stock debe ser siempre un entero al escribir.", 5],
    ["A retry must never create a duplicate.", 2],
  ]);
});

test("a sentence starts on its own line inside a paragraph", () => {
  const d = tmp();
  put(d, "README.md", "Intro text here.\nIt must work.\nAnd it never fails.\n");
  commit(d);
  assert.deepEqual(collectRules(d).rules.map((x) => [x.text, x.line]), [["It must work.", 2], ["And it never fails.", 3]]);
});

test("tables, fences, front matter and headings are not rules", () => {
  const d = tmp();
  put(d, "docs/x.md", "---\ntitle: it must be\n---\n# It must be a heading\n| a | must |\n```\nnever in code\n```\nReal one must stay.\n");
  commit(d);
  assert.deepEqual(collectRules(d).rules.map((x) => x.text), ["Real one must stay."]);
});

test("abbreviations do not split a sentence", () => {
  const d = tmp();
  put(d, "README.md", "Use ids, e.g. uuids, and so on, i.e. never counters. Also vs. others it must hold, etc. and p. ej. esto debe ser.\n");
  commit(d);
  assert.equal(collectRules(d).rules.length, 2);
});

test("realistic sentences get their kinds", () => {
  const d = tmp();
  const cases = [
    ["The price must always be stored in cents.", "values"],
    ["El saldo debe ser siempre exacto.", "values"],
    ["A webhook must be applied once.", "idem"],
    ["Cada pedido se aplica una sola vez, nunca dos.", "idem"],
    ["Only the owner may log in to the admin area.", "access"],
    ["Solo el dueño tiene acceso.", "access"],
    ["A failed step must rollback: all or nothing.", "txn"],
    ["Todo o nada: debe ser una transacción.", "txn"],
    ["Process each item in a batch, never one by one.", "batch"],
    ["Se debe procesar por lote.", "batch"],
    ["History must never change past rows.", "snap"],
    ["Se guarda al escribir; el histórico nunca cambia.", "snap"],
    ["Every invoice must follow accounting law.", "domain"],
    ["La factura debe cumplir la norma contable.", "domain"],
  ];
  put(d, "docs/k.md", cases.map(([t]) => `- ${t}`).join("\n") + "\n- A refresh rate must never be below 30. Each unit must be tested.\n");
  commit(d);
  const r = collectRules(d).rules;
  for (const [t, k] of cases) assert.ok(r.find((x) => x.text === t)?.kinds.includes(k), t);
  assert.deepEqual(r.find((x) => /refresh rate/.test(x.text)).kinds, []);
});

test("per-file cap of 40 and file order put PRODUCT before a long README", () => {
  const d = tmp();
  put(d, "README.md", Array.from({ length: 60 }, (_, i) => `- Manual ${i} must hold.`).join("\n") + "\n");
  put(d, "PRODUCT.md", "- Alpha must stay.\n- Beta never changes.\n- Gamma only here.\n");
  put(d, "docs/z.md", "- Zed must stay.\n");
  commit(d);
  const r = collectRules(d).rules;
  assert.deepEqual(r.slice(0, 3).map((x) => x.file), ["PRODUCT.md", "PRODUCT.md", "PRODUCT.md"]);
  assert.equal(r[3].file, "docs/z.md");
  const readme = r.filter((x) => x.file === "README.md");
  assert.equal(readme.length, 40);
  assert.equal(readme[0].text, "Manual 0 must hold.");
  assert.equal(r.length, 44);
});
