import { execFile, spawn } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as readline from "node:readline/promises";
import { promisify } from "node:util";
import { runGit } from "./git.js";

const execFileAsync = promisify(execFile);

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

/** Is `cmd` on PATH? (POSIX only — used for the non-Windows fallback.) */
async function commandExists(cmd: string): Promise<boolean> {
  try {
    await execFileAsync("which", [cmd]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the editor for editing a commit message. Matches git's own
 * precedence (so it's consistent with `git commit`): GIT_EDITOR, then
 * core.editor, then $VISUAL/$EDITOR. With nothing configured, fall back to the
 * beginner-friendly `nano` rather than `vi` (notepad on Windows).
 */
async function resolveEditor(cwd: string = process.cwd()): Promise<string> {
  if (process.env.GIT_EDITOR) return process.env.GIT_EDITOR;
  try {
    const coreEditor = (await runGit(["config", "--get", "core.editor"], cwd)).trim();
    if (coreEditor) return coreEditor;
  } catch {
    /* core.editor not set */
  }
  if (process.env.VISUAL) return process.env.VISUAL;
  if (process.env.EDITOR) return process.env.EDITOR;
  if (process.platform === "win32") return "notepad";
  if (await commandExists("nano")) return "nano";
  return "vi";
}

/** Launch the editor on `file` and resolve when it exits cleanly. */
async function launchEditor(file: string): Promise<void> {
  const editor = await resolveEditor();
  const [cmd, ...args] = editor.split(" ");
  const base = cmd.split("/").pop() ?? cmd;
  const tip =
    base === "vi" || base === "vim"
      ? "edit, then press Esc and type :wq to save & exit"
      : "save and exit to continue";
  process.stderr.write(`Opening ${base} (${tip})…\n`);

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
