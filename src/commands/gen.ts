import { loadConfig } from "../config.js";
import {
  commit,
  getCurrentBranch,
  getRecentCommitSubjects,
  getStagedDiff,
  getStagedFileChanges,
  isGitRepo,
} from "../lib/git.js";
import { budgetDiff, computeDiffBudgetTokens } from "../lib/diff.js";
import { buildGenPrompt } from "../lib/prompts.js";
import { OllamaUnavailableError, generate } from "../lib/ollama.js";
import { Prompter, editInEditor } from "../lib/prompt.js";

/** Print a candidate message, each line indented for readability. */
function printCandidate(message: string): void {
  const indented = message
    .split("\n")
    .map((line) => "  " + line)
    .join("\n");
  console.log("\nGenerated commit message:\n");
  console.log(indented);
  console.log("");
}

/**
 * Generate mode.
 *
 * Milestone 3: after generating a candidate, run a confirm loop —
 * [y]es commits, [e]dit opens the editor, [r]egenerate asks for another
 * candidate, [q]uit aborts. Never commits without explicit confirmation.
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

  const [branch, recentSubjects, fileChanges] = await Promise.all([
    getCurrentBranch(cwd),
    getRecentCommitSubjects(5, cwd),
    getStagedFileChanges(cwd),
  ]);

  const { system, prompt } = buildGenPrompt({
    diff: budgeted.text,
    fileChanges,
    branch,
    recentSubjects,
    messageFormat: config.messageFormat,
  });

  // Returns a candidate message, or null if generation failed (error printed).
  const tryGenerate = async (): Promise<string | null> => {
    try {
      const message = await generate({
        host: config.ollamaHost,
        model: config.model,
        system,
        prompt,
      });
      if (message === "") {
        console.error("Model returned an empty message.");
        return null;
      }
      return message;
    } catch (err) {
      if (err instanceof OllamaUnavailableError) {
        console.error(err.message);
      } else {
        console.error(`Error generating commit message: ${(err as Error).message}`);
      }
      return null;
    }
  };

  let current = await tryGenerate();
  if (current === null) return 1;

  // Non-interactive (piped) invocation: print and exit without committing.
  if (!process.stdin.isTTY) {
    process.stdout.write(current + "\n");
    return 0;
  }

  const prompter = new Prompter();
  try {
    for (;;) {
      printCandidate(current);
      const answer = (
        await prompter.question(
          "Use this message? [y]es / [e]dit / [r]egenerate / [q]uit: ",
        )
      ).toLowerCase();

      switch (answer) {
        case "y":
        case "yes": {
          try {
            await commit(current, cwd);
          } catch (err) {
            console.error(`Commit failed: ${(err as Error).message}`);
            return 1;
          }
          console.log("✓ Committed.");
          return 0;
        }
        case "e":
        case "edit": {
          try {
            const edited = await editInEditor(current, prompter);
            if (edited === "") {
              console.log("Empty message — keeping the previous one.");
            } else {
              current = edited;
            }
          } catch (err) {
            console.error(`Edit cancelled: ${(err as Error).message}`);
          }
          break;
        }
        case "r":
        case "regenerate":
        case "n":
        case "no": {
          console.log("Regenerating…");
          const next = await tryGenerate();
          if (next !== null) current = next;
          break;
        }
        case "q":
        case "quit": {
          console.log("Aborted. Nothing committed.");
          return 1;
        }
        default:
          console.log("Please answer: y, e, r, or q.");
      }
    }
  } finally {
    prompter.close();
  }
}
