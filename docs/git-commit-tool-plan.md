# AI Commit Tool — Project Plan

## Overview
A local-first CLI tool with two modes:
1. **Generate mode** — reads staged git diff, generates a commit message using a local LLM (Gemma via Ollama), and commits on confirmation.
2. **Verify mode** — runs as a `commit-msg` git hook, checks any commit message (manual or generated) for low-effort messages, and warns (soft block) without hard-blocking the commit.

Built for personal use; potential second user is a senior engineer colleague. No telemetry, no cloud dependency required, no monetization.

---

## Cross-Platform Compatibility (macOS / Linux / Windows)

Hard requirement: must work on all three. Specific spots in this design that need care:

1. **`/dev/tty` is Unix-only** — and it's the load-bearing piece of the hook prompt (Flow 2, step 5). `tty.ts` becomes a **platform abstraction**: `/dev/tty` on POSIX, `CONIN$`/`CONOUT$` on Windows. The rest of the code only talks to that interface. This is the single biggest cross-platform risk in the plan.
2. **Hook script** — `hooks/commit-msg` works on Windows because Git for Windows runs hooks through its bundled bash, *but* it must be **LF-ended** and a **thin shim** only: it calls `<tool> verify "$1"` and nothing else. All real logic lives in Node, not the shell script.
3. **Paths & home dir** — resolve `~/.yourtool/` via `os.homedir()` + `path.join`; never hardcode `/` separators or `$HOME`.
4. **`child_process`** — use `spawn`/`execFile` with **argument arrays**, never shell command strings. Avoids quoting differences across `zsh`/`bash`/`cmd.exe` (and is safer). Git's own CLI behaves consistently cross-platform.
5. **Line endings** — commit message files and diffs may be CRLF on Windows. Normalize CRLF→LF before heuristic parsing (word count, blocklist matching) so checks behave identically across platforms.

---

## Goals
- Reduce friction of writing commit messages day-to-day.
- Catch low-effort commit messages ("quick fix", "wip", "update") before they land in history.
- Keep everything local — diffs and messages never leave the machine unless the user explicitly configures a cloud provider.
- Keep the LLM backend swappable (Ollama by default; optionally Claude/OpenAI API later).
- Non-intrusive: soft warnings, not hard blocks. Should never feel like a CI gate.

## Non-goals (v1)
- Not building this for distribution/sale.
- Not doing diff-quality checks (large diffs, missing tests, debug logs) — message-quality only for v1.
- Not building team-wide commit-style learning yet (stretch goal, not required).

---

## Tech Stack
- **Language:** TypeScript / Node.js (CLI)
- **LLM runtime:** Ollama (local), model: Gemma (start with 4B variant, keep swappable)
- **Git interaction:** shell out to `git diff --staged`, `git log`, etc. via `child_process`
- **CLI framework:** something lightweight (e.g. `commander` or `yargs`)
- **Install/distribution:** npm-installable globally for personal use (`npm link` or local global install); no publishing required
- **Node version:** pin a minimum in `package.json` `engines` (e.g. `"node": ">=18"`) so behavior is reproducible across machines/platforms — avoids "works on my machine" drift between users.

### Testing strategy
Keep it light (personal tool), but make the logic worth testing actually testable:
- **Highest-value surface:** heuristics, tested against known-good/known-bad sample messages.
- **Keep core logic pure & mockable:** diff budgeting, message parsing, and config merging as pure functions; push I/O (git calls, Ollama HTTP, tty) to the edges so it can be mocked. No need to spin up a real repo or Ollama to test the logic.

> **TODO: pick a tool name.** Placeholder `yourtool` / `~/.yourtool/` used throughout this doc. Affects binary name, config dir, and package name.

