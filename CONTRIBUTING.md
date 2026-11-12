# Contributing to Verbatim Commit

Thanks for taking a look. This is a small, solo-maintained project, so
contributions of any size help — bug reports, prompt tweaks, docs fixes, or code.
If you're new here, issues labeled
[`good first issue`](https://github.com/JonathanSContreras/verbatim-commit/labels/good%20first%20issue)
are a good place to start.

## Setup

You need Git, Node.js 18 or newer, and (for anything touching generation)
[Ollama](https://ollama.com) with a model pulled.

```sh
git clone https://github.com/JonathanSContreras/verbatim-commit.git
cd verbatim-commit
npm install
npm run build      # compile src/ to dist/
npm link           # puts your local build on PATH as `verbatim`
```

`verbatim` runs from the compiled `dist/`, so rebuild after editing `src/`
(`npm run build`, or `npm run dev` to watch).

## Tests

```sh
npm test           # build + run every test in test/
```

The tests are pure — no Ollama, no terminal — so they run anywhere, and CI runs
them on Linux, macOS, and Windows against Node 18, 24, and 26. Anything that needs
a real terminal or a running model is covered by hand; for Windows, see the
[testing checklist](docs/windows-testing.md).

## Where things live

| Path | What it does |
|---|---|
| `src/cli.ts` | Command-line entry point (commander) |
| `src/commands/` | One file per command: `gen`, `verify` (the hook), `install-hook` |
| `src/lib/prompts.ts` | The prompts sent to the model |
| `src/lib/heuristics.ts` | The low-effort message rules the hook checks |
| `src/lib/diff.ts` | Fitting large diffs into the model's context window |
| `src/lib/tty.ts` | Reading the terminal during a hook (`/dev/tty`, `CONIN$`) |
| `src/config.ts` | Defaults and config loading |
| `test/` | `node:test` suites, named after the module they cover |

## Commit messages

This is a commit message tool, so the repo tries to practice what it preaches:

- Use [Conventional Commits](https://www.conventionalcommits.org/) prefixes
  (`feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`, `refactor:`), with an
  optional scope: `fix(hook): ...`.
- Write the subject in the imperative and say what changed:
  `fix(gen): keep the body when the model omits a blank line`, not `fix bug`.
- One logical change per commit. A fix and the test that covers it can go
  together; an unrelated cleanup gets its own commit.
- Use the body to explain *why* when it isn't obvious from the diff.

Installing the hook in your clone (`verbatim install-hook`) is a good way to
dogfood it.

## Pull requests

- Keep PRs focused on one thing; open an issue first for anything large so we can
  agree on the approach before you spend time on it.
- Add or update tests for behavior changes. CI must pass.
- Update the README if you change a command, option, or config key.
- **Prompt changes:** model output varies, so include a few before/after examples
  from real diffs, and the model you tested with. A prompt that helps one model can
  hurt another.
- AI-assisted contributions are welcome (this project is built that way), as long
  as you've read the change and can explain it.
- There needs to be a person behind every PR: someone who uses the tool or cares
  where it's going, and who will answer review comments. PRs opened by autonomous
  agents or for bounty platforms will be closed, however good the change is.
  Good first issues in particular are kept for people new to the project.

## Reporting bugs

Use the [bug report template](https://github.com/JonathanSContreras/verbatim-commit/issues/new/choose).
The most useful details are your OS, Node version, `verbatim --version`, and the
Ollama model you're running. For a bad generated message, the diff (or a
trimmed-down version of it) makes it much easier to reproduce.

## Response times

I'm one person, so I aim to reply to new issues and PRs within a day or two.
If something sits longer than that, a polite bump is welcome.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
