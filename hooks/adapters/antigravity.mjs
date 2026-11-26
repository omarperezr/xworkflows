import { readFileSync, writeFileSync, existsSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WF_SUFFIX = "When you are done, call the finish tool with your result.";
const safeId = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, "_");
const readText = (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } };
const readJson = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const writeState = (p, v) => { try { writeFileSync(p, typeof v === "string" ? v : JSON.stringify(v)); } catch { /* ignore */ } };

function readStep(transcriptPath, stepIdx) {
  if (typeof transcriptPath !== "string" || !transcriptPath || !Number.isInteger(stepIdx)) return null;
  const text = readText(transcriptPath);
  if (!text) return null;
  const lines = text.trimEnd().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    let o;
    try { o = JSON.parse(lines[i]); } catch { continue; }
    if (o?.step_index === stepIdx) return o;
  }
  return null;
}

function lastStep(transcriptPath) {
  if (typeof transcriptPath !== "string" || !transcriptPath) return null;
  const text = readText(transcriptPath);
  if (!text) return null;
  const lines = text.trimEnd().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].trim()) continue;
    try { return JSON.parse(lines[i]); } catch { /* try earlier */ }
  }
  return null;
}

function parentFromTranscript(transcriptPath) {
  if (typeof transcriptPath !== "string" || !transcriptPath) return null;
  const text = readText(transcriptPath);
  if (!text) return null;
  const lines = text.split("\n", 5);
  for (const line of lines) {
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const content = typeof o?.content === "string" ? o.content : "";
    const m = /sender=([0-9a-f-]{8,})/i.exec(content);
    if (m) return { parent: m[1] };
  }
  return null;
}

function recordSession(root, cid, transcript, env) {
  if (!root || !cid || typeof transcript !== "string" || !transcript || env?.XWORKFLOWS_DRY) return;
  try {
    const dir = join(root, ".xworkflows");
    if (!existsSync(dir) || lstatSync(dir).isSymbolicLink()) return;
    const file = join(dir, "local.json");
    if (existsSync(file) && lstatSync(file).isSymbolicLink()) return;
    const raw = readJson(file);
    const local = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const ag = local.antigravity && typeof local.antigravity === "object" && !Array.isArray(local.antigravity) ? local.antigravity : {};
    const prev = Array.isArray(ag.sessions) ? ag.sessions.filter((s) => s && s.id !== cid) : [];
    prev.push({ id: cid, transcript, startedAt: new Date().toISOString() });
    local.antigravity = { ...ag, sessions: prev.slice(-200) };
    writeFileSync(file, JSON.stringify(local, null, 2) + "\n");
  } catch { /* never fail a hook */ }
}

