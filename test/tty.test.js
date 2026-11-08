import assert from "node:assert/strict";
import { test } from "node:test";
import { confirmTty, isCI } from "../dist/lib/tty.js";

test("isCI recognizes the values CI systems set", () => {
  for (const CI of ["true", "1", "TRUE", "yes", " true "]) {
    assert.equal(isCI({ CI }), true, `CI=${JSON.stringify(CI)}`);
  }
});

test("isCI is false when CI is unset, empty, 0, or false", () => {
  assert.equal(isCI({}), false);
  for (const CI of ["", "  ", "0", "false", "False"]) {
    assert.equal(isCI({ CI }), false, `CI=${JSON.stringify(CI)}`);
  }
});

test("under CI, confirmTty returns the no-terminal default without prompting", () => {
  const saved = process.env.CI;
  process.env.CI = "true";
  try {
    assert.equal(confirmTty("Commit anyway? ", true), true);
    assert.equal(confirmTty("Commit anyway? ", false), false);
  } finally {
    if (saved === undefined) delete process.env.CI;
    else process.env.CI = saved;
  }
});
