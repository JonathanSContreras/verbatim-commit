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
      ? 'Use Conventional Commits, format "type(optional-scope): description". The type MUST be exactly one of: feat, fix, docs, style, refactor, perf, test, chore, build, ci. Never invent a type (e.g. not "rename:" or "update:"); for renames, moves, or file reorganization use "refactor" or "chore". Example: "fix(auth): handle missing token".'
      : "Write a plain, descriptive subject line in the imperative mood, with no type prefix.";

  const system = [
    "You write git commit messages from a staged diff.",
    "Output ONLY the commit message — no preamble, no surrounding quotes, no markdown, no explanation.",
    "First line: a concise subject (aim for <= 72 characters). If the change warrants it, add a blank line then a short body explaining the why.",
    "Never put code, diff lines, or verbatim file contents in the message. Describe the change in prose.",
    "A complete list of changed files is provided. Some files (binary, lockfiles, or very large) are listed there without their content shown — still account for them.",
    "Use each file's change type exactly: 'renamed' means renamed/moved (NOT updated or added), 'deleted' means removed, 'added' means new, 'modified' means edited. Never describe a rename or deletion as an 'update'.",
    "Describe only what the diff and file list actually show. Do not invent reasons, benefits, or changes — e.g. do not claim something was done 'for readability', 'to improve performance', or that content was 'updated' unless the diff clearly shows it.",
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

/** Build the system + user prompt for the LLM verify second-pass. */
export function buildVerifyPrompt(
  message: string,
  diff: string,
): { system: string; prompt: string } {
  const system = [
    "You judge whether a git commit message accurately and specifically describes the staged code change.",
    "WEAK = vague, generic, or low-effort (e.g. 'update', 'fix stuff', 'changes'), or it does not reflect what the diff actually does.",
    "GOOD = it specifically and accurately describes the change.",
    "Respond with exactly one word on the first line: GOOD or WEAK.",
    "If WEAK, add a second line with a short reason (max 12 words).",
  ].join("\n");

  const prompt = [
    "Commit message:",
    message.trim(),
    "",
    "Staged diff:",
    diff,
    "",
    "Verdict:",
  ].join("\n");

  return { system, prompt };
}
