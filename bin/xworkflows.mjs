#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const PKG = dirname(dirname(fileURLToPath(import.meta.url)));
export let ROOT;

const COMMANDS = ["install", "doctor", "uninstall", "pack"];
const BOOL = ["--yes", "--dry-run", "--check"];

function die(code, msg) {
  process.stderr.write(msg + "\n");
  process.exit(code);
}

function parse(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--tool") {
      if (i + 1 >= args.length) die(2, "--tool needs a value");
      flags.tool = args[++i];
    } else if (BOOL.includes(a)) flags[a.slice(2)] = true;
    else die(2, `unknown flag: ${a}`);
  }
  return flags;
}

export function main(argv) {
  const [cmd, ...rest] = argv;
  if (!COMMANDS.includes(cmd)) die(2, `usage: xworkflows <${COMMANDS.join("|")}> [--tool claude] [--yes] [--dry-run]`);
  const flags = parse(rest);
  if (flags.check && cmd !== "pack") die(2, "--check is for pack only");
  if (flags.tool && flags.tool !== "claude") die(2, `not yet: ${flags.tool} comes in a later phase`);
  try {
    ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    die(1, "not inside a git repository");
  }
  die(1, "not built yet");
}

main(process.argv.slice(2));
