import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync as makeTmp, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeRepo } from "../../test/helpers/repo.mjs";
import * as lint from "./lint.mjs";
import * as semgrep from "./semgrep.mjs";
import * as trivy from "./trivy.mjs";
const madeTmp = [];
const mkdtempSync = (p) => { const d = makeTmp(p); madeTmp.push(d); return d; };
test.after(() => { for (const d of madeTmp) rmSync(d, { recursive: true, force: true }); });

const withRepo = async (config, fn, files) => {
  const repo = makeRepo({ config, files });
  try { await fn(repo); } finally { repo.cleanup(); }
};

// a fake tool first on PATH; `body` is its shell script; the log file records its arguments
async function withTool(name, body, fn) {
  const dir = mkdtempSync(join(tmpdir(), "xwf-tool-"));
  const oldPath = process.env.PATH;
  if (body !== null) { writeFileSync(join(dir, name), `#!/bin/sh\n${body}\n`); chmodSync(join(dir, name), 0o755); }
  // absent: PATH keeps only the system tools the pack itself needs (git, tar, sh)
  process.env.PATH = `${dir}:${oldPath}`;
  try { await fn(dir); } finally { process.env.PATH = oldPath; rmSync(dir, { recursive: true, force: true }); }
}
const absent = (name, fn) => withTool(name, null, async (dir) => {
  const old = process.env.PATH;
  const keep = mkdtempSync(join(tmpdir(), "xwf-bin-"));
  try {
    for (const t of ["git", "tar", "sh", "mkdir"]) {
      const p = [...old.split(":")].map((d) => join(d, t)).find((f) => existsSync(f));
      if (p) writeFileSync(join(keep, t), `#!/bin/sh\nexec ${p} "$@"\n`), chmodSync(join(keep, t), 0o755);
    }
    process.env.PATH = keep;
    await fn();
  } finally { process.env.PATH = old; rmSync(keep, { recursive: true, force: true }); }
});

test("TOOL carries the version each pack is checked against", () => {
  assert.deepEqual(semgrep.TOOL, { command: "semgrep", version: "1.179.0" });
  assert.deepEqual(trivy.TOOL, { command: "trivy", version: "0.75.0" });
});

// semgrep
const sg = { paths: { code: ["src"] }, packs: { semgrep: { configs: ["p/default", "p/secrets"] } } };

test("semgrep: exit 0 passes, with its arguments", () => withRepo(sg, (repo) =>
  withTool("semgrep", 'echo "$@" > "$0.log"; exit 0', async (dir) => {
    assert.deepEqual(await repo.run(semgrep), { ok: true, lines: [] });
    assert.equal(readFileSync(join(dir, "semgrep.log"), "utf8").trim(),
      "scan --config p/default --config p/secrets --metrics=off --severity ERROR --error --quiet src");
  })));

test("semgrep: packs.semgrep.paths wins over paths.code", () =>
  withRepo({ ...sg, packs: { semgrep: { configs: ["p/x"], paths: ["a", "b"] } } }, (repo) =>
    withTool("semgrep", 'echo "$@" > "$0.log"', async (dir) => {
      await repo.run(semgrep);
      assert.match(readFileSync(join(dir, "semgrep.log"), "utf8"), /--quiet a b\n$/);
    })));

test("semgrep: exit 1 fails with the last 20 lines", () => withRepo(sg, (repo) =>
  withTool("semgrep", "seq 1 25; exit 1", async () => {
    const r = await repo.run(semgrep);
    assert.equal(r.ok, false);
    assert.notEqual(r.cannotRun, true);
    assert.equal(r.lines.length, 20);
    assert.equal(r.lines[0], "6");
    assert.equal(r.lines.at(-1), "25");
  })));

test("semgrep: exit 2 could not run", () => withRepo(sg, (repo) =>
  withTool("semgrep", "echo boom >&2; exit 2", async () => {
    const r = await repo.run(semgrep);
    assert.equal(r.ok, false);
    assert.equal(r.cannotRun, true);
    assert.match(r.lines[0], /exited 2/);
  })));

test("semgrep: not on the machine could not run", () => withRepo(sg, (repo) =>
  absent("semgrep", async () => {
    const r = await repo.run(semgrep);
    assert.equal(r.cannotRun, true);
    assert.match(r.lines[0], /semgrep/);
  })));

test("semgrep: configs missing or not a list of strings could not run", async () => {
  for (const configs of [undefined, [], "p/default", [1]]) {
    await withRepo({ ...sg, packs: { semgrep: { configs } } }, async (repo) => {
      const r = await repo.run(semgrep);
      assert.equal(r.cannotRun, true);
      assert.match(r.lines[0], /configs/);
    });
  }
});

// trivy
const tv = { packs: { trivy: {} } };

test("trivy: exit 0 passes with its arguments", () => withRepo(tv, (repo) =>
  withTool("trivy", 'echo "$@" > "$0.log"', async (dir) => {
    assert.deepEqual(await repo.run(trivy), { ok: true, lines: [] });
    assert.match(readFileSync(join(dir, "trivy.log"), "utf8"),
      /^fs --quiet --scanners vuln,secret --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 \S+\n$/);
  })));

test("trivy: exit 1 fails with the last 20 lines", () => withRepo(tv, (repo) =>
  withTool("trivy", "seq 1 25; exit 1", async () => {
    const r = await repo.run(trivy);
    assert.equal(r.ok, false);
    assert.notEqual(r.cannotRun, true);
    assert.equal(r.lines.length, 20);
    assert.equal(r.lines[0], "6");
  })));

