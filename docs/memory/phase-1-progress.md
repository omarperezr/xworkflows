---
name: phase-1-progress
description: "Where phase 1 of xworkflows stands on 2026-11-23: what is merged, the one piece left (the pilot), and what the owner still owes"
metadata:
  node_type: memory
  type: project
  modified: 2026-11-23T00:00:00.000Z
---

# Phase 1 of xworkflows (state 2026-11-23)

- Merged on `main`: 1.1 installer (`install`, `doctor`, `uninstall`, `pack`), 1.2 day one (`/adapt`, `/full-review`, `/next-step`), 1.2b adapt reproducible, and the method part of 1.3 (`deepen`, `grill`, `plan`, `orchestrate`, `pending`, the brakes and hooks). xworkflows is installed in its own repository.
- Left: 1.4, the pilot. Since 2026-11-18 it runs directly on the owner's own project, not on a clone; the owner ran the live interview there himself. The assistant touches that repository only on his express word.
- Not tested yet: Windows and `npx github:` install.
- Owner still owes: the 5-minute check in a real terminal (spec deny, `/grill`, allow, install's question).
- Benchmark idea, proposed, not decided, not built: 10 to 20 past fixes from the exam projects with their hidden tests as the grade, 3 runs per version (plain Claude Code, full xworkflows, xworkflows minus one piece).

## Lessons that still hold

- A batch that touches `bin/`, `hooks/`, `checks/` or `proof/` is reviewed by `risk-review`, and so is every later code commit pushed in the same range. A review-small seal never counts on a risk range.
- Run install and `pack` before the final review, so the seal covers them.
- Wait for an agent's report and relay it as it is; do not answer "Ship" or summarise before it arrives.
- Before giving the owner a step list, check the prerequisites (installed tools, the clone's commit and branch) first.
- Exam projects are used once each; tuning happens only on the reference project, so scores there are not evidence of generalization.
- The owner's marks are the measure that counts; a judge agent was stricter than him.

Related: [[adapt-proof-runs]], [[workflow-upgrade-2026-11]], [[system-map-artifact]].
