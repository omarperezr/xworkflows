import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, appendFileSync, utimesSync, cpSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "../../test-tmp.mjs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { mask, shapes, suspect, run } from "./extract.mjs";
import { shared } from "./shared.mjs";

const made = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "dream-x-")); made.push(d); return d; };
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const user = (text, timestamp) => JSON.stringify({ type: "user", timestamp, message: { content: text } });
const asst = (text, timestamp) => JSON.stringify({ type: "assistant", timestamp, message: { content: [{ type: "text", text }, { type: "tool_use", name: "Bash", input: { command: "ls" } }] } });
const day = (n) => `2030-01-0${n}T10:00:00.000Z`;
const parse = (r) => { const json = r.stdout.startsWith("{") ? JSON.parse(r.stdout) : null; if (json?.out) made.push(json.out); return { ...r, json }; };

const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
// a repository whose main branch holds what the folder holds now
const repo = (root, branch = "main") => {
  git(root, "init", "-q", "-b", branch);
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "T");
  git(root, "add", "-A");
  git(root, "commit", "-q", "--allow-empty", "-m", "init");
};

// a repository with one memory note on main, and a sessions folder
function world({ notes = true, config } = {}) {
  const root = tmp(), sessions = tmp();
  if (notes) { mkdirSync(join(root, "docs/memory"), { recursive: true }); writeFileSync(join(root, "docs/memory/a.md"), "note"); writeFileSync(join(root, "docs/memory/MEMORY.md"), "index"); }
  if (config) { mkdirSync(join(root, ".xworkflows")); writeFileSync(join(root, ".xworkflows/config.json"), JSON.stringify(config)); }
  repo(root, config?.mainBranch);
  const put = (name, ...lines) => writeFileSync(join(sessions, name + ".jsonl"), lines.join("\n") + "\n");
  // the state as an adopted run leaves it: committed on the branch that is checked out (main, unless a test moved)
  const state = (s) => {
    mkdirSync(join(root, "docs/memory"), { recursive: true });
    writeFileSync(join(root, "docs/memory/dream.json"), typeof s === "string" ? s : JSON.stringify(s));
    git(root, "add", "docs/memory/dream.json");
    git(root, "commit", "-q", "-m", "state");
  };
  const go = (...extra) => parse(run([...extra, "--sessions", sessions, "--current", "none"], {}, root, tmp()));
  return { root, sessions, put, state, go };
}

test("sessions come oldest first by their first timestamp, not by name", () => {
  const w = world();
  w.put("a-late", user("second", day(2)));
  w.put("z-early", user("first", day(1)));
  const { json } = w.go();
  assert.deepEqual(json.sessions.map((s) => s.name), ["z-early", "a-late"]);
  assert.deepEqual(json.sessions.map((s) => s.lines), [1, 1]);
  assert.equal(json.last, undefined);
  assert.equal(readFileSync(json.sessions[0].file, "utf8"), "user: first");
  assert.equal(json.notes, 1);
});

test("the printed object is also written into the out folder as extract.json", () => {
  const w = world();
  w.put("s", user("t", day(1)));
  const { stdout, json } = w.go();
  assert.ok(!json.out.startsWith(w.root));
  assert.deepEqual(JSON.parse(readFileSync(join(json.out, "extract.json"), "utf8")), json);
  assert.equal(JSON.parse(stdout).out, json.out);
});

test("a session with no timestamp falls back to the modification time", () => {
  const w = world();
  w.put("old", user("x"));
  utimesSync(join(w.sessions, "old.jsonl"), new Date(day(1)), new Date(day(1)));
  w.put("new", user("y", day(2)));
  assert.deepEqual(w.go().json.sessions.map((s) => s.name), ["old", "new"]);
});

test("the running session is skipped, by --current and by the environment", () => {
  const w = world();
  w.put("run", user("now", day(2)));
  w.put("past", user("then", day(1)));
  assert.deepEqual(w.go("--current", "run").json.sessions.map((s) => s.name), ["past"]);
  const r = parse(run(["--sessions", w.sessions], { CLAUDE_CODE_SESSION_ID: "past" }, w.root, tmp()));
  assert.deepEqual(r.json.sessions.map((s) => s.name), ["run"]);
});

