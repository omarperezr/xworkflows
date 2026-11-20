// the helpers the bin/*.test.mjs files share; it holds no test
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, lstatSync, mkdtempSync as makeTmp, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "../test-tmp.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const madeTmp = [];
export const mkdtempSync = (p) => { const d = makeTmp(p); madeTmp.push(d); return d; };
test.after(() => { for (const d of madeTmp) rmSync(d, { recursive: true, force: true }); });

// the developer's own git config never reaches a test
export const ISO = { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
export const isoEnv = () => ({ ...process.env, ...ISO });

export function repo(setup = {}) {
  const dir = mkdtempSync(join(tmpdir(), "xwf-"));
  const env = isoEnv();
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir, env });
  spawnSync("git", ["config", "user.name", "t"], { cwd: dir, env });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: dir, env });
  for (const [p, c] of Object.entries(setup)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), c);
  }
  return dir;
}

export const git = (cwd, args) => spawnSync("git", args.split(" "), { cwd, encoding: "utf8", env: isoEnv() }).stdout.trim();

export function cli(cwd, args, opts = {}) {
  const base = { ...process.env };
  delete base.XWORKFLOWS_FREE;
  delete base.XWORKFLOWS_RECORD;
  const env = { ...base, ...ISO, ...opts.env };
  const r = spawnSync("node", [BIN, ...args], { cwd, env, input: opts.input ?? "", encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

export const readJson = (r, p) => JSON.parse(readFileSync(join(r, p), "utf8"));
export const writeJson = (r, p, v) => writeFileSync(join(r, p), JSON.stringify(v, null, 2) + "\n");

export const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
// What install wires into settings.json comes from the manifest: counts follow it as hooks are added.
export const WIRED = readJson(PKG_ROOT, "manifest.json").pieces.flatMap((p) => p.claude ?? []);
export const PRE = WIRED.filter((c) => c.event === "PreToolUse").length;

export function packageCopy(from = PKG_ROOT) {
  const dir = mkdtempSync(join(tmpdir(), "xwf-pkg-"));
  for (const p of ["package.json", "manifest.json", "tiers.json", "templates", "bin", "skills", "agents", "hooks", "checks"]) {
    cpSync(join(from, p), join(dir, p), { recursive: true });
  }
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir, env: isoEnv() });
  spawnSync("git", ["add", "-A"], { cwd: dir, env: isoEnv() });
  return dir;
}

// the tests install from one copy made per run, its manifest regenerated here: a changed piece never needs pack first
export const SHARED = packageCopy();
process.on("exit", () => rmSync(SHARED, { recursive: true, force: true }));
const packed = spawnSync("node", [join(SHARED, "bin/xworkflows.mjs"), "pack"], { cwd: SHARED, env: { ...process.env, ...ISO }, encoding: "utf8" });
assert.equal(packed.status, 0, `pack of the shared copy failed, every install test depends on it:\n${packed.stdout}${packed.stderr}`);
export const BIN = join(SHARED, "bin/xworkflows.mjs");

export function cliAt(pkg, cwd, args, extra = {}) {
  const env = { ...process.env };
  delete env.XWORKFLOWS_FREE;
  delete env.XWORKFLOWS_RECORD;
  const r = spawnSync("node", [join(pkg, "bin/xworkflows.mjs"), ...args], { cwd, env: { ...env, ...ISO, ...extra }, input: "", encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

// a copy of the regenerated package: its manifest follows the pieces, so a changed piece needs no pack first
export const packedCopy = () => packageCopy(SHARED);

export const theirs = { matcher: "Write|Edit|MultiEdit|Bash", hooks: [{ type: "command", command: "/opt/guard.sh" }] };
// a project installed before the matcher changed: the entry and the record both hold the old one
// P-121: adapt-gates reads no shell command since cleanup-b-4, so Bash left its matcher, and the entry with it is an earlier text
export const OLD_MATCHER = "Write|Edit|MultiEdit|Workflow|Bash", CURRENT = "Write|Edit|MultiEdit|Workflow";
export function installedOld(r, onDisk = OLD_MATCHER) {
  cli(r, ["install"]);
  const adapt = (e) => e.hooks?.[0]?.command?.endsWith(" claude adapt-gates");
  const s = readJson(r, ".claude/settings.json");
  s.hooks.PreToolUse.find(adapt).matcher = onDisk;
  writeJson(r, ".claude/settings.json", s);
  const rec = readJson(r, ".xworkflows/installed.json");
  rec.merged.find((m) => adapt(m.entry)).entry.matcher = OLD_MATCHER;
  writeJson(r, ".xworkflows/installed.json", rec);
  return adapt;
}
export const KEPT_EDIT = /kept: \.claude\/settings\.json hook adapt-gates differs from every text the package published; to get the package's entry, delete it and run xworkflows install\n/;
// the four states of an entry at the package's place, each with an unedited old text or a hand edit
export const adaptOf = (e) => e.hooks?.[0]?.command?.endsWith(" claude adapt-gates");

// brakes, git hooks, gitignore lines and scalar settings
export const ALL_KEYS = { paths: { code: [], risk: [], heavyRead: [], codeAnyway: [] }, tests: { files: [], run: "true", notRunnable: [] }, checks: { project: [], patterns: [], ratchets: [] } };
export const config = (r, patterns) => {
  mkdirSync(join(r, ".xworkflows"), { recursive: true });
  writeJson(r, ".xworkflows/config.json", { ...ALL_KEYS, checks: { ...ALL_KEYS.checks, patterns } });
};
export const BAD = [{ name: "no-bad", regex: "BADWORD", why: "no bad words" }];
export const commit = (r, file, text, env) => {
  file = `docs/${file}`; // under paths.nonCode: review-seal has nothing to say
  mkdirSync(join(r, "docs"), { recursive: true });
  writeFileSync(join(r, file), text);
  spawnSync("git", ["add", file], { cwd: r, env: isoEnv() });
  return spawnSync("git", ["commit", "-qm", `add ${file}`], { cwd: r, encoding: "utf8", env: { ...isoEnv(), ...env } });
};
export const pushed = (r) => {
  const x = spawnSync("git", ["push", "-q", "origin", "main"], { cwd: r, encoding: "utf8", env: isoEnv() });
  return { status: x.status, stderr: x.stdout + x.stderr }; // a hook's standard output is shown on either stream
};
export function withRemote() {
  const r = repo();
  const bare = mkdtempSync(join(tmpdir(), "xwf-bare-"));
  spawnSync("git", ["init", "-q", "--bare", bare], { env: isoEnv() });
  git(r, `remote add origin ${bare}`);
  return { r, bare };
}
// the line install puts in a hook ends with this mark
export const marked = (t) => t.split("\n").filter((l) => l.endsWith(" # xworkflows"));

export const OLD = '#!/bin/sh\nd="$(dirname "$0")/.."\nbasename "$0" > "$d/old-name"\necho "$@" > "$d/old-args"\ncat > "$d/old-in"\n[ -e "$d/old-fail" ] && { echo OLD-FAILED >&2; exit 7; }\nexit 0\n';
export function chained() {
  const { r, bare } = withRemote();
  mkdirSync(join(r, ".git/hooks"), { recursive: true });
  writeFileSync(join(r, ".git/hooks/pre-push"), OLD);
  chmodSync(join(r, ".git/hooks/pre-push"), 0o755);
  return { r, bare };
}

// doctor: fakes first on a PATH of its own, so the real qmd, graphify, semgrep and trivy never run
export const made = [];
process.on("exit", () => made.forEach((d) => rmSync(d, { recursive: true, force: true })));
export const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
export function tools(fakes = {}) {
  const d = tmp("xwf-bin-");
  symlinkSync(process.execPath, join(d, "node"));
  symlinkSync(spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim(), join(d, "git"));
  for (const [n, body] of Object.entries(fakes)) { writeFileSync(join(d, n), `#!/bin/sh\n${body}\n`); chmodSync(join(d, n), 0o755); }
  return `${d}:/usr/bin:/bin`;
}
// a qmd whose one collection covers docs/memory of the folder it runs in
export const COVERS = `case "$*" in *"collection list"*) printf 'memory (qmd://memory/)\\n';; *"collection show memory"*) printf '  Path:     %s/docs/memory\\n' "$(pwd -P)";; esac`;
export const GOOD = tools({ qmd: COVERS, graphify: "exit 0" });
export const EMPTY_HOME = tmp("xwf-home-");
export function doctor(r, env = {}) {
  if (!existsSync(join(r, ".xworkflows/config.json"))) { mkdirSync(join(r, ".xworkflows"), { recursive: true }); writeJson(r, ".xworkflows/config.json", ALL_KEYS); }
  return cli(r, ["doctor"], { env: { PATH: GOOD, HOME: EMPTY_HOME, ...env } });
}
export const withConfig = (r, c) => { mkdirSync(join(r, ".xworkflows"), { recursive: true }); writeJson(r, ".xworkflows/config.json", { ...ALL_KEYS, ...c }); };

// review findings
export const outside = (hooksPath) => {
  const cfg = join(tmp("xwf-g-"), "gitconfig");
  writeFileSync(cfg, `[core]\n\thooksPath = ${hooksPath}\n`);
  return cfg;
};
export const hasHook = (d) => { const p = join(d, "pre-push"); writeFileSync(p, OLD); chmodSync(p, 0o755); };
// husky's two files, written here from its documented behaviour: the shim git runs reads h beside it, and h runs the file of the
// hook's own name one folder up with sh -e, which gets the arguments and the standard input
const HUSKY_H = '#!/usr/bin/env sh\nn=$(basename "$0")\ns=$(dirname "$(dirname "$0")")/$n\n[ ! -f "$s" ] && exit 0\nsh -e "$s" "$@"\nc=$?\n[ $c != 0 ] && echo "husky - $n script failed (code $c)"\nexit $c\n';
export const HUSKY_SHIM = '#!/usr/bin/env sh\n. "$(dirname "$0")/h"\n';
export function husky(files = {}) {
  const { r, bare } = withRemote();
  mkdirSync(join(r, ".husky/_"), { recursive: true });
  writeFileSync(join(r, ".husky/_/h"), HUSKY_H, { mode: 0o755 });
  for (const n of ["pre-push", "post-merge", "post-commit"]) writeFileSync(join(r, ".husky/_", n), HUSKY_SHIM, { mode: 0o755 });
  for (const [n, t] of Object.entries(files)) writeFileSync(join(r, ".husky", n), t);
  git(r, "config core.hooksPath .husky/_");
  return { r, bare };
}
// a pre-push that is not a shell script: it keeps what it got on standard input
export const NODE_HOOK = '#!/usr/bin/env node\nrequire("fs").writeFileSync(".git/node-in", require("fs").readFileSync(0));\n';
// the hook texts of the package before the line (P-46), kept as fixtures: an install made then is built from them
export const OLD_TEXT = (kind, name) => readFileSync(join(PKG_ROOT, "fixtures/old-hooks", `${kind}-${name}`), "utf8");
// What an install made before the line left: each hook of the project renamed <name>.before-xworkflows and run from the chained hook,
// install's own text where there was none, and a record that says so. Built from today's install of the rest.
export function oldInstall(r) {
  const at = (n) => join(r, ".git/hooks", n), theirs = ["pre-push", "post-merge", "post-commit"].filter((n) => lstatSync(at(n), { throwIfNoEntry: false }));
  for (const n of theirs) renameSync(at(n), `${at(n)}.aside`);
  assert.equal(cli(r, ["install"]).status, 0);
  rmSync(join(r, ".xworkflows/git"), { recursive: true });
  rmSync(at("pre-commit")); // an older install wrote no pre-commit hook, and this one sources the file just removed
  const rec = readJson(r, ".xworkflows/installed.json");
  delete rec.files[".git/hooks/pre-commit"];
  for (const n of ["pre-push", "post-merge", "post-commit"]) {
    const chain = theirs.includes(n), t = OLD_TEXT(chain ? "chained" : "own", n);
    if (chain) renameSync(`${at(n)}.aside`, `${at(n)}.before-xworkflows`);
    writeFileSync(at(n), t); chmodSync(at(n), 0o755);
    delete rec.files[`.xworkflows/git/${n}`];
    rec.files[`.git/hooks/${n}`] = { piece: "checks", sha256: createHash("sha256").update(t).digest("hex") };
    if (chain) rec.chained.push({ file: `.git/hooks/${n}`, to: `.git/hooks/${n}.before-xworkflows` });
  }
  writeJson(r, ".xworkflows/installed.json", rec);
}
export const ROOT_WRITES = process.getuid?.() === 0 && "root writes a file of mode 555";

export const sha = (t) => createHash("sha256").update(t).digest("hex");

// the record is the project's text, never the package's word: uninstall removes only what this package writes
export const withRecord = (r, edit) => { const rec = readJson(r, ".xworkflows/installed.json"); edit(rec); writeJson(r, ".xworkflows/installed.json", rec); };
// every path of the project with its bytes, the hooks folder included
export const files = (r) => readdirSync(r, { recursive: true }).filter((p) => !/^\.git(\/|$)/.test(p) || p.startsWith(".git/hooks")).sort()
  .map((p) => (statSync(join(r, p)).isDirectory() ? `${p}/` : `${p} ${readFileSync(join(r, p), "base64")}`)).join("\n");

// install: the memory folder and the project-local qmd index (.qmd/index.yml); no qmd ever starts
export const qmdLog = () => join(tmp("xwf-log-"), "qmd.log");
export const spy = (log) => tools({ qmd: `echo "$@" >> ${log}` });
export const inst = (r, args = [], log = qmdLog()) => ({ ...cli(r, ["install", ...args], { env: { PATH: spy(log), HOME: EMPTY_HOME } }), log });
export const top = (r) => git(r, "rev-parse --show-toplevel");
export const tree = (r) => spawnSync("find", [".", "-path", "./.git", "-prune", "-o", "-print"], { cwd: r, encoding: "utf8" }).stdout.split("\n").sort().join("\n");

// every fail and warn line of doctor ends with the command or the action that fixes it
export const FIX = "run xworkflows install";
export const lineOf = (out, re) => out.stdout.split("\n").find((l) => re.test(l));
export const hookAt = (r, body) => { const h = join(r, ".git/hooks/pre-push"); mkdirSync(dirname(h), { recursive: true }); writeFileSync(h, body); chmodSync(h, 0o755); };
export const yes = (r) => assert.equal(cli(r, ["install", "--yes"]).status, 0);
// `how`: "by hand", of the two steps a declined hook's line offers, the row does the hand edit; "own folder", of the two a hooks
// folder outside the repository offers, the second
export function doLine(r, line, how) {
  let m;
  if (how === "by hand") line = line.replace(/: .*?; or (add this line)/, ": $1");
  if (how === "own folder") {
    m = line.match(/; or point this repository at its own hooks folder, .*: run: (git config core\.hooksPath .+); then run xworkflows install$/);
    assert.ok(m, line);
    assert.equal(spawnSync("sh", ["-c", m[1]], { cwd: r, env: isoEnv() }).status, 0);
    return assert.equal(cli(r, ["install"]).status, 0);
  }
  // the sentence for a hooks folder outside the repository offers this edit first, and may ask to take an earlier line out
  if ((m = line.match(/(?::|either) add this line to (\S+) as its first command(, in place of [^:]*)?: (.+ # xworkflows)(?: ;|$)/))) {
    let t = existsSync(m[1]) ? readFileSync(m[1], "utf8") : "";
    if (m[2]) t = t.split("\n").filter((l) => l !== GUARDED_OLD).join("\n");
    // a read-only file is made writable first, as a user does to edit it
    if (existsSync(m[1])) chmodSync(m[1], statSync(m[1]).mode | 0o200);
    writeFileSync(m[1], t.startsWith("#!") ? t.replace("\n", `\n${m[3]}\n`) : `${m[3]}\n${t}`);
    // the step of a sentence that names install after the edit
    if (line.includes(" # xworkflows ; then run xworkflows install")) assert.equal(cli(r, ["install"]).status, 0);
    return;
  }
  if ((m = line.match(/: delete (\S+), then run xworkflows install$/))) {
    rmSync(join(r, m[1]), { recursive: true });
    return assert.equal(cli(r, ["install"]).status, 0);
  }
  const undecline = (f) => withRecord(r, (x) => { x.declined = x.declined.filter((d) => d.file !== f); });
  if ((m = line.match(/take the entry of (\S+) out of "declined" in \.xworkflows\/installed\.json, then run xworkflows install and answer yes(;|$)/))) {
    undecline(m[1]);
    return yes(r);
  }
  if ((m = line.match(/, and (\S+) is in the way of chaining it: move that file out of the hooks folder, (?:take the entry of (\S+) out of "declined" in \.xworkflows\/installed\.json, )?then run xworkflows install and answer yes to chain it$/))) {
    renameSync(m[1], join(tmp("xwf-moved-"), "pre-push"));
    if (m[2]) undecline(m[2]);
    return yes(r);
  }
  if (/: run xworkflows install and answer yes to chain it$/.test(line)) return yes(r);
  if (/: run xworkflows install( replaces it)?$/.test(line)) return assert.equal(cli(r, ["install"]).status, 0);
  if ((m = line.match(/: chmod \+x (\S+)$/))) return chmodSync(m[1], 0o755);
  assert.fail(`doctor's line names no step that can be done: ${line}`);
}
export const at = (f) => () => { const x = withRemote(); f(x.r); return x; };
// the file f moves to scripts/pre-push.sh, and f becomes a link to it
export const toScript = (r, f, link) => { mkdirSync(join(r, "scripts"), { recursive: true }); renameSync(join(r, f), join(r, "scripts/pre-push.sh")); symlinkSync(link, join(r, f)); };
// the line an earlier version told a user to put in the pre-push of a hooks folder outside the repository: it ran the check and
// handed the rest of the hook no pushed refs
const GUARDED_OLD = 'f="$(git rev-parse --show-toplevel)/.xworkflows/checks/run.mjs"; if [ -f "$f" ]; then node "$f" --pre-push "$1" || exit $?; fi';
// a hooks folder outside the repository, shared with other projects: its pre-push is OLD, which writes beside the folder what it got.
// install writes nothing there
export const shared = (guarded) => () => {
  const x = withRemote(), g = join(tmp("xwf-shared-"), "hooks");
  mkdirSync(g);
  const body = guarded ? OLD.replace("\n", `\n${GUARDED_OLD}\n`) : OLD;
  writeFileSync(join(g, "pre-push"), body, { mode: 0o755 });
  git(x.r, `config core.hooksPath ${g}`);
  yes(x.r);
  assert.deepEqual(readdirSync(g), ["pre-push"]);
  assert.equal(readFileSync(join(g, "pre-push"), "utf8"), body);
  return { ...x, g };
};
export const lines = (r, p = ".graphifyignore") => readFileSync(join(r, p), "utf8").split("\n").filter(Boolean);

// P-125: doctor never throws; a throw anywhere in it is one fail line, and doctor ends with its count
export const ENDS = /\ndoctor: [1-9]\d* fail, \d+ warn\n$/;
