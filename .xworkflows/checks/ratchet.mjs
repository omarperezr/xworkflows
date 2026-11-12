export const needs = ["checks.ratchets"];

const BASELINE = ".xworkflows/ratchets.json";
const cannot = (why) => ({ ok: false, cannotRun: true, lines: [why] });
const isCount = (n) => Number.isSafeInteger(n) && n >= 0;

export function run(range, ctx) {
  const list = ctx.config.checks.ratchets;
  if (!Array.isArray(list) || list.some((e) => typeof e?.name !== "string" || typeof e.count !== "string")) {
    return cannot("checks.ratchets is not a list of { name, count }");
  }
  if (!list.length) return { ok: true, lines: [] };
  if (ctx.git("rev-parse", "HEAD") !== range.head || ctx.git("status", "--porcelain", "--untracked-files=no") !== "") {
    return { ok: false, lines: [`check out ${range.ref ?? range.head.slice(0, 7)} or commit first`] }; // the commands count the working tree
  }
  const text = ctx.show(range.head, BASELINE);
  let base = {};
  if (text !== null) {
    try { base = JSON.parse(text); } catch { return cannot(`${BASELINE} is not valid JSON`); }
    if (!base || typeof base !== "object" || Array.isArray(base) || Object.values(base).some((v) => !isCount(v))) {
      return cannot(`${BASELINE} is not an object of { "<name>": n }`);
    }
  }
  const fails = [], notes = [];
  for (const { name, count } of list) {
    const r = ctx.exec("sh", ["-c", count]);
    if (r.code !== 0) return cannot(`${name}: count command ${r.code === null ? "was killed" : `exited ${r.code}`}: ${r.err.trim()}`);
    const out = r.out.trim();
    if (!/^\d+$/.test(out)) return cannot(`${name}: count command must print one integer, it printed: ${out.slice(0, 80) || "nothing"}`);
    const n = Number(out);
    const had = Object.hasOwn(base, name) ? base[name] : null;
    if (had === null) fails.push(`${name}: no baseline in ${BASELINE}`, `add "${name}": ${n} to ${BASELINE} and commit it`);
    else if (n > had) fails.push(`${name}: ${n} is above the baseline ${had}`, `pay the debt down to ${had} or less; the baseline in ${BASELINE} only goes down`);
    else if (n < had) notes.push(`${name}: lower the baseline to ${n}`);
  }
  return fails.length ? { ok: false, lines: fails } : { ok: true, lines: notes };
}
