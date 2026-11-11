export function normalize(raw, env) {
  if (!raw.session_id) throw new Error("no session_id");
  const { tool_name: tool, tool_input: i = {} } = raw;
  const ev = { event: "preTool", tool, kind: "other", session: raw.session_id, root: env.CLAUDE_PROJECT_DIR ?? raw.cwd, isSubagent: Boolean(raw.agent_id) };
  if (tool === "Write") return { ...ev, kind: "write", writes: [{ path: i.file_path, content: i.content }] };
  if (tool === "Edit") return { ...ev, kind: "write", writes: [{ path: i.file_path, old: i.old_string, new: i.new_string }] };
  if (tool === "MultiEdit") return { ...ev, kind: "write", writes: i.edits.map((e) => ({ path: i.file_path, old: e.old_string, new: e.new_string })) };
  if (tool === "Bash") return { ...ev, kind: "shell", command: i.command };
  return ev;
}

export const answer = (d) => ({
  stdout: d.decision === "deny"
    ? JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: d.reason } })
    : "",
  exitCode: 0,
});
