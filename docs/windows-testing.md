# Windows testing checklist

Manual verification of Verbatim Commit on real Windows hardware. The one genuine
cross-platform risk is the interactive hook prompt, which reads the console
directly via `CONIN$`/`CONOUT$` instead of `/dev/tty` — **test that across
several terminals.** Everything else should "just work," but verify.

## Prerequisites
- [ ] **Node.js ≥ 18** installed (`node --version`)
- [ ] **Git for Windows** installed (provides the bash that runs git hooks)
- [ ] **Ollama for Windows** installed and running
- [ ] Model pulled: `ollama pull gemma3:4b`

## Build & link
- [ ] `npm install`
- [ ] `npm run build`
- [ ] `npm link` (or run `scripts/install.sh` from Git Bash)
- [ ] `verbatim --version` works from a new terminal (command is on PATH)

## Unit tests
- [ ] `npm test` → **45 passing** (these are pure; cross-platform-sensitive bits like path handling run here)

## Generate mode (`verbatim gen`)
Test in **both PowerShell and Git Bash** (and Windows Terminal if available):
- [ ] Stage a change, run `verbatim gen` → the `|/-\` **spinner shows** while generating (not a blank pause, not garbled glyphs)
- [ ] Candidate prints cleanly — **no boxes/garbled characters** (ASCII output: `!`, no emoji)
- [ ] `y` commits; `e` opens the editor (Notepad fallback or `%EDITOR%`); `r` regenerates; `q` aborts
- [ ] Non-interactive: `echo. | verbatim gen` prints the message and does **not** commit

## Verify hook — the key Windows risk
- [ ] `verbatim install-hook` → creates `.git\hooks\commit-msg`
- [ ] Open that hook file and confirm **LF line endings** and correct absolute paths to node + cli.js
- [ ] **Interactive prompt** — commit a weak message (`git commit -m "wip"`) from a terminal:
  - [ ] in **PowerShell** → `Commit anyway? (y/N)` appears and accepts `n` (aborts) / `y` (proceeds)
  - [ ] in **cmd.exe** → same
  - [ ] in **Git Bash** → same
  - [ ] in **Windows Terminal** → same
- [ ] **No-TTY path** — commit the same from a **GUI client** (GitHub Desktop, or VS Code's commit box) → it should **proceed without prompting** (never blocks automation/GUI)
- [ ] A good message (e.g. `git commit -m "Add config loader"`) commits silently — no prompt
- [ ] `verbatim uninstall-hook` removes it

## Config & paths
- [ ] Global config at `%USERPROFILE%\.verbatim\config.json` is read
- [ ] `VERBATIM_HOME` override is honored
- [ ] A per-repo `.verbatimrc` overrides global (e.g. set `messageFormat: "conventional"` and confirm gen output changes)
- [ ] No path-separator issues (hooks dir resolves, temp message files write/clean up)

## Notes
Record anything that misbehaves (terminal name + symptom). The most likely
trouble spots are the `CONIN$`/`CONOUT$` prompt and any path handling — both
flagged in the cross-platform section of `docs/git-commit-tool-plan.md`.
