import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decide } from "./safe-db.mjs";

const root = mkdtempSync(join(tmpdir(), "safe-db-"));
const ev = (command) => ({ event: "preTool", tool: "Bash", kind: "shell", session: "s", root, isSubagent: false, writes: [], command });
const ctx = { readFile: () => null };

test("cat fed a literal (here-string or heredoc) naming a db into xargs rm asks", () => {
  for (const c of ["cat <<< app.db | xargs rm", "cat <<'EOF' | xargs rm\napp.db\nEOF"]) assert.equal(decide(ev(c), ctx).decision, "ask", c);
});
