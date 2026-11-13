# The orchestrator hook: three false denials (design)

Status: the owner's "done when" of 2026-11-12 asks for no false denial in the hook log; these three happened in this repository's own use the same day (cards P-61, P-64, P-68).

## The request, deepened

Request: The `orchestrator` hook stops denying three things it should allow. Done when each case below has a test that fails on today's code and passes after, and every case the hook must still deny keeps its test.
Material: `hooks/core/orchestrator.mjs`: the shell rule for heavy folders (around line 51), the index query it records (around line 49), and the rule that the risk reviewer never runs twice on one commit; `hooks/core/orchestrator.test.mjs`. read not tested
Methods: Narrow each rule to what it is for. No new option, no new config key.

## The three cases

1. A write is not a read. A `cat`, `head` or `tail` whose output is redirected into a path under a heavy folder (`>` or `>>` before the path), with or without a here-document, reads nothing there: it is allowed. The text of a here-document is not searched for paths. A heavy folder is a folder at the root of the repository: `proof/x` matches, `docs/proof/x` does not.
2. The index query counts with something before it: `env`, with its `-u NAME` and `NAME=value` arguments, or plain `NAME=value` words, in front of the index command.
3. "This commit" is the one the prompt names. When the risk reviewer's prompt holds commit ids, the rule keys on those ids; a prompt with other ids is another review. With no id in the prompt it keys on the HEAD of the root, as today.

## What must still be denied

A plain `cat`, `head`, `tail` or `sed -n` of a file under a heavy folder at the root; the lookup agent with no index query in the last minutes; a second risk review whose prompt names the same commit ids as the first.

## Questions for the owner

None open.
