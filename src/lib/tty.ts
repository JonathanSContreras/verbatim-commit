import { closeSync, openSync, readSync, writeSync } from "node:fs";

/**
 * Interactive prompts from inside a git hook.
 *
 * During a commit-msg hook, stdin is git's, not the user's terminal — so we
 * read/write the controlling terminal directly: `/dev/tty` on POSIX,
 * `CONIN$`/`CONOUT$` on Windows. (Windows path is untested here; see the
 * cross-platform notes in docs/git-commit-tool-plan.md.)
 *
 * When no controlling terminal is available (CI, GUI git clients, scripts),
 * the prompt returns null so callers can fall through without blocking.
 */
function ttyPaths(): { input: string; output: string } {
  if (process.platform === "win32") {
    return { input: "\\\\.\\CONIN$", output: "\\\\.\\CONOUT$" };
  }
  return { input: "/dev/tty", output: "/dev/tty" };
}

/**
 * Write `question` to the terminal and read one line back (blocking).
 * Returns the trimmed answer, or null if no terminal is available.
 */
export function promptTty(question: string): string | null {
  const { input, output } = ttyPaths();

  let outFd: number;
  try {
    outFd = openSync(output, "w");
  } catch {
    return null;
  }

  let inFd: number;
  try {
    inFd = openSync(input, "r");
  } catch {
    closeSync(outFd);
    return null;
  }

  try {
    writeSync(outFd, question);
    const buf = Buffer.alloc(1);
    let line = "";
    for (;;) {
      let bytes: number;
      try {
        bytes = readSync(inFd, buf, 0, 1, null);
      } catch {
        break;
      }
      if (bytes === 0) break; // EOF
      const ch = buf.toString("utf8", 0, 1);
      if (ch === "\n") break;
      if (ch === "\r") continue;
      line += ch;
    }
    return line.trim();
  } finally {
    try {
      closeSync(inFd);
    } catch {
      /* ignore */
    }
    try {
      closeSync(outFd);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Yes/no prompt on the terminal. When there's no terminal, returns
 * `defaultWhenNoTty` instead of blocking. Only an explicit "y"/"yes"
 * (case-insensitive) counts as yes.
 */
export function confirmTty(question: string, defaultWhenNoTty: boolean): boolean {
  const answer = promptTty(question);
  if (answer === null) return defaultWhenNoTty;
  return /^y(es)?$/i.test(answer);
}
