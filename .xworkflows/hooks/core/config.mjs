import { readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { outsideLine } from "./ctx.mjs";

export const DEFAULTS = {
  owner: "the owner",
  mainBranch: "main",
  paths: {
    specs: "docs/superpowers/specs",
    plans: "docs/superpowers/plans",
    reviews: "docs/superpowers/reviews",
    pending: "docs/PENDING.md",
    nonCode: ["docs/", ".claude/", ".xworkflows/", "**/*.md", ".gitignore"],
    curated: ["AGENTS.md", "CLAUDE.md", ".claude/rules/", "docs/BUSINESS.md"],
  },
  roles: {
    reviewer: "review",
    riskReviewer: "risk-review",
    implementers: ["implement", "mechanical"],
    lookup: "explore",
    verifier: "verify-finding",
    builtIn: [],
  },
  zones: [],
  git: {
    rules: [
      "One branch per batch, merged with --no-ff, never rebased after review.",
      "Push only when the owner says so.",
      "Files are added by explicit path, never git add . or -A.",
      "No commit, PR or comment names an AI as author or co-author.",
    ],
  },
  brakes: { changeSize: { warn: 400, max: 800 } },
  tokens: { sessionStartBytes: 2000, alwaysLoadedBytes: 24000 },
  limits: { inlineReadLines: 40, agentsBeforeWorkflow: 2, commentRatio: 0.2, commentMinLines: 30 },
  lookup: { index: { command: "graphify query", folder: "graphify-out", minutes: 30 } },
  checks: { timeoutMinutes: 10 },
  mainSession: { denyWeb: true, denyExtensions: ["png", "jpg", "jpeg", "pdf"] },
  comments: {
    marks: { ts: ["//"], tsx: ["//"], js: ["//"], jsx: ["//"], mjs: ["//"], cjs: ["//"], sql: ["--"], sh: ["#"], py: ["#"] },
  },
  memory: { dir: "docs/memory", outside: [] },
  dream: { maxExtractBytes: 4000000, suggest: true, suggestAfterDays: 7, suggestAfterSessions: 10 },
  packs: {},
};

export const PROJECT_KEYS = [
  "paths.code", "paths.risk", "paths.heavyRead", "paths.codeAnyway",
  "tests.files", "tests.run", "tests.notRunnable",
  "checks.project", "checks.patterns", "checks.ratchets",
];

// memory.dir as a folder name inside the repository; null when it is not one
export function memoryDir(d) {
  const n = typeof d === "string" ? posix.normalize(d.trim()).replace(/^\.\/|\/+$/g, "") : "";
  return n === "" || n === "." || n.startsWith("/") || n === ".." || n.startsWith("../") ? null : n;
}

// the memory folder every reader uses, { dir, line: null }, or the line that refuses it, { dir: null, line }
// a value that is not a text is the default; a text outside is refused even when memory.outside lists it: that list is only for a link inside
export function memoryFolder(config, root) {
  const value = config.memory?.dir;
  const dir = typeof value === "string" ? memoryDir(value) : DEFAULTS.memory.dir;
  if (dir === null) return { dir: null, line: `memory.dir ${JSON.stringify(value)} must be a folder inside the repository` };
  const line = outsideLine(root, join(dir, "MEMORY.md"), config.memory?.outside);
  return line ? { dir: null, line } : { dir, line: null };
}

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// the sections read as objects: one edited by hand into anything else is refused by its name
const SECTIONS = new Set([...Object.keys(DEFAULTS).filter((k) => isObj(DEFAULTS[k])), ...PROJECT_KEYS.map((k) => k.split(".")[0])]);

export function merge(base, over) {
  if (!isObj(base) || !isObj(over)) return structuredClone(over);
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(over)) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k], v) : structuredClone(v);
  return out;
}

const readOrNull = (p) => {
  try { return readFileSync(p, "utf8"); } catch (e) { if (e.code === "ENOENT") return null; throw e; }
};

function parse(root, read) {
  const text = read(join(root, ".xworkflows", "config.json"));
  if (text === null) return {};
  let user;
  try {
    user = JSON.parse(text);
    if (!isObj(user)) throw new Error("not a JSON object");
  } catch (e) {
    throw new Error(`.xworkflows/config.json does not parse: ${e.message}`);
  }
  return user;
}

const badSections = (user) => Object.keys(user).filter((k) => SECTIONS.has(k) && !isObj(user[k]));

export function load(root, read = readOrNull) {
  const user = parse(root, read);
  const bad = badSections(user)[0];
  if (bad) throw new Error(`.xworkflows/config.json: ${bad} must be an object`);
  return merge(DEFAULTS, user);
}

// for the hooks: a section that is not an object takes its default, and the names of those sections come back
export function loadLenient(root, read = readOrNull) {
  const user = parse(root, read);
  const replaced = badSections(user);
  for (const k of replaced) delete user[k];
  return { config: merge(DEFAULTS, user), replaced };
}

export const get = (config, key) => key.split(".").reduce((o, k) => (isObj(o) ? o[k] : undefined), config);

export const missing = (config, keys) => keys.filter((k) => get(config, k) === undefined);

// `**/` is any folders or none, `**` anything, `*` inside one segment
const globRe = (g) =>
  new RegExp("^" + g.split(/(\*\*\/|\*\*|\*)/).map((s) =>
    s === "**/" ? "(?:.*/)?" : s === "**" ? ".*" : s === "*" ? "[^/]*" : s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("") + "$");

export function inPaths(file, list) {
  return (list ?? []).some((e) => {
    if (e.includes("*")) return globRe(e).test(file);
    const dir = e.replace(/\/$/, "");
    return file === dir || file.startsWith(dir + "/");
  });
}
