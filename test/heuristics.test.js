import assert from "node:assert/strict";
import { test } from "node:test";
import { checkMessage } from "../dist/lib/heuristics.js";
import { DEFAULT_CONFIG } from "../dist/config.js";

const config = {
  minWordCount: DEFAULT_CONFIG.minWordCount,
  blocklist: DEFAULT_CONFIG.blocklist,
};

// Messages that SHOULD be flagged.
const known_bad = [
  "wip",
  "fix",
  "Fix.",
  "update",
  "update stuff",
  "minor changes",
  "quick fix",
  "asdf",
  "stuff",
  "misc",
  "just some changes",
  "",
  "   ",
];

// Messages that SHOULD pass.
const known_good = [
  "Add null check to auth middleware",
  "Fix crash when token is missing",
  "Update README to document install steps",
  "Refactor diff budgeting into pure functions",
  "fix: handle missing token in auth guard",
  "Remove deprecated portfolio image assets",
  "add login route",
];

for (const msg of known_bad) {
  test(`flags low-effort: ${JSON.stringify(msg)}`, () => {
    const r = checkMessage(msg, config);
    assert.equal(r.flagged, true, `expected flagged; reasons: ${r.reasons}`);
    assert.ok(r.reasons.length > 0);
  });
}

for (const msg of known_good) {
  test(`passes descriptive: ${JSON.stringify(msg)}`, () => {
    const r = checkMessage(msg, config);
    assert.equal(r.flagged, false, `expected pass; reasons: ${r.reasons}`);
  });
}

test("flags identical-to-previous", () => {
  const r = checkMessage("Add login route", config, "Add login route");
  assert.equal(r.flagged, true);
  assert.ok(r.reasons.some((x) => x.includes("identical")));
});

test("does not flag when different from previous", () => {
  const r = checkMessage("Add logout route", config, "Add login route");
  assert.equal(r.flagged, false);
});

test("uses the first non-comment line as the subject", () => {
  const msg = "# this is a comment\n\nAdd retry logic to payment client";
  const r = checkMessage(msg, config);
  assert.equal(r.flagged, false);
});
