// Checks every citation of the area research and sorts the findings into the three screens the owner sees,
// plus the detail file. No judgment here: agents judged, this file verifies, caps and orders.
// Standalone: node: built-ins only (it is copied into projects).
import { resolve, sep, posix, isAbsolute } from "node:path";
import { realpathSync } from "node:fs";
import { verifyCitation } from "./research.mjs";

export const MAX_RULES = 12, MAX_MORE = 12, MAX_GAPS = 6, MAX_WORDS = 14; // about what one short screen holds (owner, 2026-11-12)
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

// Agents sometimes cite absolute paths inside the root, spelled through a link of it or through its real path; keep them repo-relative.
const checker = (root) => {
  const bases = [resolve(root), (() => { try { return realpathSync(root); } catch { return resolve(root); } })()].map((b) => b + sep);
  const real = (f) => { try { return realpathSync(f); } catch { return f; } };
  const rel = (f) => { f = String(f); for (const g of isAbsolute(f) ? [f, real(f)] : []) { const b = bases.find((x) => g.startsWith(x)); if (b) return g.slice(b.length); } return f; };
  return {
    ok: (c) => Boolean(c && c.file) && verifyCitation(root, { ...c, file: rel(c.file) }),
    at: (c) => `${rel(c.file)}:${c.line}`,
    rel,
  };
};

