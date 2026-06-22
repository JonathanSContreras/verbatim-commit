#!/usr/bin/env node
import { Command } from "commander";
import { gen } from "./commands/gen.js";
import { verify } from "./commands/verify.js";
import { installHook, uninstallHook } from "./commands/install-hook.js";

const program = new Command();

program
  .name("verbatim")
  .description(
    "Local-first AI commit message generator + low-effort commit verifier",
  )
  .version("0.1.0");

program
  .command("gen")
  .description("Generate a commit message from staged changes")
  .action(async () => {
    const code = await gen();
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
