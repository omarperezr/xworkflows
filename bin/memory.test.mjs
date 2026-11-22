import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { isoEnv, repo, cli, readJson, writeJson, ALL_KEYS, tmp, tools, COVERS, EMPTY_HOME, doctor, withConfig, files, qmdLog, spy, inst, top, tree, lineOf } from "./shared.test.mjs";
const yml = (r, dir = "docs/memory") => `collections:\n  memory:\n    path: ${JSON.stringify(join(top(r), dir))}\n    pattern: "**/*.md"\n`;

const MARKER = "written by xworkflows install: uninstall removes index.yml and its database here only while this file exists\n";

const QMD_V = "qmd 2.8.3 (facd35e)";


test("install: a first install makes the memory folder, writes .qmd/index.yml and ignores .qmd/, with no qmd call", () => {
  const r = repo();
  const out = inst(r);
  assert.equal(out.status, 0, out.stderr);
  assert.ok(statSync(join(r, "docs/memory")).isDirectory());
  assert.equal(readFileSync(join(r, ".qmd/index.yml"), "utf8"), yml(r));
  assert.ok(readFileSync(join(r, ".gitignore"), "utf8").split("\n").includes(".qmd/"));
  assert.ok(!existsSync(out.log), "qmd was started");
  assert.ok(!existsSync(join(r, ".qmd/index.sqlite")));
});
test("install: a second install after the yml was edited by hand changes nothing", () => {
  const r = repo(); inst(r);
  writeFileSync(join(r, ".qmd/index.yml"), "mine: 1\n");
  const before = tree(r), rec = readFileSync(join(r, ".xworkflows/installed.json"), "utf8");
  const out = inst(r);
  assert.match(out.stdout, /^nothing to do$/m);
  assert.equal(readFileSync(join(r, ".qmd/index.yml"), "utf8"), "mine: 1\n");
  assert.equal(readFileSync(join(r, ".xworkflows/installed.json"), "utf8"), rec);
  assert.equal(tree(r), before);
  assert.ok(!existsSync(out.log));
});
test("install: a yml that existed before is left byte-identical and .qmd/ is not added to .gitignore", () => {
  const r = repo({ ".qmd/index.yml": "mine: 1\r\n" });
  assert.equal(inst(r).status, 0);
  assert.equal(readFileSync(join(r, ".qmd/index.yml"), "utf8"), "mine: 1\r\n");
  assert.ok(!readFileSync(join(r, ".gitignore"), "utf8").split("\n").includes(".qmd/"));
  assert.ok(statSync(join(r, "docs/memory")).isDirectory());
});
test("install: with memory.index set the folder is made and no .qmd", () => {
  const r = repo({ ".xworkflows/config.json": JSON.stringify({ memory: { index: "mine" } }) });
  assert.equal(inst(r).status, 0);
  assert.ok(statSync(join(r, "docs/memory")).isDirectory());
  assert.ok(!existsSync(join(r, ".qmd")));
  assert.ok(!readFileSync(join(r, ".gitignore"), "utf8").split("\n").includes(".qmd/"));
});
test("install --dry-run writes nothing and names the folder, the yml and the .gitignore", () => {
  const r = repo(), before = tree(r);
  const out = inst(r, ["--dry-run"]);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /^would create docs\/memory$/m);
  assert.match(out.stdout, /^would write \.qmd\/index\.yml$/m);
  assert.match(out.stdout, /^would merge \.gitignore$/m);
  assert.equal(tree(r), before);
});
// P-128: install reads the memory folder by the one rule the hooks read it by
test("install: a docs link that leaves the repo gets no folder, no yml and no autoMemoryDirectory, and the line says why; listed under memory.outside it gets them", () => {
  const o = tmp("xwf-out-"), r = repo();
  symlinkSync(o, join(r, "docs"));
  const out = inst(r);
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(readdirSync(o), []);
  assert.ok(!existsSync(join(r, ".qmd")));
  assert.ok(!existsSync(join(r, ".claude/settings.local.json")));
  assert.ok(out.stdout.split("\n").some((l) => l.startsWith(`not written: docs/memory/MEMORY.md is written outside the repository (${realpathSync(o)})`)), out.stdout);
  mkdirSync(join(o, "memory"));
  writeJson(r, ".xworkflows/config.json", { memory: { outside: [realpathSync(o)] } });
  assert.equal(inst(r).status, 0);
  assert.equal(readFileSync(join(r, ".qmd/index.yml"), "utf8"), yml(r));
  assert.equal(readJson(r, ".claude/settings.local.json").autoMemoryDirectory, join(top(r), "docs/memory"));
});
test("install: a .qmd link that leaves the repo gets no yml and no .gitignore line", () => {
  const o = tmp("xwf-out-"), r = repo();
  symlinkSync(o, join(r, ".qmd"));
  const out = inst(r);
  assert.deepEqual(readdirSync(o), []);
  assert.match(out.stdout, /^not written \(symlink\): \.qmd\/index\.yml$/m);
  assert.ok(!readFileSync(join(r, ".gitignore"), "utf8").split("\n").includes(".qmd/"));
});
for (const [what, dir] of [["absolute", (o) => join(o, "mem")], ["climbing out with ..", (o) => `../${basename(o)}/mem`]]) {
  test(`install: a memory.dir that is ${what} creates nothing and says why`, () => {
    const o = tmp("xwf-out-"), r = repo({ ".xworkflows/config.json": JSON.stringify({ memory: { dir: dir(o) } }) });
    const out = inst(r);
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual(readdirSync(o), []);
    assert.ok(!existsSync(join(r, ".qmd")));
    assert.ok(out.stdout.split("\n").includes(`not written: memory.dir ${JSON.stringify(dir(o))} must be a folder inside the repository`), out.stdout);
  });
}
// P-125: settings.local.json gets the folder the memory.dir rule names, and nothing for a value that names none
// P-128: a value that is not a text is the default folder, for install as for the hooks
test("install: a memory.dir that is not text is read as the default folder; a padded one is written and taken back as the folder it names", () => {
  const r = repo({ ".xworkflows/config.json": JSON.stringify({ memory: { dir: 5 } }) });
  const out = inst(r);
  assert.equal(out.status, 0, out.stderr);
  assert.ok(statSync(join(r, "docs/memory")).isDirectory());
  assert.equal(readJson(r, ".claude/settings.local.json").autoMemoryDirectory, join(top(r), "docs/memory"));
  assert.equal(cli(r, ["uninstall"]).status, 0);
  assert.ok(!existsSync(join(r, ".claude/settings.local.json")) && !existsSync(join(r, "docs")));
  const q = repo({ ".xworkflows/config.json": JSON.stringify({ memory: { dir: " docs/memory " } }) });
  assert.equal(inst(q).status, 0);
  assert.equal(readJson(q, ".claude/settings.local.json").autoMemoryDirectory, join(top(q), "docs/memory"));
  assert.equal(cli(q, ["uninstall"]).status, 0);
  assert.ok(!existsSync(join(q, ".claude/settings.local.json")));
});
test("install: a repository path with a space, # and : gives the JSON string of the folder", () => {
  const d = join(tmp("xwf-"), "a b#c:d");
  mkdirSync(d);
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: d, env: isoEnv() });
  assert.equal(inst(d).status, 0);
  const text = readFileSync(join(d, ".qmd/index.yml"), "utf8");
  assert.equal(text, yml(d));
  assert.match(text, /a b#c:d/);
});
test("doctor: the two qmd failures name the cause, a linked folder outside warns, an unresolvable path says nothing more", () => {
  const r = repo(); inst(r);
  const q = tools({ qmd: "exit 0" });
  rmSync(join(r, ".qmd"), { recursive: true });
  assert.match(doctor(r, { PATH: q }).stdout, /^fail no qmd collection covers docs\/memory: run xworkflows install$/m);
  mkdirSync(join(r, ".qmd")); writeFileSync(join(r, ".qmd/index.yml"), "collections: {}\n");
  const abs = join(top(r), "docs/memory");
  assert.ok(doctor(r, { PATH: q }).stdout.split("\n").includes(`fail no qmd collection covers docs/memory: .qmd/index.yml names no collection with the path ${abs}; add one, or delete .qmd and run install again`));
  assert.doesNotMatch(doctor(r, { PATH: q }).stdout, /outside the repository/);
  withConfig(r, { memory: { index: "mine" } });
  assert.match(doctor(r, { PATH: q }).stdout, /^fail no qmd collection covers docs\/memory: qmd --index mine collection add docs\/memory$/m);
  withConfig(r, {});
  const o = tmp("xwf-out-"); rmSync(join(r, "docs"), { recursive: true }); symlinkSync(o, join(r, "docs"));
  mkdirSync(join(o, "memory"));
  // a write there is refused unless memory.outside lists the real path: doctor fails with the line the hooks refuse with, and says nothing more of that folder
  const real = realpathSync(join(o, "memory"));
  const unlisted = doctor(r, { PATH: q });
  const refused = lineOf(unlisted, /^fail docs\/memory\/MEMORY\.md is written outside the repository/);
  assert.ok(refused?.includes(`(${real})`) && refused.includes("put the notes inside the project") && refused.includes(`list ${real} under memory.outside in .xworkflows/config.json`), unlisted.stdout);
  assert.match(refused, /: set memory\.dir in \.xworkflows\/config\.json to a folder inside the repository, then run xworkflows install$/);
  assert.doesNotMatch(unlisted.stdout, /qmd trust|qmd collection covers|autoMemoryDirectory/);
  withConfig(r, { memory: { outside: [real] } });
  assert.doesNotMatch(doctor(r, { PATH: q }).stdout, /is written outside the repository/);
  assert.match(doctor(r, { PATH: q }).stdout, /^warn the memory folder is outside the repository: qmd indexes it only after "qmd trust" is run here$/m);
  withConfig(r, {});
  rmSync(join(r, "docs")); writeFileSync(join(r, "docs"), "a file\n");
  const out = doctor(r, { PATH: q });
  assert.equal(out.stderr, "");
  assert.match(out.stdout, /^doctor: \d+ fail, \d+ warn$/m);
  assert.doesNotMatch(out.stdout, /outside the repository/);
});
test("uninstall: the yml, index.sqlite, .qmd and the .gitignore line go; a note stays; two installs change nothing", () => {
  const r = repo(); inst(r); inst(r);
  for (const f of ["", "-wal", "-shm"]) writeFileSync(join(r, `.qmd/index.sqlite${f}`), "x");
  writeFileSync(join(r, "docs/memory/note.md"), "# n\n");
  const out = cli(r, ["uninstall"], { env: { PATH: spy(qmdLog()), HOME: EMPTY_HOME } });
  assert.equal(out.status, 0, out.stderr);
  assert.ok(!existsSync(join(r, ".qmd")));
  assert.deepEqual(readdirSync(r).sort(), [".git", "docs"]);
  assert.match(out.stdout, /^left in place: docs\/memory$/m);
  assert.equal(readFileSync(join(r, "docs/memory/note.md"), "utf8"), "# n\n");
});
test("uninstall: a yml install did not create stays with its index.sqlite; the empty folder install made goes", () => {
  const r = repo({ ".qmd/index.yml": "mine: 1\n" }); inst(r);
  writeFileSync(join(r, ".qmd/index.sqlite"), "x");
  assert.equal(cli(r, ["uninstall"]).status, 0);
  assert.equal(readFileSync(join(r, ".qmd/index.yml"), "utf8"), "mine: 1\n");
  assert.ok(existsSync(join(r, ".qmd/index.sqlite")));
  assert.ok(!existsSync(join(r, "docs")));
});
test("uninstall: a memory folder install made and that holds a hidden file stays and is named; install, install, uninstall removes an empty one", () => {
  const r = repo(); inst(r); inst(r);
  writeFileSync(join(r, "docs/memory/.hidden"), "");
  assert.match(cli(r, ["uninstall"]).stdout, /^left in place: docs\/memory$/m);
  assert.ok(existsSync(join(r, "docs/memory/.hidden")));
  const q = repo(); inst(q); inst(q);
  cli(q, ["uninstall"]);
  assert.deepEqual(readdirSync(q), [".git"]);
});
test("uninstall: a memory folder that existed before the install is neither removed nor named", () => {
  const r = repo({ "docs/memory/.keep": "" }); mkdirSync(join(r, "empty"));
  inst(r);
  const out = cli(r, ["uninstall"]);
  assert.ok(existsSync(join(r, "docs/memory/.keep")));
  assert.doesNotMatch(out.stdout, /docs\/memory/);
  const q = repo(); mkdirSync(join(q, "docs/memory"), { recursive: true }); inst(q);
  assert.doesNotMatch(cli(q, ["uninstall"]).stdout, /docs\/memory/);
  assert.ok(statSync(join(q, "docs/memory")).isDirectory());
});
for (const dir of ["./docs/memory", "docs/memory/"]) {
  test(`install: memory.dir ${dir} is read as docs/memory, by install and by doctor`, () => {
    const r = repo({ ".xworkflows/config.json": JSON.stringify({ ...ALL_KEYS, memory: { dir } }) });
    assert.equal(inst(r).status, 0);
    assert.ok(statSync(join(r, "docs/memory")).isDirectory());
    assert.equal(readFileSync(join(r, ".qmd/index.yml"), "utf8"), yml(r));
    assert.match(doctor(r, { PATH: tools({ qmd: COVERS }) }).stdout, /^ok +qmd collection covers docs\/memory$/m);
  });
}

