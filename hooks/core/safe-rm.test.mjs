import { test } from "node:test";
import assert from "node:assert/strict";
import { decide } from "./safe-rm.mjs";

const ev = (command, extra = {}) => ({ event: "preTool", tool: "Bash", kind: "shell", session: "s", root: "/r", isSubagent: false, writes: [], command, ...extra });
const ctx = {};
const denied = (c) => { const d = decide(ev(c), ctx); return d.decision === "deny" && /\$\{NAME:\?/.test(d.reason); };
const allowed = (c, e) => decide(ev(c, e), ctx).decision === "allow";

test("variable in a recursive rm: deny", () => {
  assert.ok(denied("rm -rf $DIR/x"));
  assert.ok(denied("rm -rf ${DIR}/x"));
  assert.ok(denied('rm -rf "$DIR"/x'));
  assert.ok(denied("rm -rf ${DIR:-/tmp}/x"));
});

test("substitution in a recursive rm: deny", () => {
  assert.ok(denied("rm -rf $(pwd)/x"));
  assert.ok(denied("rm -rf `pwd`/x"));
});

test("recursive flag forms: deny", () => {
  for (const f of ["-r", "-R", "-rf", "-fr", "-Rf", "--recursive", "-f -r", "-vrf"]) assert.ok(denied(`rm ${f} $DIR`), f);
});

test("after sudo, xargs and separators: deny", () => {
  for (const c of ["sudo rm -rf $D", "echo a | xargs rm -rf $D", "cd x; rm -rf $D", "cd x && rm -rf $D", "cd x || rm -rf $D", "ls | rm -rf $D", "ls\nrm -rf $D"]) assert.ok(denied(c), c);
});

test("literal path, guarded variable, non-recursive rm: allow", () => {
  assert.ok(allowed("rm -r build"));
  assert.ok(allowed("rm -rf ${DIR:?unset}/x"));
  assert.ok(allowed('rm -rf "${DIR:?unset}/x"'));
  assert.ok(allowed("rm -f $FILE"));
  assert.ok(allowed("rm $FILE"));
  assert.ok(allowed("rm -rf 'a$b'"));
  assert.ok(allowed("rm -rf a\\$b"));
  assert.ok(allowed("echo rm -rf $D"));
  assert.ok(allowed("ls $D && rm -rf build"));
  assert.ok(allowed("find . | xargs rm -rf"));
});

test("guarded and unguarded mixed: deny", () => {
  assert.ok(denied("rm -rf ${A:?x} $B"));
});

test("non-shell and broken input: allow", () => {
  assert.ok(allowed(undefined, { kind: "write" }));
  assert.ok(allowed(5));
  assert.ok(allowed("rm -rf $D", { kind: "write" }));
  assert.equal(decide(null, ctx).decision, "allow");
});