test("without the id of the running session it refuses with one line on standard error and exit 2", () => {
  const w = world();
  w.put("s", user("t", day(1)));
  for (const [argv, env] of [[[], {}], [[], { CLAUDE_CODE_SESSION_ID: "" }], [["--current"], {}]]) {
    const r = run(["--sessions", w.sessions, ...argv], env, w.root, tmp());
    assert.equal(r.code, 2, JSON.stringify([argv, env]));
    assert.equal(r.stdout, "");
    assert.equal(r.stderr.trim().split("\n").length, 1);
  }
});

test("a cap that is not a whole number above zero is refused with one line on standard error and exit 2", () => {
  for (const cap of ["100", -5, 0, 1.5, null]) {
    const w = world({ config: { dream: { maxExtractBytes: cap } } });
    w.put("s", user("t", day(1)));
    const r = w.go();
    assert.equal(r.code, 2, String(cap));
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /^[^\n]*maxExtractBytes[^\n]*\n$/);
  }
});

test("a line of a side chain is dropped", () => {
  const w = world();
  w.put("s", user("main text", day(1)), JSON.stringify({ type: "user", isSidechain: true, timestamp: day(1), message: { content: "SIDE" } }));
  w.put("agent-a", JSON.stringify({ type: "assistant", isSidechain: true, timestamp: day(2), message: { content: [{ type: "text", text: "SIDE" }] } }));
  const { json } = w.go();
  assert.equal(readFileSync(json.sessions[0].file, "utf8"), "user: main text");
  assert.equal(json.sessions[0].lines, 2);
  for (const s of json.sessions) assert.ok(!readFileSync(s.file, "utf8").includes("SIDE"));
});

test("a file in a sub-folder is not read", () => {
  const w = world();
  mkdirSync(join(w.sessions, "agents"));
  writeFileSync(join(w.sessions, "agents", "side.jsonl"), user("side", day(1)) + "\n");
  w.put("main", user("main", day(2)));
  assert.deepEqual(w.go().json.sessions.map((s) => s.name), ["main"]);
});

test("both sides' text is kept; tools, notices, meta, summaries and reports are dropped", () => {
  const w = world();
  w.put("s",
    user("typed by the owner", day(1)),
    asst("written by the model", day(1)),
    JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: "TOOLOUT" }] } }),
    JSON.stringify({ type: "user", isMeta: true, message: { content: "METALINE" } }),
    JSON.stringify({ type: "user", isCompactSummary: true, message: { content: "SUMMARY" } }),
    user("<task-notification>AGENTREPORT</task-notification>", day(1)),
    user("<system-reminder>NOTICE</system-reminder> after the tag", day(1)),
    JSON.stringify({ type: "system", message: { content: "SYS" } }));
  const text = readFileSync(w.go().json.sessions[0].file, "utf8");
  assert.equal(text, "user: typed by the owner\nassistant: written by the model\nuser: after the tag");
});

const v = "Zq7" + "Wx2" + "Rt9"; // a made-up value
const long = "A1".repeat(12);
const pk = "-----BEGIN RSA PRIVATE " + "KEY-----\nabc\n-----END RSA PRIVATE " + "KEY-----";
// keys by their own shape, wherever they stand
const SHAPES = [
  [pk, "[masked]\n\n"], // the lines of the block stay, so a line number after it still holds
  ["sk-" + "a1".repeat(12), "[masked]"],
  ["sk-" + "ant-api03-" + long + "-x_y", "[masked]"],
  ["sk-" + "proj-" + long + "_z-1", "[masked]"],
  ["sk" + "_live_" + long, "[masked]"],
  ["sk" + "_test_" + long, "[masked]"],
  ["rk" + "_live_" + long, "[masked]"],
  ["gh" + "p_" + long, "[masked]"],
  ["gh" + "o_" + long, "[masked]"],
  ["gh" + "u_" + long, "[masked]"],
  ["gh" + "s_" + long, "[masked]"],
  ["gh" + "r_" + long, "[masked]"],
  ["github" + "_pat_" + long, "[masked]"],
  ["AK" + "IA" + "ABCDEFGH12345678", "[masked]"],
  ["xo" + "xb-123-abc", "[masked]"],
  ["ey" + "Jhbg.ey" + "Jzdw.sig_-9", "[masked]"],
  // the password of a URL goes, its user stays; also with no user
  [`postgres://admin:${v}@db.example:5432/app`, "postgres://admin:[masked]@db.example:5432/app"],
  [`redis://:${v}@cache.example:6379`, "redis://:[masked]@cache.example:6379"],
  [`see ANTHROPIC_API_KEY=sk-` + `ant-api03-${long} here`, "see ANTHROPIC_API_KEY=[masked] here"],
];
// ordinary text both reviews named: no shape of its own, so shapes leaves it alone
const ORDINARY = ["plain words", "Authorization: Bearer <token>", "token: string", "`token: string`", "(token: string)", "token: str",
  "password: <your password>", '"secret": null', "apiKey: undefined", "token=true", "access_key: false", "passwordLength: number",
  "hasToken: boolean", 'password=""', "https://example.com:8080/a@b", "the summarizer uses max_tokens: 4096 and tokens: 1500 per call",
  "maxTokens = 1000", "token_type: bearer", "secretName: x", "const token = await getToken(req)", "password === confirm",
  "Tokens: how they work", "already [masked] once", "postgres://admin:[masked]@db.example/app"];
