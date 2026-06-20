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
import { checkMessage } from "../lib/heuristics.js";
import { OllamaUnavailableError, generate } from "../lib/ollama.js";
import { Prompter, editInEditor } from "../lib/prompt.js";

/** Print a candidate message, with a soft warning if heuristics flag it. */
function printCandidate(message: string, warnings: string[]): void {
  const indented = message
    .split("\n")
    .map((line) => "  " + line)
    .join("\n");
  console.log("\nGenerated commit message:\n");
  console.log(indented);
  if (warnings.length > 0) {
    console.log(`\n⚠️  Looks weak: ${warnings[0]}`);
  }
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

  const baseContext = {
    diff: budgeted.text,
    fileChanges,
    branch,
    recentSubjects,
    messageFormat: config.messageFormat,
  };

  // Messages the user has rejected via "regenerate", so we steer away from them.
  const rejected: string[] = [];

  // Returns a candidate message, or null if generation failed (error printed).
  // On regeneration, raise the temperature, use a fresh seed, and tell the
  // model to avoid the rejected messages — small diffs are otherwise so
  // high-confidence that the model keeps returning the same phrasing.
  const tryGenerate = async (regenerate: boolean): Promise<string | null> => {
    const { system, prompt } = buildGenPrompt({
      ...baseContext,
      avoid: regenerate ? rejected : [],
    });
    const options = regenerate
      ? { temperature: 1.1, seed: Math.floor(Math.random() * 1_000_000_000) }
      : undefined;
    try {
      const message = await generate({
        host: config.ollamaHost,
        model: config.model,
        system,
        prompt,
        options,
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

  let current = await tryGenerate(false);
  if (current === null) return 1;

  // Non-interactive (piped) invocation: print and exit without committing.
  if (!process.stdin.isTTY) {
    process.stdout.write(current + "\n");
    return 0;
  }

  const prompter = new Prompter();
  try {
    for (;;) {
      const { reasons } = checkMessage(
        current,
        { minWordCount: config.minWordCount, blocklist: config.blocklist },
        recentSubjects[0],
      );
      printCandidate(current, reasons);
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
          rejected.push(current);
          const next = await tryGenerate(true);
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
