import { test } from "node:test";
import assert from "node:assert/strict";
import { decide } from "./safe-db.mjs";

// the -f of docker compose is not a SQL file of psql
const yaml = "services:\n  db:\n    image: postgres # update the image tag\n";
const ctx = { readFile: (p) => (p.endsWith("docker-compose.yml") ? yaml : null) };
const run = (isSubagent) => decide({ event: "preTool", tool: "Bash", kind: "shell", session: "s", root: "/r", isSubagent, writes: [], command: 'docker compose -f docker-compose.yml exec -T db psql -U postgres -c "SELECT 1"' }, ctx).decision;

test("a -f before the client is not read as its SQL file", () => {
  assert.equal(run(false), "allow");
  assert.equal(run(true), "allow");
});
