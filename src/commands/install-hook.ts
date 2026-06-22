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
 * Install the commit-msg hook into the current repo. Writes an LF-ended POSIX
 * shim that shells out to `verify`. Absolute paths to node and the CLI are
 * baked in at install time so the hook works regardless of PATH (re-run if
 * node or the tool location changes).
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

  const node = process.execPath;
  const cli = cliPath();
  // LF line endings only — Git for Windows runs hooks via its bundled bash.
  const script = `#!/bin/sh\n# ${MARKER} (commit-msg hook) — safe to remove\n"${node}" "${cli}" verify "$1"\n`;

  await writeFile(hookPath, script, { encoding: "utf8" });
  await chmod(hookPath, 0o755);
  console.log(`✓ Installed commit-msg hook at ${hookPath}`);
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
  console.log(`✓ Removed commit-msg hook at ${hookPath}`);
  return 0;
}
