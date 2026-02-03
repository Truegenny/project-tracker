#!/bin/sh
set -e

REPO_URL="https://github.com/Truegenny/project-tracker.git"
WEB_DIR="/usr/share/nginx/html"

echo "Pulling latest from GitHub..."
cd /tmp
rm -rf repo
git clone --depth 1 $REPO_URL repo
cp repo/index.html repo/app.js $WEB_DIR/
rm -rf repo
echo "Updated to latest version"

exec nginx -g "daemon off;"
