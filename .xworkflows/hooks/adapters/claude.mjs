export function normalize(raw, env) {
  if (!raw.session_id) throw new Error("no session_id");
  const { tool_name: tool, tool_input: i = {} } = raw;
  const ev = { event: "preTool", tool, kind: "other", session: raw.session_id, root: env.CLAUDE_PROJECT_DIR ?? raw.cwd, isSubagent: Boolean(raw.agent_id), hookEvent: raw.hook_event_name };
  if (raw.hook_event_name === "UserPromptSubmit") return { ...ev, event: "prompt", prompt: raw.prompt, fromUser: !/^(<task-notification>|Another Claude session sent a message)/.test(String(raw.prompt).trim()) };
  if (raw.hook_event_name === "SessionStart") return { ...ev, event: "sessionStart", source: raw.source, transcript: raw.transcript_path };
  if (raw.hook_event_name === "PreCompact") return { ...ev, event: "preCompact" };
  if (raw.hook_event_name === "SessionEnd") return { ...ev, event: "sessionEnd" };
  if (raw.hook_event_name === "PostToolUse") return { ...ev, event: "postTool", input: i, response: raw.tool_response };
  if (tool === "Workflow") return { ...ev, kind: "workflow", inline: Boolean(i.script), scriptPath: i.scriptPath, args: i.args };
  if (tool === "Write") return { ...ev, kind: "write", writes: [{ path: i.file_path, content: i.content }] };
  if (tool === "Edit") return { ...ev, kind: "write", writes: [{ path: i.file_path, old: i.old_string, new: i.new_string }] };
  if (tool === "MultiEdit") return { ...ev, kind: "write", writes: i.edits.map((e) => ({ path: i.file_path, old: e.old_string, new: e.new_string })) };
  if (tool === "Bash") return { ...ev, kind: "shell", command: i.command };
  if (tool === "Read") return { ...ev, kind: "read", path: i.file_path, limit: i.limit };
  if (tool === "Agent") return { ...ev, kind: "agent", agent: i.subagent_type, prompt: i.prompt };
  if (tool === "WebSearch" || tool === "WebFetch") return { ...ev, kind: "web" };
  if (tool === "AskUserQuestion") return { ...ev, kind: "ask" };
  if (tool === "SubagentHandback") return { ...ev, kind: "handback", agent: raw.agent_type, message: String(i.message ?? "") };
  return ev;
}

export function answer(d, ev) {
  let stdout = "";
  if (d.decision === "deny" && (!ev || ev.event === "preTool")) stdout = JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: d.reason } });
  else if (d.decision !== "deny" && typeof d.context === "string" && d.context) stdout = JSON.stringify({ hookSpecificOutput: { hookEventName: ev?.hookEvent, additionalContext: d.context } });
  return { stdout, exitCode: 0 };
}
