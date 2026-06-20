#!/usr/bin/env node
import { Command } from "commander";
import { gen } from "./commands/gen.js";

const program = new Command();

program
  // TODO: "aicommit" is a placeholder name — see docs/git-commit-tool-plan.md
  .name("aicommit")
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

program.parseAsync(process.argv);
