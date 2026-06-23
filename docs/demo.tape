# Verbatim Commit demo — render with:  vhs docs/demo.tape
# Produces docs/demo.gif. Requires `verbatim` on PATH (npm link) and Ollama running.
# Pre-warm the model first so the visible generation finishes within the Sleep:
#   ollama run "$(node -e 'import("./dist/config.js").then(m=>console.log(m.DEFAULT_CONFIG.model))')" 'hi' >/dev/null 2>&1

Output docs/demo.gif

Set Shell "bash"
Set Theme "Catppuccin Mocha"
Set FontFamily "Menlo"
Set FontSize 18
Set Width 1200
Set Height 760
Set Padding 25
Set Margin 50
Set MarginFill "#313244"
Set BorderRadius 14
Set WindowBar "Colorful"
Set TypingSpeed 55ms

# ---------- hidden setup (not recorded) ----------
Hide
Type "export PS1='$ '" Enter
Type "rm -rf /tmp/shop && mkdir /tmp/shop && cd /tmp/shop" Enter
Type "git init -q && git config user.email demo@demo.dev && git config user.name Demo" Enter
Type "git commit -q --allow-empty -m init" Enter
Type "cat > cart.js <<'EOF'" Enter
Type "export function addToCart(item, qty) {" Enter
Type "  if (qty <= 0) throw new Error('quantity must be positive');" Enter
Type "  return { ...item, qty };" Enter
Type "}" Enter
Type "EOF" Enter
Type "git add cart.js" Enter
Type "echo 'export const TAX_RATE = 0.0825;' > tax.js" Enter
Type "clear" Enter
Sleep 1s
Show

# ---------- 1. generate a commit message ----------
Sleep 1s
Type "verbatim gen" Enter
Sleep 6s
Type "y" Enter
Sleep 2500ms

# ---------- 2. enable the hook ----------
Type "verbatim install-hook" Enter
Sleep 2s

# ---------- 3. the hook catches a low-effort message ----------
Type "git add tax.js && git commit -m 'wip'" Enter
Sleep 2500ms
Type "n" Enter
Sleep 2500ms

# ---------- 4. a real message lands cleanly ----------
Type "git commit -m 'Add sales tax rate constant'" Enter
Sleep 3s
