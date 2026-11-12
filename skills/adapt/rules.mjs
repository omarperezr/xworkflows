#!/usr/bin/env node
// No-LLM collection of the rules a project wrote down: normative sentences from docs and code comments.
// Standalone: node: built-ins and ./scan.mjs only (it is copied into projects beside scan.mjs).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { projectFiles } from "./scan.mjs";

const MAX = 400, CUT = 300, PER_FILE = 40, PER_KIND = 15; // PER_KIND: the kind prompt and render read the same cap
const RANK = ["PRODUCT", "DESIGN", "ARCHITECTURE", "CONTRIBUTING", "AGENTS|CLAUDE", "docs/", "README", ""];
const rankOf = (p, isDoc) => (isDoc ? RANK.findIndex((r) => r && new RegExp(`^(${r})`, "i").test(p)) : RANK.length - 1);
const L = (s) => new RegExp(`(?<![\\p{L}\\p{N}_])(?:${s})`, "iu"); // word start; stems run on
const W = (s) => new RegExp(`(?<![\\p{L}\\p{N}_])(?:${s})(?![\\p{L}\\p{N}_])`, "iu"); // whole word
const NORMATIVE = W("must|never|always|only|do not|don['’]t|required|forbidden|debe|debes|deben|nunca|siempre|solo|sólo|no se|prohibido");
// Fixed keyword table, English and Spanish, in the kind order of the scan.
const KIND_WORDS = [
  ["values", L("currenc|exchange rate|tasa|rounding|round(?:ed)?\\s+(?:to|half|up|down|off)|redonde|decimal|precision|unit of measure|units? of|kg\\b|unidad de medida|moneda|c[eé]ntimo|cents?\\b|price|amount|money|total|balance|precio|monto|dinero|saldo|importe")],
  ["snap", L("snapshot|at the time|frozen|sealed|congelad|sellad|history|histor[ií]c|past rows?|at write|when written|al escribir|hist[oó]rico")],
  ["srvw", L("server function|rpc|only through|solo por|s[oó]lo por|server-side|funci[oó]n de servidor")],
  ["delta", L("delta|increment|decrement|relativ")],
  ["idem", L("idempoten|retry|retries|duplicate|replay|outbox|reintent|duplicad|once\\b|twice|at most once|webhook|applied|una vez|una sola vez|dos veces")],
  ["txn", L("transaction|one request|atomic|transacci[oó]n|una sola (?:petici|llamada|operaci)|all or nothing|rollback|roll back|todo o nada")],
  ["access", W("roles?|permissions?|rls|policy|policies|rol(es)?|permisos?|pol[ií]ticas?|owners?|admins?|administrators?|auth\\w*|log ?in|acceso|due[ñn]o|administrador")],
  ["batch", L("per row|per item|loop|n\\+1|por fila|por [ií]tem|en bucle|bulk|batch|each item|cada uno|cada [ií]tem|lote")],
  ["domain", W("tax(es)?|laws?|legal|iva|impuestos?|ley(es)?|fiscal|regulations?|invoices?|ledger|accounting|bookkeeping|facturas?|libro|contable")],
  ["compat", W("api|formats?|schema|compatible|compatibility|versions?|formato|versi[oó]n")],
  ["conc", L("lock|concurren|race|bloqueo|mutex")],
  ["input", L("validat|sanitiz|input|validar|entrada")],
];
// Visual-design sentences (sizes in px/rem, utility classes such as px-3.5 or rounded-lg) are not mechanism rules.
const STYLE = /\d(?:px|rem)\b|(?<![\w-])(?:p[xytrbl]?|m[xytrbl]|gap|rounded|shadow|ring|border)-[\w.\[\]/]+/;
const G = KIND_WORDS.map(([k, re]) => [k, new RegExp(re.source, "giu")]);
// Match strength of a sentence for a kind: distinct keyword matches.
const strength = (text, k) => new Set([...text.matchAll(G.find(([x]) => x === k)[1])].map((m) => m[0].toLowerCase())).size;
const DOCS = /^(README|PRODUCT|DESIGN|ARCHITECTURE|CONTRIBUTING|AGENTS|CLAUDE)[^/]*$|^docs\//i;
const DOC_EXT = [".md", ".mdx", ".markdown", ".rst", ".txt", ""];
const CODE_EXT = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts", ".py", ".sql", ".go", ".rs", ".java", ".kt", ".rb", ".php", ".cs", ".swift", ".vue", ".svelte", ".dart", ".ex", ".scala", ".c", ".cc", ".cpp", ".h", ".sh"];
// shortcut: comments are line comments or block-comment lines only; a "#" or "--" inside a string counts as a comment. Upgrade with a tokenizer if noise shows.
const COMMENT = /^\s*(?:\/\*+|\*+(?!\/)|\/\/+|#(?!!)|--)\s?(.*)$|\s(?:\/\/|#|--)\s(.*)$/;

const ABBR = /(?:\be\.g\.|\bi\.e\.|\betc\.|\bvs\.|\bp\. ej\.)$/i;
const LIST = /^\s*(?:[-*+]\s+|\d+[.)]\s+)/;

