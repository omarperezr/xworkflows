// Checks every citation of the area research and sorts the findings into the three screens the owner sees,
// plus the detail file. No judgment here: agents judged, this file verifies, caps and orders.
// Standalone: node: built-ins only (it is copied into projects).
import { resolve, sep, posix } from "node:path";
import { verifyCitation } from "./research.mjs";

export const MAX_RULES = 12, MAX_GAPS = 6, MAX_WORDS = 14; // about what one short screen holds (owner, 2026-11-12)
const RISK = { high: 0, medium: 1, low: 2 };
const ASK = {
  "B-rules": "Which business rule must the code respect that is written in no file?",
  "B-refused": "What does this project not do, on purpose?",
  "B-mistake": "Which mistake would cost you the most?",
  "B-incident": "Tell me about one real time something went wrong here: what broke, and what did it cost?",
  "B-free": "What may an agent change or delete without asking you?",
  "G-3m": "Where should the project be in about 3 months?",
  "G-12m": "Where should it be in about 12 months?",
  "G-36m": "Where should it be in about 36 months?",
  "G-interim": "Given those goals, which part of today's code is provisional?",
};
const collapse = (t) => String(t).replace(/\s+/g, " ").trim();
const words = (t) => String(t).split(/\s+/).filter(Boolean).length;

// Agents sometimes cite absolute paths inside the root; keep them repo-relative.
const checker = (root) => {
  const base = resolve(root) + sep;
  return {
    ok: (c) => Boolean(c && c.file) && verifyCitation(root, c),
    at: (c) => `${String(c.file).startsWith(base) ? String(c.file).slice(base.length) : c.file}:${c.line}`,
  };
};

// Verified general rules by area key (the risk and the detail), and verified ideas by id `<key>.<n>`, n from 1 in the area's own list.
function ruleIndex(root, r) {
  const { ok, at } = checker(root);
  const rules = new Map(), seconds = new Map(), ideas = new Map();
  for (const key of r.areaOrder || []) {
    const a = r.areas?.[key];
    if (!a || a.status === "not-present") continue;
    if (a.status === "found" && a.second?.rule && ok(a.second)) seconds.set(key, { rule: a.second.rule, risk: a.second.risk, cost: a.second.cost, at: at(a.second) });
    if (a.status === "found" && a.general?.rule && ok(a.general)) rules.set(key, { rule: a.general.rule, basis: a.general.basis, risk: a.general.risk, cost: a.general.cost, at: [at(a.general), ...(a.support || []).filter(ok).map(at)] });
    (a.ideas || []).forEach((i, n) => { if (i?.text && ok(i)) ideas.set(`${key}.${n + 1}`, { area: key, text: i.text, at: at(i) }); });
  }
  return { rules, seconds, ideas };
}

