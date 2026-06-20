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

/** Current branch name (empty on a detached HEAD or fresh repo). */
export async function getCurrentBranch(cwd: string = process.cwd()): Promise<string> {
  try {
    const out = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
    const branch = out.trim();
    return branch === "HEAD" ? "" : branch;
  } catch {
    return "";
  }
}

/** Subjects of the most recent commits (empty on a repo with no commits yet). */
export async function getRecentCommitSubjects(
  count = 5,
  cwd: string = process.cwd(),
): Promise<string[]> {
  try {
    const out = await runGit(["log", "-n", String(count), "--format=%s"], cwd);
    return out
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}