// Verified general rules by area key (the risk and the detail), and verified ideas by id `<key>.<n>`, n from 1 in the area's own list.
function ruleIndex(root, r) {
  const { ok, at, rel } = checker(root);
  const rules = new Map(), seconds = new Map(), ideas = new Map();
  for (const key of r.areaOrder || []) {
    const a = r.areas?.[key];
    if (!a || a.status === "not-present") continue;
    if (a.status === "found" && a.second?.rule && ok(a.second)) seconds.set(key, { rule: a.second.rule, risk: a.second.risk, cost: a.second.cost, at: at(a.second) });
    // A support counts, and is listed, only when its file is not the example's nor an earlier support's.
    if (a.status === "found" && a.general?.rule && ok(a.general)) {
      const seen = new Set([resolve(root, rel(a.general.file))]);
      const sup = (a.support || []).filter((c) => ok(c) && !seen.has(resolve(root, rel(c.file))) && seen.add(resolve(root, rel(c.file))));
      rules.set(key, { rule: a.general.rule, basis: a.general.basis, risk: a.general.risk, cost: a.general.cost, at: [at(a.general), ...sup.map(at)] });
    }
    (a.ideas || []).forEach((i, n) => { if (i?.text && ok(i)) ideas.set(`${key}.${n + 1}`, { area: key, text: i.text, at: at(i) }); });
  }
  // A found kind's verified general rule is the item `kind:<kind>`, with its own citation only: its other rules are not other places of it.
  for (const [k, x] of Object.entries(r.kinds || {})) if (x?.status === "found" && x.general?.rule && ok(x.general)) rules.set(`kind:${k}`, { rule: x.general.rule, basis: x.general.basis, risk: x.general.risk, cost: x.general.cost, at: [at(x.general)] });
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
    const blank = (v) => !String(v ?? "").trim();
    const exceptions = keep(a.exceptions, "exception").filter((e) => !blank(e.how) || (dropped.push({ area: key, what: `exception: ${at(e)}`, reason: "no written how" }), false));
    for (const i of a.ideas || []) if (i?.text && !ok(i)) dropped.push({ area: key, what: `idea: ${i.text}`, at: at(i), quote: i.quote });
    if (a.status === "found") for (const c of a.support || []) if (!ok(c)) dropped.push({ area: key, what: `support: ${g?.rule ?? "no general rule"}`, at: at(c), quote: c.quote });
    if (g && !ok(g)) dropped.push({ area: key, what: `general rule: ${g.rule}`, at: at(g), quote: g.quote });
    else if (!g) noRule.push(key);
    const s2 = a.status === "found" && a.second?.rule ? a.second : null;
    if (s2 && !ok(s2)) dropped.push({ area: key, what: `second rule: ${s2.rule}`, at: at(s2), quote: s2.quote });
    // A written rule counts as contradicted only when both its doc line and the code line hold.
    for (const c of a.contradicted || []) {
      if (ok(c) && ok({ file: c.wfile, line: c.wline, quote: c.wquote }) && blank(c.how)) dropped.push({ area: key, what: `contradicted: ${c.written}`, reason: "no written how" });
      else if (ok(c) && ok({ file: c.wfile, line: c.wline, quote: c.wquote })) gaps.push({ kind: "contradicted", area: key, risk, text: `The docs say: "${c.written}" (${at({ file: c.wfile, line: c.wline })}). The code does otherwise at ${at(c)}: ${c.how}. Which one is right?`, options: ["The written rule", "The code", "I don't know"] });
      else dropped.push({ area: key, what: `contradicted: ${c.written}`, at: at(c), quote: c.quote });
    }
    for (const d of keep(a.doubted, "doubted")) if (!String(d.why ?? "").trim()) dropped.push({ area: key, what: `doubted: ${d.rule}`, reason: "no written reason" }); else gaps.push({ kind: "doubted", area: key, risk, text: `The code follows this rule: "${d.rule}" (${at(d)}). Research doubts it: ${d.why}. What do you say?`, options: ["You are right: a pending card", "Keep it, because ...", "I don't know"] });
    if (g && ok(g) && exceptions.length) gaps.push({ kind: "exceptions", area: key, risk, text: `Rule: "${g.rule}" The rule itself holds at ${at(g)}. Done differently in ${exceptions.length} place${exceptions.length > 1 ? "s" : ""}: ${exceptions.map((e) => `${at(e)} (${e.how})`).join("; ")}. Mistake or exception?`, options: ["Mistake: fix it", "Exception: keep it", "I don't know"] });
    for (const u of keep(a.unprotected, "unprotected")) if (blank(u.risk)) dropped.push({ area: key, what: `unprotected: ${at(u)}`, reason: "no written risk" }); else gaps.push({ kind: "unprotected", area: key, risk, text: `Nothing protects this: ${u.risk} (${at(u)}). Is that on purpose?`, options: ["On purpose", "Not on purpose: protect it", "I don't know"] });
  }
  // A sentence shows when a general rule it names (id `<key>` of an area, `kind:<kind>`) verified, or, naming none, an idea (id `<key>.<n>`) did; the first verified rule gives the example (its own citation) and `also`, the count of its verified support; else the first verified idea's citation.
  // Its risk is the highest of the rules it names or whose area its ideas belong to. A rule it names that did not verify gets its own Dropped line.
  const { rules, ideas } = ruleIndex(root, r);
  // After risk (none sorts last) the script's own order breaks ties, never the agent's: kinds' keys, then areaOrder, then the idea's number; the text last.
  const pos = (id) => id.startsWith("kind:") ? Object.keys(r.kinds || {}).indexOf(id.slice(5)) : (r.areaOrder || []).indexOf(id.split(".")[0]) * 1000 + (Number(id.split(".")[1]) || 0);
  const byOrder = (x, y) => (x.id.startsWith("kind:") ? 0 : 1) - (y.id.startsWith("kind:") ? 0 : 1) || pos(x.id) - pos(y.id);
  const byRisk = (x, y) => (RISK[x.risk] ?? 3) - (RISK[y.risk] ?? 3) || byOrder(x.first, y.first) || (x.text < y.text ? -1 : x.text > y.text ? 1 : 0);
  const verified = [];
  for (const c of [...(r.plain?.claims || []), ...(r.plain?.rest || [])]) { // `rest`: a research.json written before the plain agent returned only `claims`
    const named = (c.from || []).filter((id) => rules.has(id) || ideas.has(id)).map((id) => ({ id })).sort(byOrder).map((x) => x.id);
    const rule = named.find((id) => rules.has(id));
    const failed = (c.from || []).filter((id) => ((r.areaOrder || []).includes(id) || id.startsWith("kind:")) && !rules.has(id));
    const n = words(c.text);
    const why = failed.length && !rule ? "its general rule did not verify" : !named.length ? "names no item with a verified citation" : n > MAX_WORDS ? `${n} words, more than ${MAX_WORDS}` : null;
    if (why) dropped.push({ area: "plain", what: `sentence: ${c.text}`, reason: why });
    for (const id of failed) dropped.push({ area: "plain", what: `rule ${id}, named by: ${c.text}`, reason: "did not verify" });
    if (!why) verified.push({ text: c.text, from: c.from, at: rule ? rules.get(rule).at[0] : ideas.get(named[0]).at, ...(rule && !rule.startsWith("kind:") && { also: rules.get(rule).at.length - 1 }), general: Boolean(rule), first: { id: rule ?? named[0] }, kind: named.some((id) => id.startsWith("kind:")), risk: named.map((id) => (rules.get(id) ?? rules.get(ideas.get(id).area))?.risk).filter((k) => k in RISK).sort((x, y) => RISK[x] - RISK[y])[0] });
  }
  // One list by risk, high first, whatever the sentence comes from; inside a risk: general rules first, a kind's and an area-only one in turn, then the ideas.
  const sentences = [0, 1, 2, 3].flatMap((k) => {
    const by = (f) => verified.filter((x) => (RISK[x.risk] ?? 3) === k && f(x)).sort(byRisk);
    const [kindList, areaList] = [by((x) => x.general && x.kind), by((x) => x.general && !x.kind)];
    const mixed = Array.from({ length: Math.max(kindList.length, areaList.length) }, (_, i) => [kindList[i], areaList[i]].filter(Boolean)).flat();
    return [...mixed, ...by((x) => !x.general)];
  }).map(({ kind, general, first, ...x }) => x);
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

