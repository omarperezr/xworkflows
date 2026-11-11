// Docs: https://geminicli.com/docs/hooks/reference/ (stdout must hold only JSON)
export function normalize(raw, env) {
  if (!raw.session_id) throw new Error("no session_id");
  const { tool_name: tool, tool_input: i = {} } = raw;
  // shortcut: Gemini subagents are not told apart; design-first does not need it, add it with the orchestrator hook.
  const ev = { event: "preTool", tool, kind: "other", session: raw.session_id, root: raw.cwd, isSubagent: false };
  if (tool === "write_file") return { ...ev, kind: "write", writes: [{ path: i.file_path, content: i.content }] };
  if (tool === "replace") return { ...ev, kind: "write", writes: [{ path: i.file_path, old: i.old_string, new: i.new_string }] };
  if (tool === "run_shell_command") return { ...ev, kind: "shell", command: i.command };
  return ev;
}

export const answer = (d) => ({
  stdout: JSON.stringify(d.decision === "deny" ? { decision: "deny", reason: d.reason } : {}),
  exitCode: 0,
});
