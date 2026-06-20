import { readFile } from "node:fs/promises";
import { loadConfig } from "../config.js";
import { getRecentCommitSubjects } from "../lib/git.js";
import { checkMessage } from "../lib/heuristics.js";
import { llmVerify } from "../lib/llm-verify.js";

/** First meaningful line of a message, for display. */
function firstLine(message: string): string {
  for (const line of message.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) return trimmed;
  }
  return "";
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
    console.error("");
    console.error(`⚠️  This commit message looks weak: "${firstLine(message)}"`);
    for (const reason of result.reasons) {
      console.error(`   - ${reason}`);
    }
    console.error("");
    // TODO(milestone 7): prompt y/n via /dev/tty here and return non-zero on "no".
    return 0;
  }

  // Heuristics passed. Optional LLM second-pass for a deeper "does this message
  // actually describe the change?" check. Off by default (latency on every
  // commit); never blocks the commit on its own failure.
  if (config.llmVerifyEnabled) {
    const verdict = await llmVerify(message, config);
    if (verdict?.weak) {
      console.error("");
      console.error(`⚠️  Second-opinion check flagged this message: "${firstLine(message)}"`);
      if (verdict.reason) console.error(`   - ${verdict.reason}`);
      console.error("");
    }
  }

  return 0;
}
