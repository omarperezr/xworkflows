// Grader for trial folders. No SDK import: the tests load this file.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { lastRun } from "./answers.mjs";

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");
// A harness trial folder has research files at its root; a live copy has them in .xworkflows/.
export const art = (dir, f) => (existsSync(join(dir, f)) ? join(dir, f) : join(dir, ".xworkflows", f));
const ls = (d) => (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".md")).sort().map((f) => read(join(d, f))) : []);

const research = (dir) => { try { return JSON.parse(read(art(dir, "research.json"))); } catch { return null; } };
// "file:line" of each citation render dropped (## Dropped in research.md; old layout: ## Dropped citations); a line is "- area: what file:line "quote"" or an old "- area: file:line"
const dropped = (md) => new Set([...(md.split(/^## Dropped[^\n]*\n/m)[1]?.split(/^## /m)[0] ?? "").matchAll(/^- \S+: (?:.* )?(\S+:\d+)(?: ".*")?$/gm)].map((m) => m[1]));
// kinds with their dropped rules removed; none at all when research.md is missing
function kindsOf(dir) {
  const md = read(art(dir, "research.md"));
  if (!md) return [];
  const d = dropped(md);
  return kindList(research(dir)).map((k) => ({ ...k, rules: (k.rules ?? []).filter((r) => !d.has(`${r.file}:${r.line}`)) }));
}
// kinds is a map keyed by kind (an array is accepted too)
const kindList = (r) => Object.values(r?.kinds ?? {}).filter(Boolean);

function heading5(md) {
  const m = md.match(/^## 5\b[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  return m ? m[1] : "";
}

export function grade(dir, rubric) {
  // version 3 research.md has no heading 5: its verified citations are in details.md
  const R = heading5(read(art(dir, "research.md"))) || read(art(dir, "details.md"));
  const I = [read(join(dir, "AGENTS.md")).split(/^## Project rules[^\n]*\n/m)[1]?.split(/^## /m)[0] ?? "",
    ...ls(join(dir, ".claude/rules")), read(join(dir, ".claude/agents/risk-review.md"))].join("\n");
  const has = (text, inv) => inv.patterns.every((p) => new RegExp(p, "i").test(text));
  return {
    R: rubric.invariants.filter((i) => has(R, i)).map((i) => i.id),
    I: rubric.invariants.filter((i) => has(I, i)).map((i) => i.id),
  };
}

export function stats(values) {
  if (!values.length) return { min: null, max: null, mean: null, spread: null };
  const min = Math.min(...values), max = Math.max(...values);
  return { min, max, mean: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100, spread: max - min };
}

export const kindsFound = (dir) => kindsOf(dir).filter((k) => k.status === "found" && k.rules.length).map((k) => k.kind);

export function noMoneyCheck(dir) {
  const why = [];
  const ks = kindsOf(dir);
  if (!ks.length) why.push("research.md or research.json missing");
  for (const k of ks) {
    if (k.status === "not-present" && k.rules?.length) why.push(`${k.kind}: not-present but has ${k.rules.length} rule(s)`);
    if (k.kind === "values") for (const r of k.rules ?? []) if (/money|currency|price/i.test(`${r.rule} ${r.quote}`)) why.push(`values: money rule ${r.file}:${r.line}`);
  }
  const ok3 = ks.some((k) => ["compat", "conc", "input"].includes(k.kind) && k.status === "found" && k.rules?.length);
  if (!ok3) why.push("none of compat, conc, input found with a rule");
  return { ok: !why.length, why };
}

export function recommendedReport(logText, r, researchMd = "") {
  const d = dropped(researchMd);
  const rules = kindList(r).flatMap((k) => (k.status === "found" ? k.rules ?? [] : []));
  const verified = new Set(rules.map((x) => `${x.file}:${x.line}`).filter((c) => !d.has(c)));
  const found = new Set(kindList(r).filter((k) => k.status === "found").map((k) => k.kind));
  const out = [];
  for (const l of lastRun(logText)) {
    for (const o of l.options ?? []) {
      const text = typeof o === "string" ? o : o?.label ?? "";
      if (!text.includes("(Recommended)")) continue;
      const cites = (text.match(/[\w./-]+:\d+/g) ?? []).some((c) => verified.has(c));
      const h5 = l.id.match(/^H5-([a-z]+)$/);
      out.push({ id: l.id, option: text, cited: cites || (!!h5 && found.has(h5[1])) });
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [flag, ...rest] = process.argv.slice(2);
  const show = (o) => console.log(JSON.stringify(o, null, 2));
  for (const t of flag === "--rubric" ? rest.slice(1) : rest) if (!existsSync(art(t, "research.md"))) console.error(`warning: ${t}: no research.md at the root or in .xworkflows/; R counts 0`);
  if (flag === "--rubric") {
    const rubric = JSON.parse(read(rest[0]));
    const trials = rest.slice(1);
    if (!trials.length) { console.error("no trial folders"); process.exit(2); }
    const rows = trials.map((t) => ({ trial: t, ...grade(t, rubric), meta: JSON.parse(read(join(t, "meta.json")) || "{}") }));
    const byInv = Object.fromEntries(rubric.invariants.map((i) => [i.id, rows.filter((r) => r.I.includes(i.id)).length / rows.length]));
    show({
      trials: rows.map((r) => ({ trial: r.trial, R: r.R.length, I: r.I.length, missedR: rubric.invariants.map((i) => i.id).filter((id) => !r.R.includes(id)), missedI: rubric.invariants.map((i) => i.id).filter((id) => !r.I.includes(id)), misses: r.meta.misses, costUsd: r.meta.costUsd })),
      R: stats(rows.map((r) => r.R.length)), I: stats(rows.map((r) => r.I.length)), recoveryRateI: byInv,
    });
  } else if (flag === "--kinds") for (const t of rest) console.log(t, kindsFound(t).length);
  else if (flag === "--no-money") for (const t of rest) console.log(t, JSON.stringify(noMoneyCheck(t)));
  else if (flag === "--log") for (const t of rest) show(recommendedReport(read(art(t, "interview.log.jsonl")), research(t), read(art(t, "research.md"))));
  else { console.error("usage: grade.mjs --rubric <file> <trialDir...> | --kinds|--no-money|--log <trialDir...>"); process.exit(2); }
}
