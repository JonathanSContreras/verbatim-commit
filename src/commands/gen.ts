import { loadConfig } from "../config.js";
import {
  getCurrentBranch,
  getRecentCommitSubjects,
  getStagedDiff,
  isGitRepo,
} from "../lib/git.js";
import { budgetDiff, computeDiffBudgetTokens } from "../lib/diff.js";
import { buildGenPrompt } from "../lib/prompts.js";
import { OllamaUnavailableError, generate } from "../lib/ollama.js";

/**
 * Generate mode.
 *
 * Milestone 2: read the staged diff, budget it to the model's context window,
 * gather repo-aware context (branch + recent subjects), call Ollama, and print
 * the generated message. The confirm/commit loop is milestone 3.
 *
 * Returns a process exit code.
 */
export async function gen(): Promise<number> {
  const cwd = process.cwd();

  if (!(await isGitRepo(cwd))) {
    console.error("Error: not inside a git repository.");
    return 1;
  }

  const rawDiff = await getStagedDiff(cwd);
  if (rawDiff.trim() === "") {
    console.error("No staged changes. Stage files with `git add` first.");
    return 1;
  }

  const config = loadConfig();
  const contextWindow = config.contextWindow[config.model] ?? 8192;
  const budgetTokens = computeDiffBudgetTokens(contextWindow, config.diffBudgetFraction);
  const budgeted = budgetDiff(rawDiff, budgetTokens);

  if (budgeted.text.trim() === "") {
    console.error(
      "Staged changes are all filtered out (lockfiles/binaries/vendored). Nothing to summarize.",
    );
    return 1;
  }

  const [branch, recentSubjects] = await Promise.all([
    getCurrentBranch(cwd),
    getRecentCommitSubjects(5, cwd),
  ]);

  const { system, prompt } = buildGenPrompt({
    diff: budgeted.text,
    branch,
    recentSubjects,
    messageFormat: config.messageFormat,
  });

  let message: string;
  try {
    message = await generate({
      host: config.ollamaHost,
      model: config.model,
      system,
      prompt,
    });
  } catch (err) {
    if (err instanceof OllamaUnavailableError) {
      console.error(err.message);
      return 1;
    }
    console.error(`Error generating commit message: ${(err as Error).message}`);
    return 1;
  }

  if (message === "") {
    console.error("Model returned an empty message.");
    return 1;
  }

  process.stdout.write(message + "\n");
  return 0;
}
