import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "./review-seal.mjs";
import { isComment, commentOnly } from "./comment-lines.mjs";
import { makeRepo } from "../test/helpers/repo.mjs";
import { makeCtx } from "./run.mjs";
import { load } from "../hooks/core/config.mjs";

const config = { paths: { code: ["src"], risk: ["db/"], codeAnyway: [".claude/hooks/"] } };
const files = { "src/a.js": "const a = 1;\n" };
const PLAN = "docs/superpowers/plans/p.md";

async function withRepo(fn) {
  const repo = makeRepo({ config, files });
  try { return await fn(repo); } finally { repo.cleanup(); }
}
const seal = (repo, line, file = PLAN) => repo.commit("docs: seal", { files: { [file]: `${line}\n` } });

test("exports the table's contract", () => {
  assert.equal(mod.mainOnly, true);
  assert.deepEqual(mod.needs, ["paths.codeAnyway", "paths.risk"]);
});

test("a sealed batch passes, with a short sha", () => withRepo(async (repo) => {
  repo.commit("feat: one", { files: { "src/a.js": "const a = 2;\n" } });
  const last = repo.commit("feat: two", { files: { "src/b.js": "export {};\n" } });
  seal(repo, `review ok at ${last.slice(0, 7)}`);
  assert.deepEqual(await repo.run(mod), { ok: true, lines: [] });
}));

test("a seal inside a fenced code block does not count", () => withRepo(async (repo) => {
  const c = repo.commit("feat: one", { files: { "src/a.js": "const a = 2;\n" } });
  seal(repo, `Example:\n\n\`\`\`\nreview ok at ${c.slice(0, 7)}\n\`\`\`\n\n~~~md\nreview ok at ${c.slice(0, 7)}\n~~~`);
  assert.equal((await repo.run(mod)).ok, false);
  seal(repo, `\`\`\`\nopen block\nreview ok at ${c.slice(0, 7)}`, "docs/superpowers/plans/q.md");
  assert.equal((await repo.run(mod)).ok, false);
  seal(repo, `\`\`\`\nx\n\`\`\`\nreview ok at ${c.slice(0, 7)}`, "docs/superpowers/plans/r.md");
  assert.equal((await repo.run(mod)).ok, true);
}));

test("a line of inline code that starts with three backticks is not a fence", () => withRepo(async (repo) => {
  const c = repo.commit("feat: one", { files: { "src/a.js": "const a = 2;\n" } });
  seal(repo, `\`\`\`git status\`\`\` must print nothing\n\n## Seals\n\nreview ok at ${c.slice(0, 7)}`);
  assert.equal((await repo.run(mod)).ok, true);
}));

test("a fence indented four spaces under a list item is no fence: its seal counts, as before", () => withRepo(async (repo) => {
  const c = repo.commit("feat: one", { files: { "src/a.js": "const a = 2;\n" } });
  seal(repo, `- item\n\n    \`\`\`\n    x\n    \`\`\`\n\nreview ok at ${c.slice(0, 7)}`);
  assert.equal((await repo.run(mod)).ok, true);
}));

test("a seal written as a numbered item or a check box does not count", () => withRepo(async (repo) => {
  const c = repo.commit("feat: one", { files: { "src/a.js": "const a = 2;\n" } });
  seal(repo, `1. review ok at ${c.slice(0, 7)}\n- [x] review ok at ${c.slice(0, 7)}`);
  assert.equal((await repo.run(mod)).ok, false);
}));

test("a commit that touches only .gitignore is not code", () => withRepo(async (repo) => {
  repo.commit("chore: ignore", { files: { ".gitignore": "node_modules/\n" } });
  assert.deepEqual(await repo.run(mod), { ok: true, lines: [] });
}));

test("a seal in a spec counts, also one naming a later commit", () => withRepo(async (repo) => {
  repo.commit("feat: one", { files: { "src/a.js": "const a = 2;\n" } });
  const s = seal(repo, "nothing yet");
  repo.write("docs/superpowers/specs/s.md", `risk-review ok at ${s}\n`);
  repo.commit("docs: spec");
  assert.equal((await repo.run(mod)).ok, true);
}));

test("no seal fails and lists the unsealed commits", () => withRepo(async (repo) => {
  const c1 = repo.commit("feat: one", { files: { "src/a.js": "const a = 2;\n" } });
  const r = await repo.run(mod);
  assert.equal(r.ok, false);
  assert.match(r.lines[0], /seal/);
  assert.ok(r.lines.some((l) => l.includes(c1.slice(0, 7)) && l.includes("feat: one")));
}));

