// Replay of recorded owner answers. No SDK import: the tests load this file.
import { readFileSync } from "node:fs";

const label = (o) => (typeof o === "string" ? o : o?.label ?? "");

export function parseLog(logText) {
  const out = [];
  for (const l of logText.split("\n")) {
    if (!l.trim()) continue;
    try { out.push(JSON.parse(l)); } catch { /* truncated line */ }
  }
  return out;
}

export function lastRun(logText) {
  const ls = parseLog(logText);
  const run = ls.at(-1)?.run;
  return ls.filter((l) => l.run === run);
}

export function toAnswers(logText) {
  const a = {};
  for (const l of lastRun(logText)) a[l.id] = l.answer;
  return a;
}

// A pretty { id: answer } object (as printed below) or a JSONL log; throws when no id loads.
export function loadAnswers(text) {
  let a = null;
  try { const j = JSON.parse(text); if (j && typeof j === "object" && !Array.isArray(j)) a = j; } catch { /* not one object */ }
  a ??= toAnswers(text);
  if (!Object.keys(a).length) throw new Error("no answer id loaded");
  return a;
}

export function answerFor(q, answers) {
  const id = q.header;
  if (id === "S5-next") return { answer: "", miss: false, stop: true };
  if (/^P-H\d+$/.test(id)) return { answer: "Right", miss: false };
  if (!Object.hasOwn(answers, id)) return { answer: "I don't know", miss: true };
  const text = answers[id];
  const hit = (q.options || []).map(label).find((o) => o.trim().toLowerCase() === String(text).trim().toLowerCase());
  return { answer: hit ?? text, miss: false };
}

const covers = (p, e) => e === p || e.startsWith(p.replace(/\/$/, "") + "/");

// Which listed paths exist (to remove) and which do not.
export function stripPlan(list, existing) {
  const remove = list.filter((p) => existing.some((e) => covers(p, e)));
  return { remove, absent: list.filter((p) => !remove.includes(p)) };
}

// Listed paths still present after the removal; the harness fails if any.
export function stripLeft(list, existing) {
  return list.filter((p) => existing.some((e) => covers(p, e)));
}

if (import.meta.url === `file://${process.argv[1]}` && process.argv[2]) {
  console.log(JSON.stringify(toAnswers(readFileSync(process.argv[2], "utf8")), null, 2));
}
