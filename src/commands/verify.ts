import { readFile } from "node:fs/promises";
import { loadConfig } from "../config.js";
import { getRecentCommitSubjects } from "../lib/git.js";
import { checkMessage } from "../lib/heuristics.js";
import { llmVerify } from "../lib/llm-verify.js";
import { confirmTty } from "../lib/tty.js";

/** First meaningful line of a message, for display. */
function firstLine(message: string): string {
  for (const line of message.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) return trimmed;
  }
  return "";
}

/**
 * A message was flagged. Print the warning, then ask (on the terminal) whether
 * to commit anyway. Returns the exit code: 0 to let the commit proceed, 1 to
 * abort. With no terminal available (CI, GUI clients, scripts), defaults to
 * proceeding so automation is never blocked.
 */
function handleFlagged(subject: string, reasons: string[]): number {
  console.error("");
  console.error(`! This commit message looks weak: "${subject}"`);
  for (const reason of reasons) {
    console.error(`   - ${reason}`);
  }

  const proceed = confirmTty("\nCommit anyway? (y/N) ", true);
  if (proceed) return 0;

  console.error("Commit aborted — edit your message and commit again.");
  return 1;
}

/**
 * Verify mode — invoked by the commit-msg hook with the path to the message
 * file. Runs the heuristic pass.
 *
 * Milestone 5: soft warning only. If flagged, print the warning and still
 * allow the commit (exit 0) — the interactive /dev/tty override that can abort
 * a commit lands in milestone 7. Never hard-block by default.
 *
 * Returns a process exit code (0 lets git proceed; non-zero aborts the commit).
 */
export async function verify(messageFile: string): Promise<number> {
  const config = loadConfig();
  if (!config.hookEnabled) return 0;

  let message: string;
  try {
    message = await readFile(messageFile, "utf8");
  } catch (err) {
    // Our own failure should never block the user's commit.
    console.error(`verify: could not read ${messageFile}: ${(err as Error).message}`);
    return 0;
  }

  const recent = await getRecentCommitSubjects(1);
  const result = checkMessage(
    message,
    { minWordCount: config.minWordCount, blocklist: config.blocklist },
    recent[0],
  );

  if (result.flagged) {
    return handleFlagged(firstLine(message), result.reasons);
  }

  // Heuristics passed. Optional LLM second-pass for a deeper "does this message
  // actually describe the change?" check. Off by default (latency on every
  // commit); never blocks the commit on its own failure.
  if (config.llmVerifyEnabled) {
    const verdict = await llmVerify(message, config);
    if (verdict?.weak) {
      return handleFlagged(
        firstLine(message),
        verdict.reason ? [verdict.reason] : ["does not clearly describe the change"],
      );
    }
  }

  return 0;
}
