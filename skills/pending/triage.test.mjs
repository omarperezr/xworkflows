import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "../../test-tmp.mjs";

const bin = fileURLToPath(new URL("./triage.mjs", import.meta.url));
const card = (n, status, text = `text ${n}`) => `- **P-${n}** — ${text}. Origin: somewhere. Status: ${status}.`;
const LIST = [
  "# Pending", "", "## A",
  card(1, "unscheduled"), card(2, "scheduled"), card(3, "in progress on b-1"),
  "- **P-4** — no origin or status here", "", "## B",
  card(5, "unscheduled", "text with Origin: inside"), "trailing no newline",
].join("\n");

function project(content = LIST, pending = "docs/PENDING.md") {
  const root = mkdtempSync(join(tmpdir(), "triage-"));
  mkdirSync(join(root, "docs"));
  if (pending !== "docs/PENDING.md") {
    mkdirSync(join(root, ".xworkflows"));
    writeFileSync(join(root, ".xworkflows/config.json"), JSON.stringify({ paths: { pending } }));
  }
  writeFileSync(join(root, pending), content);
  return root;
}
const run = (root, ...a) => spawnSync(process.execPath, [bin, ...a], { cwd: root, encoding: "utf8" });

test("list names the unscheduled cards, the skipped ones and the malformed one", () => {
  const r = run(project(), "list");
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.cards, [
    { n: "P-1", text: "text 1", origin: "somewhere", line: 4 },
    { n: "P-5", text: "text with Origin: inside", origin: "somewhere", line: 10 },
  ]);
  assert.deepEqual(out.skipped, [{ n: "P-2", status: "scheduled" }, { n: "P-3", status: "in progress on b-1" }]);
  assert.deepEqual(out.malformed, [{ line: 7, text: "- **P-4** — no origin or status here" }]);
});

test("list reads the list from paths.pending", () => {
  const out = JSON.parse(run(project(card(9, "unscheduled") + "\n", "todo.md"), "list").stdout);
  assert.equal(out.cards[0].n, "P-9");
});

test("drop removes only the named lines and no other byte", () => {
  const root = project();
  const r = run(root, "drop", "--cards", "P-1,P-5");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(join(root, "docs/PENDING.md"), "utf8"), LIST.split("\n").filter((l) => !/^- \*\*P-[15]\*\*/.test(l)).join("\n"));
});

test("drop refuses an unknown, a scheduled, a malformed or an in-progress number and leaves the list unchanged", () => {
  for (const bad of ["P-99", "P-2", "P-3", "P-4"]) {
    const root = project();
    const r = run(root, "drop", "--cards", `P-1,${bad}`);
    assert.equal(r.status, 1, bad);
    assert.equal(readFileSync(join(root, "docs/PENDING.md"), "utf8"), LIST, bad);
  }
});
