---
name: system-map-artifact
description: "URL of the published diagram page of the whole xworkflows system (install, adapt, seven stages, agents, hooks, brakes, memory); update it in place instead of publishing a new one"
metadata:
  node_type: memory
  type: reference
  originSessionId: d86649ed-72f7-4483-b071-92227fe2cef4
  modified: 2026-11-23
---

The owner asked on 2026-11-12 for "un diagrama completo del sistema completo por partes". It is published as a private artifact, in Spanish, eight parts:

https://claude.ai/artifact/Bx9gyUH3W89oadTZkHiTXP ("Mapa de xworkflows")

To change it from another session: read it with the Artifact tool (`action: "read"`, this `url`), edit, and publish with the same `url`. Its content comes from `docs/design.md` and the installer branch; it marks what works today (Claude Code) and what is designed for later. It must hold no name of the owner's private projects. That was not checked after publication.

Versions: the same `url` was updated in place on 2026-11-15 (the session shows versions 4, 5 and 6 that day). Version 6 adds the four model tiers and the `/adapt` question about the risk reviewer's model (see [[model-and-effort-policy]]) and the install section as built, including the memory folder ([[qmd-local-index]]). Its counts, such as "7 hooks and 14 checks", were not rechecked against the code on 2026-11-15; check them before reuse.

Verify before sharing it: the diagram was published about 13:40 on 2026-11-12, before the reference-project names in `docs/design.md` were neutralized later that day. Check the artifact text for those names, and if any remain, publish a fix with the same `url`. The session did not see the rendered page either; the owner was asked to read part 1 and report what looks wrong.

Related: [[phase-1-progress]], [[owner-judges-short-plain-lists]].