test("install: a user's own .qmd/index.yaml and index.sqlite are not shadowed by a new index.yml and survive uninstall", () => {
  const r = repo({ ".qmd/index.yaml": "mine: 1\n", ".qmd/index.sqlite": "SQLITE-user-data" });
  assert.equal(inst(r).status, 0);
  assert.ok(!existsSync(join(r, ".qmd/index.yml")), "install wrote .qmd/index.yml beside the user's index.yaml");
  assert.ok(!/^\.qmd\/$/m.test(readFileSync(join(r, ".gitignore"), "utf8")));
  assert.equal(cli(r, ["uninstall"]).status, 0);
  assert.equal(readFileSync(join(r, ".qmd/index.yaml"), "utf8"), "mine: 1\n");
  assert.equal(readFileSync(join(r, ".qmd/index.sqlite"), "utf8"), "SQLITE-user-data");
});

test("doctor: with a local .qmd/index.yaml that covers nothing, the text names that file", () => {
  const r = repo({ ".qmd/index.yaml": "mine: 1\n", "docs/memory/a.md": "x\n" });
  assert.equal(inst(r).status, 0);
  const out = doctor(r, { PATH: tools({ qmd: "exit 0" }) }).stdout;
  assert.match(out, /\.qmd\/index\.yaml names no collection/);
  assert.ok(!out.includes(".qmd/index.yml"));
});

