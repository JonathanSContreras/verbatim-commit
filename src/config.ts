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
  /** Subjects with fewer words than this are flagged as too short. */
  minWordCount: number;
  /** User-editable low-effort phrases that flag a message. */
  blocklist: string[];
}

export const DEFAULT_CONFIG: Config = {
  model: "gemma3:4b",
  ollamaHost: "http://localhost:11434",
  contextWindow: { "gemma3:4b": 128000 },
  diffBudgetFraction: 0.5,
  messageFormat: "plain",
  // 3 (not the plan's 4–5) so legitimate imperative subjects like
  // "add login route" aren't flagged; only 1–2 word subjects trip it.
  minWordCount: 3,
  blocklist: [
    "wip",
    "fix",
    "fixes",
    "quick fix",
    "update",
    "updates",
    "changes",
    "change",
    "stuff",
    "misc",
    "minor changes",
    "cleanup",
    "tweaks",
    "asdf",
    "test",
    "tmp",
    "temp",
  ],
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