test("a seal naming an older commit than the code fails", () => withRepo(async (repo) => {
  const c1 = repo.commit("feat: one", { files: { "src/a.js": "const a = 2;\n" } });
  repo.commit("feat: two", { files: { "src/b.js": "export {};\n" } });
  seal(repo, `review ok at ${c1}`);
  assert.equal((await repo.run(mod)).ok, false);
}));

test("a role is not matched inside another role's name", () => withRepo(async (repo) => {
  const c1 = repo.commit("db change", { files: { "db/m.sql": "select 1;\n" } });
  seal(repo, `risk-review ok at ${c1}`);
  assert.equal((await repo.run(mod)).ok, true);
  const r2 = makeRepo({ config, files });
  try {
    const c = r2.commit("feat: x", { files: { "src/a.js": "const a = 3;\n" } });
    seal(r2, `xrisk-review ok at ${c}`);
    assert.equal((await r2.run(mod)).ok, false);
  } finally { r2.cleanup(); }
}));

test("docs-only and comment-only commits need no seal", () => withRepo(async (repo) => {
  repo.commit("docs: note", { files: { "docs/x.md": "hi\n", "README.md": "hi\n" } });
  repo.commit("chore: comment", { files: { "src/a.js": "// why\nconst a = 1;\n\n" } });
  assert.deepEqual(await repo.run(mod), { ok: true, lines: [] });
}));

test("a path under codeAnyway inside a non-code folder needs a seal", () => withRepo(async (repo) => {
  const c = repo.commit("chore: hook", { files: { ".claude/hooks/h.mjs": "export {};\n" } });
  assert.equal((await repo.run(mod)).ok, false);
  seal(repo, `review ok at ${c}`);
  assert.equal((await repo.run(mod)).ok, true);
}));

test("no-review skips a commit but not one touching risk", () => withRepo(async (repo) => {
  repo.commit("feat: x", { files: { "src/a.js": "const a = 2;\n" }, body: "no-review: trivial" });
  assert.equal((await repo.run(mod)).ok, true);
  repo.commit("db: m", { files: { "db/m.sql": "select 2;\n" }, body: "no-review: trivial" });
  const r = await repo.run(mod);
  assert.equal(r.ok, false);
  assert.ok(r.lines.some((l) => l.includes("db: m")));
}));

test("a risk commit needs the risk reviewer", () => withRepo(async (repo) => {
  const c = repo.commit("db: m", { files: { "db/m.sql": "select 2;\n" } });
  const s = seal(repo, `review ok at ${c}`);
  assert.equal((await repo.run(mod)).ok, false);
  repo.write(PLAN, `review ok at ${s}\nrisk-review ok at ${s}\n`);
  repo.commit("docs: seal 2");
  assert.equal((await repo.run(mod)).ok, true);
}));

test("a risk path in a .md file is not risk", () => withRepo(async (repo) => {
  const c = repo.commit("feat: x", { files: { "src/a.js": "const a = 2;\n", "db/notes.md": "x\n" } });
  seal(repo, `review ok at ${c}`);
  assert.equal((await repo.run(mod)).ok, true);
}));

test("a merge is code only when --cc lists files", () => withRepo(async (repo) => {
  const esc = { body: "no-review: x" };
  repo.branch("side");
  repo.commit("side: a", { files: { "src/a.js": "const a = 'side';\n" }, ...esc });
  repo.checkout("main");
  repo.commit("main: a", { files: { "src/a.js": "const a = 'main';\n" }, ...esc });
  try { repo.git("merge", "--no-ff", "-m", "merge side", "side"); } catch { /* conflict */ }
  repo.write("src/a.js", "const a = 'both';\n");
  repo.git("add", "-A");
  repo.git("commit", "-q", "--no-edit");
  const r = await repo.run(mod);
  assert.equal(r.ok, false);
  assert.ok(r.lines.some((l) => l.includes("merge side")));
  assert.ok(!r.lines.some((l) => l.includes("side: a") || l.includes("main: a")));
}));

