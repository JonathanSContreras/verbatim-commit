import { getStagedDiff, isGitRepo } from "../lib/git.js";

/**
 * Generate mode.
 *
 * Milestone 1: read the staged diff and print it, to confirm the git plumbing
 * works. LLM generation, diff budgeting, repo-aware context, and the
 * confirm/commit loop land in later milestones.
 *
 * Returns a process exit code.
 */
export async function gen(): Promise<number> {
  const cwd = process.cwd();

  if (!(await isGitRepo(cwd))) {
    console.error("Error: not inside a git repository.");
    return 1;
  }

  const diff = await getStagedDiff(cwd);

  if (diff.trim() === "") {
    console.error("No staged changes. Stage files with `git add` first.");
    return 1;
  }

  process.stdout.write(diff);
  return 0;
}
