#!/bin/sh
# בנייה ופריסה לענף gh-pages
set -e
cd "$(dirname "$0")"
npx vite build
cd dist
[ -n "$CNAME" ] && echo "$CNAME" > CNAME
touch .nojekyll
git init -q -b gh-pages
git add -A
git commit -qm "deploy $(date +%Y-%m-%d_%H:%M)"
git push -qf https://github.com/nirbosco/masa-map.git gh-pages
rm -rf .git
echo deployed
