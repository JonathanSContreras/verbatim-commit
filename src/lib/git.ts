import { execFile } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
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

/**
 * Commit the staged changes with `message`. Writes the message to a temp file
 * and uses `git commit -F` so multi-line messages and special characters are
 * preserved exactly, cross-platform.
 */
export async function commit(message: string, cwd: string = process.cwd()): Promise<void> {
  const file = join(tmpdir(), `verbatim-msg-${process.pid}-${Date.now()}.txt`);
  await writeFile(file, message, "utf8");
  try {
    await runGit(["commit", "-F", file], cwd);
  } finally {
    await unlink(file).catch(() => {});
  }
}

export interface FileChange {
  /** Human-readable status: added, modified, deleted, renamed, etc. */
  status: string;
  /** File path; for renames/copies, "old -> new". */
  path: string;
}

const STATUS_LABELS: Record<string, string> = {
  A: "added",
  M: "modified",
  D: "deleted",
  R: "renamed",
  C: "copied",
  T: "type changed",
};

/**
 * Complete inventory of staged file changes (added/modified/deleted/renamed),
 * independent of diff content budgeting — so binary/lockfile/large-file changes
 * are never lost from the model's view even when their content is filtered out.
 */
export async function getStagedFileChanges(
  cwd: string = process.cwd(),
): Promise<FileChange[]> {
  let out: string;
  try {
    out = await runGit(["diff", "--cached", "-M", "--name-status"], cwd);
  } catch {
    return [];
  }

  const changes: FileChange[] = [];
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const code = parts[0][0];
    const status = STATUS_LABELS[code] ?? code;
    if ((code === "R" || code === "C") && parts.length >= 3) {
      changes.push({ status, path: `${parts[1]} -> ${parts[2]}` });
    } else {
      changes.push({ status, path: parts[parts.length - 1] });
    }
  }
  return changes;
}

/** Absolute path to this repo's git hooks directory. */
export async function getHooksDir(cwd: string = process.cwd()): Promise<string> {
  const out = await runGit(["rev-parse", "--git-path", "hooks"], cwd);
  const p = out.trim();
  return isAbsolute(p) ? p : join(cwd, p);
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
