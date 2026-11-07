import assert from "node:assert/strict";
import { test } from "node:test";
import { buildGenPrompt } from "../dist/lib/prompts.js";

const base = {
  diff: "diff --git a/src/auth.ts b/src/auth.ts\n+const SKEW_MS = 30_000;",
  fileChanges: [{ status: "modified", path: "src/auth.ts" }],
  branch: "main",
  recentSubjects: ["fix: handle missing token"],
  messageFormat: "plain",
};

test("without intent, the prompt has no author's-note section", () => {
  const { system, prompt } = buildGenPrompt(base);
  assert.doesNotMatch(prompt, /Author's note/);
  assert.doesNotMatch(system, /author has supplied a note/i);
});

test("blank or whitespace-only intent is treated as absent", () => {
  const without = buildGenPrompt(base);
  for (const intent of ["", "   ", "\n\t"]) {
    assert.deepEqual(buildGenPrompt({ ...base, intent }), without);
  }
});

test("intent is included, trimmed, ahead of the diff", () => {
  const { prompt } = buildGenPrompt({
    ...base,
    intent: "  users were logged out early because of clock skew \n",
  });
  const note = prompt.indexOf("Author's note");
  const text = prompt.indexOf("users were logged out early because of clock skew\n");
  const diff = prompt.indexOf("Staged diff:");
  assert.ok(note !== -1, "author's note heading present");
  assert.ok(text > note, "intent text follows its heading, trimmed");
  assert.ok(diff > text, "the diff comes after the intent");
});

test("intent adds system rules: state the reason, never list the note as changes", () => {
  const { system } = buildGenPrompt({ ...base, intent: "clock skew" });
  assert.match(system, /author has supplied a note/i);
  assert.match(system, /ALWAYS include a body/);
  assert.match(system, /note is NOT a list of changes/);
  assert.match(system, /Describe only changes you can see in the diff/);
  // The no-invented-reasons rule still stands alongside it.
  assert.match(system, /Do not invent reasons/);
});

test("intent survives regeneration alongside rejected messages", () => {
  const { prompt } = buildGenPrompt({
    ...base,
    intent: "clock skew",
    avoid: ["Add skew constant"],
  });
  assert.match(prompt, /clock skew/);
  assert.match(prompt, /- Add skew constant/);
});
