import { readFileSync } from "node:fs";
import { join, posix } from "node:path";

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
  memory: { dir: "docs/memory" },
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

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function merge(base, over) {
  if (!isObj(base) || !isObj(over)) return structuredClone(over);
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(over)) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k], v) : structuredClone(v);
  return out;
}

const readOrNull = (p) => {
  try { return readFileSync(p, "utf8"); } catch (e) { if (e.code === "ENOENT") return null; throw e; }
};

export function load(root, read = readOrNull) {
  const text = read(join(root, ".xworkflows", "config.json"));
  if (text === null) return structuredClone(DEFAULTS);
  let user;
  try {
    user = JSON.parse(text);
    if (!isObj(user)) throw new Error("not a JSON object");
  } catch (e) {
    throw new Error(`.xworkflows/config.json does not parse: ${e.message}`);
  }
  return merge(DEFAULTS, user);
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