// each a form a review saw pass a mask, with v as its secret
const FORMS = [
  `Staging password: \`${v}\``, `**Password:** ${v}`, `'password' => '${v}'`, `DB_PASS=${v}`, `SMTP_PASS=${v}`, `MYSQL_PWD=${v}`,
  `Server=db;Uid=sa;Pwd=${v};`, `curl -d "{\\"password\\":\\"${v}\\"}" https://api.example`, `"Authorization": "Bearer ${v}"`,
  `Authorization: 'Bearer ${v}'`, `Authorization: Basic ${v}`, `--password ${v}`, `API key: ${v}`, `password=${v} ok`, `"passwd": "${v}"`,
  `secret: ${v}`, `token='${v}'`, `api_key=${v}`, `apikey=${v}`, `DB_PASSWORD=${v}`, `client_secret=${v}`, `AWS_SECRET_ACCESS_KEY=${v}`,
  `aws_access_key_id: ${v}`, `x-api-key: ${v}`, `"accessToken": "${v}"`, `password: "correct horse ${v}" done`, `PASSPHRASE ${v}`,
  `the credential is ${v}`, `Authorization: Bearer ${v}`,
];

test("shapes: each key of a known form goes, the text around stays, the count is returned", () => {
  for (const [from, to] of SHAPES) assert.deepEqual(shapes(from), [to, 1], from);
  for (const keep of ORDINARY) assert.deepEqual(shapes(keep), [keep, 0], keep);
  for (const form of FORMS) assert.deepEqual(shapes(form), [form, 0], form);
});

test("shapes: a BEGIN line in a sentence masks only that line, and a cut block takes only its key lines before a blank line", () => {
  const lines = Array.from({ length: 20 }, (_, i) => `Fact ${i + 1} of the note.`);
  lines[0] = "The key file must start with the line -----BEGIN OPENSSH PRIVATE " + "KEY----- or ssh refuses it.";
  const [out, n] = shapes(lines.join("\n\n"));
  assert.equal(n, 1);
  assert.deepEqual(out.split("\n\n"), ["The key file must start with the line [masked]", ...lines.slice(1)]); // nineteen stay
  const cut = "-----BEGIN RSA PRIVATE " + "KEY-----\nabc\ndef";
  assert.deepEqual(shapes(`${cut}\n\nafter`), ["[masked]\n\n\n\nafter", 1]); // a cut block: its lines go, the line numbers hold
});

test("shapes: a BEGIN line with no END line takes only the lines of key material that follow it", () => {
  const prose = Array.from({ length: 20 }, (_, i) => `Fact ${i + 1} of the note.`);
  const head = "The key file must start with the line -----BEGIN OPENSSH PRIVATE " + "KEY----- or ssh refuses it.";
  for (const eol of ["\n", "\r\n"]) {
    const [out, n] = shapes([head, ...prose].join(eol));
    assert.equal(n, 1);
    assert.deepEqual(out.split(eol), ["The key file must start with the line [masked]", ...prose]); // the twenty stay
  }
  const b64 = Array.from({ length: 6 }, (_, i) => "MIIEvQIBADANBgkq+/" + i + "=");
  const cut = ["-----BEGIN RSA PRIVATE " + "KEY-----", ...b64, "Then some prose.", "More prose."];
  assert.deepEqual(shapes(cut.join("\n")), ["[masked]\n\n\n\n\n\n\nThen some prose.\nMore prose.", 1]); // the six go, the prose stays
  const crlf = shapes(cut.join("\r\n"));
  assert.equal(crlf[1], 1);
  assert.ok(crlf[0].endsWith("Then some prose.\r\nMore prose."));
  assert.ok(!crlf[0].includes("MIIEv"));
});

