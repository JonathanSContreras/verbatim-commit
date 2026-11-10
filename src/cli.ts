#!/usr/bin/env node
import { Command } from "commander";
import { gen } from "./commands/gen.js";
import { verify } from "./commands/verify.js";
import { installHook, uninstallHook } from "./commands/install-hook.js";
import { createRequire } from "node:module";

// Read the version from package.json (one level up from dist/) so it can't
// drift from what npm publishes. package.json always ships with the package.
const { version } = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

const program = new Command();

program
  .name("verbatim")
  .description(
    "Local-first AI commit message generator + low-effort commit verifier",
  )
  .version(version);

program
  .command("gen")
  .description("Generate a commit message from staged changes")
  .option(
    "-c, --context <text>",
    "why you made this change — shapes the message, never overrides the diff",
  )
  .action(async (opts: { context?: string }) => {
    const code = await gen(opts);
    process.exit(code);
  });

program
  .command("verify <messageFile>")
  .description("Check a commit message (used by the commit-msg hook)")
  .action(async (messageFile: string) => {
    const code = await verify(messageFile);
    process.exit(code);
  });

program
  .command("install-hook")
  .description("Install the commit-msg hook into the current repo")
  .option("-f, --force", "overwrite an existing commit-msg hook")
  .action(async (opts: { force?: boolean }) => {
    const code = await installHook(opts);
    process.exit(code);
  });

program
  .command("uninstall-hook")
  .description("Remove the commit-msg hook from the current repo")
  .action(async () => {
    const code = await uninstallHook();
    process.exit(code);
  });

program.parseAsync(process.argv);
