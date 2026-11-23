---
name: reference-project-paused
description: "The reference project's own work is stopped until xworkflows is fully integrated there"
metadata:
  node_type: memory
  type: project
  originSessionId: 6c0db597-361b-4d5c-b60b-338bb201c865
  modified: 2026-11-20T18:53:40.617Z
---

The owner, 2026-11-20: the reference project is stopped until the integration of the new workflow (xworkflows) is finished.

**Why:** the owner wants the reference project to run on xworkflows before it moves on; the migration plan replaces its old workflow, never duplicates it.

**How to apply:** the order is group A, then C, then B and D in parallel, then the migration batches of the reference project. Treat every card the migration needs as the critical path; nothing else of the reference project is waiting. Urgent fixes still land there during the pause (the owner, 2026-11-20); the owner will say when that urgent work is over, and no migration batch touches the reference project before that word. Later on 2026-11-20 the owner said the urgent work is over and nobody writes code there until the migration is finished, so the migration batches are free to run after groups A, B, C and D. Later the same day the owner resumed work there (the owner: someone is programming there again): no migration batch writes in the reference project until the owner gives a window again; read-only preparation is fine. before the first migration batch, diff the reference project against the commit the migration plan read and refresh the plan's facts. On 2026-11-21 the owner opened the window: nobody works there until further notice, the window is open for now; the migration may write there now (no push of the reference project), until the owner says otherwise. On 2026-11-21 the migration merged into the reference project's main (its brakes green); its push is the owner's. After every install there, remove `autoMemoryDirectory` from its `.claude/settings.local.json` until P-237 lands. Never name the project in a tracked file. See [[migration-plan]].