export function screens(root, r) {
  const { ok, at } = checker(root);
  const dropped = [], gaps = [], noRule = [], notPresent = [], errors = [];
  if (!r.plain) errors.push("plain: agent returned nothing, rerun the Workflow");
  if (!r.questions) errors.push("questions: agent returned nothing, rerun the Workflow");
  for (const [t, x] of Object.entries(r.topics || {})) if (!x) errors.push(`topic ${t}: agent returned nothing, rerun the Workflow`);
  for (const key of r.areaOrder || []) {
    const a = r.areas?.[key];
    if (!a) { errors.push(`${key}: agent returned nothing, rerun the Workflow`); continue; }
    if (a.status === "not-present") { notPresent.push(key); continue; }
    const keep = (list, what) => (list || []).filter((c) => ok(c) || (dropped.push({ area: key, what, at: at(c), quote: c.quote }), false));
    const g = a.status === "found" && a.general?.rule ? a.general : null;
    const risk = RISK[g?.risk] ?? 1;
    const exceptions = keep(a.exceptions, "exception");
    if (g && !ok(g)) dropped.push({ area: key, what: `general rule: ${g.rule}`, at: at(g), quote: g.quote });
    else if (!g) noRule.push(key);
    const s2 = a.status === "found" && a.second?.rule ? a.second : null;
    if (s2 && !ok(s2)) dropped.push({ area: key, what: `second rule: ${s2.rule}`, at: at(s2), quote: s2.quote });
    // A written rule counts as contradicted only when both its doc line and the code line hold.
    for (const c of a.contradicted || []) {
      if (ok(c) && ok({ file: c.wfile, line: c.wline, quote: c.wquote })) gaps.push({ kind: "contradicted", area: key, risk, text: `The docs say: "${c.written}" (${at({ file: c.wfile, line: c.wline })}). The code does otherwise at ${at(c)}: ${c.how}. Which one is right?`, options: ["The written rule", "The code", "I don't know"] });
      else dropped.push({ area: key, what: `contradicted: ${c.written}`, at: at(c), quote: c.quote });
    }
    for (const d of keep(a.doubted, "doubted")) if (!String(d.why ?? "").trim()) dropped.push({ area: key, what: `doubted: ${d.rule}`, reason: "no written reason" }); else gaps.push({ kind: "doubted", area: key, risk, text: `The code follows this rule: "${d.rule}" (${at(d)}). Research doubts it: ${d.why}. What do you say?`, options: ["You are right: a pending card", "Keep it, because ...", "I don't know"] });
    if (g && ok(g) && exceptions.length) gaps.push({ kind: "exceptions", area: key, risk, text: `Rule: "${g.rule}". Done differently in ${exceptions.length} place${exceptions.length > 1 ? "s" : ""}: ${exceptions.map((e) => `${at(e)} (${e.how})`).join("; ")}. Mistake or exception?`, options: ["Mistake: fix it", "Exception: keep it", "I don't know"] });
    for (const u of keep(a.unprotected, "unprotected")) gaps.push({ kind: "unprotected", area: key, risk, text: `Nothing protects this: ${u.risk} (${at(u)}). Is that on purpose?`, options: ["On purpose", "Not on purpose: protect it", "I don't know"] });
  }
  // A sentence shows only with a verified rule behind it, and short; its citation is the first verified one of the ideas it names; its risk is its areas' general rule's.
  const { rules, ideas } = ruleIndex(root, r);
  const byRisk = (x, y) => (RISK[x.risk] ?? 3) - (RISK[y.risk] ?? 3); // stable: the agent's order within a risk; no risk sorts last
  const lists = [[], []];
  [r.plain?.claims || [], r.plain?.rest || []].forEach((list, k) => { const sentences = lists[k];
  for (const c of list) {
    const from = (c.from || []).filter((id) => ideas.has(id));
    const n = words(c.text);
    const why = !from.length ? "names no idea with a verified citation" : n > MAX_WORDS ? `${n} words, more than ${MAX_WORDS}` : null;
    if (why) dropped.push({ area: "plain", what: `sentence: ${c.text}`, reason: why });
    else sentences.push({ text: c.text, from: c.from, at: ideas.get(from[0]).at, risk: from.map((id) => rules.get(ideas.get(id).area)?.risk).filter((k) => k in RISK).sort((x, y) => RISK[x] - RISK[y])[0] });
  }
  sentences.sort(byRisk); });
  // The verified sentences of `rest` only fill the places the claims leave free.
  const sentences = [...lists[0], ...lists[1]];
  // Screen 2: contradictions first, then a doubted rule, exceptions, unprotected places.
  const order = { contradicted: 0, doubted: 1, exceptions: 2, unprotected: 3 };
  gaps.sort((x, y) => order[x.kind] - order[y.kind] || x.risk - y.risk);
  const byId = Object.fromEntries((r.questions || []).map((q) => [q.id, q]));
  const drawer3 = Object.entries(ASK).map(([id, text]) => ({ id, text, lead: byId[id]?.lead ?? "Research found nothing on this.", options: (byId[id]?.options || []).map((o) => ({ label: o.label, description: o.description, ...(ok(o) && { at: at(o) }) })) }));
  return {
    errors, dropped, noRule, notPresent,
    drawer1: sentences.slice(0, MAX_RULES), drawer1LeftOut: sentences.slice(MAX_RULES),
    drawer2: gaps.slice(0, MAX_GAPS).map((g, i) => ({ id: `X${i + 1}`, ...g })), drawer2LeftOut: gaps.slice(MAX_GAPS),
    drawer3,
  };
}

