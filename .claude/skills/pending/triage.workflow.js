export const meta = {
  name: "pending-triage",
  description: "Judges the unscheduled pending cards, 20 per agent in parallel; a chunk that fails leaves its cards not judged.",
  phases: [{ title: "Judge" }],
};

// args: cards [{ n, text, origin }], agent, model (the cheap tier's).
const { cards, agent: agentType, model } = args;
const str = { type: "string" };
const JUDGED = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: { n: {}, kind: { enum: ["finding", "ordered"] }, row: { enum: ["blocking", "pending", "drop", null] }, reason: str },
        required: ["n", "kind", "row", "reason"],
      },
    },
  },
  required: ["results"],
};

phase("Judge");
const chunks = [];
for (let i = 0; i < cards.length; i += 20) chunks.push(cards.slice(i, i + 20));
const ask = (chunk, i) => agent(
  `Judge these cards:\n${JSON.stringify(chunk)}`,
  { agentType, model, schema: JUDGED, label: `judge ${i + 1}`, phase: "Judge" },
);
const got = await parallel(chunks.map((chunk, i) => () => ask(chunk, i)));

// a result counts only for a card of its own chunk; a finding needs a row, an ordered card never has one
const judged = [], ordered = [], seen = new Set();
chunks.forEach((chunk, i) => {
  const mine = new Set(chunk.map((c) => c.n));
  for (const r of got[i]?.results ?? []) {
    if (!mine.has(r.n) || seen.has(r.n)) continue;
    if (r.kind === "ordered") ordered.push({ ...r, row: null });
    else if (["blocking", "pending", "drop"].includes(r.row)) judged.push(r);
    else continue;
    seen.add(r.n);
  }
});
return { judged, ordered, notJudged: cards.filter((c) => !seen.has(c.n)).map((c) => c.n) };
