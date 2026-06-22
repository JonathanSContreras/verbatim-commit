import { spawn } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as readline from "node:readline/promises";

/**
 * A single, reusable readline interface for an interactive session.
 *
 * Reuse matters: creating and closing a fresh interface per prompt loses
 * buffered stdin between prompts (questions after the first never resolve).
 * Hold one for the whole loop and close it once at the end.
 */
export class Prompter {
  private readonly rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  async question(query: string): Promise<string> {
    const answer = await this.rl.question(query);
    return answer.trim();
  }

  /** Pause input handling (e.g. while a child process owns the terminal). */
  pause(): void {
    this.rl.pause();
  }

  resume(): void {
    this.rl.resume();
  }

  close(): void {
    this.rl.close();
  }
}

/** Resolve the user's editor, mirroring git's precedence. */
function resolveEditor(): string {
  return (
    process.env.VISUAL ||
    process.env.EDITOR ||
    (process.platform === "win32" ? "notepad" : "vi")
  );
}

/** Launch the editor on `file` and resolve when it exits cleanly. */
function launchEditor(file: string): Promise<void> {
  const editor = resolveEditor();
  const [cmd, ...args] = editor.split(" ");
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [...args, file], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`editor exited with code ${code}`)),
    );
  });
}

/**
 * Open `initial` in the user's editor and return the edited, trimmed text.
 * Pass the active Prompter so its input handling is paused while the editor
 * owns the terminal, then resumed.
 */
export async function editInEditor(
  initial: string,
  prompter?: Prompter,
): Promise<string> {
  const file = join(tmpdir(), `verbatim-edit-${process.pid}-${Date.now()}.txt`);
  await writeFile(file, initial, "utf8");
  prompter?.pause();
  try {
    await launchEditor(file);
    const edited = await readFile(file, "utf8");
    return edited.trim();
  } finally {
    prompter?.resume();
    await unlink(file).catch(() => {});
  }
}