function recordSubagents(raw, args, stateDir) {
  const step = readStep(raw.transcriptPath, raw.stepIdx);
  const content = typeof step?.content === "string" ? step.content : "";
  if (!content) return;
  const ids = [...content.matchAll(/"conversationId"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
  if (!ids.length) return;
  const types = Array.isArray(args.Subagents) ? args.Subagents.map((s) => s?.TypeName) : [args.TypeName];
  for (let i = 0; i < ids.length; i++) {
    const agent = types[i] ?? types[0];
    writeState(join(stateDir, `xwf-ag-sub-${safeId(ids[i])}`), { parent: raw.conversationId, ...(agent ? { agent } : {}) });
  }
}

function parseAskAnswers(text, questions) {
  const answers = {};
  if (typeof text !== "string" || !Array.isArray(questions)) return answers;
  const matches = [...text.matchAll(/^([QA])(\d+):\s*/gm)];
  for (let i = 0; i < matches.length; i++) {
    if (matches[i][1] !== "A") continue;
    const idx = Number(matches[i][2]) - 1;
    if (idx < 0 || idx >= questions.length) continue;
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const val = text.slice(start, end).trim();
    if (val) answers[questions[idx].question] = val;
  }
  return answers;
}

const lineLimit = (a) => (Number.isFinite(a.EndLine) ? a.EndLine - (Number.isFinite(a.StartLine) ? a.StartLine : 1) + 1 : undefined);

export function normalize(raw, env = {}) {
  if (!raw?.conversationId || typeof raw.conversationId !== "string") throw new Error("no conversationId");
  const cid = raw.conversationId;
  const root = (Array.isArray(raw.workspacePaths) && typeof raw.workspacePaths[0] === "string" && raw.workspacePaths[0]) || raw.cwd;
  const cwd = raw.cwd || root;
  const stateDir = env.XWORKFLOWS_STATE_DIR ?? tmpdir();
  const hookEvent = raw.hookEventName;
  const lastInput = typeof raw.lastUserInput === "string" ? raw.lastUserInput : "";

  let sub = readJson(join(stateDir, `xwf-ag-sub-${safeId(cid)}`));
  let isSubagent = Boolean(sub);
  let parent = sub?.parent ?? null;
  let agent = sub?.agent;

  if (!isSubagent && lastInput.trimEnd().endsWith(WF_SUFFIX)) {
    isSubagent = true;
    const m = /^Agent:\s*([A-Za-z0-9_-]+)\s*\n/.exec(lastInput);
    if (m) agent = m[1];
  } else if (!isSubagent && !lastInput && raw.transcriptPath) {
    const fromT = parentFromTranscript(raw.transcriptPath);
    if (fromT) { isSubagent = true; parent = fromT.parent; }
  }

  const tool = raw.toolCall?.name;
  const a = raw.toolCall?.args ?? {};
  const ev = {
    event: "preTool",
    tool,
    kind: "other",
    session: parent || cid,
    root,
    cwd,
    toolDir: ".agents",
    isSubagent,
    ...(isSubagent && agent ? { agent } : {}),
    hookEvent,
  };

  if (hookEvent === "SessionStart") {
    if (isSubagent) return { ...ev, event: "other" };
    recordSession(root, cid, raw.transcriptPath, env);
    return { ...ev, event: "sessionStart", source: "startup", transcript: raw.transcriptPath };
  }

  if (hookEvent === "Stop") {
    return { ...ev, event: "stop", fullyIdle: Boolean(raw.fullyIdle), terminationReason: raw.terminationReason };
  }

  if (hookEvent === "PreInvocation") {
    if (isSubagent) return { ...ev, event: "prompt", prompt: lastInput, fromUser: false };
    const keyFile = join(stateDir, `xwf-ag-prompt-${safeId(cid)}`);
    const prev = readText(keyFile);
    const step = lastStep(raw.transcriptPath);
    let fromUser = false;
    if (step) {
      const idxKey = `s:${step.step_index ?? raw.initialNumSteps ?? ""}`;
      const explicit = step.type === "USER_INPUT" && (step.source === "USER_EXPLICIT" || (!step.source && !/^(<task-notification>|\[Message\]|sender=)/.test(String(step.content ?? "").trim())));
      if (explicit && idxKey !== prev) { fromUser = true; writeState(keyFile, idxKey); }
    } else if (raw.invocationNum === 0 && lastInput.trim() && !/^(<task-notification>|\[Message\]|sender=)/.test(lastInput.trim())) {
      const txtKey = `t:${lastInput}`;
      if (txtKey !== prev) { fromUser = true; writeState(keyFile, txtKey); }
    }
    return { ...ev, event: "prompt", prompt: lastInput, fromUser };
  }

  if (hookEvent === "PostToolUse") {
    if (tool === "invoke_subagent") recordSubagents(raw, a, stateDir);
    if (tool === "ask_question") {
      const rawQs = Array.isArray(a.questions) ? a.questions : [];
      const questions = rawQs.map((q) => {
        const text = String(q?.question ?? "");
        const header = /^\[([A-Za-z0-9._-]+)\]\s*/.exec(text)?.[1] ?? q?.header ?? "";
        const options = (q?.options ?? []).map((o) => (typeof o === "string" ? { label: o } : o));
        return { ...q, question: text, header, options };
      });
      const step = readStep(raw.transcriptPath, raw.stepIdx);
      const parsed = parseAskAnswers(step?.content, questions);
      const answers = Object.keys(parsed).length ? parsed : (raw.tool_response?.answers ?? a.answers ?? {});
      return { ...ev, event: "postTool", kind: "ask", input: { questions, answers }, response: { answers } };
    }
    return { ...ev, event: "postTool", input: a, response: raw.tool_response };
  }

  if (hookEvent && hookEvent !== "PreToolUse") return { ...ev, event: "other" };

  if (tool === "run_workflow") return { ...ev, kind: "workflow", inline: Boolean(a.Script), scriptPath: a.ScriptPath, args: a.Args };
  if (tool === "write_file") {
    const w = a.Append ? { path: a.Path, old: "", new: a.Content ?? "" } : { path: a.Path, content: a.Content };
    return { ...ev, kind: "write", writes: [w] };
  }
  if (tool === "write_to_file") return { ...ev, kind: "write", writes: [{ path: a.TargetFile, content: a.CodeContent }] };
  if (tool === "edit_file") return { ...ev, kind: "write", writes: [{ path: a.Path, old: a.Target, new: a.Replacement }] };
  if (tool === "replace_file_content") return { ...ev, kind: "write", writes: [{ path: a.TargetFile, old: a.TargetContent, new: a.ReplacementContent }] };
  if (tool === "multi_replace_file_content") {
    const writes = (a.ReplacementChunks ?? []).map((c) => ({ path: a.TargetFile, old: c.TargetContent, new: c.ReplacementContent }));
    return { ...ev, kind: "write", writes };
  }
  if (tool === "run_command") return { ...ev, kind: "shell", command: a.CommandLine };
  if (tool === "read_file") return { ...ev, kind: "read", path: a.Path, limit: lineLimit(a) };
  if (tool === "view_file") return { ...ev, kind: "read", path: a.AbsolutePath, limit: lineLimit(a) };
  if (tool === "invoke_subagent") {
    const first = Array.isArray(a.Subagents) ? a.Subagents[0] : null;
    return { ...ev, kind: "agent", agent: a.TypeName ?? first?.TypeName, prompt: a.Prompt ?? first?.Prompt };
  }
  if (tool === "search_web" || tool === "read_url_content") return { ...ev, kind: "web" };
  if (tool === "ask_question") return { ...ev, kind: "ask" };
  if (tool === "send_message" && isSubagent && (!parent || a.Recipient === parent)) {
    return { ...ev, kind: "handback", agent, message: String(a.Message ?? "") };
  }
  return ev;
}

export function answer(d, ev) {
  if (!ev || ev.event === "preTool") {
    if (d.decision === "deny" || d.decision === "ask") {
      return { stdout: JSON.stringify({ decision: d.decision, ...(d.reason ? { reason: d.reason } : {}) }), exitCode: 0 };
    }
    return { stdout: JSON.stringify({ decision: "allow" }), exitCode: 0 };
  }
  if ((ev.event === "sessionStart" || ev.event === "prompt") && d.decision !== "deny" && d.decision !== "ask" && typeof d.context === "string" && d.context) {
    const msg = { systemMessage: d.context, ...(typeof d.notice === "string" && d.notice ? { metadata: { user_markdown: d.notice } } : {}) };
    return { stdout: JSON.stringify({ injectSteps: [{ systemMessage: msg }] }), exitCode: 0 };
  }
  return { stdout: "{}", exitCode: 0 };
}
