import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "./review-seal.mjs";
import { makeRepo } from "../test/helpers/repo.mjs";

const config = { paths: { code: ["src"], risk: ["db/"], codeAnyway: [".claude/hooks/"] }, tests: { files: [] } };
const PLAN = "docs/superpowers/plans/p.md";

test("review-small ok seals a non-risk commit and not a risk commit", async () => {
  const repo = makeRepo({ config, files: { "src/a.js": "const a = 1;\n" } });
  try {
    const c = repo.commit("feat: one", { files: { "src/a.js": "const a = 2;\n" } });
    repo.commit("docs: seal", { files: { [PLAN]: `review-small ok at ${c.slice(0, 7)}\n` } });
    assert.equal((await repo.run(mod)).ok, true);
    const r = repo.commit("feat: risk", { files: { "db/m.sql": "x\n" } });
    repo.commit("docs: seal2", { files: { [PLAN]: `review-small ok at ${r.slice(0, 7)}\n` } });
    assert.equal((await repo.run(mod)).ok, false);
  } finally { repo.cleanup(); }
});