test("shapes: 2000 BEGIN lines with no END line are masked within 1500 ms", () => {
  const t = "-----BEGIN RSA PRIVATE KEY-----\n".repeat(2000);
  const t0 = performance.now();
  shapes(t);
  const ms = performance.now() - t0;
  assert.ok(ms < 1500, `took ${Math.round(ms)} ms`);
});

test("shapes: a cut block is masked whole when its key lines are indented, quoted or end in white space", () => {
  const b = "-----BEGIN RSA PRIVATE " + "KEY-----", key = Array.from({ length: 4 }, (_, i) => "MIIEvQIBADANBgkq+/" + i + "=");
  const cases = [["indent", b, (k) => "    " + k], ["tab", b, (k) => "\t" + k], ["quote", "> " + b, (k) => "> " + k],
    ["quote nested", ">> " + b, (k) => ">  > " + k], ["trailing", b, (k) => k + " "], ["trailing tab", b, (k) => k + "\t"]];
  for (const eol of ["\n", "\r\n"]) for (const [name, head, f] of cases) {
    const [out, n] = shapes([head, ...key.map(f), "Then some prose."].join(eol));
    assert.equal(n, 1, name);
    assert.ok(!out.includes("MIIEv"), `${name}: ${JSON.stringify(out)}`);
    assert.equal(out.split("\n").length, 6, name); // the line breaks hold
    assert.ok(out.endsWith("Then some prose."), name);
  }
  const head = "The key file must start with the line " + b + " or ssh refuses it.";
  for (const f of [(l) => l, (l) => "    " + l, (l) => "> " + l]) {
    const prose = Array.from({ length: 20 }, (_, i) => f(`Fact ${i + 1} of the note.`));
    assert.deepEqual(shapes([head, ...prose].join("\n")), ["The key file must start with the line [masked]\n" + prose.join("\n"), 1]);
  }
  const ordinary = Array.from({ length: 30 }, (_, i) => `line${i}`).join("\n");
  assert.deepEqual(shapes(ordinary), [ordinary, 0]);
});

test("mask: every form a review found is masked, and every key of a known form", () => {
  for (const form of FORMS) {
    const [out, n] = mask(form);
    assert.ok(!out.includes(v) && n >= 1, `${form} -> ${out}`);
  }
  for (const [from, to] of SHAPES) assert.equal(mask(from)[0], mask(to)[0], from); // the shape goes first, then the wide rule
  assert.deepEqual(mask("sk-" + "a1".repeat(12)), ["[masked]", 1]);
  assert.deepEqual(mask(`Staging password: \`${v}\` ok`), ["Staging password: `[masked]` ok", 1]);
  assert.deepEqual(mask(`DB_PASSWORD=${v}`), ["DB_PASSWORD=[masked]", 1]);
  assert.deepEqual(mask(`"Authorization": "Bearer ${v}"`), ['"Authorization": "[masked]"', 1]);
});

test("mask: after a credential word the value goes whole, however short and whatever it holds; with none on its line, the next line that is not empty goes", () => {
  const sym = "kX9&" + "mQ2*" + "abcdEFGH";
  for (const [from, to] of [
    [`here is the db password:\n${v}\nthanks`, "here is the db password:\n[masked]\nthanks"],
    [`password:\n\n   ${v}`, "password:\n\n[masked]"],
    [`DB_PASSWORD="${sym}"`, 'DB_PASSWORD="[masked]"'],
    [`DB_PASSWORD=${sym};x`, "DB_PASSWORD=[masked]"],
    ["pwd=abc", "pwd=[masked]"],
  ]) assert.deepEqual(mask(from), [to, 1], from);
});

test("mask: the value of a flag goes: -u name:value, -p value and -pvalue", () => {
  for (const [from, to] of [
    [`curl -u admin:${v} https://api.example`, "curl -u admin:[masked] https://api.example"],
    [`mysql -uroot -p${v} app`, "mysql -uroot -p[masked] app"],
    [`docker login -u app -p ${v}`, "docker login -u app -p [masked]"],
  ]) assert.deepEqual(mask(from), [to, 1], from);
});

