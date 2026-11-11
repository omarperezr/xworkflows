// Grammar: https://github.com/openai/codex/blob/main/codex-rs/apply-patch/src/parser.rs
export function parsePatch(text) {
  const writes = [];
  let file = null; // the Add/Update block being read
  let hunk = null;
  const endHunk = () => {
    if (hunk) writes.push({ path: file.path, old: hunk.old.join("\n"), new: hunk.new.join("\n") });
    hunk = null;
  };
  const endFile = () => {
    endHunk();
    if (file?.add) writes.push({ path: file.path, content: file.lines.join("\n") });
    file = null;
  };
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\*\*\* (Add File|Update File|Delete File|Move to): (.+)$/);
    if (m || line.startsWith("*** ")) {
      if (m?.[1] === "Move to") continue;
      endFile();
      if (m?.[1] === "Add File") file = { path: m[2], add: true, lines: [] };
      if (m?.[1] === "Update File") file = { path: m[2] };
    } else if (file?.add) {
      if (line.startsWith("+")) file.lines.push(line.slice(1));
    } else if (file) {
      if (line.startsWith("@@")) endHunk();
      else if (/^[ +-]/.test(line)) {
        hunk ??= { old: [], new: [] };
        if (line[0] !== "+") hunk.old.push(line.slice(1));
        if (line[0] !== "-") hunk.new.push(line.slice(1));
      }
    }
  }
  endFile();
  return writes;
}

export function normalize(raw, env) {
  if (!raw.session_id) throw new Error("no session_id");
  const { tool_name: tool, tool_input: i = {} } = raw;
  // shortcut: Codex marks subagents only on SubagentStart/Stop; design-first does not need it, add the running count of 7.2 with the orchestrator hook.
  const ev = { event: "preTool", tool, kind: "other", session: raw.session_id, root: raw.cwd, isSubagent: false };
  if (tool === "apply_patch") return { ...ev, kind: "write", writes: parsePatch(i.command) };
  if (tool === "Bash") return { ...ev, kind: "shell", command: [i.command].flat().join(" ") };
  return ev;
}

export const answer = (d) => ({
  stdout: d.decision === "deny"
    ? JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: d.reason } })
    : "",
  exitCode: 0,
});
