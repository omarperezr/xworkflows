// Docs: https://cursor.com/docs/agent/hooks (invalid JSON or schema mismatch blocks the action, so every answer is JSON)
export function normalize(raw, env) {
  if (!raw.conversation_id) throw new Error("no conversation_id");
  const { tool_name: tool, tool_input: i = {} } = raw;
  // shortcut: Cursor subagents are not told apart; design-first does not need it, add it with the orchestrator hook.
  const ev = { event: "preTool", tool, kind: "other", session: raw.conversation_id, root: raw.workspace_roots?.[0] ?? raw.cwd, isSubagent: false };
  // not confirmed: the Write tool_input shape is assumed; `edits` is a guess for the multi-edit form
  if (tool === "Write") return { ...ev, kind: "write", writes: i.content === undefined && Array.isArray(i.edits)
    ? i.edits.map((e) => ({ path: i.file_path, old: e.old_string, new: e.new_string }))
    : [{ path: i.file_path, content: i.content }] };
  if (tool === "Shell") return { ...ev, kind: "shell", command: i.command };
  return ev;
}

export const answer = (d) => ({
  stdout: JSON.stringify(d.decision === "deny"
    ? { permission: "deny", user_message: d.reason, agent_message: d.reason }
    : { permission: "allow" }),
  exitCode: 0,
});