test("mask: of 200 made-up passwords of 20 characters from the full symbol set, none leaves a character after password=", () => {
  let seed = 7;
  const pick = () => String.fromCharCode(33 + ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 16) % 94); // ! to ~
  for (let i = 0; i < 200; i++) {
    const pw = Array.from({ length: 20 }, pick).join("");
    assert.deepEqual(mask(`password=${pw}`), ["password=[masked]", 1], pw);
  }
});

test("forms the mask does not see: the declared limit", () => {
  for (const form of [`pw: ${v}`, `creds: user:${v}`, `login: user / ${v}`, `ADMIN_PW=${v}`, `${v} is the password`, `contraseña: ${v}`, `clave: ${v}`])
    assert.deepEqual(mask(form), [form, 0], form);
});

test("mask: a long random-looking run goes anywhere; a placeholder, a type word, a short run and a masked value stay", () => {
  const random = "q7Wx2Rt9" + "Kp4Ld8Vm" + "3Hs6"; // 20 characters, letters beside digits
  assert.deepEqual(mask(`commit ${random} is the one`), ["commit [masked] is the one", 1]);
  for (const keep of ["Authorization: <token>", "token: string", "password: <your password>", '"secret": null',
    "apiKey: undefined", "token=true", "access_key: false", "passwordLength: number", "hasToken: boolean", 'password=""',
    "a_long_snake_case_name_without_digits", "version 2 of the 20 page manual", "token: [masked]"]) assert.deepEqual(mask(keep), [keep, 0], keep);
});

test("suspect: the numbers of the lines the wide rule would touch beyond shapes", () => {
  const text = ["plain line", `DB_PASSWORD=${v}`, "sk-" + "a1".repeat(12), "token: string", `id ${"q7Wx2Rt9" + "Kp4Ld8Vm" + "3Hs6"}`, pk, `secret: ${v}`].join("\n");
  assert.deepEqual(suspect(text), [2, 5, 9]); // the key block is lines 6 to 8
  // the wide rule's cost on ordinary text: these lines are named for a look, not rewritten; a value goes whole whatever it holds
  // (the closing backtick and bracket too) and however short, and the line after password="" goes as a value on the next line
  assert.deepEqual(suspect(ORDINARY.join("\n")).map((n) => ORDINARY[n - 1]), ["Authorization: Bearer <token>", "`token: string`",
    "(token: string)", "token: str", "https://example.com:8080/a@b",
    "the summarizer uses max_tokens: 4096 and tokens: 1500 per call", "maxTokens = 1000", "token_type: bearer", "secretName: x",
    "const token = await getToken(req)", "password === confirm", "Tokens: how they work"]);
  assert.deepEqual(suspect(""), []);
  // the next line after a credential word with no value, and a flag's value
  assert.deepEqual(suspect(`here is the db password:\n\n${v}\nplain`), [3]);
  assert.deepEqual(suspect(`plain\ncurl -u admin:${v} https://api.example`), [2]);
});