### Distribution & per-project context
- **Onboarding:** `git clone … && npm install && npm run build && npm link` puts the command on `PATH` globally. Any repo can then use it; the `commit-msg` hook calls the command *by name* (no absolute paths baked in, no per-repo `node_modules`).
- **Per-project context (no mixing):** the tool always operates on `process.cwd()`'s git repo, reading `git diff/log/branch` (and later `CONTRIBUTING.md`) fresh on every invocation — never caching repo state across runs. This is how git itself stays repo-scoped, and it's what keeps two projects' context from bleeding into each other.
- **Hook install — two models:**
  - **Per-repo (default):** a `<tool> install-hook` command writes `.git/hooks/commit-msg` in the current repo. Explicit; won't silently clobber Husky/other existing hooks.
  - **All-repos (opt-in):** `git config --global core.hooksPath ~/.<tool>/hooks` once applies to every repo on the machine. Deliberate opt-in only — it *overrides* per-repo hooks.

---

## Architecture

```
yourtool/
├── src/
│   ├── cli.ts              # entry point, command routing
│   ├── commands/
│   │   ├── gen.ts          # generate mode
│   │   └── verify.ts       # verify mode (called by git hook)
│   ├── lib/
│   │   ├── git.ts          # git diff/log/commit helpers
│   │   ├── ollama.ts       # Ollama API client wrapper
│   │   ├── prompts.ts      # prompt templates for gen + verify
│   │   ├── heuristics.ts   # fast rule-based message checks
│   │   └── tty.ts          # cross-platform tty prompt helper (/dev/tty on POSIX, CONIN$/CONOUT$ on Windows)
│   └── config.ts           # model selection, thresholds, blocklist
├── hooks/
│   └── commit-msg          # shell script installed into .git/hooks
├── package.json
└── README.md
```

---

## Flow 1: Generate Mode

**Command:** `yourtool gen`

1. User stages changes (`git add .`) as normal.
2. Tool runs `git diff --staged` to get exactly what's about to be committed.
3. Tool builds a prompt wrapping the (budgeted, see Diff Budgeting below) diff: "Summarize this diff into a concise, descriptive commit message." Includes branch name + last 3–5 commit subjects from `git log` for style context (cheap, bounded size — see Repo-Aware Context below).
4. Prompt sent to local Ollama instance (`localhost:11434`) running Gemma.
   - **If Ollama isn't running / unreachable:** fail with a clear, actionable error (e.g. `Ollama not reachable at localhost:11434 — is it running? Try: ollama serve`) and exit non-zero. This is the most common real-world break, so it gets a defined failure mode rather than a stack trace.
5. Model returns a candidate commit message (subject, optionally + body).
6. Before displaying the message, tool runs the same heuristic pass used by verify mode (`heuristics.ts`) against the generated message.
   - If flagged, show the message with a warning annotation alongside the normal prompt (does not auto-regenerate):
     ```
     ⚠️  Generated message looks weak: "update stuff"
     Reason: matches low-effort phrase blocklist.
     Use this message? (y/n/edit)
     ```
   - If not flagged, show the normal prompt:
     ```
     Generated: "Add null check to auth middleware to prevent crash on missing token"
     Use this message? (y/n/edit)
     ```
7. On confirm → runs `git commit -m "<message>"`.
8. On reject → regenerate or allow manual edit before committing.

**Note:** this is a convenience check, not the enforcement point — the `commit-msg` hook (Flow 2) is still what actually fires regardless of whether the message came from `gen` or was typed manually, so there's still one clear place where a flagged message can hard-stop a commit.

**Key UX rule:** never auto-commit without human confirmation.

---

## Diff Budgeting (large diffs)

Sizing the diff sent to the model is tied to the configured model's context window, not a fixed cap — different models (or future provider swaps) have very different headroom (e.g. Gemma 3 4B has a 128K-token context window).

1. **Filter first, always** — strip lockfiles (`package-lock.json`, `yarn.lock`, etc.), binary diffs, and vendored/generated paths from the diff before sizing it. Pure noise regardless of model.
2. **Per-model token budget in config** — `config.ts` holds a `contextWindow` lookup per model name (e.g. `gemma3:4b` → `128000`). The diff budget is `contextWindow * diffBudgetFraction` (default 50%) **minus an estimated response reserve** (~1–2k tokens), leaving headroom for the prompt template, repo-aware context, and — critically — the model's own output so the generated message can't get truncated mid-sentence. With defaults (`128k * 0.5 = 64k`), the response reserve is a rounding error against the budget and nearly all real commits fit completely, so this is a reliability win at negligible quality cost. Swapping models in config automatically changes how much diff gets sent.
3. **Small diff (fits in budget) → send it in full**, verbatim, no summarization. This covers most day-to-day commits.
4. **Diff exceeds budget → per-file summarization, not blind truncation:** for each changed file, include the path + insertion/deletion counts; give full hunks to small files, and trim only the largest files (e.g. first/last N lines per hunk). Insert an explicit `[N lines omitted]` marker wherever content is cut, so the model doesn't silently guess at unseen changes.

