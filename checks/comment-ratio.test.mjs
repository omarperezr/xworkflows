import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "./comment-ratio.mjs";
import { makeRepo } from "../test/helpers/repo.mjs";

const cfg = { limits: { commentMinLines: 10, commentRatio: 0.2 } };
const code = (n) => Array.from({ length: n }, (_, i) => `const a${i} = ${i};\n`).join("");
const note = (n, p = "// why") => Array.from({ length: n }, (_, i) => `${p} ${i}\n`).join("");
const withRepo = (fn, config = cfg) => async () => {
  const repo = makeRepo({ config, files: { "src/a.js": "a\n" } });
  try { repo.branch("feat"); await fn(repo); } finally { repo.cleanup(); }
};

test("mostly code passes", withRepo(async (repo) => {
  repo.commit("c", { files: { "src/b.js": code(10) + note(2) } });
  assert.deepEqual(await repo.run(mod), { ok: true, lines: [] });
}));

test("over the ratio fails: numbers, ratio, top files, the why rule", withRepo(async (repo) => {
  repo.commit("c", { files: { "src/b.js": code(8) + note(6), "src/c.js": note(2) + code(1) } });
  const r = await repo.run(mod);
  assert.equal(r.ok, false);
  assert.match(r.lines[0], /8 of 17/);
  assert.match(r.lines[0], /0\.2|20/);
  const rest = r.lines.slice(1).join("\n");
  assert.ok(rest.indexOf("src/b.js") >= 0 && rest.indexOf("src/b.js") < rest.indexOf("src/c.js"));
  assert.match(rest, /why/);
}));

test("under commentMinLines passes whatever the ratio", withRepo(async (repo) => {
  repo.commit("c", { files: { "src/b.js": note(9) } });
  assert.equal((await repo.run(mod)).ok, true);
}));

test("shortcut: lines are in neither number", withRepo(async (repo) => {
  repo.commit("c", { files: { "src/b.js": code(10) + note(10, "// shortcut: limit") } });
  assert.equal((await repo.run(mod)).ok, true);
  repo.commit("d", { files: { "src/c.js": code(4) + note(6, "// shortcut: x") + note(7) } });
  assert.equal((await repo.run(mod)).ok, false); // 7 of 21 counted
}));

test("escape passes, empty reason does not", withRepo(async (repo) => {
  repo.commit("c", { files: { "src/b.js": note(12) }, body: "comments:   " });
  assert.equal((await repo.run(mod)).ok, false);
  repo.commit("d", { files: { "src/c.js": "x\n" }, body: "comments: generated table docs" });
  assert.equal((await repo.run(mod)).ok, true);
}));

test("extension without marks is ignored; removed lines not counted", async () => {
  const repo = makeRepo({ config: cfg, files: { "src/old.js": note(20) } });
  try {
    repo.branch("feat");
    repo.commit("c", { files: { "docs/n.txt": note(20) } });
    assert.equal((await repo.run(mod)).ok, true);
    repo.commit("d", { files: { "src/old.js": code(12) } }); // 20 comments removed, 12 code added
    assert.equal((await repo.run(mod)).ok, true);
  } finally { repo.cleanup(); }
});

test("accented name with a space", withRepo(async (repo) => {
  repo.commit("c", { files: { "src/naïve résumé.js": note(12) } });
  const r = await repo.run(mod);
  assert.equal(r.ok, false);
  assert.match(r.lines.join("\n"), /src\/naïve résumé\.js/);
}));

test("wrong-shaped config is could-not-run", async () => {
  for (const limits of [{ commentMinLines: "many", commentRatio: 0.2 }, { commentMinLines: 10, commentRatio: {} }]) {
    const repo = makeRepo({ config: { limits }, files: { "src/a.js": "a\n" } });
    try {
      repo.branch("feat"); repo.commit("c", { files: { "src/b.js": code(3) } });
      const r = await repo.run(mod);
      assert.equal(r.ok, false); assert.equal(r.cannotRun, true);
    } finally { repo.cleanup(); }
  }
  const repo = makeRepo({ config: { comments: { marks: [] } }, files: { "src/a.js": "a\n" } });
  try {
    repo.branch("feat"); repo.commit("c", { files: { "src/b.js": code(3) } });
    assert.equal((await repo.run(mod)).cannotRun, true);
  } finally { repo.cleanup(); }
});

test("a subject starting with comments: is not the escape", withRepo(async (repo) => {
  repo.commit("comments: lots", { files: { "src/b.js": note(12) } });
  assert.equal((await repo.run(mod)).ok, false);
}));

test("extension mapped to no marks does not dilute the ratio", withRepo(async (repo) => {
  repo.commit("c", { files: { "src/b.js": code(8) + note(4), "src/c.sh": code(20) } });
  assert.equal((await repo.run(mod)).ok, false);
}, { limits: cfg.limits, comments: { marks: { js: ["//"], sh: [] } } }));

test("exactly at the limit passes despite float error", withRepo(async (repo) => {
  repo.commit("c", { files: { "src/b.js": note(29) + code(71) } });
  assert.equal((await repo.run(mod)).ok, true);
}, { limits: { commentMinLines: 10, commentRatio: 0.29 } }));

test("no counted line at all passes, also with a minimum of 0", withRepo(async (repo) => {
  repo.commit("docs", { files: { "README.md": "only words\n" } });
  assert.deepEqual(await repo.run(mod), { ok: true, lines: [] });
}, { limits: { commentMinLines: 0, commentRatio: 0.2 } }));
