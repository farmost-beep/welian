#!/bin/bash
# Sync prompt md files from cloud-worker/prompts/ to Cloudflare KV
# Usage: bash prompts/sync.sh

set -e
cd "$(dirname "$0")/.."

for f in prompts/*.md; do
  name=$(basename "$f")
  echo "Uploading $name to KV (prompt:$name)..."
  npx wrangler kv key put --binding=USER_DATA --preview=false --remote "prompt:$name" --path="$f"
  echo "  ✅ $name synced"
done

echo ""
echo "All prompts synced. Worker will pick up changes within 5 minutes (cache TTL)."
