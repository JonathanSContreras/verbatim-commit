import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG, loadConfig } from "../dist/config.js";

function tempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

test("precedence: defaults < global < repo", () => {
  const home = tempDir("aic-home-");
  mkdirSync(join(home, ".verbatim"), { recursive: true });
  writeFileSync(
    join(home, ".verbatim", "config.json"),
    JSON.stringify({ model: "global-model", messageFormat: "conventional", minWordCount: 5 }),
  );
  process.env.VERBATIM_HOME = join(home, ".verbatim");

  const repo = tempDir("aic-repo-");
  mkdirSync(join(repo, ".git"), { recursive: true });
  writeFileSync(
    join(repo, ".verbatimrc"),
    JSON.stringify({ messageFormat: "plain", minWordCount: 2, contextWindow: { "custom:7b": 5000 } }),
  );

  const cfg = loadConfig(repo);
  assert.equal(cfg.model, "global-model"); // from global
  assert.equal(cfg.messageFormat, "plain"); // repo overrides global
  assert.equal(cfg.minWordCount, 2); // repo overrides global
  assert.equal(cfg.hookEnabled, true); // default retained
  assert.equal(cfg.contextWindow["custom:7b"], 5000); // repo-added model
  assert.equal(cfg.contextWindow["gemma3:4b"], 128000); // default model merged in

  delete process.env.VERBATIM_HOME;
});

test("per-repo config found from a subdirectory", () => {
  process.env.VERBATIM_HOME = tempDir("aic-empty-"); // no global config
  const repo = tempDir("aic-repo-");
  mkdirSync(join(repo, ".git"), { recursive: true });
  writeFileSync(join(repo, ".verbatimrc"), JSON.stringify({ minWordCount: 7 }));
  const sub = join(repo, "src", "deep");
  mkdirSync(sub, { recursive: true });

  const cfg = loadConfig(sub);
  assert.equal(cfg.minWordCount, 7);

  delete process.env.VERBATIM_HOME;
});

test("invalid JSON is ignored, defaults retained", () => {
  process.env.VERBATIM_HOME = tempDir("aic-empty-");
  const repo = tempDir("aic-repo-");
  mkdirSync(join(repo, ".git"), { recursive: true });
  writeFileSync(join(repo, ".verbatimrc"), "{ not valid json ");

  const cfg = loadConfig(repo);
  assert.equal(cfg.minWordCount, 3); // default

  delete process.env.VERBATIM_HOME;
});

test("malformed values are sanitized to defaults", () => {
  process.env.VERBATIM_HOME = tempDir("aic-empty-");
  const repo = tempDir("aic-repo-");
  mkdirSync(join(repo, ".git"), { recursive: true });
  writeFileSync(
    join(repo, ".verbatimrc"),
    JSON.stringify({ messageFormat: "bogus", diffBudgetFraction: 9, minWordCount: -1 }),
  );

  const cfg = loadConfig(repo);
  assert.equal(cfg.messageFormat, DEFAULT_CONFIG.messageFormat);
  assert.equal(cfg.diffBudgetFraction, DEFAULT_CONFIG.diffBudgetFraction);
  assert.equal(cfg.minWordCount, DEFAULT_CONFIG.minWordCount);

  delete process.env.VERBATIM_HOME;
});
