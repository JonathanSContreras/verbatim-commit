import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanCommitMessage } from "../dist/lib/message.js";

test("strips a code line from the body", () => {
  const raw =
    "Add retry helper\n\nexport function retry(fn){ for(let i=0;i<3;i++) return fn(); }";
  assert.equal(cleanCommitMessage(raw), "Add retry helper");
});

test("keeps a normal prose body", () => {
  const raw = "Add retry helper\n\nWraps calls so transient failures are retried.";
  assert.equal(
    cleanCommitMessage(raw),
    "Add retry helper\n\nWraps calls so transient failures are retried.",
  );
});

test("unwraps a markdown code fence", () => {
  const raw = "```\nFix null check in auth\n```";
  assert.equal(cleanCommitMessage(raw), "Fix null check in auth");
});

test("strips surrounding quotes on the subject", () => {
  assert.equal(cleanCommitMessage('"Update README"'), "Update README");
});

test("drops leftover diff markers", () => {
  const raw = "Update config\n\n@@ -1 +1 @@\ndiff --git a/x b/x";
  assert.equal(cleanCommitMessage(raw), "Update config");
});

test("does not drop prose that merely mentions code words", () => {
  const raw = "Export the build config\n\nExpose the config so other tools can read it.";
  assert.equal(
    cleanCommitMessage(raw),
    "Export the build config\n\nExpose the config so other tools can read it.",
  );
});
