export const meta = {
  name: "dream",
  description: "One analyzer per session file, in parallel, then one organizer alone over the memory notes of the dream branch.",
  phases: [{ title: "Analyze" }, { title: "Organize" }],
};

// args: sessions (the text files), memory (the folder of the branch's worktree), focus, agents { analyzer, organizer }, model (the cheap tier's), brought (the names of the old notes `open` copied in).
const { sessions, memory, focus, agents, model, brought = [] } = args;
const steer = (focus ? `\nSteer toward this: ${focus}` : "") + (brought.length ? `\nBrought notes (old notes from an earlier folder): ${brought.join(", ")}` : "");
const list = (props) => ({ type: "array", items: { type: "object", properties: props, required: Object.keys(props) } });
const str = { type: "string" };
const EXTRA = {
  remove: list({ note: str, reason: str }),
  fates: list({ note: str, fate: str, into: str, reason: str }),
  owner: list({ text: str, note: str }),
};

const ANALYZED = {
  type: "object",
  properties: { proposals: { type: "array", items: { type: "object", properties: { rule: { type: "string" }, session: { type: "string" } }, required: ["rule", "session"] } }, ...EXTRA },
  required: ["proposals"],
};
const ORGANIZED = {
  type: "object",
  properties: { merged: { type: "integer" }, conflicts: { type: "integer" }, ...EXTRA },
  required: ["merged", "conflicts"],
};

phase("Analyze");
const found = await parallel(sessions.map((file, i) => () => agent(
  `Session file: ${file}\nMemory folder: ${memory}${steer}`,
  { agentType: agents.analyzer, model, schema: ANALYZED, label: `analyze ${i + 1}`, phase: "Analyze" },
)));
const ok = found.filter((r) => r);

phase("Organize");
const merged = await agent(
  `Memory folder: ${memory}${steer}`,
  { agentType: agents.organizer, model, schema: ORGANIZED, label: "organize", phase: "Organize" },
);
return {
  merged: merged?.merged ?? 0,
  conflicts: merged?.conflicts ?? 0,
  proposals: ok.flatMap((r) => r.proposals),
  missing: sessions.filter((_, i) => !found[i]).map((f) => f.split(/[\\/]/).pop().replace(/\.txt$/, "")), // the session names close takes in --not-read
  // the agents list; the close runs the removals, the skill reports the fates and the owner text
  ...Object.fromEntries(Object.keys(EXTRA).map((k) => [k, [...ok, merged ?? {}].flatMap((r) => r[k] ?? [])])),
};
