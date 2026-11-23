---
name: risk-reviewer-model-test
description: "Card P-222 (closed 2026-11-23): Fable xhigh against Opus xhigh as the xworkflows risk reviewer; result and why Fable was kept"
metadata:
  node_type: memory
  type: project
  modified: 2026-11-23T00:00:00.000Z
---

# Risk reviewer model test (card P-222)

Question: can Opus xhigh replace Fable xhigh as `risk-review` without losing blocking findings?

- 9 past batches (7 with proven faults, 2 clean), one run per model each, blind grade on 20 proven findings: Fable blocked 16 and missed 2; Opus blocked 12 and missed 5. Neither raised a false alarm.
- Opus cost about 44 percent of Fable and ran faster.
- Four findings only Fable blocked, among them uninstall with the memory folder as a symlink and `safe-db -f` resolved from the wrong folder.
- Small batches had real faults too, so lowering review effort by batch size would miss them.

Decision: Fable stays the risk reviewer, because it misses fewer faults.

Limits: one run per model per batch; the reference findings came from Fable's earlier reviews, so the test favours Fable.

Related: [[model-and-effort-policy]], [[measure-tool]].
