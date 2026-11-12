#!/usr/bin/env node
// No-LLM collection of the rules a project wrote down: normative sentences from docs and code comments.
// Standalone: node: built-ins and ./scan.mjs only (it is copied into projects beside scan.mjs).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { projectFiles } from "./scan.mjs";

const MAX = 400, CUT = 300;
const L = (s) => new RegExp(`(?<![\\p{L}\\p{N}_])(?:${s})`, "iu"); // word start; stems run on
const W = (s) => new RegExp(`(?<![\\p{L}\\p{N}_])(?:${s})(?![\\p{L}\\p{N}_])`, "iu"); // whole word
const NORMATIVE = W("must|never|always|only|do not|don['’]t|required|forbidden|debe|debes|deben|nunca|siempre|solo|sólo|no se|prohibido");
// Fixed keyword table, English and Spanish, in the kind order of the scan.
const KIND_WORDS = [
  ["values", L("currenc|rate|round|decimal|precision|unit|moneda|tasa|redondeo|c[eé]ntimo|cents")],
  ["snap", L("snapshot|at the time|frozen|sealed|congelad|sellad")],
  ["srvw", L("server function|rpc|only through|solo por|s[oó]lo por|server-side|funci[oó]n de servidor")],
  ["delta", L("delta|increment|decrement|relativ")],
  ["idem", L("idempoten|retry|retries|duplicate|replay|outbox|reintent|duplicad")],
  ["txn", L("transaction|one request|atomic|transacci[oó]n|una sola")],
  ["access", W("roles?|permissions?|rls|policy|policies|rol(es)?|permisos?|pol[ií]ticas?")],
  ["batch", L("per row|per item|loop|n\\+1|por fila|por [ií]tem|en bucle|bulk")],
  ["domain", W("tax(es)?|laws?|legal|iva|impuestos?|ley(es)?|fiscal|regulations?")],
  ["compat", W("api|formats?|schema|compatible|compatibility|versions?|formato|versi[oó]n")],
  ["conc", L("lock|concurren|race|bloqueo|mutex")],
  ["input", L("validat|sanitiz|input|validar|entrada|sanitiz")],
];
const DOCS = /^(README|PRODUCT|DESIGN|ARCHITECTURE|CONTRIBUTING)[^/]*$|^docs\//i;
const DOC_EXT = [".md", ".mdx", ".markdown", ".rst", ".txt", ""];
const CODE_EXT = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts", ".py", ".sql", ".go", ".rs", ".java", ".kt", ".rb", ".php", ".cs", ".swift", ".vue", ".svelte", ".dart", ".ex", ".scala", ".c", ".cc", ".cpp", ".h", ".sh"];
// shortcut: comments are line comments or block-comment lines only; a "#" or "--" inside a string counts as a comment. Upgrade with a tokenizer if noise shows.
const COMMENT = /^\s*(?:\/\*+|\*+(?!\/)|\/\/+|#(?!!)|--)\s?(.*)$|\s(?:\/\/|#|--)\s(.*)$/;

const sentences = (s) => s.replace(/^\s*(?:[-*+>]\s+|\d+[.)]\s+|#+\s+)+/, "").split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);

function fromFile(path, text, isDoc) {
  const out = [];
  text.split("\n").forEach((raw, i) => {
    let line = raw;
    if (!isDoc) { const m = COMMENT.exec(raw); if (!m) return; line = (m[1] ?? m[2] ?? "").replace(/\*\/\s*$/, ""); }
    for (const s of sentences(line)) if (NORMATIVE.test(s)) {
      const t = s.slice(0, CUT);
      out.push({ text: t, file: path, line: i + 1, kinds: KIND_WORDS.filter(([, re]) => re.test(t)).map(([k]) => k) });
    }
  });
  return out;
}

export function collectRules(root) {
  const { kept, dropped, churn } = projectFiles(root);
  const c = (f) => churn.get(f) || 0;
  const docs = [], code = [];
  for (const p of [...kept].sort()) {
    if (dropped.has(p)) continue;
    const ext = extname(p).toLowerCase();
    const isDoc = DOCS.test(p) && DOC_EXT.includes(ext);
    if (!isDoc && !CODE_EXT.includes(ext)) continue;
    let buf;
    try { buf = readFileSync(join(root, p)); } catch { continue; }
    if (buf.subarray(0, 8000).includes(0) || buf.length > 1 << 20) continue;
    const text = buf.toString("utf8");
    if (/@generated|DO NOT EDIT/.test(text.slice(0, text.indexOf("\n") < 0 ? undefined : text.indexOf("\n")))) continue;
    (isDoc ? docs : code).push(...fromFile(p, text, isDoc));
  }
  const order = (a, b) => c(b.file) - c(a.file) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || a.line - b.line;
  const rules = [...docs.sort(order), ...code.sort(order)].slice(0, MAX).map((r, i) => ({ id: `W${i + 1}`, ...r }));
  return { rules };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.argv[2] || ".";
  const r = collectRules(root);
  mkdirSync(join(root, ".xworkflows"), { recursive: true });
  writeFileSync(join(root, ".xworkflows/rules.json"), JSON.stringify(r, null, 2) + "\n");
  console.log(`rules: ${r.rules.length}`);
}
