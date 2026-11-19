import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "./review-seal.mjs";
import { makeRepo } from "../test/helpers/repo.mjs";

const PLAN = "docs/superpowers/plans/p.md";

test("a risk batch is not sealed by the risk seal of an earlier, already merged batch", async () => {
  const repo = makeRepo({ config: { paths: { code: ["src"], risk: ["db/"] } }, files: { "src/a.js": "a\n" } });
  try {
    const b1 = repo.commit("db: one", { files: { "db/a.sql": "select 1;\n" } });
    const s1 = repo.commit("docs: seal 1", { files: { [PLAN]: `risk-review ok at ${b1}\n` } });
    const b2 = repo.commit("db: two", { files: { "db/b.sql": "select 2;\n" } });
    repo.commit("docs: seal 2", { files: { [PLAN]: `risk-review ok at ${b1}\nreview ok at ${b2}\n` } });
    assert.equal((await repo.run(mod, { base: s1 })).ok, false);
  } finally { repo.cleanup(); }
});
