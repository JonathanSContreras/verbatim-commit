import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getHooksDir, isGitRepo } from "../lib/git.js";

/** Marker so we can recognize (and safely overwrite) our own hook. */
const MARKER = "installed by verbatim";

/** Absolute path to the compiled CLI entry (dist/cli.js). */
function cliPath(): string {
  // This module is dist/commands/install-hook.js → cli is ../cli.js
  return join(dirname(fileURLToPath(import.meta.url)), "..", "cli.js");
}

/**
 * A stable absolute path to node, used as the hook's fallback when `node` isn't
 * on PATH (e.g. GUI git clients launch hooks with a minimal PATH). We prefer a
 * package-manager symlink that survives version upgrades over process.execPath,
 * which on Homebrew resolves to a versioned Cellar path (…/node/25.6.1/bin/node)
 * that breaks on the next `brew upgrade`.
 */
function stableNodePath(): string {
  const candidates = [
    "/opt/homebrew/bin/node", // Homebrew (Apple Silicon)
    "/usr/local/bin/node", // Homebrew (Intel) / common install prefix
    "/usr/bin/node",
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return process.execPath;
}

/**
 * Install the commit-msg hook into the current repo. Writes an LF-ended POSIX
 * shim that shells out to `verify`. The hook prefers `node` on PATH at runtime
 * (so it survives node upgrades) and falls back to a baked absolute path for
 * GUI git clients that run hooks with a minimal PATH. Re-run if the tool
 * location changes.
 */
export async function installHook(opts: { force?: boolean }): Promise<number> {
  const cwd = process.cwd();
  if (!(await isGitRepo(cwd))) {
    console.error("Error: not inside a git repository.");
    return 1;
  }

  const hooksDir = await getHooksDir(cwd);
  await mkdir(hooksDir, { recursive: true });
  const hookPath = join(hooksDir, "commit-msg");

  if (existsSync(hookPath) && !opts.force) {
    const existing = await readFile(hookPath, "utf8").catch(() => "");
    if (!existing.includes(MARKER)) {
      console.error(`A commit-msg hook already exists at ${hookPath}.`);
      console.error("Re-run with --force to overwrite it (back it up first if you need it).");
      return 1;
    }
  }

  const fallback = stableNodePath();
  const cli = cliPath();
  // LF line endings only — Git for Windows runs hooks via its bundled bash.
  // Prefer node on PATH (survives runtime upgrades); fall back to the baked
  // absolute path for GUI git clients that run with a minimal PATH.
  const script =
    `#!/bin/sh\n` +
    `# ${MARKER} (commit-msg hook) — safe to remove\n` +
    `node_bin="$(command -v node || true)"\n` +
    `[ -x "$node_bin" ] || node_bin="${fallback}"\n` +
    `"$node_bin" "${cli}" verify "$1"\n`;

  await writeFile(hookPath, script, { encoding: "utf8" });
  await chmod(hookPath, 0o755);
  console.log(`Installed commit-msg hook at ${hookPath}`);
  return 0;
}

/** Remove the commit-msg hook, but only if it's ours. */
export async function uninstallHook(): Promise<number> {
  const cwd = process.cwd();
  if (!(await isGitRepo(cwd))) {
    console.error("Error: not inside a git repository.");
    return 1;
  }

  const hookPath = join(await getHooksDir(cwd), "commit-msg");
  if (!existsSync(hookPath)) {
    console.log("No commit-msg hook to remove.");
    return 0;
  }

  const existing = await readFile(hookPath, "utf8").catch(() => "");
  if (!existing.includes(MARKER)) {
    console.error(`The commit-msg hook at ${hookPath} was not installed by verbatim — leaving it alone.`);
    return 1;
  }

  await unlink(hookPath);
  console.log(`Removed commit-msg hook at ${hookPath}`);
  return 0;
}
