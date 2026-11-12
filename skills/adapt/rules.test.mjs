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
  put(d, "docs/a.md", Array.from({ length: 300 }, (_, i) => `- Rule ${i} must hold.`).join("\n") + "\n");
  put(d, "src.js", Array.from({ length: 300 }, (_, i) => `// code ${i} must hold`).join("\n") + "\n");
  commit(d);
  const r = collectRules(d);
  assert.equal(r.rules.length, 400);
  assert.equal(r.rules.filter((x) => x.file === "docs/a.md").length, 300);
  assert.equal(r.rules[299].file, "docs/a.md");
  assert.equal(r.rules[300].file, "src.js");
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
  assert.equal(collectRules(d).rules[0].text.length, 300);
});

test("no docs gives an empty list", () => {
  const d = tmp();
  put(d, "a.js", "const x = 1;\n");
  commit(d);
  assert.deepEqual(collectRules(d), { rules: [] });
});
