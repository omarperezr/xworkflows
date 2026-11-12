import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { main, PACKS, TABLE } from "./run.mjs";
import { makeRepo } from "../test/helpers/repo.mjs";

const pass = { run: () => ({ ok: true, lines: [] }) };
// a brake not named here passes; null means its module is missing
const loader = (mods = {}) => async (n) => {
  if (mods[n] === null) throw Object.assign(new Error("not found"), { code: "ERR_MODULE_NOT_FOUND" });
  return mods[n] ?? pass;
};
const ZERO = "0".repeat(40);
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

async function check(repo, argv, mods, stdin = "") {
  const out = [];
  const code = await main(argv, { cwd: repo.root, stdin, print: (l) => out.push(l), load: loader(mods) });
  return { code, out };
}
const withRepo = (opts, fn) => async () => {
  const repo = makeRepo(opts);
  try { await fn(repo); } finally { repo.cleanup(); }
};

test("TABLE keeps the order of the spec", () => {
  assert.deepEqual(TABLE, ["signature", "review-seal", "goal-cited", "pending", "fix-has-test", "change-size",
    "comment-ratio", "skills-travel", "patterns", "ratchet", "graph-current", "stale-memory", "index-current", "project"]);
});

test("all pass: exit 0, nothing printed", withRepo({}, async (repo) => {
  assert.deepEqual(await check(repo, []), { code: 0, out: [] });
}));

test("a failure: format, indented lines, count", withRepo({}, async (repo) => {
  const r = await check(repo, [], { signature: { run: () => ({ ok: false, lines: ["bad one", "fix it", "then push"] }) } });
  assert.equal(r.code, 1);
  assert.deepEqual(r.out, ["signature: bad one", "  fix it", "  then push", `xworkflows check: 1 of ${TABLE.length} failed`]);
}));

test("a brake that throws: exit 2, counted as failed", withRepo({}, async (repo) => {
  const r = await check(repo, ["--only", "pending"], { pending: { run: () => { throw new Error("boom"); } } });
  assert.equal(r.code, 2);
  assert.deepEqual(r.out, ["pending: could not run: boom", "xworkflows check: 1 of 1 failed"]);
}));

test("cannotRun: exit 2", withRepo({}, async (repo) => {
  const r = await check(repo, ["--only", "ratchet"], { ratchet: { run: () => ({ ok: false, cannotRun: true, lines: ["no counter"] }) } });
  assert.equal(r.code, 2);
  assert.equal(r.out[0], "ratchet: could not run: no counter");
}));

test("missing needs key: exit 2 with one line per key; [] runs the brake", withRepo({ config: {} }, async (repo) => {
  const brake = { needs: ["paths.code", "tests.run"], run: () => ({ ok: true, lines: [] }) };
  const r = await check(repo, ["--only", "patterns"], { patterns: brake });
  assert.equal(r.code, 2);
  assert.deepEqual(r.out.slice(0, 2), ["patterns: not configured: paths.code, run /adapt", "patterns: not configured: tests.run, run /adapt"]);
  repo.write(".xworkflows/config.json", JSON.stringify({ paths: { code: [] }, tests: { run: [] } }));
  assert.deepEqual(await check(repo, ["--only", "patterns"], { patterns: brake }), { code: 0, out: [] });
}));

test("missing module: exit 2", withRepo({}, async (repo) => {
  const r = await check(repo, ["--only", "project"], { project: null });
  assert.equal(r.code, 2);
  assert.equal(r.out[0], "project: could not run: checks/project.mjs is missing, reinstall xworkflows");
}));

test("--only keeps table order; unknown name: exit 2", withRepo({}, async (repo) => {
  const seen = [];
  const spy = (n) => ({ run: () => { seen.push(n); return { ok: true, lines: [] }; } });
  await check(repo, ["--only", "project,signature,pending"], { project: spy("project"), signature: spy("signature"), pending: spy("pending") });
  assert.deepEqual(seen, ["signature", "pending", "project"]);
  const r = await check(repo, ["--only", "signature,nope"]);
  assert.deepEqual(r, { code: 2, out: ["xworkflows check: unknown brake nope"] });
}));

test("unknown flag: exit 2", withRepo({}, async (repo) => {
  assert.deepEqual(await check(repo, ["--wat"]), { code: 2, out: ["xworkflows check: unknown flag --wat"] });
}));

test("a note on a pass is printed, exit stays 0", withRepo({}, async (repo) => {
  const r = await check(repo, ["--only", "change-size"], { "change-size": { run: () => ({ ok: true, lines: ["450 lines", "not run"] }) } });
  assert.deepEqual(r, { code: 0, out: ["change-size: note: 450 lines", "change-size: note: not run"] });
}));

