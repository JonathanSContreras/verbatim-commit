export type MessageFormat = "plain" | "conventional";

export interface Config {
  /** Ollama model name. */
  model: string;
  /** Base URL of the local Ollama instance. */
  ollamaHost: string;
  /** Per-model context window (tokens), used by diff budgeting. */
  contextWindow: Record<string, number>;
  /** Fraction of the context window reserved for diff content. */
  diffBudgetFraction: number;
  /** Commit subject style the gen prompt asks for. */
  messageFormat: MessageFormat;
}

export const DEFAULT_CONFIG: Config = {
  model: "gemma3:4b",
  ollamaHost: "http://localhost:11434",
  contextWindow: { "gemma3:4b": 128000 },
  diffBudgetFraction: 0.5,
  messageFormat: "plain",
};

/**
 * Load effective config.
 *
 * Milestone 2: returns defaults only. Milestone 8 adds file loading with
 * global (`~/.<tool>/config.json`) + per-repo (`.<tool>rc`) deep-merge
 * precedence — see docs/git-commit-tool-plan.md.
 */
export function loadConfig(): Config {
  return DEFAULT_CONFIG;
}