---

## Repo-Aware Context (v1 scope)

Beyond the raw diff, the prompt includes lightweight repo context to make output more tailored:
- **Branch name** — often encodes intent (`fix/auth-null-check`, `feat/payment-retry`).
- **Recent commit history** (last 3–5 subjects via `git log`) — gives the model a feel for this repo's existing tone/style (plain vs. conventional, terse vs. descriptive).

Both are cheap (bounded, small token cost) and already partially scoped, so they ship in v1.

**Deferred to v2:** parsing `CONTRIBUTING.md` (or similar style docs) for explicit commit conventions. Not every repo has one, format varies wildly, and reliably extracting "style guidance" from arbitrary free text is its own sub-problem — fits better alongside the existing team-wide commit-style learning stretch goal than v1's personal-use scope.

---

## Flow 2: Verify Mode (commit-msg hook)

**Trigger:** Git's native `commit-msg` hook, fired after a message is written (manually or via `gen`), before the commit object is created.

1. Git invokes `.git/hooks/commit-msg <path-to-message-file>`.
2. Hook script reads the message text from that file.
3. **Heuristic pass (fast, no LLM call):**
   - Word count below threshold (e.g. < 4–5 words)
   - Matches blocklist of low-effort phrases: "quick fix", "wip", "update", "fix", "stuff", "changes", "asdf", etc.
   - Identical to previous commit message *(v1: simple check only; **revisit later** to exempt legit `--amend`/rebase/squash workflows that can reproduce a prior subject)*
4. **Optional LLM pass:** if heuristics pass but a second opinion is wanted, send the message (+ diff for context) to Gemma: "Is this commit message descriptive of an actual code change, or vague/low-effort?"
   - **Note:** the `commit-msg` hook only receives the *message file path*, not the diff. The hook (or `verify`) must run `git diff --cached` itself at this point to get the diff — it's still staged and available at commit-msg time.
   - Disabled by default (`llmVerifyEnabled: false`) — the hook fires on every commit, and an LLM call adds seconds of latency to something that should feel instant. Heuristics already catch the obvious cases; this is an opt-in "second opinion" toggle.
5. **If flagged:** print a warning and prompt for override via `/dev/tty` (since stdin is occupied by git during hooks):
   ```
   ⚠️  This commit message looks weak: "quick fix"
   Reason: doesn't describe what changed.
   Commit anyway? (y/n)
   ```
6. **Exit behavior:**
   - Message passes cleanly → exit 0 immediately, no interruption.
   - Flagged + user says "no" → exit non-zero, git aborts commit.
   - Flagged + user says "yes" → exit 0, commit proceeds.
   - **Default on empty input (Enter):** prompt is `(y/N)` — Enter aborts. **Resolved:** the lazy/reflexive keystroke nudges toward writing a better message; overriding is still one keystroke (`y`). Soft means *easy to override*, which one keystroke satisfies, not *defaults to letting weak messages through*.
   - **No controlling terminal** (CI, GUI git clients, scripts) → no prompt; commit always proceeds, so automation is never blocked.

**Key UX rule:** soft warning, not a hard block by default — avoid the tool becoming something that gets `--no-verify`'d into irrelevance.

---

## Config (v1)

**Precedence:** load global config (`~/.yourtool/config.json`) first, then **deep-merge per-repo config (`.yourtoolrc`) on top, key by key**. A repo can override just `messageFormat` and inherit everything else. Use case: relaxed side projects vs. conventional/strict work projects.

