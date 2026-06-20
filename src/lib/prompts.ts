import type { MessageFormat } from "../config.js";
import type { FileChange } from "./git.js";

export interface GenPromptContext {
  diff: string;
  fileChanges: FileChange[];
  branch: string;
  recentSubjects: string[];
  messageFormat: MessageFormat;
  /** Previously rejected messages to steer away from on regeneration. */
  avoid?: string[];
}

/** Build the system + user prompt for generate mode. */
export function buildGenPrompt(ctx: GenPromptContext): {
  system: string;
  prompt: string;
} {
  const formatInstruction =
    ctx.messageFormat === "conventional"
      ? 'Use Conventional Commits: a type prefix (feat, fix, docs, refactor, test, chore, etc.), optional scope, then a concise description. Example: "fix(auth): handle missing token".'
      : "Write a plain, descriptive subject line in the imperative mood, with no type prefix.";

  const system = [
    "You write git commit messages from a staged diff.",
    "Output ONLY the commit message — no preamble, no surrounding quotes, no markdown, no explanation.",
    "First line: a concise subject (aim for <= 72 characters). If the change warrants it, add a blank line then a short body explaining the why.",
    "A complete list of changed files is provided. Some files (binary, lockfiles, or very large) are listed there without their content shown — still account for them, including deletions and renames.",
    formatInstruction,
  ].join("\n");

  const parts: string[] = [];
  if (ctx.branch) parts.push(`Branch: ${ctx.branch}`);
  if (ctx.fileChanges.length > 0) {
    parts.push(
      "Files changed in this commit:",
      ...ctx.fileChanges.map((c) => `- ${c.status}: ${c.path}`),
      "",
    );
  }
  if (ctx.recentSubjects.length > 0) {
    parts.push(
      "Recent commit subjects in this repo (style/tone reference only — do not copy):",
      ...ctx.recentSubjects.map((s) => `- ${s}`),
    );
  }
  parts.push("", "Staged diff:", ctx.diff, "");

  if (ctx.avoid && ctx.avoid.length > 0) {
    parts.push(
      "These messages were rejected — write a clearly different one (different wording and emphasis):",
      ...ctx.avoid.map((m) => `- ${m.split("\n")[0]}`),
      "",
    );
  }

  parts.push("Commit message:");

  return { system, prompt: parts.join("\n") };
}
