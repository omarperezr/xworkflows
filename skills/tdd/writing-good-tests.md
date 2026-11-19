# Writing Good Tests

Load this when you write or change a test, add a mock, or add a test helper.

A test exists to catch a specific break. Two rules:

1. Every test names the break it catches.
2. Every test exercises the real thing.

## Name the break

Before the test body, answer: what production change should make this test fail, and is that change a bug or a decision?

- **Derive expectations by hand.** Use literals and checked fixtures. An expected value computed by the code under test passes whatever that code does.

```
BAD   expected = build_query(tag: "urgent"); assert build_query(tag: "urgent") == expected
GOOD  assert build_query(tag: "urgent") == 'tag:"urgent"'
```

- **No change detectors.** If only a decision can fail the test (a constant, exact wording, private structure), it fires on redesign and sleeps through bugs. Test the behavior that depends on the decision: "a failing call is retried 5 times and never a 6th", not "MAX_RETRIES is 5".
- **Behavior, not text.** Never assert that a script or config contains a line. Run it on controlled input and assert outputs, side effects or exit codes. Prose for humans earns no test.
- **Your code, not the framework.** Test the contract you make at your boundary: the route, the query, the payload. If upstream surprised you, write one narrow test naming the assumption. Constructors, getters, constants and plain forwarding earn a test only when they validate, default, derive or cause a side effect.

Cannot name the break? Redesign the test around an observable behavior.

## Exercise the real thing

- **A mock earns no assertions.** An assertion on the mock passes when the mock is there and fails when it is not. Assert the real component, or delete the assertion.
- **Mock at the right level.** Learn every side effect of the real method first. Mock only the slow, costly or shared operation below it; keep what the test depends on real.
- **Make doubles specific.** If arguments or counts are part of the contract, assert them. Give each branch (success, error, malformed) its own fixture, so the wrong branch cannot pass.
- **Mirror real data completely.** A mock carries every documented field, not only the ones the test reads.
- **Production classes carry production methods only.** Cleanup that only tests call lives in test utilities.
- **Mock setup bigger than the test?** Switch to an integration test with real components. A real database or file system is fine with a fresh fixture per test.

## The mutation check

Before you finish, change the production code in your head. Each realistic mutation should fail at least one test:

- a wrong constant or argument, or the wrong branch
- a missing state change or side effect
- an empty or default return
- missing validation of zero, empty, null, unauthorized or malformed input

A mutation nothing catches means unprotected behavior or a tautological test.

## Warning signs

- Setup and assertion share one object, so equality is guaranteed.
- The test fails on every intentional change and never on a bug.
- Expected values hide behind loops, builders or helpers.
- The test greps source text.
- The test exists for coverage and checks no outcome.
- An assertion targets a mock, or fails if you remove the mock.
- A method is called only from test files.
- Mock setup is over half the test.