// The mechanism agents' answers: kinds.json (hooks read it), and the lines of the detail file. A kind the Workflow did not run is skipped.
export function mechanism(root, r) {
  const { ok, at } = checker(root);
  const errors = [], lines = [], dropped = [], state = {};
  for (const k of Object.keys(r.kinds || {}).sort()) {
    const x = r.kinds[k];
    if (!x) { errors.push(`${k}: agent returned nothing`); continue; }
    if (!["found", "absent", "not-present"].includes(x.status)) { errors.push(`${k}: invalid status ${JSON.stringify(x.status)}`); continue; }
    for (const v of x.verdicts || []) if (v.verdict !== "no-evidence" && !ok(v)) dropped.push({ area: k, what: `verdict ${v.id} ${v.verdict}`, at: at(v), quote: v.quote });
    if (x.status !== "found") { state[k] = { general: null, status: x.status }; continue; }
    // A found kind whose general rule is missing or does not verify counts as absent; what failed gets a line.
    const g = x.general?.rule && ok(x.general) ? x.general : null;
    if (x.general?.rule && !g) dropped.push({ area: k, what: `general rule: ${x.general.rule}`, at: at(x.general), quote: x.general.quote });
    state[k] = { general: g ? g.rule : null, status: g ? "found" : "absent" };
    const rules = (x.rules || []).filter((y) => ok(y) || (dropped.push({ area: k, what: `rule: ${y.rule}`, at: at(y), quote: y.quote }), false));
    if (g || rules.length) lines.push(`### ${k}`, "", ...(g && ok(g) ? [`- general: ${g.rule} (${g.basis}) ${at(g)}`] : []), ...rules.map((y) => `- ${y.rule} (code) ${at(y)}`), "");
  }
  return { state: JSON.stringify(state, null, 2) + "\n", lines, errors, dropped };
}

const norm = (p) => posix.normalize(String(p).replace(/^(\.\/)+/, "")).replace(/\/$/, "");
const dropLine = (d) => `- ${d.area}: ${d.what} ${d.reason ?? `${d.at} ${JSON.stringify(d.quote)}`}`;

export function render(r, s, commit) {
  const out = ["---", `commit: ${commit}`, "version: 3", "---", "", "## What it is", "", r.profile.what, ""];
  out.push("## Screen 1: what the code shows", "", "Strike what is habit and not rule; correct the level where a rule is stated too narrowly.", "");
  s.drawer1.forEach((x, i) => out.push(`${i + 1}. ${x.text} (${x.at})${x.risk ? ` Risk ${x.risk}.` : ""}`));
  if (s.drawer1LeftOut.length) out.push("", `Left out of this screen: ${s.drawer1LeftOut.length} sentence(s), the ones past ${MAX_RULES}; they are in the research, not asked.`);
  out.push("", "## Screen 2: where the code contradicts itself or leaves a gap", "");
  for (const g of s.drawer2) out.push(`- ${g.id} [${g.area}] ${g.text}`, `  Options: ${g.options.join(" / ")}`);
  if (!s.drawer2.length) out.push("(nothing found)");
  if (s.drawer2LeftOut.length) out.push("", `Left out of this screen: ${s.drawer2LeftOut.length} question(s), the last in this order: contradicted, doubted, exceptions, unprotected, then the least risky (${s.drawer2LeftOut.map((g) => `${g.kind} in ${g.area}`).join(", ")}).`);
  out.push("", "## Screen 3: what no file says", "");
  for (const q of s.drawer3) {
    out.push(`- ${q.id} ${q.text}`, `  ${q.lead}`);
    for (const o of q.options) out.push(`  - ${o.label}: ${o.description}${o.at ? ` (${o.at})` : ""}`);
    out.push("  - I don't know. Or type your own answer.");
  }
  out.push("", "## Areas", "");
  if (s.noRule.length) out.push(`- no rule found: ${s.noRule.join(", ")}`);
  if (s.notPresent.length) out.push(`- not in this project: ${s.notPresent.join(", ")}`);
  out.push(`- rules read from the docs and the project's own checks: ${r.written.count} (${r.written.fromChecks} from checks)`);
  const unread = [...(r.written.docsLeftOut || []), ...(r.written.notRead || [])];
  if (unread.length) out.push(`- docs not read: ${unread.join(", ")}`);
  const notChecked = [...new Set([...Object.entries(r.kinds || {}), ...Object.entries(r.areas || {})].flatMap(([k, x]) => (x?.notChecked || []).map((p) => `${k}: ${norm(p)}`)))].sort();
  if (notChecked.length) out.push("", "## Not checked", "", ...notChecked.map((l) => `- ${l}`));
  if (s.dropped.length) out.push("", "## Dropped", "", ...s.dropped.map(dropLine));
  return out.join("\n") + "\n";
}

