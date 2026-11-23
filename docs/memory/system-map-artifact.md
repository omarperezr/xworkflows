---
name: system-map-artifact
description: "URL of the published diagram page of the whole xworkflows system; update it in place instead of publishing a new one"
metadata:
  node_type: memory
  type: reference
  modified: 2026-11-23T00:00:00.000Z
---

The owner asked on 2026-11-12 for a complete diagram of the system by parts. It is a private artifact, in Spanish:

https://claude.ai/artifact/Bx9gyUH3W89oadTZkHiTXP ("Mapa de xworkflows")

To change it: read it with the Artifact tool (`action: "read"`, this `url`), edit, and publish with the same `url`. Its content comes from `docs/design.md`; it marks what works today (Claude Code) and what is designed for later. It must hold no name of the owner's own projects; it was first published before those names were neutralized, so check its text before sharing it.

Related: [[phase-1-progress]].
