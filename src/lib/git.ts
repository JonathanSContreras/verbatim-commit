import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Run a git command with an argument array (never a shell string) so quoting
 * behaves identically across zsh/bash/cmd.exe. See cross-platform notes in
 * docs/git-commit-tool-plan.md.
 */
export async function runGit(
  args: string[],
  cwd: string = process.cwd(),
): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 50 * 1024 * 1024, // diffs can be large
  });
  return stdout;
}

/** True if `cwd` is inside a git working tree. */
export async function isGitRepo(cwd: string = process.cwd()): Promise<boolean> {
  try {
    const out = await runGit(["rev-parse", "--is-inside-work-tree"], cwd);
    return out.trim() === "true";
  } catch {
    return false;
  }
}

/**
 * The staged diff — exactly what's about to be committed.
 * Uses `--cached` (the canonical synonym for `--staged`).
 */
export async function getStagedDiff(cwd: string = process.cwd()): Promise<string> {
  return runGit(["diff", "--cached"], cwd);
}