test("the mask's time grows with the length of the text, not its square", () => {
  const run = "a1B2".repeat(50000); // 200,000 letters and digits
  const texts = [run, `password: ${run}`, `${run} token`, "a.b-".repeat(50000), "eyJ-".repeat(50000), "-----BEGIN ".repeat(20000),
    "x://y:".repeat(30000), "pass=a1 ".repeat(25000), `password="${"<a'&*;`".repeat(33334)}`, "-u a:-p ".repeat(25000), Array.from({ length: 20000 }, (_, i) => `token ${i}: line ${i}`).join("\n")];
  for (const t of texts) {
    const t0 = performance.now();
    mask(t); suspect(t); shapes(t);
    const ms = performance.now() - t0;
    assert.ok(ms < 1500, `${t.slice(0, 12)}... took ${Math.round(ms)} ms`);
  }
});

test("a session whose unread lines hold no kept text makes no file and is not listed; its position moves on in empty", () => {
  const w = world();
  const summary = JSON.stringify({ type: "summary", summary: "SUMMARY" }), side = JSON.stringify({ type: "user", isSidechain: true, message: { content: "SIDE" } });
  w.put("quiet", summary, side);
  w.put("later", user("t1", day(1)), summary);
  w.put("talk", user("hello", day(2)));
  w.state({ sessions: { later: 1 } });
  const { json } = w.go();
  assert.deepEqual(json.sessions.map((s) => s.name), ["talk"]);
  assert.deepEqual(json.empty.sort((a, b) => a.name.localeCompare(b.name)), [{ name: "later", lines: 2 }, { name: "quiet", lines: 2 }]);
  assert.deepEqual(readdirSync(json.out).sort(), ["extract.json", "talk.txt"]);
  assert.equal(json.left, 0);
});

test("a session's masked count is reported and the text on disk is masked", () => {
  const w = world();
  w.put("s", user("password=hunter2", day(1)));
  const { json } = w.go();
  assert.equal(json.sessions[0].masked, 1);
  assert.equal(readFileSync(json.sessions[0].file, "utf8"), "user: password=[masked]");
});

const body = "x".repeat(94); // "user: " + 94 = 100 bytes

test("the cap: two sessions fit, the third waits for the next run", () => {
  const w = world({ config: { dream: { maxExtractBytes: 250 } } });
  for (const n of [1, 2, 3]) w.put("s" + n, user(body, day(n)));
  const { json } = w.go();
  assert.deepEqual(json.sessions.map((s) => s.name), ["s1", "s2"]);
  assert.equal(json.sessions[0].bytes, 100);
  assert.equal(json.bytes, 200);
  assert.equal(json.tokens, 50);
  assert.equal(json.left, 1);
  assert.equal(json.cut, false);
});

test("the cap cuts at a line: the session says how far it was read and the rest is read at the next run", () => {
  const w = world({ config: { dream: { maxExtractBytes: 250 } } });
  w.put("s1", user(body, day(1)), user(body, day(1)), user(body, day(1)));
  w.put("s2", user(body, day(2)));
  const first = w.go().json;
  assert.deepEqual(first.sessions.map((s) => [s.name, s.lines, s.bytes]), [["s1", 2, 201]]);
  assert.equal(readFileSync(first.sessions[0].file, "utf8"), `user: ${body}\nuser: ${body}`);
  assert.deepEqual([first.cut, first.left, first.bytes], [true, 2, 201]);
  w.state({ sessions: { s1: 2 } });
  const next = w.go().json;
  assert.deepEqual(next.sessions.map((s) => [s.name, s.lines, s.bytes]), [["s1", 3, 100], ["s2", 1, 100]]);
  assert.deepEqual([next.cut, next.left], [false, 0]);
});

test("one line bigger than the cap, first in the run, is taken cut at the cap", () => {
  const w = world({ config: { dream: { maxExtractBytes: 50 } } });
  w.put("s1", user(body, day(1)));
  w.put("s2", user(body, day(2)));
  const { json } = w.go();
  assert.deepEqual(json.sessions.map((s) => [s.name, s.lines]), [["s1", 1]]);
  assert.equal(json.bytes, 50);
  assert.equal(json.cut, true);
  assert.equal(json.left, 1);
  assert.equal(readFileSync(json.sessions[0].file, "utf8").length, 50);
});

test("dream.json: each session is read from the line after the count it holds", () => {
  const w = world();
  w.put("s1", user("t1", day(1)), user("t1 more", day(5)));
  w.put("s2", user("t2", day(2)));
  w.put("s3", user("t3", day(3)));
  w.state({ sessions: { s1: 1, s2: 1 } });
  const { json } = w.go();
  assert.deepEqual(json.sessions.map((s) => [s.name, s.lines]), [["s3", 1], ["s1", 2]]); // s1 by the time of its first unread line
  assert.equal(readFileSync(json.sessions[1].file, "utf8"), "user: t1 more");
  assert.equal(json.notes, 1);
});

const refused = (r) => { assert.equal(r.code, 2); assert.equal(r.stdout, ""); assert.match(r.stderr, /^dream extract: [^\n]+\n$/); };

test("a dream.json on main that does not parse or has another form is refused with one line on standard error and exit 2", () => {
  for (const s of [{ name: "s2", time: day(2) }, "{broken", { sessions: [1] }, { sessions: { s1: "2" } }, { sessions: { s1: -1 } }, "null",
    "<<<<<<< HEAD\n{\"sessions\":{\"s1\":1}}\n=======\n{\"sessions\":{\"s1\":2}}\n>>>>>>> dream/2030-01-02\n"]) {
    const w = world();
    w.state(s);
    w.put("s1", user("t1", day(1)));
    refused(w.go());
  }
});

test("a dream.json with the time of the run is read as one without it; a ran that is not a string is refused", () => {
  const w = world();
  w.put("s1", user("t1", day(1)), user("t1 more", day(5)));
  w.state({ sessions: { s1: 1 }, ran: "2030-01-02T03:04:05.000Z" });
  assert.deepEqual(w.go().json.sessions.map((s) => [s.name, s.lines]), [["s1", 2]]);
  for (const ran of [5, null, {}, ["x"]]) {
    const v = world();
    v.state({ sessions: {}, ran });
    v.put("s1", user("t1", day(1)));
    refused(v.go());
  }
});

test("the state is read from the main branch: the working folder's copy and the branch checked out are not read", () => {
  const w = world();
  w.put("s1", user("t1", day(1)), user("t1 more", day(1)));
  w.state({ sessions: { s1: 1 } });
  writeFileSync(join(w.root, "docs/memory/dream.json"), "{broken"); // an edit in the working folder
  assert.equal(readFileSync(w.go().json.sessions[0].file, "utf8"), "user: t1 more");
  git(w.root, "checkout", "-q", "-f", "-b", "batch", "HEAD~1"); // a branch made before the run was adopted: no dream.json
  assert.equal(readFileSync(w.go().json.sessions[0].file, "utf8"), "user: t1 more");
});

test("the main branch is the one the config names", () => {
  const w = world({ config: { mainBranch: "trunk" } });
  w.put("s1", user("t1", day(1)), user("t1 more", day(1)));
  w.state({ sessions: { s1: 1 } });
  assert.equal(readFileSync(w.go().json.sessions[0].file, "utf8"), "user: t1 more");
});

test("no main branch, or no repository, is refused with one line on standard error and exit 2", () => {
  const noMain = world({ config: { mainBranch: "trunk" } });
  git(noMain.root, "branch", "-m", "trunk", "other");
  const empty = tmp(), plain = tmp();
  mkdirSync(join(empty, "docs/memory"), { recursive: true });
  writeFileSync(join(empty, "docs/memory/a.md"), "note");
  git(empty, "init", "-q", "-b", "main"); // no commit: main does not exist yet
  cpSync(join(empty, "docs"), join(plain, "docs"), { recursive: true });
  noMain.put("s", user("t", day(1)));
  for (const root of [noMain.root, empty, plain]) refused(run(["--sessions", noMain.sessions, "--current", "none"], {}, root, tmp()));
});

test("waiting: the dream branches not merged into main, an empty list when none", () => {
  const w = world();
  w.put("s1", user("t1", day(1)));
  assert.deepEqual(w.go().json.waiting, []);
  git(w.root, "branch", "dream/2030-01-01"); // merged: it points at main
  git(w.root, "checkout", "-q", "-b", "dream/2030-01-02");
  git(w.root, "commit", "-q", "--allow-empty", "-m", "a run");
  git(w.root, "checkout", "-q", "-b", "other");
  git(w.root, "commit", "-q", "--allow-empty", "-m", "not a run");
  git(w.root, "checkout", "-q", "main");
  assert.deepEqual(w.go().json.waiting, ["dream/2030-01-02"]);
  w.state({ sessions: { s1: 1 } });
  assert.deepEqual([w.go().json.reason, w.go().json.waiting], ["no new session", ["dream/2030-01-02"]]);
});

test("a last line still being written is not read yet", () => {
  const w = world();
  writeFileSync(join(w.sessions, "s.jsonl"), user("done", day(1)) + "\n" + user("half", day(1)).slice(0, 20));
  const first = w.go().json;
  assert.deepEqual([first.sessions[0].lines, first.skipped], [1, 0]);
  w.state({ sessions: { s: 1 } });
  appendFileSync(join(w.sessions, "s.jsonl"), user("half", day(1)).slice(20) + "\n");
  assert.equal(readFileSync(w.go().json.sessions[0].file, "utf8"), "user: half");
});

test("zero notes: the run goes on and reads the sessions", () => {
  const w = world({ notes: false });
  w.put("s", user("t", day(1)));
  const r = w.go();
  assert.equal(r.code, 0);
  assert.deepEqual([r.json.sessions.map((s) => s.name), r.json.reason, r.json.notes], [["s"], undefined, 0]);
});

test("outside lists the default and the earlier folder with their notes, in extract.json too", () => {
  const w = world({ notes: false });
  w.put("s", user("t", day(1)));
  const home = tmp(), earlier = tmp();
  const def = join(home, ".claude", "projects", w.root.replace(/[^a-zA-Z0-9]/g, "-"), "memory");
  mkdirSync(def, { recursive: true });
  for (const f of ["b.md", "a.md", "MEMORY.md", "x.txt"]) writeFileSync(join(def, f), "n");
  writeFileSync(join(earlier, "e.md"), "n");
  writeFileSync(join(earlier, "MEMORY.md"), "i");
  mkdirSync(join(w.root, ".xworkflows"), { recursive: true });
  writeFileSync(join(w.root, ".xworkflows/local.json"), JSON.stringify({ memory: { earlierAutoDirectory: earlier } }));
  const j = parse(run(["--sessions", w.sessions, "--current", "none"], {}, w.root, home)).json;
  assert.deepEqual(j.outside, [{ kind: "default", folder: def, files: ["a.md", "b.md"] }, { kind: "earlier", folder: earlier, files: ["e.md"] }]);
  assert.deepEqual(JSON.parse(readFileSync(join(j.out, "extract.json"), "utf8")).outside, j.outside);
});

test("outside leaves out a missing folder and the repository memory folder itself", () => {
  const w = world();
  const home = tmp();
  mkdirSync(join(w.root, ".xworkflows"), { recursive: true });
  writeFileSync(join(w.root, ".xworkflows/local.json"), JSON.stringify({ memory: { earlierAutoDirectory: join(w.root, "docs/memory") } }));
  assert.deepEqual(parse(run(["--sessions", w.sessions, "--current", "none"], {}, w.root, home)).json.outside, []);
});

test("no new session: an empty list with its reason, exit 0", () => {
  const w = world();
  w.state({ sessions: { s1: 1 } });
  w.put("s1", user("t", day(1)));
  const r = w.go();
  assert.equal(r.code, 0);
  assert.deepEqual([r.json.sessions, r.json.reason, r.json.left, r.json.out], [[], "no new session", 0, null]);
});

test("a broken line is skipped and counted, never thrown", () => {
  const w = world();
  w.put("s", "{not json", user("kept", day(1)), "also not json");
  const { json } = w.go();
  assert.equal(json.skipped, 2);
  assert.equal(readFileSync(json.sessions[0].file, "utf8"), "user: kept");
});

test("without --sessions the folder is under home, named after the repository root", () => {
  const w = world(), home = tmp();
  const dir = join(home, ".claude", "projects", w.root.replace(/[^A-Za-z0-9]/g, "-"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "s.jsonl"), user("from home", day(1)) + "\n");
  const j = parse(run(["--current", "none"], {}, w.root, home)).json;
  assert.deepEqual(j.sessions.map((s) => s.name), ["s"]);
});

test("installed in a project and started through a linked path, the script finds the method's shared code and prints its JSON", () => {
  const pkg = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const proj = tmp(), sessions = tmp(), link = join(tmp(), "link");
  cpSync(join(pkg, "skills/dream"), join(proj, ".claude/skills/dream"), { recursive: true });
  for (const d of ["hooks", "checks"]) cpSync(join(pkg, d), join(proj, ".xworkflows", d), { recursive: true });
  mkdirSync(join(proj, "docs/memory"), { recursive: true });
  writeFileSync(join(proj, "docs/memory/a.md"), "note");
  repo(proj);
  writeFileSync(join(sessions, "s.jsonl"), user("hello", day(1)) + "\n");
  symlinkSync(proj, link);
  const r = parse(spawnSync("node", [join(link, ".claude/skills/dream/extract.mjs"), "--sessions", sessions, "--current", "none"], { cwd: link, encoding: "utf8" }));
  assert.equal(r.status, 0);
  assert.equal(r.json.sessions.length, 1);
  const refused = spawnSync("node", [join(link, ".claude/skills/dream/extract.mjs"), "--sessions", sessions], { cwd: link, encoding: "utf8", env: { ...process.env, CLAUDE_CODE_SESSION_ID: "" } });
  assert.deepEqual([refused.status, refused.stdout, refused.stderr.trim().split("\n").length], [2, "", 1]);
});

test("shared: in the package layout the module under the package root resolves", async () => {
  const m = await shared("hooks/core/config.mjs");
  assert.equal(typeof m.load, "function");
});

test("shared: when neither path exists it throws one line naming both", async () => {
  await assert.rejects(shared("hooks/core/none.mjs"), (e) => !e.message.includes("\n") && /hooks\/core\/none\.mjs/.test(e.message) && /\.xworkflows\/hooks\/core\/none\.mjs/.test(e.message));
});
