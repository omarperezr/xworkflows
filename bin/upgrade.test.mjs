import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repo, git, cli, readJson, writeJson, PKG_ROOT, cliAt, packedCopy, tmp, GOOD, EMPTY_HOME, sha, withRecord, files, qmdLog, spy, inst, tree, lines } from "./shared.test.mjs";

// install keeps the method's own files out of the code graph: a .graphifyignore with the folders it writes
const SKILLS = [...new Set(JSON.parse(readFileSync(join(PKG_ROOT, "manifest.json"), "utf8")).pieces.flatMap((p) => Object.keys(p.files)).map((f) => f.match(/^skills\/([^/]+)\//)?.[1]).filter(Boolean))];
const AGENTS = [...new Set(JSON.parse(readFileSync(join(PKG_ROOT, "manifest.json"), "utf8")).pieces.flatMap((p) => Object.keys(p.files)).map((f) => f.match(/^agents\/([^/]+)\.md$/)?.[1]).filter(Boolean))];
const GI = [".xworkflows/", ...SKILLS.map((n) => `.claude/skills/${n}/`), ...AGENTS.map((n) => `.claude/agents/${n}.md`)];
const sameLines = (a, b) => assert.deepEqual([...a].sort(), [...b].sort());

// P-26: a file of the package's that a newer version no longer ships
// the package's copy, its manifest listing retired files: { "skills/x/f.md": [hashes earlier versions wrote] }
function retiringCopy(retired) {
  const copy = packedCopy();
  const m = JSON.parse(readFileSync(join(copy, "manifest.json"), "utf8"));
  m.pieces.find((p) => p.id === "adapt").retired = retired;
  writeFileSync(join(copy, "manifest.json"), JSON.stringify(m, null, 2) + "\n");
  return copy;
}

// a retired agent is a unit of one file; a retired file outside a unit is judged the same way
const AGENT = ".claude/agents/gone.md", LOOSE = ".xworkflows/hooks/core/old.mjs";
const retiringBoth = () => retiringCopy({ "agents/gone.md": [sha("a\n")], "hooks/core/old.mjs": [sha("a\n")] });
// an earlier install wrote the retired agent: its file, its record entry and its line of .graphifyignore
function upgradeWithAgent(text) {
  const copy = retiringBoth();
  const r = repo(); assert.equal(cliAt(copy, r, ["install", "--yes"]).status, 0);
  writeFileSync(join(r, AGENT), text);
  appendFileSync(join(r, ".graphifyignore"), `${AGENT}\n`);
  withRecord(r, (rec) => { rec.files[AGENT] = { piece: "agents", sha256: sha("a\n") }; rec.imports.push({ file: ".graphifyignore", line: AGENT }); });
  return { copy, r };
}

// P-123: the manifest holds the hash of the text the package published; install changed some on the way to the disk
// the package's copy, the given files of its own retired with the hash of the text it ships
function retireReal(files) {
  const copy = packedCopy();
  const m = JSON.parse(readFileSync(join(copy, "manifest.json"), "utf8"));
  for (const f of files) {
    const p = m.pieces.find((q) => f in q.files);
    p.retired = { ...p.retired, [f]: [p.files[f]] };
    delete p.files[f];
  }
  writeFileSync(join(copy, "manifest.json"), JSON.stringify(m, null, 2) + "\n");
  return copy;
}
const committed = (setup) => { const r = repo(setup); git(r, "add -A"); git(r, "commit -q --allow-empty -m base"); return r; };

test(".graphifyignore: install names .xworkflows/, each skill folder and each agent file it writes, never .claude/ whole nor the project's own", () => {
  const r = repo({ ".claude/skills/mine/SKILL.md": "---\nname: mine\n---\n", ".claude/agents/mine.md": "---\nname: mine\n---\n" });
  assert.equal(inst(r).status, 0);
  sameLines(lines(r), GI);
  assert.ok(!lines(r).includes(".claude/") && !lines(r).includes(".claude/skills/mine/") && !lines(r).includes(".claude/agents/mine.md"));
  assert.ok(readJson(r, ".xworkflows/installed.json").imports.some((i) => i.file === ".graphifyignore" && i.line === ".xworkflows/"));
});
test(".graphifyignore: a skill kept as the project's is not named, one installed as xwf- is named by that folder", () => {
  const r = repo({ ".claude/skills/tdd/SKILL.md": "mine\n", ".claude/skills/grill/SKILL.md": "mine too\n" });
  const out = cli(r, ["install"], { env: { HOME: EMPTY_HOME } });
  assert.equal(out.status, 0, out.stderr);
  assert.ok(!lines(r).includes(".claude/skills/tdd/") && !lines(r).includes(".claude/skills/grill/"));
  const y = repo({ ".claude/skills/tdd/SKILL.md": "mine\n" });
  assert.equal(cli(y, ["install", "--yes"], { env: { HOME: EMPTY_HOME } }).status, 0);
  assert.ok(lines(y).includes(".claude/skills/xwf-tdd/") && !lines(y).includes(".claude/skills/tdd/"));
  cli(y, ["uninstall"]);
  assert.ok(!existsSync(join(y, ".graphifyignore")));
});
test(".graphifyignore: an agent kept as the project's is not named, one installed as xwf- is named by that file", () => {
  const r = repo({ ".claude/agents/explore.md": "mine\n" });
  const out = cli(r, ["install"], { env: { HOME: EMPTY_HOME } });
  assert.equal(out.status, 0, out.stderr);
  assert.ok(!lines(r).includes(".claude/agents/explore.md") && !lines(r).includes(".claude/agents/xwf-explore.md"));
  assert.ok(lines(r).includes(".claude/agents/review.md"));
  const y = repo({ ".claude/agents/explore.md": "mine\n" });
  assert.equal(cli(y, ["install", "--yes"], { env: { HOME: EMPTY_HOME } }).status, 0);
  assert.ok(lines(y).includes(".claude/agents/xwf-explore.md") && !lines(y).includes(".claude/agents/explore.md"));
  cli(y, ["uninstall"]);
  assert.ok(!existsSync(join(y, ".graphifyignore")));
});
test(".graphifyignore: uninstall takes back exactly the recorded lines, the project's lines and its missing newline stay", () => {
  const r = repo({ ".graphifyignore": "vendor/\n.xworkflows/\nbuild" });
  inst(r);
  assert.deepEqual(lines(r).slice(0, 3), ["vendor/", ".xworkflows/", "build"]);
  sameLines(lines(r).slice(3), GI.slice(1));
  cli(r, ["uninstall"]);
  assert.equal(readFileSync(join(r, ".graphifyignore"), "utf8"), "vendor/\n.xworkflows/\nbuild");
});
test(".graphifyignore: a file install created that ends empty is removed, a second install changes nothing", () => {
  const r = repo(), before = tree(r);
  inst(r);
  const gi = readFileSync(join(r, ".graphifyignore"), "utf8"), rec = readFileSync(join(r, ".xworkflows/installed.json"), "utf8");
  assert.match(inst(r).stdout, /^nothing to do$/m);
  assert.equal(readFileSync(join(r, ".graphifyignore"), "utf8"), gi);
  assert.equal(readFileSync(join(r, ".xworkflows/installed.json"), "utf8"), rec);
  cli(r, ["uninstall"]);
  assert.ok(!existsSync(join(r, ".graphifyignore")));
  assert.equal(tree(r), before);
});
test(".graphifyignore: --dry-run writes nothing and names the file", () => {
  const r = repo(), before = tree(r);
  const out = inst(r, ["--dry-run"]);
  assert.match(out.stdout, /^would merge \.graphifyignore$/m);
  assert.equal(tree(r), before);
});
test(".graphifyignore: a link that leaves the repository is not written through", () => {
  const o = tmp("xwf-out-"), r = repo();
  writeFileSync(join(o, "target"), "outside\n");
  symlinkSync(join(o, "target"), join(r, ".graphifyignore"));
  const out = inst(r);
  assert.equal(readFileSync(join(o, "target"), "utf8"), "outside\n");
  assert.match(out.stdout, /^not written \(symlink\): \.graphifyignore$/m);
  cli(r, ["uninstall"]);
  assert.equal(readFileSync(join(o, "target"), "utf8"), "outside\n");
});

test("uninstall leaves nothing when the record has no dirs, and an empty folder is no skill", () => {
  const r = repo({ "a.txt": "x\n" });
  const before = tree(r);
  const env = { PATH: spy(qmdLog()), HOME: EMPTY_HOME };
  assert.equal(cli(r, ["install"], { env }).status, 0);
  withRecord(r, (rec) => { delete rec.dirs; });
  assert.equal(cli(r, ["uninstall"], { env }).status, 0);
  assert.equal(tree(r), before);
  const again = cli(r, ["install"], { env });
  assert.doesNotMatch(again.stdout, /A skill grill exists/);
});
test("install removes only a file the record holds that the manifest lists as retired with a listed hash; the record's hash never decides", () => {
  const copy = retiringCopy({ "skills/adapt/old.md": [sha("v1\n"), sha("v2\n")], "skills/adapt/edited.md": [sha("v1\n")], "skills/adapt/stray.md": [sha("v1\n")] });
  const r = repo(); assert.equal(cliAt(copy, r, ["install", "--yes"]).status, 0);
  const mine = ".claude/skills/mine/SKILL.md", conf = ".xworkflows/config.json", gone = ".claude/skills/adapt/old.md", edited = ".claude/skills/adapt/edited.md", stray = ".claude/skills/adapt/stray.md";
  mkdirSync(join(r, ".claude/skills/mine"), { recursive: true });
  writeFileSync(join(r, mine), "mine\n"); writeFileSync(join(r, conf), "{}\n");
  writeFileSync(join(r, gone), "v2\n"); writeFileSync(join(r, edited), "v1\nmine\n"); writeFileSync(join(r, stray), "v1\n");
  // the record holds the retired file install wrote; a hand edit names the user's files with their own hashes; the stray file is not in it at all
  withRecord(r, (rec) => {
    rec.files[gone] = { piece: "adapt", sha256: sha("v2\n") };
    for (const [p, t] of [[mine, "mine\n"], [conf, "{}\n"], [edited, "v1\nmine\n"]]) rec.files[p] = { piece: "adapt", sha256: sha(t) };
  });
  const dry = cliAt(copy, r, ["install", "--yes", "--dry-run"]);
  assert.match(dry.stdout, new RegExp(`^would remove ${gone.replaceAll(".", "\\.")}$`, "m"));
  assert.ok(existsSync(join(r, gone)), "dry-run removes nothing");
  const out = cliAt(copy, r, ["install", "--yes"]);
  assert.equal(out.status, 0, out.stderr);
  assert.ok(!existsSync(join(r, gone)));
  assert.equal(readFileSync(join(r, mine), "utf8"), "mine\n");
  assert.equal(readFileSync(join(r, conf), "utf8"), "{}\n");
  assert.equal(readFileSync(join(r, edited), "utf8"), "v1\nmine\n");
  assert.equal(readFileSync(join(r, stray), "utf8"), "v1\n");
  assert.ok(!dry.stdout.includes(stray) && !out.stdout.includes(stray), out.stdout);
  assert.equal(out.stdout.split("\n").filter((l) => l === `kept (no longer shipped, changed locally): ${edited}`).length, 1, out.stdout);
  const files = readJson(r, ".xworkflows/installed.json").files;
  assert.ok(!(gone in files) && !(mine in files) && !(conf in files) && !(stray in files));
  assert.ok(!(edited in files), "the kept file is named once and leaves the record");
  assert.match(cliAt(copy, r, ["install", "--yes"]).stdout, /nothing to do/);
});
test("install does not throw on a null entry of the record's files: it counts as not recorded", () => {
  const r = repo(); cli(r, ["install", "--yes"]);
  const p = ".xworkflows/hooks/core/stray.mjs";
  writeFileSync(join(r, p), "mine\n");
  withRecord(r, (rec) => { rec.files[p] = null; });
  const out = cli(r, ["install", "--yes"]);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(readFileSync(join(r, p), "utf8"), "mine\n");
});
test("install: the real manifest lists skills/adapt/topics.md as retired with the hash of each text earlier versions shipped", () => {
  const list = readJson(PKG_ROOT, "manifest.json").pieces.find((p) => p.id === "adapt").retired?.["skills/adapt/topics.md"];
  assert.equal(list?.length, 6);
  assert.ok(list.every((h) => /^[0-9a-f]{64}$/.test(h)));
});

// a retired file alone in its folder takes the folder, and a retired unit takes its line of .graphifyignore and its entry of the record
test("install: a retired file alone in a folder of the package takes the folder; a whole retired skill takes its .graphifyignore line and record entry", () => {
  const copy = retiringCopy({ "skills/gone/SKILL.md": [sha("g\n")], "hooks/core/oldsub/x.mjs": [sha("x\n")] });
  const r = repo(); assert.equal(cliAt(copy, r, ["install", "--yes"]).status, 0);
  const unit = ".claude/skills/gone", sub = ".xworkflows/hooks/core/oldsub";
  mkdirSync(join(r, unit), { recursive: true }); writeFileSync(join(r, unit, "SKILL.md"), "g\n");
  mkdirSync(join(r, sub), { recursive: true }); writeFileSync(join(r, sub, "x.mjs"), "x\n");
  appendFileSync(join(r, ".graphifyignore"), `${unit}/\n`);
  withRecord(r, (rec) => { rec.imports.push({ file: ".graphifyignore", line: `${unit}/` }); rec.files[`${unit}/SKILL.md`] = { piece: "adapt", sha256: sha("g\n") }; rec.files[`${sub}/x.mjs`] = { piece: "hooks", sha256: sha("x\n") }; });
  const out = cliAt(copy, r, ["install", "--yes"]);
  assert.equal(out.status, 0, out.stderr);
  assert.ok(!existsSync(join(r, unit)) && !existsSync(join(r, sub)), "both folders are gone");
  assert.ok(existsSync(join(r, ".xworkflows/hooks/core")), "the shared parent stays");
  assert.ok(!lines(r).includes(`${unit}/`) && lines(r).includes(".xworkflows/"));
  assert.ok(!readJson(r, ".xworkflows/installed.json").imports.some((i) => i.line === `${unit}/`));
  const un = cliAt(copy, r, ["uninstall"]);
  assert.doesNotMatch(un.stdout, /kept \(not ours\)/);
});

// a unit that ships no file any more is judged only where the record knows it
for (const [what, content] of [["other content", "mine\n"], ["the published text", "g\n"]]) {
  test(`install: a first install leaves the user's own skill whose retired file holds ${what}, and names nothing`, () => {
    const copy = retiringCopy({ "skills/gone/SKILL.md": [sha("g\n")] });
    const f = ".claude/skills/gone/SKILL.md";
    const r = repo({ [f]: content });
    const out = cliAt(copy, r, ["install", "--yes"]);
    assert.equal(out.status, 0, out.stderr);
    assert.equal(readFileSync(join(r, f), "utf8"), content);
    assert.doesNotMatch(out.stdout, /skills\/gone/);
  });
}
test("install: an upgrade whose record holds the file of a retired unit still removes the unchanged one", () => {
  const copy = retiringCopy({ "skills/gone/SKILL.md": [sha("g\n")] });
  const r = repo(); assert.equal(cliAt(copy, r, ["install", "--yes"]).status, 0);
  const f = ".claude/skills/gone/SKILL.md";
  mkdirSync(join(r, ".claude/skills/gone"), { recursive: true }); writeFileSync(join(r, f), "g\n");
  withRecord(r, (rec) => { rec.files[f] = { piece: "adapt", sha256: sha("g\n") }; });
  assert.equal(cliAt(copy, r, ["install", "--yes"]).status, 0);
  assert.ok(!existsSync(join(r, f)));
});
test("install: a retired agent the record holds, unchanged, is removed on an upgrade, and uninstall then leaves nothing of it", () => {
  const { copy, r } = upgradeWithAgent("a\n");
  const out = cliAt(copy, r, ["install", "--yes"]);
  assert.equal(out.status, 0, out.stderr);
  assert.ok(!existsSync(join(r, AGENT)));
  assert.match(out.stdout, /^removed \.claude\/agents\/gone\.md$/m);
  const rec = readJson(r, ".xworkflows/installed.json");
  assert.ok(!(AGENT in rec.files) && !rec.imports.some((i) => i.line === AGENT));
  assert.ok(!lines(r).includes(AGENT));
  const un = cliAt(copy, r, ["uninstall"]);
  assert.equal(un.status, 0, un.stderr);
  assert.doesNotMatch(un.stdout, /gone\.md|kept \(not ours\)/);
  assert.ok(!existsSync(join(r, AGENT)) && !(existsSync(join(r, ".graphifyignore")) && lines(r).includes(AGENT)));
});
test("install: a retired agent the record holds, changed locally, is kept, named once and leaves the record", () => {
  const { copy, r } = upgradeWithAgent("a\nmine\n");
  const out = cliAt(copy, r, ["install", "--yes"]);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(readFileSync(join(r, AGENT), "utf8"), "a\nmine\n");
  assert.equal(out.stdout.split("\n").filter((l) => l === `kept (no longer shipped, changed locally): ${AGENT}`).length, 1, out.stdout);
  assert.ok(!(AGENT in readJson(r, ".xworkflows/installed.json").files));
});
test("install: a first install into a project with its own files at retired paths, with the published text, leaves them and names nothing", () => {
  const r = repo({ [AGENT]: "a\n", [LOOSE]: "a\n" });
  const out = cliAt(retiringBoth(), r, ["install", "--yes"]);
  assert.equal(out.status, 0, out.stderr);
  for (const f of [AGENT, LOOSE]) assert.equal(readFileSync(join(r, f), "utf8"), "a\n", f);
  assert.doesNotMatch(out.stdout, /gone\.md|old\.mjs/);
});
test("install: a record edited by hand to name the user's files at retired paths with other content removes nothing", () => {
  const copy = retiringBoth();
  const r = repo(); assert.equal(cliAt(copy, r, ["install", "--yes"]).status, 0);
  for (const f of [AGENT, LOOSE]) writeFileSync(join(r, f), "mine\n");
  withRecord(r, (rec) => { for (const f of [AGENT, LOOSE]) rec.files[f] = { piece: "adapt", sha256: sha("mine\n") }; });
  const out = cliAt(copy, r, ["install", "--yes"]);
  assert.equal(out.status, 0, out.stderr);
  const files = readJson(r, ".xworkflows/installed.json").files;
  for (const f of [AGENT, LOOSE]) {
    assert.equal(readFileSync(join(r, f), "utf8"), "mine\n", f);
    assert.match(out.stdout, new RegExp(`^kept \\(no longer shipped, changed locally\\): ${f.replaceAll(".", "\\.")}$`, "m"));
    assert.ok(!(f in files), f);
  }
});
test("install: a retired agent whose tier line install wrote as a model line is removed on the upgrade, and uninstall leaves git status empty", () => {
  const r = committed(), a = ".claude/agents/explore.md";
  assert.equal(cli(r, ["install", "--yes"]).status, 0);
  assert.match(readFileSync(join(PKG_ROOT, "agents/explore.md"), "utf8"), /^tier: /m);
  assert.match(readFileSync(join(r, a), "utf8"), /^model: /m);
  const copy = retireReal(["agents/explore.md"]);
  const up = cliAt(copy, r, ["install", "--yes"]);
  assert.equal(up.status, 0, up.stderr);
  assert.ok(!existsSync(join(r, a)), up.stdout);
  assert.match(up.stdout, /^removed \.claude\/agents\/explore\.md$/m);
  assert.equal(cliAt(copy, r, ["uninstall"]).status, 0);
  assert.equal(git(r, "status --porcelain"), "");
});
// P-130: the file on disk was written with the map of the version that installed it, which may not be today's
test("install: a retired agent written with an older map of tiers is removed on the upgrade, and uninstall leaves git status empty", () => {
  const r = committed(), a = ".claude/agents/explore.md";
  assert.equal(cli(r, ["install", "--yes"]).status, 0);
  const tier = readFileSync(join(PKG_ROOT, "agents/explore.md"), "utf8").match(/^tier: (\w+)$/m)[1];
  const was = readJson(PKG_ROOT, "tiers.json").claude[tier], now = was === "opus" ? "sonnet" : "opus";
  assert.match(readFileSync(join(r, a), "utf8"), new RegExp(`^model: ${was}$`, "m"));
  const copy = retireReal(["agents/explore.md"]);
  const tiers = readJson(copy, "tiers.json");
  tiers.claude[tier] = now;
  writeJson(copy, "tiers.json", tiers);
  const up = cliAt(copy, r, ["install", "--yes"]);
  assert.equal(up.status, 0, up.stderr);
  assert.match(up.stdout, /^removed \.claude\/agents\/explore\.md$/m);
  assert.ok(!existsSync(join(r, a)), up.stdout);
  assert.equal(cliAt(copy, r, ["uninstall"]).status, 0);
  assert.equal(git(r, "status --porcelain"), "");
});
test("install: the SKILL.md of a renamed unit and a renamed agent, retired, are removed on the upgrade; the user's own stay and uninstall leaves git status empty", () => {
  const own = { ".claude/skills/next-step/SKILL.md": "mine\n", ".claude/agents/explore.md": "mine\n" };
  const r = committed(own), skill = ".claude/skills/xwf-next-step/SKILL.md", agent = ".claude/agents/xwf-explore.md";
  assert.equal(cli(r, ["install", "--yes"]).status, 0);
  assert.match(readFileSync(join(r, skill), "utf8"), /^name: xwf-next-step$/m);
  assert.match(readFileSync(join(r, agent), "utf8"), /^name: xwf-explore$/m);
  const copy = retireReal(["skills/next-step/SKILL.md", "agents/explore.md"]);
  const up = cliAt(copy, r, ["install", "--yes"]);
  assert.equal(up.status, 0, up.stderr);
  assert.ok(!existsSync(join(r, ".claude/skills/xwf-next-step")) && !existsSync(join(r, agent)), up.stdout);
  assert.doesNotMatch(up.stdout, /kept/);
  for (const [p, t] of Object.entries(own)) assert.equal(readFileSync(join(r, p), "utf8"), t, p);
  assert.equal(cliAt(copy, r, ["uninstall"]).status, 0);
  assert.equal(git(r, "status --porcelain"), "");
});
// P-130: a retired unit's line of .graphifyignore is install's line, also when the unit's folder stays for a changed file
for (const [what, own] of [["install made", null], ["the project had", "mine/\n"]]) {
  test(`uninstall: after an upgrade that retires changed units, a .graphifyignore ${what} holds no line of install's`, () => {
    const r = repo(own === null ? {} : { ".graphifyignore": own }), skill = ".claude/skills/next-step/SKILL.md", agent = ".claude/agents/explore.md";
    assert.equal(cli(r, ["install", "--yes"]).status, 0);
    assert.ok(lines(r).includes(".claude/skills/next-step/") && lines(r).includes(agent));
    appendFileSync(join(r, skill), "mine\n"); appendFileSync(join(r, agent), "mine\n");
    const copy = retireReal(["skills/next-step/SKILL.md", "agents/explore.md"]);
    const up = cliAt(copy, r, ["install", "--yes"]);
    assert.equal(up.status, 0, up.stderr);
    assert.ok(existsSync(join(r, skill)) && existsSync(join(r, agent)), up.stdout);
    const un = cliAt(copy, r, ["uninstall"]);
    assert.equal(un.status, 0, un.stderr);
    assert.doesNotMatch(un.stdout, /kept \(not ours\): \.graphifyignore/);
    if (own === null) assert.ok(!existsSync(join(r, ".graphifyignore")), "the .graphifyignore install made is left");
    else assert.equal(readFileSync(join(r, ".graphifyignore"), "utf8"), own);
  });
}
test("install: a skill the user put under kept is not judged: an upgrade that retires its file removes nothing in that folder", () => {
  const r = repo(), f = ".claude/skills/next-step/SKILL.md";
  assert.equal(cli(r, ["install", "--yes"]).status, 0);
  const text = readFileSync(join(r, f), "utf8");
  withRecord(r, (rec) => { rec.kept.push(".claude/skills/next-step"); });
  const out = cliAt(retireReal(["skills/next-step/SKILL.md"]), r, ["install", "--yes"]);
  assert.equal(out.status, 0, out.stderr);
  assert.ok(existsSync(join(r, f)), out.stdout);
  assert.equal(readFileSync(join(r, f), "utf8"), text);
  assert.doesNotMatch(out.stdout, /next-step/);
});
test("install: a changed retired file is named once, at the upgrade, and leaves the record: doctor and a second install say nothing of it", () => {
  const r = repo(), f = ".claude/skills/next-step/SKILL.md";
  assert.equal(cli(r, ["install", "--yes"]).status, 0);
  appendFileSync(join(r, f), "mine\n");
  const text = readFileSync(join(r, f), "utf8"), copy = retireReal(["skills/next-step/SKILL.md"]);
  const up = cliAt(copy, r, ["install", "--yes"]);
  assert.equal(up.status, 0, up.stderr);
  assert.equal(up.stdout.split("\n").filter((l) => l === `kept (no longer shipped, changed locally): ${f}`).length, 1, up.stdout);
  assert.ok(!(f in readJson(r, ".xworkflows/installed.json").files));
  const again = cliAt(copy, r, ["install", "--yes"]);
  assert.equal(again.status, 0, again.stderr);
  assert.doesNotMatch(again.stdout, /next-step/);
  assert.match(again.stdout, /nothing to do/);
  const doc = cliAt(copy, r, ["doctor"], { PATH: GOOD, HOME: EMPTY_HOME });
  assert.doesNotMatch(doc.stdout, /next-step/);
  assert.equal(readFileSync(join(r, f), "utf8"), text);
});

test("install --yes: a retired file is removed under the xwf- name the record holds, and with no record nothing is removed", () => {
  const published = spawnSync("git", ["show", "f467f65~1:skills/adapt/topics.md"], { cwd: PKG_ROOT, encoding: "utf8" }).stdout;
  const mine = ".claude/skills/adapt/topics.md", ours = ".claude/skills/xwf-adapt/topics.md";
  const r = repo({ ".claude/skills/adapt/SKILL.md": "mine\n", [mine]: published, [ours]: published });
  const first = cli(r, ["install", "--yes"]);
  assert.equal(first.status, 0, first.stderr);
  assert.ok(existsSync(join(r, mine)) && existsSync(join(r, ours)), "no record: nothing is removed");
  assert.ok(!first.stdout.includes("adapt/topics.md"), first.stdout);
  withRecord(r, (rec) => { rec.files[ours] = { piece: "adapt", sha256: sha(published) }; });
  const out = cli(r, ["install", "--yes"]);
  assert.equal(out.status, 0, out.stderr);
  assert.ok(existsSync(join(r, mine)), "the user's file is still there");
  assert.ok(!existsSync(join(r, ours)), "the retired file of the package's skill is removed");
  assert.ok(!out.stdout.includes(mine), out.stdout);
});
test("install: the user's own skill with a topics.md of other content is untouched and not named", () => {
  const mine = ".claude/skills/adapt/topics.md";
  const r = repo({ ".claude/skills/adapt/SKILL.md": "mine\n", [mine]: "my own topics\n" });
  for (const args of [["install"], ["install", "--yes"]]) {
    const out = cli(r, args);
    assert.equal(out.status, 0, out.stderr);
    assert.equal(readFileSync(join(r, mine), "utf8"), "my own topics\n");
    assert.ok(!out.stdout.includes(".claude/skills/adapt/topics.md"), out.stdout);
  }
});


test("install: a retired file inside the user's own skill that install keeps is neither removed nor named", () => {
  // a text the package once published, taken from git; the hash is in the manifest's retired list
  const published = spawnSync("git", ["show", "f467f65~1:skills/adapt/topics.md"], { cwd: PKG_ROOT, encoding: "utf8" }).stdout;
  assert.ok(readJson(PKG_ROOT, "manifest.json").pieces.find((p) => p.id === "adapt").retired["skills/adapt/topics.md"].includes(sha(published)));
  const topics = ".claude/skills/adapt/topics.md";
  const r = repo({ ".claude/skills/adapt/SKILL.md": "mine\n", [topics]: published });
  const out = cli(r, ["install"]);
  assert.equal(out.status, 0, out.stderr);
  assert.ok(existsSync(join(r, topics)), "the user's file is still there");
  assert.ok(!out.stdout.includes("adapt/topics.md"), out.stdout);
});

test("install: a retired entry naming a file this tool's adapter never installs is skipped", () => {
  const copy = retiringCopy({ "hooks/adapters/other.mjs": [sha("old\n")] });
  const out = cliAt(copy, repo(), ["install", "--yes"]);
  assert.equal(out.status, 0, out.stderr);
});

// the copy of ponytail an earlier version shipped, read at the fixed commit b0f0430 (HEAD no longer holds it): gone on install when unchanged, kept when edited; the plugin replaces it
const OLD_PONY = () => Object.fromEntries(["SKILL.md", "LICENSE", "SOURCE.md"].map((f) => [f, spawnSync("git", ["show", `b0f0430:skills/ponytail/${f}`], { cwd: PKG_ROOT, encoding: "utf8" }).stdout]));
const withOldPony = (edit) => {
  const r = repo();
  cli(r, ["install"]);
  const rec = readJson(r, ".xworkflows/installed.json");
  mkdirSync(join(r, ".claude/skills/ponytail"), { recursive: true });
  for (const [f, text] of Object.entries(OLD_PONY())) {
    const p = `.claude/skills/ponytail/${f}`;
    writeFileSync(join(r, p), f === "SKILL.md" && edit ? text + "mine\n" : text);
    rec.files[p] = { sha256: sha(text) };
  }
  writeJson(r, ".xworkflows/installed.json", rec);
  return r;
};
test("install removes an unchanged old ponytail copy and keeps an edited one", () => {
  const a = withOldPony(false);
  cli(a, ["install"]);
  assert.ok(!existsSync(join(a, ".claude/skills/ponytail")));
  const b = withOldPony(true);
  assert.match(cli(b, ["install"]).stdout, /kept \(no longer shipped, changed locally\): \.claude\/skills\/ponytail\/SKILL\.md/);
  assert.ok(existsSync(join(b, ".claude/skills/ponytail/SKILL.md")));
});