// The mechanism agents' answers: the lines of the detail file. A kind the Workflow did not run is skipped.
export function mechanism(root, r) {
  const { ok, at } = checker(root);
  const errors = [], parts = [], dropped = [];
  for (const k of Object.keys(r.kinds || {}).sort()) {
    const x = r.kinds[k];
    if (!x) { errors.push(`${k}: agent returned nothing`); continue; }
    if (!["found", "absent", "not-present"].includes(x.status)) { errors.push(`${k}: invalid status ${JSON.stringify(x.status)}`); continue; }
    for (const v of x.verdicts || []) if (v.verdict !== "no-evidence" && !ok(v)) dropped.push({ area: k, what: `verdict ${v.id} ${v.verdict}`, ...(v.file ? { at: at(v), quote: v.quote } : { reason: "no citation" }) });
    if (x.status !== "found") continue;
    // A found kind whose general rule is missing or does not verify keeps no general line; what failed gets a line.
    const g = x.general?.rule && ok(x.general) ? x.general : null;
    if (x.general?.rule && !g) dropped.push({ area: k, what: `general rule: ${x.general.rule}`, at: at(x.general), quote: x.general.quote });
    const rules = (x.rules || []).filter((y) => ok(y) || (dropped.push({ area: k, what: `rule: ${y.rule}`, at: at(y), quote: y.quote }), false));
    if (g || rules.length) parts.push({ k, general: g ? `- general: ${g.rule} (${g.basis}) ${at(g)}` : null, rules: rules.map((y) => `- ${y.rule} (code) ${at(y)}`) });
  }
  return { parts, errors, dropped };
}

// The detail's mechanism lines; a kind whose general rule a shown sentence lists is left out of its own section.
const mechLines = (parts, shown = new Set()) => parts.flatMap(({ k, general, rules }) => {
  const own = [...(general && !shown.has(`kind:${k}`) ? [general] : []), ...rules];
  return own.length ? [`### ${k}`, "", ...own, ""] : [];
});

const norm = (p) => posix.normalize(String(p).replace(/^(\.\/)+/, "")).replace(/\/$/, "");
const dropLine = (d) => `- ${d.area}: ${d.what} ${d.reason ?? `${d.at} ${JSON.stringify(d.quote)}`}`;

// The words that say in how many more places an area's general rule was seen; an idea or kind sentence has no `also`.
export const seen = (x) => ("also" in x ? ` seen in ${x.also} more place(s).` : "");

export function render(r, s, commit) {
  const out = ["---", `commit: ${commit}`, "version: 3", "---", "", "## What it is", "", r.profile.what, ""];
  out.push("## Screen 1: what the code shows", "", "Strike what is habit and not rule; correct the level where a rule is stated too narrowly.", "");
  s.drawer1.forEach((x, i) => out.push(`${i + 1}. ${x.text} (${x.at})${seen(x)}${x.risk ? ` Risk ${x.risk}.` : ""}`));
  if (s.drawer1LeftOut.length) out.push("", `Left out of this screen: ${s.drawer1LeftOut.length} sentence(s): ${Math.min(MAX_MORE, s.drawer1LeftOut.length)} on the second page, ${Math.max(0, s.drawer1LeftOut.length - MAX_MORE)} beyond it, not asked.`);
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

// details.md, apart from the screens: under each sentence the items it names, each with its citation, then the mechanism rules, then what the areas found in comments.
export function details(r, s, m, root, written = []) {
  const { ok, at } = checker(root);
  const { rules, seconds, ideas } = ruleIndex(root, r);
  const out = ["# Detail", "", "## Screen 1, sentence by sentence", ""];
  const asked = [...s.drawer1, ...s.drawer1LeftOut.slice(0, MAX_MORE)];
  asked.forEach((x, i) => {
    out.push(`### ${i + 1}. ${x.text}`, "");
    const mine = x.from.filter((id) => ideas.has(id) || rules.has(id));
    const line = (y) => `- ${y.rule} (${y.basis}${y.risk ? `; risk ${y.risk}: ${y.cost}` : ""}) ${y.at.join(", ")}`;
    for (const id of mine) out.push(rules.has(id) ? line(rules.get(id)) : `- ${ideas.get(id).text} ${ideas.get(id).at}`);
    out.push("");
  });
  const shown = new Set(asked.flatMap((x) => x.from));
  const unnamed = [...ideas].filter(([id]) => !shown.has(id));
  const lost = [
    ...unnamed.map(([id, y]) => `- [${id}] ${y.text} ${y.at}`),
    ...[...rules].filter(([k]) => !shown.has(k) && !k.startsWith("kind:")).map(([k, y]) => `- [${k}] ${y.rule} (${y.basis}; risk ${y.risk}: ${y.cost}) ${y.at.join(", ")}`),
    ...[...seconds].map(([k, y]) => `- [${k}] ${y.rule} (risk ${y.risk}: ${y.cost}) ${y.at}`),
  ];
  if (lost.length) out.push("## Rules no sentence shows", "", ...lost, "");
  out.push("## Mechanism rules", "", ...((lines) => (lines.length ? lines : ["(none)", ""]))(mechLines(m.parts, shown)));
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
