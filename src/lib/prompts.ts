import type { MessageFormat } from "../config.js";

export interface GenPromptContext {
  diff: string;
  branch: string;
  recentSubjects: string[];
  messageFormat: MessageFormat;
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
    formatInstruction,
  ].join("\n");

  const parts: string[] = [];
  if (ctx.branch) parts.push(`Branch: ${ctx.branch}`);
  if (ctx.recentSubjects.length > 0) {
    parts.push(
      "Recent commit subjects in this repo (style/tone reference only — do not copy):",
      ...ctx.recentSubjects.map((s) => `- ${s}`),
    );
  }
  parts.push("", "Staged diff:", ctx.diff, "", "Commit message:");

  return { system, prompt: parts.join("\n") };
}
