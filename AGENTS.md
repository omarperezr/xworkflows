<!-- xworkflows:start -->
## xworkflows

This project uses xworkflows (https://github.com/omarperezr/xworkflows).

- Before writing a spec, run the `grill` skill and settle the design questions with the owner. A hook enforces it.
- For lookups, use the `explore` agent: it answers in 10 lines or fewer.
<!-- xworkflows:end -->

## Rules of this project

- Everything that is installed uses the Node standard library only; the installer has no dependency.
- Hook logic is a pure `decide(ev, ctx)` with a test beside it; broken input lets the call through.
- Every installed file is a manifest piece with its hash: `node bin/xworkflows.mjs pack --check` prints nothing.
- Every project value comes from `.xworkflows/config.json` through the one defaults module.
- The product vocabulary is fixed English: the seal line, the commit-body escapes, the card form, the report keys.
- A brake returns `{ ok, lines }`; the check exits 0, 1, or 2 when anything could not run.
- No name, path or business term of the author's own projects in a tracked file: say "the reference project" and "exam project A / B". Before every commit the two privacy commands of the `privacy` project check print nothing.
- Git: one branch per batch, merged with `--no-ff`; push and merge only on the owner's word; files added by explicit path; no AI authorship line.
- A model call that costs money runs only through the proof harness, with `--api-credits` and its spend ledger.
