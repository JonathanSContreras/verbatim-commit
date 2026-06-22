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
  /** Master switch for the commit-msg hook (verify mode). */
  hookEnabled: boolean;
  /** Whether verify mode adds an optional LLM second-pass (milestone 6). */
  llmVerifyEnabled: boolean;
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
  hookEnabled: true,
  llmVerifyEnabled: false,
};

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const REPO_CONFIG_NAME = ".verbatimrc";

/** Global config directory (override with VERBATIM_HOME). */
function globalConfigDir(): string {
  return process.env.VERBATIM_HOME || join(homedir(), ".verbatim");
}

function readJsonIfExists(path: string): Partial<Config> | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Partial<Config>;
    }
    console.error(`Warning: ignoring config at ${path} (not a JSON object).`);
    return null;
  } catch (err) {
    console.error(`Warning: ignoring invalid config at ${path}: ${(err as Error).message}`);
    return null;
  }
}

/** Walk up from `startDir` to the repo root looking for a per-repo config. */
function findRepoConfig(startDir: string): Partial<Config> | null {
  let dir = startDir;
  for (;;) {
    const found = readJsonIfExists(join(dir, REPO_CONFIG_NAME));
    if (found) return found;
    if (existsSync(join(dir, ".git"))) break; // reached repo root
    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  return null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep-merge `override` onto `base` (nested objects merged; arrays replaced). */
function deepMerge<T>(base: T, override: Partial<T> | null): T {
  if (!override) return base;
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = deepMerge(result[key], value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

/** Drop values with the wrong type so a malformed file can't corrupt config. */
function sanitize(cfg: Config): Config {
  const out = { ...cfg };
  if (out.messageFormat !== "plain" && out.messageFormat !== "conventional") {
    out.messageFormat = DEFAULT_CONFIG.messageFormat;
  }
  if (typeof out.minWordCount !== "number" || out.minWordCount < 0) {
    out.minWordCount = DEFAULT_CONFIG.minWordCount;
  }
  if (
    typeof out.diffBudgetFraction !== "number" ||
    out.diffBudgetFraction <= 0 ||
    out.diffBudgetFraction > 1
  ) {
    out.diffBudgetFraction = DEFAULT_CONFIG.diffBudgetFraction;
  }
  if (!Array.isArray(out.blocklist)) out.blocklist = DEFAULT_CONFIG.blocklist;
  if (typeof out.hookEnabled !== "boolean") out.hookEnabled = DEFAULT_CONFIG.hookEnabled;
  if (typeof out.llmVerifyEnabled !== "boolean") {
    out.llmVerifyEnabled = DEFAULT_CONFIG.llmVerifyEnabled;
  }
  return out;
}

/**
 * Load effective config: defaults < global (`~/.verbatim/config.json`) <
 * per-repo (`.verbatimrc`), deep-merged key by key. See
 * docs/git-commit-tool-plan.md.
 */
export function loadConfig(cwd: string = process.cwd()): Config {
  let cfg: Config = DEFAULT_CONFIG;
  cfg = deepMerge(cfg, readJsonIfExists(join(globalConfigDir(), "config.json")));
  cfg = deepMerge(cfg, findRepoConfig(cwd));
  return sanitize(cfg);
}