test("a clean merge is not code", () => withRepo(async (repo) => {
  repo.branch("side");
  repo.commit("side: b", { files: { "src/b.js": "export {};\n" }, body: "no-review: x" });
  repo.checkout("main");
  repo.commit("main: c", { files: { "src/c.js": "export {};\n" }, body: "no-review: x" });
  repo.merge("side", "merge side");
  assert.equal((await repo.run(mod)).ok, true);
}));

test("isComment follows the marks of the extension", () => {
  const marks = { js: ["//"], py: ["#"] };
  assert.equal(isComment("  // x", "js", marks), true);
  assert.equal(isComment("# x", "py", marks), true);
  assert.equal(isComment("# x", "js", marks), false);
  assert.equal(isComment("const a = 1; // x", "js", marks), false);
  assert.equal(isComment("// x", "rb", marks), false);
  assert.equal(isComment("", "js", marks), false);
});

test("commentOnly: comments and blanks yes; code, unknown extension, chmod, new file no", () => withRepo(async (repo) => {
  const ctx = () => makeCtx(repo.root, load(repo.root));
  const yes = repo.commit("c1", { files: { "src/a.js": "// n\nconst a = 1;\n\n" } });
  assert.equal(commentOnly(ctx(), yes), true);
  const mixed = repo.commit("c2", { files: { "src/a.js": "// m\nconst a = 2;\n\n" } });
  assert.equal(commentOnly(ctx(), mixed), false);
  repo.commit("c3", { files: { "x.txt": "a\n" } });
  const txt = repo.commit("c4", { files: { "x.txt": "# a\n" } });
  assert.equal(commentOnly(ctx(), txt), false);
  const added = repo.commit("c5", { files: { "src/n.js": "// only\n" } });
  assert.equal(commentOnly(ctx(), added), false);
  repo.git("update-index", "--chmod=+x", "src/a.js");
  repo.git("commit", "-q", "-m", "chmod");
  assert.equal(commentOnly(ctx(), repo.git("rev-parse", "HEAD")), false);
}));

test("a risk path with an accented name and a space is still a risk path", () => withRepo(async (repo) => {
  const c = repo.commit("db", { files: { "db/mïgration 1.sql": "drop table x;\n" }, body: "no-review: trivial" });
  assert.equal((await repo.run(mod)).ok, false);
  seal(repo, `review ok at ${c}`);
  assert.equal((await repo.run(mod)).ok, false);
  seal(repo, `risk-review ok at ${c}`, "docs/superpowers/plans/q.md");
  assert.equal((await repo.run(mod)).ok, true);
}));

test("commentOnly sees real hunks under -diff attributes and diff.external", () => withRepo(async (repo) => {
  const ctx = () => makeCtx(repo.root, load(repo.root));
  repo.write(".git/info/attributes", "* -diff\n");
  const a = repo.commit("feat", { files: { "src/a.js": "const a = 2; evil();\n" } });
  assert.equal(commentOnly(ctx(), a), false);
  repo.write(".git/info/attributes", "");
  repo.git("config", "diff.external", "true");
  const b = repo.commit("feat2", { files: { "src/a.js": "const a = 3; evil();\n" } });
  assert.equal(commentOnly(ctx(), b), false);
}));

test("a seal must be a line of its own and the escape needs a reason", () => withRepo(async (repo) => {
  const c = repo.commit("feat: one", { files: { "src/a.js": "const a = 2;\n" } });
  seal(repo, `Later we will write review ok at ${c} once done`);
  assert.equal((await repo.run(mod)).ok, false);
  repo.commit("feat: two", { files: { "src/b.js": "export {};\n" }, body: "no-review: " });
  assert.equal((await repo.run(mod)).ok, false);
}));

test("a seal as a list item or in backticks counts; a sentence still does not", () => withRepo(async (repo) => {
  const c = repo.commit("feat: one", { files: { "src/a.js": "const a = 2;\n" } });
  for (const l of [`- review ok at ${c}`, `* \`review ok at ${c}\``, `> review ok at ${c}.`]) {
    seal(repo, l);
    assert.equal((await repo.run(mod)).ok, true, l);
  }
}));

test("a list-item seal keeps its role: risk needs risk-review", () => withRepo(async (repo) => {
  const c = repo.commit("db change", { files: { "db/m.sql": "select 1;\n" } });
  seal(repo, `- review ok at ${c}`);
  assert.equal((await repo.run(mod)).ok, false);
  seal(repo, `- risk-review ok at ${c}`);
  assert.equal((await repo.run(mod)).ok, true);
}));
