const SHAPE = {
  "red:": "`red: <test file>::<case> - <the line that fails>`, run BEFORE the fix",
  "green:": "`green: <test file>::<case>`, the same test passing after",
  "skipped:": "`skipped: <what was left out and why>` (or `skipped: nothing`)",
  "sha:": "`sha: <commit>`",
  "reviewed:": "`reviewed: <the files you read and judged>`",
  "not checked:": "`not checked: <what mattered and you did not review>` (or `not checked: nothing`)",
  "discarded:": "`discarded: <why the finding does not hold>`",
};

export function decide(ev, ctx) {
  if (ev.kind !== "handback") return { decision: "allow" };
  const { owner, roles } = ctx.config;
  const msg = String(ev.message ?? "");
  const line = (k, flags = "im") => new RegExp(`^[\\s*>\`-]*${k}`, flags).test(msg);
  const has = (k) => line(k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // an agent renamed by the installer (xwf-<name>) is still its role
  const is = (role) => ev.agent != null && role != null && ev.agent === (ctx.agentName?.(role) ?? role); // when ours was renamed xwf-<role>, the bare name is the project's own agent
  const implementer = roles.implementers?.some(is);
  const reviewer = is(roles.reviewer) || is(roles.riskReviewer);
  const verifier = is(roles.verifier);
  if (!implementer && !reviewer && !verifier) return pass(ctx);

  // the escapes are exact lowercase at line start; a note that merely mentions them is not one
  if (line(implementer ? "(blocked|needs judgment|cannot test):" : "blocked:", "m")) return pass(ctx);

  let missing;
  if (verifier) missing = has("red:") || has("discarded:") ? [] : ["red:", "discarded:"];
  else if (reviewer) missing = ["reviewed:", "not checked:"].filter((k) => !has(k));
  else {
    const noTest = has("no-test:");
    missing = ["red:", "green:", "skipped:", "sha:"].filter((k) => !has(k) && !(noTest && (k === "red:" || k === "green:")));
  }
  if (!missing.length) return pass(ctx);

  const shapes = verifier ? "`red: <test file>::<case> - <the line that fails>` (the finding reproduces) or `discarded: <why the finding does not hold>`" : missing.map((k) => SHAPE[k]).join("; ");
  const reason = `Missing from the final report: ${missing.join(verifier ? " or " : ", ")}. Each key at the start of a line, plain text, no bold or numbering. Each line: ${shapes}. ${implementer ? "A change with no logic may use `no-test: <reason>` in place of red and green. " : ""}If you cannot do the task, hand back \`blocked: <question for ${owner}>\`${implementer ? " (or `needs judgment` / `cannot test`)" : ""}.`;
  return { decision: "deny", reason };
}

function pass(ctx) {
  ctx.save("agents", "0"); // a handback resets the orchestrator's agent count
  return { decision: "allow" };
}
