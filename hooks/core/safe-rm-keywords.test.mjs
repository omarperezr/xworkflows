import { test } from "node:test";
import assert from "node:assert/strict";
import { decide } from "./safe-rm.mjs";

const run = (command) => decide({ event: "preTool", tool: "Bash", kind: "shell", session: "s", root: "/r", isSubagent: false, writes: [], command }, {}).decision;

test("rm -rf with a variable behind a shell keyword, bracket or wrapper option: deny", () => {
  for (const c of [
    'for d in $DIRS; do rm -rf "$ROOT/$d"; done',
    'if [ -d "$B" ]; then rm -rf "$B"; fi',
    'if rm -rf "$X"; then :; fi',
    '{ rm -rf "$X"; }',
    '( rm -rf "$X" )',
    '(rm -rf "$X")',
    '! rm -rf "$X"',
    'sudo -u app rm -rf "$X"',
    'sleep 1 & rm -rf "$X"',
    'rm -rf "$@"',
  ]) assert.equal(run(c), "deny", c);
});

test("a heredoc body is text, not commands: allow", () => {
  assert.equal(run("cat > Makefile <<'EOF'\nclean:\n\trm -rf $(BUILD_DIR)\nEOF"), "allow");
  assert.equal(run("cat > Makefile <<'EOF'\nrm -rf $(BUILD_DIR)\nEOF"), "allow");
});
