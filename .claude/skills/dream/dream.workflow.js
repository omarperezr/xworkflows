export const meta = {
  name: "dream",
  description: "One analyzer per session file, in parallel, then one organizer alone over the memory notes of the dream branch.",
  phases: [{ title: "Analyze" }, { title: "Organize" }],
};

// args: sessions (the text files), memory (the folder of the branch's worktree), focus, agents { analyzer, organizer }, model (the cheap tier's), brought (the names of the old notes `open` copied in).
const { sessions, memory, focus, agents, model, brought = [] } = args;
const steer = focus ? `\nSteer toward this: ${focus}` : "";
const bring = brought.length ? `\nBrought notes (old notes from an earlier folder, each named by its bare file name): ${brought.join(", ")}` : ""; // only the organizer sees them
const list = (props) => ({ type: "array", items: { type: "object", properties: props, required: Object.keys(props) } });
const str = { type: "string" };
const EXTRA = {
  remove: list({ note: str, reason: str }),
  fates: list({ note: str, fate: str, into: str, reason: str }),
  owner: list({ text: str, note: str }),
};

const ANALYZED = {
  type: "object",
  properties: { proposals: { type: "array", items: { type: "object", properties: { rule: { type: "string" }, session: { type: "string" } }, required: ["rule", "session"] } } },
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
  `Memory folder: ${memory}${steer}${bring}`,
  { agentType: agents.organizer, model, schema: ORGANIZED, label: "organize", phase: "Organize" },
);
return {
  merged: merged?.merged ?? 0,
  conflicts: merged?.conflicts ?? 0,
  proposals: ok.flatMap((r) => r.proposals),
  missing: sessions.filter((_, i) => !found[i]).map((f) => f.split(/[\\/]/).pop().replace(/\.txt$/, "")), // the session names close takes in --not-read
  // the organizer alone decides the fate of the brought notes; a note is its bare file name
  remove: (merged?.remove ?? []).map((r) => ({ ...r, note: r.note.startsWith(`${memory}/`) ? r.note.slice(memory.length + 1) : r.note })),
  fates: merged?.fates ?? [],
  owner: merged?.owner ?? [],
};