Controls:
- `model`: which Ollama model to use (default `gemma:4b` or similar)
- `minWordCount`: threshold for heuristic check
- `blocklist`: array of banned phrases (user-editable)
- `llmVerifyEnabled`: bool — whether to call the LLM for a second-pass check or rely on heuristics only (**default `false`**, see Flow 2 step 4)
- `hookEnabled`: bool — easy way to toggle verify mode on/off without uninstalling
- `messageFormat`: `"plain"` (default) or `"conventional"` — controls whether the gen prompt asks Gemma for a plain descriptive subject or a Conventional Commits–style prefix (`feat:`, `fix:`, etc.)
- `contextWindow`: per-model token-budget lookup (e.g. `{ "gemma3:4b": 128000 }`), used by the diff-budgeting logic (see Diff Budgeting section)
- `diffBudgetFraction`: fraction of the model's context window reserved for diff content (default `0.5`)

---

## Known Issues / Prompt Tuning (for milestone 9 polish)
- **Model occasionally dumps raw code into the message body.** Observed with `gemma3:4b`: e.g. a generated message whose body was a verbatim line of the diff (`export function retry(fn){...}`). Harmless to heuristics (they judge the subject only) but ugly. Fix via prompt tuning — explicitly instruct the model not to include code/diff lines in the body, and/or post-process to strip body lines that look like code. Revisit during milestone 9.

---

## Build Order (suggested milestones)

1. **CLI skeleton** — basic `yourtool gen` command that reads staged diff and prints it (no LLM yet). Confirms git plumbing works.
2. **Ollama integration** — wire up `gen` to actually call Gemma and return a message. Includes diff budgeting (`contextWindow`/`diffBudgetFraction` lookup + per-file summarization fallback) and repo-aware context (branch name + recent commit subjects) in the prompt, since both only matter once real diffs are being sent.
3. **Confirm/commit loop** — add the y/n/edit prompt and actual `git commit -m` execution.
4. **Heuristic verifier** — build `heuristics.ts`, test against a list of known-bad and known-good sample messages.
5. **Hook installation** — script to install `commit-msg` hook into `.git/hooks/`, wire it to call `yourtool verify`.
6. **LLM-backed verify pass** — add optional second-pass check using Gemma.
7. **Interactive prompt in hook context** — test that y/n override actually works inside a real hook invocation (the trickiest plumbing piece). Build `tty.ts` as a platform abstraction here: `/dev/tty` on POSIX, `CONIN$`/`CONOUT$` on Windows. Test on at least one Windows environment, since this is the main cross-platform risk.
8. **Config file support** — externalize thresholds/blocklist/model selection.
9. **Polish** — README, install script, maybe a demo recording for portfolio use.

---

## Open Questions to Resolve While Building
- ~~Should `gen` mode also run the verify check automatically before showing the message to the user, or only via the git hook?~~ **Resolved:** `gen` runs the heuristic pass too (see Flow 1, step 6) and annotates the prompt with a warning if flagged, but the `commit-msg` hook remains the sole hard-enforcement point.
- ~~Prompt format for Gemma: plain message only, or conventional-commit style?~~ **Resolved:** configurable via `messageFormat`, default `"plain"`.
- ~~How much diff to send to the model on large diffs — truncate, summarize per-file, or just cap context size?~~ **Resolved:** see Diff Budgeting section — per-model token budget, full diff when it fits, per-file summarization with explicit omission markers when it doesn't.
- **Deferred (not required for v1):** logging flagged-but-overridden commits. When a message gets flagged (by `gen`'s heuristic pass or the `commit-msg` hook) and the user overrides the warning to commit anyway, optionally append a line (message + timestamp + which check flagged it) to a local log file (e.g. `~/.yourtool/overrides.log`). Purely for the user's own visibility into how often they're overriding warnings — not enforcement, not shared anywhere, not required to ship v1.

---

## Reference / Prior Art (for awareness, not copying)
- `aicommits` (Nutlope) — generate-only, multiple format types, multi-provider.
- `aicommit2` — multi-AI, diff compression, includes a code-review feature (closest existing analog to the verify idea).
- `git-commit-message` (tavernari) — Ollama-based, local-first, multiple model size variants.
- `LLMCommit` — speed-focused, full add+commit+push flow.
