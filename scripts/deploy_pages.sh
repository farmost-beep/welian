#!/bin/bash
# Deploy public/ to Cloudflare Pages
# Usage: bash scripts/deploy_pages.sh
# Note: NODE_OPTIONS forces TLSv1.2 to work around ECONNRESET on macOS
cd "$(dirname "$0")/.."
NODE_OPTIONS="--tls-min-v1.2 --tls-max-v1.2" npx wrangler pages deploy public/ --project-name=welian --commit-dirty=true
