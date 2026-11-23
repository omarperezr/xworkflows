---
name: tdd
description: Use when implementing any feature or bugfix, before writing implementation code
---

# Test-Driven Development (TDD)

Write the test first. Watch it fail. Write the quickest code that passes. Then clean up.

**If you did not watch the test fail, you do not know it tests the right thing.** Breaking the letter of these rules breaks their spirit.

## When to use

Always: new features, bug fixes, refactoring, behavior changes.

Ask your human partner first for: throwaway prototypes, generated code, configuration files.

## The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Wrote code before the test? Delete it and start over. Do not keep it as reference, do not adapt it, do not look at it.

## Start from a behavior

- A test starts from a behavior the software must have, never from a new method or class.
- First write the list of scenarios: the cases, the edges, the errors. Take one at a time.
- A scenario found midway goes on the list. Do not chase it now.
- Test through the public contract: the module's exports, its port. Never test implementation details. Never make an internal public to test it.
- The unit of isolation is the test, not the class. Tests must not depend on each other or on their order.

## Red-Green-Refactor

### RED: write one failing test

- One behavior. The name states it, so a red test says what broke: `rejects an empty email`, not `test1`. "And" in the name? Split it.
- Real code. No mocks unless unavoidable (see Mocks).
- Name the production change that would make it fail before you write it.

### Verify RED: mandatory

Run the test and confirm:
- It fails on its behavior assertion, with the message you expect.
- It fails because the behavior is missing, not because of a typo.

A missing module, a syntax error or an import error is not red. Add the empty export or stub first, then run again until the assertion fails.

Test passes at once? It tests behavior that already exists. Fix the test. A test that never failed proves nothing.

### GREEN: the quickest code that passes

- Write the simplest code that passes. Do no design between red and green.
- A second scenario forces the general code; never hard-code the expected output in the production code.
- No extra features, no options, no refactoring of other code.

### Verify GREEN: mandatory

- The test passes, and the output is clean: no errors, no warnings.
- Test fails? Fix the code, not the test.
- Run the project's whole suite (`npm test`, bare `pytest`, `cargo test`, whatever the repo uses), not only your file. A scope in your task bounds the deliverable, not the verification.
- Any failure that run shows, even one you did not cause, goes in your report by name.

### REFACTOR: only on green

- Remove duplication and smells, improve names, extract helpers. Patterns enter here, not before.
- No new test and no new behavior. A new branch or condition is a new behavior: back to red.
- Changing a public interface is a change of behavior, not a refactor: back to red.
- Keep the suite green after each step.

Then take the next scenario from the list.

## Language-neutral example: bug fix

Bug: an empty email is accepted.

```
RED     test "rejects an empty email":
          result = submit(email: "")
          assert result.error == "Email required"
VERIFY  run: FAIL, expected "Email required", got none
GREEN   in submit: if email is blank, return error "Email required"
VERIFY  run the suite: PASS
REFACTOR  share the check with the other required fields
```

Never fix a bug without a test that reproduces it first. The test proves the fix and blocks the regression.

## Tests that stay honest

Read [writing-good-tests.md](writing-good-tests.md) whenever you write or change a test.

- Mocks only for a resource that is slow, costly or shared, and only at a port. Never to isolate a class. Never to pin the order of internal calls. Assert the final state, not the calls.
- A real database or file system is fine when each test gets a fresh fixture and the suite stays fast and deterministic.
- Never edit an existing test to make it pass. When the requirement changed, change the test and say so in your report.
- Never hard-code the expected output in the production code.
- Never test by matching source text.
- A test written to explore internals is deleted before hand-back.

## Excuses and red flags: stop and start over

| Excuse | Reality |
|--------|---------|
| "Too simple to test" | Simple code breaks. The test takes 30 seconds. |
| "I'll test after" / "tests after serve the same goal" | A test written after passes at once, so you never saw it fail. It answers "what does this do?", not "what should this do?", and checks only the cases you remembered. |
| "I already tested it by hand" | Hand testing leaves no record and cannot be re-run. |
| "Deleting X hours of work is wasteful" | That time is spent either way. Code you cannot trust is the waste. |
| "Keep it as reference" | You will adapt it. That is testing after. |
| "I need to explore first" | Fine. Throw the exploration away, then start with a test. |
| "The test is hard to write" | Hard to test means hard to use. Simplify the design. |
| "TDD slows me down" | It catches bugs before commit and lets you refactor without fear. |
| "Existing code has no tests" | You are improving it. Add tests for what you touch. |

Also stop on: code before the test, a test that passes at once, a failure you cannot explain, "just this once", "this is different because...". All of these mean: delete the code and start over.

## When stuck

| Problem | Solution |
|---------|----------|
| Do not know how to test it | Write the wished-for API, then the assertion first. Ask your human partner. |
| Test too complicated | The design is too complicated. Simplify the interface. |
| Must mock everything | The code is too coupled. Inject dependencies. |
| Huge test setup | Extract helpers. Still complex? Simplify the design. |

## Before you hand back

- [ ] Every new behavior has a test that failed first, for the expected reason.
- [ ] Each test name states its behavior.
- [ ] Minimal code for each test. The whole suite passes, output clean.
- [ ] Edge cases and errors covered.
- [ ] No exploration test left. No existing test edited to pass.

Cannot check every box? You skipped TDD. Start over. No exceptions without your human partner's permission.

Sources: Kent Beck, Canon TDD; Martin Fowler, "Mocks Aren't Stubs" and "UnitTest"; Software Engineering at Google, ch. 12; Kent Beck's Test Desiderata; Ian Cooper, "TDD, Where Did It All Go Wrong".