// Sentences of a block of {text,line} parts joined by spaces; each keeps the line it starts on.
function split(parts) {
  const text = parts.map((p) => p.text).join(" ");
  const at = (i) => { let n = 0, last = parts[0].line; for (const p of parts) { if (i < n + p.text.length + 1) return p.line; n += p.text.length + 1; last = p.line; } return last; };
  const out = []; let from = 0;
  const emit = (end) => { const raw = text.slice(from, end); const t = raw.trim(); if (t) out.push({ text: t, line: at(from + raw.length - raw.trimStart().length) }); };
  for (const m of text.matchAll(/[.!?]+\s+/g)) {
    const end = m.index + m[0].length, rest = text.slice(end);
    if (ABBR.test(text.slice(0, m.index + m[0].trimEnd().length)) || (/\bp\.$/i.test(text.slice(0, m.index + 1)) && /^ej\./i.test(rest))) continue;
    emit(end); from = end;
  }
  emit(text.length);
  return out;
}

// Markdown blocks: paragraphs and list items (with their continuation lines); tables, fences, front matter and headings are not rules.
function docBlocks(lines) {
  const blocks = []; let cur = null, fence = false;
  lines.forEach((raw, i) => {
    const t = raw.trim();
    if (i === 0 && t === "---") fence = "fm";
    else if (fence === "fm") { if (t === "---") fence = false; cur = null; return; }
    if (fence === "fm") return;
    if (/^(```|~~~)/.test(t)) { fence = !fence; cur = null; return; }
    if (fence || !t || t.startsWith("|") || t.startsWith("#")) { cur = null; return; }
    if (LIST.test(raw) || !cur) blocks.push((cur = []));
    cur.push({ text: t.replace(LIST, ""), line: i + 1 });
  });
  return blocks;
}

// Code comments: consecutive comment lines of one style are one block; a trailing comment is its own.
function codeBlocks(lines) {
  const blocks = []; let cur = null, style = "";
  lines.forEach((raw, i) => {
    const m = COMMENT.exec(raw);
    if (!m) { cur = null; return; }
    const text = (m[1] ?? m[2] ?? "").replace(/\*\/\s*$/, "").trim();
    const st = m[1] === undefined ? "end" + i : /^\s*(?:\/\*|\*)/.test(raw) ? "*" : /^\s*\/\//.test(raw) ? "//" : /^\s*#/.test(raw) ? "#" : "--";
    if (!text) { cur = null; return; }
    if (!cur || st !== style) { blocks.push((cur = [])); style = st; }
    cur.push({ text, line: i + 1 });
  });
  return blocks;
}

function cut(s) {
  if (s.length <= CUT) return s;
  const h = s.slice(0, CUT - 1), sp = h.lastIndexOf(" ");
  return (sp > 0 ? h.slice(0, sp) : h).trimEnd() + "…";
}

function fromFile(path, text, isDoc) {
  const lines = text.split("\n"), out = [];
  for (const b of isDoc ? docBlocks(lines) : codeBlocks(lines)) for (const s of split(b)) if (NORMATIVE.test(s.text)) {
    const t = cut(s.text);
    out.push({ text: t, file: path, line: s.line, kinds: STYLE.test(s.text) ? [] : KIND_WORDS.filter(([, re]) => re.test(s.text)).map(([k]) => k) });
  }
  return out.slice(0, PER_FILE); // the top of a doc holds the important rules
}

export function collectRules(root) {
  const { kept, dropped, churn } = projectFiles(root);
  const c = (f) => churn.get(f) || 0;
  const all = [];
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
    const rank = rankOf(p, isDoc);
    all.push(...fromFile(p, text, isDoc).map((r) => ({ ...r, rank })));
  }
  const order = (a, b) => a.rank - b.rank || c(b.file) - c(a.file) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || a.line - b.line;
  const rules = all.sort(order).slice(0, MAX).map(({ rank, ...r }, i) => ({ id: `W${i + 1}`, ...r, i }));
  // Each kind keeps its PER_KIND strongest rules (most distinct keywords, then fewest kinds, then W order); the rest lose that tag.
  for (const [k] of KIND_WORDS) {
    const rest = rules.filter((r) => r.kinds.includes(k)).map((r) => [r, strength(r.text, k)])
      .sort((a, b) => b[1] - a[1] || a[0].kinds.length - b[0].kinds.length || a[0].i - b[0].i).slice(PER_KIND).map(([r]) => r);
    for (const r of rest) r.kinds = r.kinds.filter((x) => x !== k);
  }
  return { rules: rules.map(({ i, ...r }) => r) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.argv[2] || ".";
  const r = collectRules(root);
  mkdirSync(join(root, ".xworkflows"), { recursive: true });
  writeFileSync(join(root, ".xworkflows/rules.json"), JSON.stringify(r, null, 2) + "\n");
  console.log(`rules: ${r.rules.length}`);
}
