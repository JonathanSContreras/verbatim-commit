#!/bin/sh
# Build verbatim and link it onto your PATH.
# After this, run `verbatim install-hook` inside any repo to enable verify mode.
set -e

cd "$(dirname "$0")/.."

echo "Installing dependencies…"
npm install

echo "Building…"
npm run build

echo "Linking 'verbatim' onto your PATH…"
npm link

echo ""
echo "✓ Done. Try:  verbatim --help"
echo "  In a repo:  verbatim gen           # generate a commit message"
echo "              verbatim install-hook  # enable the commit-msg check"