test("install: a docs folder the user cannot write in does not leave a half install", { skip: process.getuid?.() === 0 }, () => {
  const r = repo({ "docs/readme.md": "x\n" });
  chmodSync(join(r, "docs"), 0o555);
  try {
    const out = inst(r);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /^not written: docs\/memory$/m);
    const rec = readJson(r, ".xworkflows/installed.json");
    assert.ok(!rec.created.includes("docs/memory"));
  } finally {
    chmodSync(join(r, "docs"), 0o755);
    rmSync(r, { recursive: true, force: true });
  }
});

test("install: a .qmd folder the user cannot write in leaves no yml, no record of it, and the install goes on", { skip: process.getuid?.() === 0 }, () => {
  const r = repo({ ".qmd/keep": "x\n" });
  chmodSync(join(r, ".qmd"), 0o555);
  try {
    const out = inst(r);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /^not written: \.qmd\/index\.yml$/m);
    assert.ok(!readJson(r, ".xworkflows/installed.json").created.includes(".qmd/index.yml"));
  } finally {
    chmodSync(join(r, ".qmd"), 0o755);
    rmSync(r, { recursive: true, force: true });
  }
});
test("install: a first install writes the marker beside the yml and records neither", () => {
  const r = repo();
  assert.equal(inst(r).status, 0);
  assert.equal(readFileSync(join(r, ".qmd/xworkflows"), "utf8"), MARKER);
  const rec = readJson(r, ".xworkflows/installed.json");
  assert.ok(!rec.created.some((p) => p.startsWith(".qmd/")));
});
test("uninstall: with the marker the yml, the three database files and the marker go, and .qmd with them", () => {
  const r = repo(); inst(r);
  for (const f of ["", "-wal", "-shm"]) writeFileSync(join(r, `.qmd/index.sqlite${f}`), "x");
  assert.equal(cli(r, ["uninstall"]).status, 0);
  assert.ok(!existsSync(join(r, ".qmd")));
});
test("uninstall: a checkout with its own yml and database keeps them even when the record names the yml", () => {
  const r = repo({ ".qmd/index.yml": "mine: 1\n", ".qmd/index.sqlite": "DB" }); inst(r);
  const rp = join(r, ".xworkflows/installed.json"), rec = readJson(r, ".xworkflows/installed.json");
  rec.created.push(".qmd/index.yml");
  writeFileSync(rp, JSON.stringify(rec));
  assert.equal(cli(r, ["uninstall"]).status, 0);
  assert.equal(readFileSync(join(r, ".qmd/index.yml"), "utf8"), "mine: 1\n");
  assert.equal(readFileSync(join(r, ".qmd/index.sqlite"), "utf8"), "DB");
});
test("install: a second install after the marker was written changes nothing", () => {
  const r = repo(); inst(r);
  const before = tree(r), rec = readFileSync(join(r, ".xworkflows/installed.json"), "utf8");
  assert.match(inst(r).stdout, /^nothing to do$/m);
  assert.equal(tree(r), before);
  assert.equal(readFileSync(join(r, ".xworkflows/installed.json"), "utf8"), rec);
});