// details.md, apart from the screens: under each sentence its ideas, each with its citation, and the general rule of their areas, then the mechanism rules, then what the areas found in comments.
export function details(r, s, m, root, written = []) {
  const { ok, at } = checker(root);
  const { rules, seconds, ideas } = ruleIndex(root, r);
  const out = ["# Detail", "", "## Screen 1, sentence by sentence", ""];
  s.drawer1.forEach((x, i) => {
    out.push(`### ${i + 1}. ${x.text}`, "");
    const mine = x.from.filter((id) => ideas.has(id));
    for (const id of mine) out.push(`- ${ideas.get(id).text} ${ideas.get(id).at}`);
    for (const k of new Set(mine.map((id) => ideas.get(id).area))) {
      const y = rules.get(k);
      if (y) out.push(`- ${y.rule} (${y.basis}; risk ${y.risk}: ${y.cost}) ${y.at.join(", ")}`);
    }
    out.push("");
  });
  const shown = new Set(s.drawer1.flatMap((x) => x.from));
  const unnamed = [...ideas].filter(([id]) => !shown.has(id));
  const shownAreas = new Set([...shown].filter((id) => ideas.has(id)).map((id) => ideas.get(id).area));
  const lost = [
    ...unnamed.map(([id, y]) => `- [${id}] ${y.text} ${y.at}`),
    ...[...rules].filter(([k]) => !shownAreas.has(k)).map(([k, y]) => `- [${k}] ${y.rule} (${y.basis}; risk ${y.risk}: ${y.cost}) ${y.at.join(", ")}`),
    ...[...seconds].map(([k, y]) => `- [${k}] ${y.rule} (risk ${y.risk}: ${y.cost}) ${y.at}`),
  ];
  if (lost.length) out.push("## Rules no sentence shows", "", ...lost, "");
  out.push("## Mechanism rules", "", ...(m.lines.length ? m.lines : ["(none)", ""]));
  // Each written rule with the verdict a mechanism agent gave it; a verdict stands only with a verified citation, else no-evidence.
  const wtext = new Map(written.map((w) => [w.id, collapse(w.text)]));
  const verdicts = Object.keys(r.kinds || {}).sort().flatMap((k) => {
    const seen = new Set();
    return (r.kinds[k]?.verdicts || []).filter((v) => wtext.has(v.id) && !seen.has(v.id) && seen.add(v.id)).map((v) => {
      const cited = ok(v);
      return `- ${k} ${v.id} ${cited ? v.verdict : "no-evidence"}: ${wtext.get(v.id)}${cited ? ` ${at(v)}` : ""}`;
    });
  });
  out.push("## Written rules and their verdicts", "", ...(verdicts.length ? verdicts : ["(none)"]), "");
  const per = (field, text) => (r.areaOrder || []).flatMap((k) => (r.areas?.[k]?.[field] || []).filter(ok).map((d) => `- [${k}] ${text(d)} ${at(d)}`));
  const more = per("details", (d) => d.rule);
  if (more.length) out.push("## More rules by area", "", ...more, "");
  const comments = per("commentRules", (d) => d.text);
  out.push("## Rules found in comments", "", ...(comments.length ? comments : ["(none)"]), "");
  return out.join("\n");
}
