/**
 * Diff budgeting — pure functions, no I/O, so they're cheap to unit test.
 * See "Diff Budgeting" in docs/git-commit-tool-plan.md.
 */

/** Tokens held back for the prompt template + the model's own response. */
export const RESERVE_TOKENS = 1500;

/** Lockfiles: pure noise, stripped regardless of model. */
const LOCKFILES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "composer.lock",
  "Cargo.lock",
  "Gemfile.lock",
  "poetry.lock",
  "Pipfile.lock",
  "go.sum",
]);

/** Vendored / generated directories. */
const VENDOR_DIRS = ["node_modules/", "vendor/", "dist/", "build/", "out/", ".next/"];

/** Rough token estimate (~4 chars/token). Good enough for budgeting. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Diff token budget = contextWindow*fraction − reserve (never below a floor). */
export function computeDiffBudgetTokens(
  contextWindow: number,
  fraction: number,
): number {
  return Math.max(256, Math.floor(contextWindow * fraction) - RESERVE_TOKENS);
}

/** Split a unified diff into one chunk per file, keeping the headers. */
export function splitDiffByFile(diff: string): string[] {
  if (!diff.trim()) return [];
  return diff
    .split(/(?=^diff --git )/m)
    .filter((part) => part.trim().length > 0);
}

function pathFromSection(section: string): string {
  const m = section.match(/^diff --git a\/(.+?) b\/(.+)$/m);
  return m ? m[2] : "";
}

function countChanges(section: string): { ins: number; del: number } {
  let ins = 0;
  let del = 0;
  for (const line of section.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) ins++;
    else if (line.startsWith("-") && !line.startsWith("---")) del++;
  }
  return { ins, del };
}

export function isNoisePath(path: string): boolean {
  if (!path) return false;
  const base = path.split("/").pop() ?? path;
  if (LOCKFILES.has(base)) return true;
  if (VENDOR_DIRS.some((d) => path.includes(d))) return true;
  if (/\.min\.(js|css)$/.test(path)) return true;
  return false;
}

function isBinarySection(section: string): boolean {
  return /^Binary files /m.test(section) || section.includes("GIT binary patch");
}

interface ParsedFile {
  path: string;
  section: string;
  ins: number;
  del: number;
  tokens: number;
}

/** Trim a single file's diff to fit `budgetTokens`, marking what was cut. */
function trimSection(file: ParsedFile, budgetTokens: number): string {
  const lines = file.section.split("\n");
  const firstHunk = lines.findIndex((l) => l.startsWith("@@"));
  const headerEnd = firstHunk >= 0 ? firstHunk : Math.min(lines.length, 5);
  const header = lines.slice(0, headerEnd);
  const body = lines.slice(headerEnd);

  const headerTokens = estimateTokens(header.join("\n") + "\n");
  if (body.length === 0 || headerTokens >= budgetTokens) {
    return header.join("\n") + `\n[diff omitted: +${file.ins}/-${file.del}]\n`;
  }

  // Keep lines from the front and back, alternating, until the budget runs out.
  let remaining = budgetTokens - headerTokens - 8; // 8 ≈ omission-marker line
  const head: string[] = [];
  const tail: string[] = [];
  let i = 0;
  let j = body.length - 1;
  while (i <= j && remaining > 0) {
    const tFront = estimateTokens(body[i] + "\n");
    if (tFront > remaining) break;
    head.push(body[i]);
    remaining -= tFront;
    i++;
    if (i > j) break;
    const tBack = estimateTokens(body[j] + "\n");
    if (tBack > remaining) break;
    tail.unshift(body[j]);
    remaining -= tBack;
    j--;
  }

  const omitted = j - i + 1;
  const parts = [...header, ...head];
  if (omitted > 0) parts.push(`[${omitted} lines omitted]`);
  parts.push(...tail);
  return parts.join("\n").replace(/\n*$/, "\n");
}

export interface BudgetResult {
  /** The budgeted diff text to send to the model. */
  text: string;
  /** Paths dropped as noise (lockfiles, binaries, vendored). */
  droppedNoise: string[];
  /** True if any file was trimmed to fit the budget. */
  trimmed: boolean;
}

/**
 * Filter noise, then fit the diff into `budgetTokens`: full diff when it fits,
 * otherwise full small files + trimmed large files with explicit omission
 * markers (never blind truncation).
 */
export function budgetDiff(diff: string, budgetTokens: number): BudgetResult {
  const droppedNoise: string[] = [];
  const kept: ParsedFile[] = [];

  for (const section of splitDiffByFile(diff)) {
    const path = pathFromSection(section);
    if (isNoisePath(path) || isBinarySection(section)) {
      droppedNoise.push(path);
      continue;
    }
    kept.push({ path, section, ...countChanges(section), tokens: estimateTokens(section) });
  }

  const total = kept.reduce((sum, f) => sum + f.tokens, 0);
  if (total <= budgetTokens) {
    return { text: kept.map((f) => f.section).join(""), droppedNoise, trimmed: false };
  }

  let remaining = budgetTokens;
  let trimmed = false;
  const out: string[] = [];
  for (const file of kept) {
    if (file.tokens <= remaining) {
      out.push(file.section);
      remaining -= file.tokens;
    } else {
      const text = trimSection(file, Math.max(remaining, 0));
      out.push(text);
      remaining -= estimateTokens(text);
      trimmed = true;
    }
  }

  return { text: out.join(""), droppedNoise, trimmed };
}
