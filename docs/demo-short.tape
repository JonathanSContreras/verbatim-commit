# Short social demo (LinkedIn/TikTok) — render with:  vhs docs/demo-short.tape
# Recorded with safe (long) sleeps so interactive input stays in sync, then
# compressed via PlaybackSpeed so the final GIF is short. Requires `verbatim`
# on PATH + Ollama. Hook is installed off-screen; shows generate + wip-blocked.

Output docs/demo-short.gif

Set Shell "bash"
Set Theme "Catppuccin Mocha"
Set FontFamily "Menlo"
Set FontSize 18
Set Width 1200
Set Height 640
Set Padding 25
Set Margin 50
Set MarginFill "#313244"
Set BorderRadius 14
Set WindowBar "Colorful"
Set TypingSpeed 45ms
Set PlaybackSpeed 2.0

# ---------- hidden setup ----------
Hide
Type "export PS1='$ '" Enter
Type "rm -rf /tmp/shop && mkdir /tmp/shop && cd /tmp/shop" Enter
Type "git init -q && git config user.email demo@demo.dev && git config user.name Demo" Enter
Type "git commit -q --allow-empty -m init" Enter
Type "verbatim install-hook >/dev/null" Enter
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

# ---------- generate ----------
Type "verbatim gen" Enter
Sleep 6s
Type "y" Enter
Sleep 2s

# ---------- hook catches a lazy commit ----------
Type "git add tax.js && git commit -m 'wip'" Enter
Sleep 2s
Type "n" Enter
Sleep 2s
