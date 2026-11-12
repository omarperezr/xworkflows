import { join } from "node:path";

export const markFrom = (command) => command.match(/node\s+["']?(?:[^\s"']*[\\/])?\.xworkflows[\\/]mark\.mjs["']?\s+([A-Za-z0-9_-]+)/)?.[1] ?? null;

export const markFile = (stateDir, skill, session) => join(stateDir, "xwf-mark-" + skill + "-" + session.replace(/[^A-Za-z0-9_-]/g, "_"));