test("install does not write the .qmd/xworkflows marker through a symlink", () => {
  const o = tmp("xwf-out-"); writeFileSync(join(o, "outside.txt"), "mine\n");
  const r = repo(); mkdirSync(join(r, ".qmd")); symlinkSync(join(o, "outside.txt"), join(r, ".qmd/xworkflows"));
  const out = cli(r, ["install", "--yes"]);
  assert.equal(readFileSync(join(o, "outside.txt"), "utf8"), "mine\n");
  assert.match(out.stdout, /^not written \(symlink\): \.qmd\/xworkflows$/m);
});
test("install: a plain .qmd/xworkflows the user already has is left byte for byte", () => {
  const r = repo({ ".qmd/xworkflows": "mine\r\n" });
  assert.equal(inst(r).status, 0);
  assert.equal(readFileSync(join(r, ".qmd/xworkflows"), "utf8"), "mine\r\n");
  assert.equal(cli(r, ["uninstall"]).status, 0);
  assert.equal(readFileSync(join(r, ".qmd/xworkflows"), "utf8"), "mine\r\n");
});
test("uninstall: a project's own .qmd/xworkflows, yml and database stay byte for byte", () => {
  const files = { ".qmd/xworkflows": "mine\n", ".qmd/index.yml": "mine: 1\n", ".qmd/index.sqlite": "DB" };
  const r = repo(files); inst(r);
  assert.equal(cli(r, ["uninstall"]).status, 0);
  for (const [f, t] of Object.entries(files)) assert.equal(readFileSync(join(r, f), "utf8"), t, f);
});
test("uninstall: a record naming the yml with the real marker removes it without a kept line", () => {
  const r = repo(); inst(r);
  const rp = join(r, ".xworkflows/installed.json"), rec = readJson(r, ".xworkflows/installed.json");
  rec.created.push(".qmd/index.yml");
  writeFileSync(rp, JSON.stringify(rec));
  const out = cli(r, ["uninstall"]);
  assert.equal(out.status, 0);
  assert.ok(!existsSync(join(r, ".qmd/index.yml")));
  assert.ok(!out.stdout.includes("kept (not ours): .qmd/index.yml"), out.stdout);
});
test("uninstall: a .qmd linked out of the repository keeps its marker, yml and database", () => {
  const o = tmp("xwf-out-");
  for (const f of ["xworkflows", "index.yml", "index.sqlite"]) writeFileSync(join(o, f), "x");
  const r = repo(); inst(r); rmSync(join(r, ".qmd"), { recursive: true }); symlinkSync(o, join(r, ".qmd"));
  assert.equal(cli(r, ["uninstall"]).status, 0);
  for (const f of ["xworkflows", "index.yml", "index.sqlite"]) assert.ok(existsSync(join(o, f)), f);
});
test("uninstall: with no marker an empty yml named by the record stays and is reported", () => {
  const r = repo(); inst(r);
  rmSync(join(r, ".qmd/xworkflows")); writeFileSync(join(r, ".qmd/index.yml"), "{}\n");
  const f = join(r, ".xworkflows/installed.json"), rec = JSON.parse(readFileSync(f, "utf8"));
  rec.created.push(".qmd/index.yml"); writeFileSync(f, JSON.stringify(rec));
  const out = cli(r, ["uninstall"]);
  assert.match(out.stdout, /^kept \(not ours\): \.qmd\/index\.yml$/m);
  assert.ok(existsSync(join(r, ".qmd/index.yml")));
});
test("uninstall: a plain file .qmd stops nothing and stays", () => {
  const r = repo({ ".xworkflows/config.json": JSON.stringify({ memory: { index: "mine" } }), ".qmd": "mine\n" });
  assert.equal(inst(r).status, 0);
  const out = cli(r, ["uninstall"]);
  assert.equal(out.status, 0, out.stderr);
  assert.ok(!existsSync(join(r, ".xworkflows/installed.json")));
  assert.equal(readFileSync(join(r, ".qmd"), "utf8"), "mine\n");
});
test("doctor prints the version qmd answers; a qmd that does not answer it warns", () => {
  const r = repo(); cli(r, ["install"]);
  const ok = doctor(r, { PATH: tools({ qmd: `case "$*" in *--version*) echo '${QMD_V}';; *) ${COVERS};; esac` }) });
  assert.match(ok.stdout, /^ok +qmd 2\.8\.3 \(facd35e\)$/m);
  assert.equal(ok.status, 0, ok.stdout);
  for (const body of ["exit 1", "exit 0", "exec sleep 30"]) {
    const out = doctor(r, { PATH: tools({ qmd: `case "$*" in *--version*) ${body};; *) ${COVERS};; esac` }), XWORKFLOWS_PROBE_TIMEOUT_MS: "400" });
    assert.ok(out.stdout.split("\n").includes("warn qmd does not answer --version: run qmd --version to see why"), body);
    assert.equal(out.stderr, "");
    assert.equal(out.status, 0, out.stdout);
  }
});
test("doctor: a yml that names the memory folder while no collection covers it says this qmd does not read it", () => {
  const r = repo(); cli(r, ["install"]);
  const abs = join(top(r), "docs/memory");
  writeFileSync(join(r, ".qmd/index.yml"), `collections:\n  memory:\n    path: ${abs}\n`);
  const out = doctor(r, { PATH: tools({ qmd: `case "$*" in *--version*) echo '${QMD_V}';; esac` }) });
  assert.ok(out.stdout.split("\n").includes("fail no qmd collection covers docs/memory: this qmd does not read .qmd/index.yml, which names it: npm install -g @tobilu/qmd@latest"), out.stdout);
  assert.doesNotMatch(out.stdout, /names no collection/);
  writeFileSync(join(r, ".qmd/index.yml"), "collections: {}\n");
  assert.match(doctor(r, { PATH: tools({ qmd: "exit 0" }) }).stdout, /^fail no qmd collection covers docs\/memory: \.qmd\/index\.yml names no collection with the path /m);
});
test("doctor: with memory.index set, every qmd line names that index", () => {
  const r = repo(); cli(r, ["install"]);
  withConfig(r, { memory: { index: "mine" } });
  const none = doctor(r, { PATH: tools({ qmd: "exit 0" }) }).stdout.split("\n");
  assert.ok(none.includes("fail no qmd collection covers docs/memory: qmd --index mine collection add docs/memory"), none.join("\n"));
  const dead = doctor(r, { PATH: tools({ qmd: `case "$*" in *--version*) echo '${QMD_V}';; *) exec sleep 30;; esac` }), XWORKFLOWS_PROBE_TIMEOUT_MS: "400" }).stdout.split("\n");
  assert.ok(dead.includes("warn qmd did not answer: collections of docs/memory not checked: run qmd --index mine collection list to see why"), dead.join("\n"));
});
test("install: with memory.autoDirectory false, autoMemoryDirectory is neither written nor recorded, and a value set by hand stays", () => {
  const r = repo({ ".xworkflows/config.json": JSON.stringify({ memory: { autoDirectory: false } }) });
  assert.equal(inst(r).status, 0);
  assert.ok(statSync(join(r, "docs/memory")).isDirectory());
  assert.ok(!existsSync(join(r, ".claude/settings.local.json")));
  assert.deepEqual(readJson(r, ".xworkflows/installed.json").scalars.filter((x) => x.key.includes("autoMemoryDirectory")), []);
  const q = repo({ ".xworkflows/config.json": JSON.stringify({ memory: { autoDirectory: false } }), ".claude/settings.local.json": JSON.stringify({ autoMemoryDirectory: "/mine" }) });
  assert.equal(inst(q).status, 0);
  assert.deepEqual(readJson(q, ".claude/settings.local.json"), { autoMemoryDirectory: "/mine" });
  const u = cli(q, ["uninstall"]);
  assert.equal(u.status, 0, u.stderr);
  assert.deepEqual(readJson(q, ".claude/settings.local.json"), { autoMemoryDirectory: "/mine" });
});
test("install: with memory.autoDirectory true, autoMemoryDirectory is written as with the key absent", () => {
  const r = repo({ ".xworkflows/config.json": JSON.stringify({ memory: { autoDirectory: true } }) });
  assert.equal(inst(r).status, 0);
  assert.equal(readJson(r, ".claude/settings.local.json").autoMemoryDirectory, join(top(r), "docs/memory"));
});