test("not a repository: exit 2", async () => {
  const dir = mkdtempSync(join(tmpdir(), "xwf-norepo-"));
  try {
    const out = [];
    const code = await main([], { cwd: dir, print: (l) => out.push(l), load: loader() });
    assert.equal(code, 2);
    assert.match(out[0], /^xworkflows check: not a git repository/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("config that does not parse: exit 2", withRepo({}, async (repo) => {
  repo.write(".xworkflows/config.json", "{");
  const r = await check(repo, []);
  assert.equal(r.code, 2);
  assert.match(r.out[0], /^xworkflows check: .*does not parse/);
}));

test("a base that does not resolve: exit 2", withRepo({}, async (repo) => {
  const r = await check(repo, ["nope"]);
  assert.equal(r.code, 2);
  assert.match(r.out[0], /^xworkflows check: .*nope/);
}));

test("mainOnly: skipped on another branch, runs on main and by hand", withRepo({}, async (repo) => {
  let runs = 0;
  const mods = { "review-seal": { mainOnly: true, run: () => { runs++; return { ok: true, lines: [] }; } } };
  const sha = repo.git("rev-parse", "HEAD");
  const push = (ref) => check(repo, ["--pre-push", "origin", "--only", "review-seal"], mods, `${ref} ${sha} ${ref} ${ZERO}\n`);
  await push("refs/heads/feature");
  assert.equal(runs, 0);
  await push("refs/heads/main");
  assert.equal(runs, 1);
  await check(repo, ["--only", "review-seal"], mods);
  assert.equal(runs, 2);
}));

test("pre-push: a deletion runs nothing and exits 0", withRepo({}, async (repo) => {
  let runs = 0;
  const mods = { signature: { run: () => { runs++; return { ok: true, lines: [] }; } } };
  const r = await check(repo, ["--pre-push", "origin", "--only", "signature"], mods, `(delete) ${ZERO} refs/heads/old ${"a".repeat(40)}\n`);
  assert.deepEqual(r, { code: 0, out: [] });
  assert.equal(runs, 0);
}));

const ranges = async (repo, stdin) => {
  const got = [];
  await check(repo, ["--pre-push", "origin", "--only", "signature"], { signature: { run: (range) => { got.push(range); return { ok: true, lines: [] }; } } }, stdin);
  return got;
};

test("pre-push: an existing branch uses the remote sha as base", withRepo({}, async (repo) => {
  repo.remote();
  repo.git("push", "-q", "origin", "main");
  const c1 = repo.git("rev-parse", "HEAD");
  const c2 = repo.commit("two");
  const [r] = await ranges(repo, `refs/heads/main ${c2} refs/heads/main ${c1}\n`);
  assert.equal(r.base, c1);
  assert.deepEqual(r.commits, [c2]);
  assert.equal(r.mainPush, true);
  assert.equal(r.manual, false);
  assert.equal(r.remote, "origin");
}));

test("pre-push: a new branch uses the merge base with origin/main", withRepo({}, async (repo) => {
  repo.remote();
  repo.git("push", "-q", "origin", "main");
  const c1 = repo.git("rev-parse", "HEAD");
  repo.branch("feature");
  const c2 = repo.commit("two");
  const [r] = await ranges(repo, `refs/heads/feature ${c2} refs/heads/feature ${ZERO}\n`);
  assert.equal(r.base, c1);
  assert.deepEqual(r.commits, [c2]);
  assert.equal(r.mainPush, false);
}));

test("pre-push: a first push to a remote with no branch judges no history, and says so", withRepo({}, async (repo) => {
  repo.remote();
  const c2 = repo.commit("two");
  const got = [];
  const r = await check(repo, ["--pre-push", "origin", "--only", "signature"], { signature: { run: (range) => { got.push(range); return { ok: true, lines: [] }; } } }, `refs/heads/main ${c2} refs/heads/main ${ZERO}\n`);
  assert.deepEqual(r, { code: 0, out: ["xworkflows check: first push to origin: the history already written is not judged"] });
  assert.equal(got[0].base, c2);
  assert.deepEqual(got[0].commits, []);
}));

test("pre-push: a new branch on a remote that has branches but no main has base null and the commits on no remote ref", withRepo({}, async (repo) => {
  repo.remote();
  const c1 = repo.git("rev-parse", "HEAD");
  repo.branch("other");
  repo.git("push", "-q", "origin", "other");
  const c2 = repo.commit("two");
  const [r] = await ranges(repo, `refs/heads/feature ${c2} refs/heads/feature ${ZERO}\n`);
  assert.equal(r.base, null);
  assert.equal(r.diffBase, EMPTY_TREE);
  assert.deepEqual(r.commits, [c2]);
  assert.notEqual(c1, c2);
}));

test("by hand: base is the merge base with main, head is HEAD", withRepo({}, async (repo) => {
  const c1 = repo.git("rev-parse", "HEAD");
  repo.branch("feature");
  const c2 = repo.commit("two");
  const c3 = repo.commit("three");
  const got = [];
  await check(repo, ["--only", "signature"], { signature: { run: (range) => { got.push(range); return pass.run(); } } });
  const [r] = got;
  assert.equal(r.base, c1);
  assert.equal(r.head, c3);
  assert.deepEqual(r.commits, [c2, c3]);
  assert.equal(r.manual, true);
}));

test("the CLI ignores a GIT_DIR in its environment", withRepo({}, async (repo) => {
  repo.write(".xworkflows/config.json", "{");
  const env = { ...process.env, GIT_DIR: join(repo.root, "nowhere") };
  const run = fileURLToPath(new URL("./run.mjs", import.meta.url));
  const r = spawnSync("node", [run], { cwd: repo.root, env, encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stdout, /does not parse/);
}));

test("the helper's run() gives a brake the range shape", withRepo({}, async (repo) => {
  const c1 = repo.git("rev-parse", "HEAD");
  const c2 = repo.commit("two");
  const mod = { run: (range) => ({ ok: true, lines: [], range }) };
  const { range } = await repo.run(mod);
  assert.deepEqual(range, { base: c1, diffBase: c1, head: c2, commits: [c2], ref: null, remote: null, mainPush: false, manual: true });
  assert.equal((await repo.run(mod, { ref: "refs/heads/main" })).range.mainPush, true);
}));

test("an empty name in --only is unknown, never a run of nothing", withRepo({}, async (repo) => {
  for (const v of [",", "", "pending,"]) assert.equal((await check(repo, ["--only", v])).code, 2, JSON.stringify(v));
  assert.deepEqual(await check(repo, ["--only"]), { code: 2, out: ["xworkflows check: unknown brake (empty)"] });
}));

test("a result with no lines, a string needs, a thrown string: could not run, the rest still runs", withRepo({ config: { tests: { run: "x" } } }, async (repo) => {
  const r = await check(repo, ["--only", "signature,pending,project,ratchet"], {
    signature: { run: () => undefined },
    pending: { run: () => ({ ok: true }) },
    project: { run: () => { throw "plain"; } },
    ratchet: { needs: "tests.run", run: () => ({ ok: true, lines: [] }) },
  });
  assert.equal(r.code, 2);
  assert.deepEqual(r.out, ["signature: could not run: it returned no { ok, lines }", "pending: could not run: it returned no { ok, lines }", "project: could not run: plain", "xworkflows check: 3 of 4 failed"]);
}));

test("an extra argument: exit 2", withRepo({}, async (repo) => {
  assert.deepEqual(await check(repo, ["HEAD", "HEAD", "junk"]), { code: 2, out: ["xworkflows check: unexpected argument junk"] });
  assert.equal((await check(repo, ["--pre-push", "origin", "HEAD"])).code, 2);
}));

test("needs that are not key names: could not run", withRepo({}, async (repo) => {
  const r = await check(repo, ["--only", "ratchet"], { ratchet: { needs: [5], run: () => ({ ok: true, lines: [] }) } });
  assert.deepEqual(r, { code: 2, out: ["ratchet: could not run: its needs must be config key names", "xworkflows check: 1 of 1 failed"] });
}));

test("index: a symlinked MEMORY.md is refused, nothing is written through it", withRepo({}, async (repo) => {
  repo.write("docs/memory/a.md", "---\ndescription: one\n---\n");
  const outside = join(mkdtempSync(join(tmpdir(), "xwf-out-")), "t.md");
  writeFileSync(outside, "keep");
  symlinkSync(outside, join(repo.root, "docs/memory/MEMORY.md"));
  const r = await check(repo, ["index"]);
  assert.equal(r.code, 2);
  assert.match(r.out[0], /^xworkflows check: .*symlink/);
  assert.equal(readFileSync(outside, "utf8"), "keep");
  rmSync(join(outside, ".."), { recursive: true, force: true });
}));

test("index: writes MEMORY.md from the memory files, prints nothing; not a repository or a bad config: exit 2", withRepo({}, async (repo) => {
  repo.write("docs/memory/b.md", "---\nname: Beta\ndescription: two\n---\n");
  repo.write("docs/memory/a.md", "---\ndescription: one\n---\n");
  const r = await check(repo, ["index"]);
  assert.deepEqual(r, { code: 0, out: [] });
  assert.equal(readFileSync(join(repo.root, "docs/memory/MEMORY.md"), "utf8"), "- [a](a.md) — one\n- [Beta](b.md) — two\n");
  assert.equal((await check(repo, ["index"])).code, 0); // the index file itself is not indexed
  assert.match(readFileSync(join(repo.root, "docs/memory/MEMORY.md"), "utf8"), /^- \[a\]/);
  repo.write(".xworkflows/config.json", "{");
  const bad = await check(repo, ["index"]);
  assert.equal(bad.code, 2);
  assert.match(bad.out[0], /^xworkflows check: .*does not parse/);
  const dir = mkdtempSync(join(tmpdir(), "xwf-norepo-"));
  try {
    const out = [];
    assert.equal(await main(["index"], { cwd: dir, print: (l) => out.push(l) }), 2);
    assert.match(out[0], /^xworkflows check: not a git repository/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}));

test("PACKS names the three packs", () => assert.deepEqual(PACKS, ["lint", "semgrep", "trivy"]));

test("a pack that is on runs after the table, printed and counted like a brake", withRepo({ config: { packs: { semgrep: {} } } }, async (repo) => {
  const order = [];
  const mods = { project: { run: () => { order.push("project"); return { ok: true, lines: [] }; } },
    "packs/semgrep": { run: () => { order.push("semgrep"); return { ok: false, lines: ["bad rule", "src/a.js:1"] }; } } };
  const r = await check(repo, [], mods);
  assert.deepEqual(order, ["project", "semgrep"]);
  assert.equal(r.code, 1);
  assert.deepEqual(r.out, ["semgrep: bad rule", "  src/a.js:1", `xworkflows check: 1 of ${TABLE.length + 1} failed`]);
}));

test("a pack that could not run: exit 2", withRepo({ config: { packs: { trivy: {} } } }, async (repo) => {
  const r = await check(repo, [], { "packs/trivy": { run: () => ({ ok: false, cannotRun: true, lines: ["no trivy"] }) } });
  assert.equal(r.code, 2);
  assert.equal(r.out[0], "trivy: could not run: no trivy");
}));

test("no packs key runs none", withRepo({}, async (repo) => {
  const seen = [];
  const r = await check(repo, [], { "packs/lint": { run: () => seen.push("lint") }, "packs/semgrep": { run: () => seen.push("semgrep") } });
  assert.deepEqual(seen, []);
  assert.equal(r.code, 0);
}));

test("an unknown pack is could not run, named", withRepo({ config: { packs: { nope: {} } } }, async (repo) => {
  const r = await check(repo, [], {});
  assert.equal(r.code, 2);
  assert.deepEqual(r.out, ["nope: could not run: not a check pack (known: lint, semgrep, trivy)", `xworkflows check: 1 of ${TABLE.length + 1} failed`]);
}));

test("--only semgrep runs only it; --only takes pack names", withRepo({ config: { packs: { semgrep: {}, lint: {} } } }, async (repo) => {
  const seen = [];
  const mk = (n) => ({ run: () => { seen.push(n); return { ok: true, lines: [] }; } });
  const r = await check(repo, ["--only", "semgrep"], { "packs/semgrep": mk("semgrep"), "packs/lint": mk("lint"), project: mk("project") });
  assert.deepEqual(seen, ["semgrep"]);
  assert.equal(r.code, 0);
}));

test("--only a pack that is not on runs nothing and could not run", withRepo({}, async (repo) => {
  const seen = [];
  const r = await check(repo, ["--only", "trivy"], { "packs/trivy": { run: () => seen.push(1) } });
  assert.deepEqual(seen, []);
  assert.equal(r.code, 2);
}));

test("packs that is not an object: setup error, exit 2", async () => {
  for (const bad of [[], "semgrep", 3, null]) {
    await withRepo({ config: { packs: bad } }, async (repo) => {
      const r = await check(repo, []);
      assert.equal(r.code, 2);
      assert.deepEqual(r.out, ["xworkflows check: packs in the config is not an object"]);
    })();
  }
});

test("--only for a pack that is not on could not run, never a silent pass", withRepo({}, async (repo) => {
  const r = await check(repo, ["--only", "semgrep"]);
  assert.equal(r.code, 2);
  assert.match(r.out[0], /^semgrep: could not run: not on in packs/);
}));
