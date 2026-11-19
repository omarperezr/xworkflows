import { test } from "node:test";
import assert from "node:assert/strict";
import { segments, commandWord, base } from "./shell-words.mjs";

const words = (c) => segments(c).map((s) => s.words);

test("segments split on ; | & && || and newline, not on 2>&1 or &>", () => {
  assert.deepEqual(words("a x; b | c && d || e & f\ng"), [["a", "x"], ["b"], ["c"], ["d"], ["e"], ["f"], ["g"]]);
  assert.deepEqual(words("make 2>&1 | tee out &> log"), [["make", "2>", "1"], ["tee", "out", ">", "log"]]);
});

test("quotes keep separators inside one word", () => {
  assert.deepEqual(words(`psql -c "a; b | c"`), [["psql", "-c", "a; b | c"]]);
});

test("a heredoc body belongs to the segment that opened it and is not parsed as commands", () => {
  const s = segments("cat <<'EOF' | psql\nrm -rf x; y\nEOF\nls");
  assert.deepEqual(s.map((x) => x.words), [["cat"], ["psql"], ["ls"]]);
  assert.equal(s[0].doc, "rm -rf x; y\n");
  assert.equal(s[0].pipe, true);
  assert.equal(s[1].pipe, false);
  assert.equal(segments("cat <<-X\n\tbody\n\tX\nls")[0].doc, "\tbody\n");
  assert.deepEqual(words("cat <<< hi"), [["cat", "<<<", "hi"]]);
});

test("commandWord skips keywords, brackets, NAME=value, wrappers and their options", () => {
  const at = (c) => commandWord(words(c)[0]);
  for (const c of ["rm x", "if rm x", "then rm x", "do rm x", "! rm x", "{ rm x", "( rm x", "(rm x", "A=1 B=2 rm x", "sudo -u app rm x", "sudo -n rm x", "xargs -I {} rm x", "env -i A=1 rm x", "/bin/rm x", "time nohup rm x"])
    assert.equal(at(c)?.word, "rm", c);
  assert.equal(at("sudo -u app rm x").at, 3);
  assert.equal(at("echo rm x").word, "echo");
  assert.equal(commandWord([]), null);
  assert.equal(commandWord(["sudo"]), null);
});

test("base is the last path part of a word without leading brackets", () => {
  assert.equal(base("/usr/bin/psql"), "psql");
  assert.equal(base("(rm"), "rm");
  assert.equal(base("./manage.py"), "manage.py");
  assert.equal(base("psql -c x"), "psql -c x");
});
