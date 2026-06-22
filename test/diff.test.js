import assert from "node:assert/strict";
import { test } from "node:test";
import {
  budgetDiff,
  computeDiffBudgetTokens,
  estimateTokens,
  isNoisePath,
  splitDiffByFile,
} from "../dist/lib/diff.js";

/** Build a minimal unified-diff section for one file. */
function fileDiff(path, bodyLines) {
  return (
    [
      `diff --git a/${path} b/${path}`,
      "index 1111111..2222222 100644",
      `--- a/${path}`,
      `+++ b/${path}`,
      `@@ -1,${bodyLines.length} +1,${bodyLines.length} @@`,
      ...bodyLines,
      "",
    ].join("\n")
  );
}

// ---------- estimateTokens ----------
test("estimateTokens rounds up at ~4 chars/token", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("abcde"), 2);
});

// ---------- computeDiffBudgetTokens ----------
test("budget = contextWindow*fraction - reserve", () => {
  assert.equal(computeDiffBudgetTokens(128000, 0.5), 62500); // 64000 - 1500
});

test("budget never drops below the 256 floor", () => {
  assert.equal(computeDiffBudgetTokens(600, 0.5), 256); // 300 - 1500 -> floored
});

// ---------- splitDiffByFile ----------
test("splitDiffByFile returns [] for empty/whitespace", () => {
  assert.deepEqual(splitDiffByFile(""), []);
  assert.deepEqual(splitDiffByFile("   \n  "), []);
});

test("splitDiffByFile splits one chunk per file", () => {
  const diff = fileDiff("a.js", ["+a"]) + fileDiff("b.js", ["+b"]);
  const parts = splitDiffByFile(diff);
  assert.equal(parts.length, 2);
  assert.ok(parts.every((p) => p.startsWith("diff --git ")));
});

// ---------- isNoisePath ----------
test("isNoisePath flags lockfiles, vendored dirs, and minified files", () => {
  assert.equal(isNoisePath("package-lock.json"), true);
  assert.equal(isNoisePath("nested/dir/yarn.lock"), true);
  assert.equal(isNoisePath("node_modules/x/index.js"), true);
  assert.equal(isNoisePath("public/app.min.js"), true);
  assert.equal(isNoisePath("styles.min.css"), true);
});

test("isNoisePath passes normal source paths", () => {
  assert.equal(isNoisePath("src/app.ts"), false);
  assert.equal(isNoisePath("README.md"), false);
  assert.equal(isNoisePath(""), false);
});

// ---------- budgetDiff ----------
test("small diff fits in full, nothing dropped or trimmed", () => {
  const diff = fileDiff("src/a.js", [" const x = 1;", "+const y = 2;"]);
  const r = budgetDiff(diff, 100000);
  assert.equal(r.trimmed, false);
  assert.deepEqual(r.droppedNoise, []);
  assert.ok(r.text.includes("src/a.js"));
  assert.ok(r.text.includes("+const y = 2;"));
});

test("lockfiles are dropped as noise but source is kept", () => {
  const diff = fileDiff("src/a.js", ["+a"]) + fileDiff("package-lock.json", ["+lock"]);
  const r = budgetDiff(diff, 100000);
  assert.ok(r.droppedNoise.includes("package-lock.json"));
  assert.ok(r.text.includes("src/a.js"));
  assert.ok(!r.text.includes("package-lock.json"));
});

test("binary sections are dropped", () => {
  const binary = [
    "diff --git a/logo.png b/logo.png",
    "index 1..2 100644",
    "Binary files a/logo.png and b/logo.png differ",
    "",
  ].join("\n");
  const diff = fileDiff("src/a.js", ["+a"]) + binary;
  const r = budgetDiff(diff, 100000);
  assert.ok(r.droppedNoise.includes("logo.png"));
  assert.ok(!r.text.includes("logo.png"));
  assert.ok(r.text.includes("src/a.js"));
});

test("over-budget diff is trimmed with an omission marker", () => {
  const big = fileDiff(
    "big.txt",
    Array.from({ length: 60 }, (_, i) => `+line ${i} with a bit of content to take up tokens`),
  );
  const r = budgetDiff(big, 60); // tiny budget forces trimming
  assert.equal(r.trimmed, true);
  assert.match(r.text, /lines omitted|diff omitted/);
});

test("all-noise diff yields empty text", () => {
  const diff = fileDiff("package-lock.json", ["+x"]) + fileDiff("yarn.lock", ["+y"]);
  const r = budgetDiff(diff, 100000);
  assert.equal(r.text.trim(), "");
  assert.equal(r.droppedNoise.length, 2);
  assert.equal(r.trimmed, false);
});
