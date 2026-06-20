import type { Config } from "../config.js";
import { budgetDiff, computeDiffBudgetTokens } from "./diff.js";
import { getStagedDiff } from "./git.js";
import { generate } from "./ollama.js";
import { buildVerifyPrompt } from "./prompts.js";

export interface LlmVerdict {
  weak: boolean;
  /** Short reason when weak; empty otherwise. */
  reason: string;
}

/**
 * Optional LLM second-pass for verify mode: ask the model whether the message
 * accurately describes the staged change. Returns null (never throws) when it
 * can't render a verdict — no staged diff, Ollama unreachable, or any other
 * error — so a hook never blocks a commit on this check's failure.
 */
export async function llmVerify(
  message: string,
  config: Config,
): Promise<LlmVerdict | null> {
  try {
    const rawDiff = await getStagedDiff();
    if (rawDiff.trim() === "") return null;

    const contextWindow = config.contextWindow[config.model] ?? 8192;
    const budget = computeDiffBudgetTokens(contextWindow, config.diffBudgetFraction);
    const { text } = budgetDiff(rawDiff, budget);

    const { system, prompt } = buildVerifyPrompt(message, text);
    const out = await generate({
      host: config.ollamaHost,
      model: config.model,
      system,
      prompt,
      options: { temperature: 0 },
    });

    const lines = out
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const verdict = (lines[0] ?? "").toUpperCase();
    const weak = verdict.includes("WEAK");
    const reason = weak ? lines.slice(1).join(" ").trim() : "";
    return { weak, reason };
  } catch {
    return null;
  }
}
