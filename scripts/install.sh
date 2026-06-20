#!/bin/sh
# Build aicommit and link it onto your PATH.
# After this, run `aicommit install-hook` inside any repo to enable verify mode.
set -e

cd "$(dirname "$0")/.."

echo "Installing dependencies…"
npm install

echo "Building…"
npm run build

echo "Linking 'aicommit' onto your PATH…"
npm link

echo ""
echo "✓ Done. Try:  aicommit --help"
echo "  In a repo:  aicommit gen           # generate a commit message"
echo "              aicommit install-hook  # enable the commit-msg check"
