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
  /**
   * Author-supplied note on *why* the change was made (`gen --context`).
   * Shapes framing only; the diff stays the source of truth for *what*.
   */
  intent?: string;
}

/** Build the system + user prompt for generate mode. */
export function buildGenPrompt(ctx: GenPromptContext): {
  system: string;
  prompt: string;
} {
  const intent = ctx.intent?.trim() ?? "";

  const formatInstruction =
    ctx.messageFormat === "conventional"
      ? 'Use Conventional Commits, format "type(optional-scope): description". The type MUST be exactly one of: feat, fix, docs, style, refactor, perf, test, chore, build, ci. Never invent a type (e.g. not "rename:" or "update:"); for renames, moves, or file reorganization use "refactor" or "chore". Example: "fix(auth): handle missing token". The type(scope) prefix applies to the SUBJECT LINE ONLY — it does not replace the body; still include a body when the body rule below calls for one.'
      : "Write a plain, descriptive subject line in the imperative mood, with no type prefix.";

  const system = [
    "You write git commit messages from a staged diff.",
    "Output ONLY the commit message — no preamble, no surrounding quotes, no markdown, no explanation.",
    "First line: a concise subject (aim for <= 72 characters) describing the single most significant change. A new feature or user-facing/behavior change (e.g. accessibility, a new capability) outranks renames, file moves, documentation, or formatting — lead with it, not with the easiest-to-name change.",
    "Body rule (applies to BOTH plain and conventional formats): for anything beyond a single trivial change — multiple files, or more than one logical change — add a blank line after the subject, then a short body of a few bullet points covering each key change (features, behavior/accessibility changes, renames, and notable additions or removals). Only a genuinely trivial one-line change may be subject-only. Be factual and concise; do not pad or repeat the subject.",
    "Never put code, diff lines, or verbatim file contents in the message. Describe the change in prose.",
    "A complete list of changed files is provided. Some files (binary, lockfiles, or very large) are listed there without their content shown — still account for them.",
    "Use each file's change type exactly: 'renamed' means renamed/moved (NOT updated or added), 'deleted' means removed, 'added' means new, 'modified' means edited. Never describe a rename or deletion as an 'update'.",
    "Describe only what the diff and file list actually show. Do not invent reasons, benefits, or changes — e.g. do not claim something was done 'for readability', 'to improve performance', or that content was 'updated' unless the diff clearly shows it.",
    ...(intent
      ? [
          "The author has supplied a note explaining WHY they made this change. Because a note was given, ALWAYS include a body (even for a one-line change), and open the body with one short sentence stating that reason in your own words, without adding to it. It is the only reason or benefit you may give.",
          "The author's note is NOT a list of changes. It may mention other work, plans, or related fixes that are not part of this commit. Describe only changes you can see in the diff; anything the note mentions that the diff does not show must be left out of the message entirely — do not list it, even briefly.",
        ]
      : []),
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
  if (intent) {
    parts.push(
      "",
      "Author's note on why (context only — it may mention things NOT in this diff; never list those as changes):",
      intent,
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