test("trivy: exit 2 could not run", () => withRepo(tv, (repo) =>
  withTool("trivy", "exit 2", async () => {
    const r = await repo.run(trivy);
    assert.equal(r.cannotRun, true);
  })));

test("trivy: not on the machine could not run", () => withRepo(tv, (repo) =>
  absent("trivy", async () => {
    const r = await repo.run(trivy);
    assert.equal(r.cannotRun, true);
    assert.match(r.lines[0], /trivy/);
  })));

test("trivy scans what git holds at head, not the folder, and cleans up", () =>
  withRepo(tv, (repo) =>
    withTool("trivy", 'for last; do :; done; ls -A "$last" > "$0.log"; echo "$last" > "$0.dir"', async (dir) => {
      repo.write(".env", "SECRET=1"); // untracked: never committed
      repo.write("later.txt", "x"); // untracked too
      await repo.run(trivy);
      const seen = readFileSync(join(dir, "trivy.log"), "utf8").split("\n").filter(Boolean).sort();
      assert.deepEqual(seen, [".xworkflows", "a.txt"]);
      assert.equal(existsSync(readFileSync(join(dir, "trivy.dir"), "utf8").trim()), false);
    }), { "a.txt": "one" }));

test("trivy: the temp folder is gone after a failure too", () => withRepo(tv, (repo) =>
  withTool("trivy", 'for last; do :; done; echo "$last" > "$0.dir"; exit 1', async (dir) => {
    await repo.run(trivy);
    assert.equal(existsSync(readFileSync(join(dir, "trivy.dir"), "utf8").trim()), false);
  })));

// lint
const ln = (run) => ({ packs: { lint: { run } } });

test("lint: a passing command passes", () => withRepo(ln("echo fine"), async (repo) => {
  assert.deepEqual(await repo.run(lint), { ok: true, lines: [] });
}));

test("lint: a failing command fails with the last 20 lines of stdout and stderr", () =>
  withRepo(ln("seq 1 25; echo err-line >&2; exit 3"), async (repo) => {
    const r = await repo.run(lint);
    assert.equal(r.ok, false);
    assert.notEqual(r.cannotRun, true);
    assert.equal(r.lines.length, 20);
    assert.equal(r.lines.at(-1), "err-line");
    assert.equal(r.lines[0], "7");
  }));

test("lint: a missing or non-text run could not run", async () => {
  for (const run of [undefined, 5, "", null]) {
    await withRepo({ packs: { lint: { run } } }, async (repo) => {
      const r = await repo.run(lint);
      assert.equal(r.cannotRun, true);
      assert.match(r.lines[0], /packs\.lint\.run/);
    });
  }
});

test("lint: a command that cannot start (126, 127) could not run; any other exit is a failure", async () => {
  for (const code of [126, 127]) await withRepo(ln(`exit ${code}`), async (repo) => {
    const r = await repo.run(lint);
    assert.equal(r.ok, false);
    assert.equal(r.cannotRun, true, `exit ${code}`);
  });
  await withRepo(ln("exit 128"), async (repo) => assert.notEqual((await repo.run(lint)).cannotRun, true));
});

test("lint: a head that is not HEAD fails with the check-out line", () => withRepo(ln("true"), async (repo) => {
  const old = repo.git("rev-parse", "HEAD");
  repo.commit("second");
  const r = await repo.run(lint, { head: old });
  assert.equal(r.ok, false);
  assert.match(r.lines[0], /^check out .+ or commit first$/);
}));

test("lint: a modified tracked file fails with the check-out line", () => withRepo(ln("true"), async (repo) => {
  repo.write("a.txt", "changed");
  const r = await repo.run(lint);
  assert.equal(r.ok, false);
  assert.match(r.lines[0], /^check out .+ or commit first$/);
}, { "a.txt": "one" }));

// findings 8 and 9
test("semgrep scans the committed tree at head, not the folder", () =>
  withRepo(sg, (repo) =>
    withTool("semgrep", 'ls -A src > "$0.log"; pwd > "$0.cwd"', async (dir) => {
      repo.write("src/untracked.js", "x");
      await repo.run(semgrep);
      assert.deepEqual(readFileSync(join(dir, "semgrep.log"), "utf8").split("\n").filter(Boolean), ["a.js"]);
      assert.equal(existsSync(readFileSync(join(dir, "semgrep.cwd"), "utf8").trim()), false);
    }), { "src/a.js": "1" }));

test("trivy: runs inside the extraction, so an untracked .trivyignore is not read", () =>
  withRepo(tv, (repo) =>
    withTool("trivy", 'ls -A > "$0.log"', async (dir) => {
      repo.write(".trivyignore", "CVE-1");
      await repo.run(trivy);
      assert.equal(readFileSync(join(dir, "trivy.log"), "utf8").includes(".trivyignore"), false);
    }), { "a.txt": "one" }));

test("trivy: a file marked export-ignore is still scanned", () =>
  withRepo(tv, (repo) =>
    withTool("trivy", 'for last; do :; done; ls -A "$last" > "$0.log"', async (dir) => {
      await repo.run(trivy);
      assert.match(readFileSync(join(dir, "trivy.log"), "utf8"), /package-lock\.json/);
    }), { "package-lock.json": "{}", ".gitattributes": "package-lock.json export-ignore\n" }));
