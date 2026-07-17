/**
 * Fast, rule-based commit-message checks — pure functions, no I/O or LLM, so
 * they're cheap to run on every commit and easy to unit test. Shared by gen
 * mode (soft warning before showing a candidate) and verify mode (the
 * commit-msg hook). See docs/git-commit-tool-plan.md.
 */

export interface HeuristicConfig {
  minWordCount: number;
  blocklist: string[];
}

export interface HeuristicResult {
  flagged: boolean;
  /** Human-readable reasons, most relevant first. */
  reasons: string[];
}

/** Common filler words that carry no specific information on their own. */
const FILLER = new Set([
  "a", "an", "the", "some", "just", "more", "new", "and", "to", "of",
  "for", "my", "it", "this", "that", "various", "minor", "small", "quick",
  "thing", "things",
]);

/** Normalize a subject for comparison: lowercase, unquote, de-punctuate. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[.!,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** First meaningful line of a message (skips blanks and `#` comment lines). */
function extractSubject(message: string): string {
  const lines = message.replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    return trimmed;
  }
  return "";
}

/**
 * True when a subject is written entirely in capitals (e.g. "FIX THE BUILD").
 * Needs at least four letters so short acronyms like "API" don't trip it.
 */
function isShouting(subject: string): boolean {
  const letters = subject.replace(/[^a-z]/gi, "");
  return letters.length >= 4 && subject === subject.toUpperCase();
}

/** Individual words drawn from the blocklist phrases. */
function blocklistWords(blocklist: string[]): Set<string> {
  const words = new Set<string>();
  for (const phrase of blocklist) {
    for (const word of normalize(phrase).split(/\s+/)) {
      if (word) words.add(word);
    }
  }
  return words;
}

/**
 * Check a commit message against the heuristics. `previousSubject` enables the
 * "identical to the last commit" check; omit it when not available.
 */
export function checkMessage(
  message: string,
  config: HeuristicConfig,
  previousSubject?: string,
): HeuristicResult {
  const reasons: string[] = [];
  const subject = extractSubject(message);
  const norm = normalize(subject);

  if (norm === "") {
    return { flagged: true, reasons: ["empty commit message"] };
  }

  const words = norm.split(/\s+/).filter(Boolean);

  // Exact match against a blocklist phrase.
  const exactMatch = config.blocklist.find((p) => normalize(p) === norm);
  if (exactMatch) {
    reasons.push(`matches low-effort phrase: "${exactMatch}"`);
  } else {
    // Every word is vague (blocklist word or filler) — e.g. "update stuff".
    const vague = new Set([...blocklistWords(config.blocklist), ...FILLER]);
    if (words.every((w) => vague.has(w))) {
      reasons.push("no specific content — every word is vague/low-effort");
    }
  }

  if (words.length < config.minWordCount) {
    reasons.push(
      `subject is only ${words.length} word${words.length === 1 ? "" : "s"} (minimum ${config.minWordCount})`,
    );
  }

  if (isShouting(subject)) {
    reasons.push("written in all caps (reads as shouting)");
  }

  if (previousSubject && normalize(previousSubject) === norm) {
    reasons.push("identical to the previous commit message");
  }

  return { flagged: reasons.length > 0, reasons };
}
