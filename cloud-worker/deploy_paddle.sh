#!/bin/bash
# deploy_paddle.sh — Configure Paddle secrets and deploy to Cloudflare Worker
#
# Usage:
#   ./deploy_paddle.sh sandbox    # Configure sandbox secrets
#   ./deploy_paddle.sh production # Configure production secrets
#   ./deploy_paddle.sh status     # Check current secret status
#
# Prerequisites:
#   - Run paddle_setup.js first to create products and get price IDs
#   - wrangler CLI installed and authenticated
#   - Price IDs file at /tmp/paddle_price_ids.json (from paddle_setup.js)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

ENV="${1:-sandbox}"
PRICE_IDS_FILE="/tmp/paddle_price_ids.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}🚀 Paddle Deployment Script — ${ENV}${NC}\n"

# ── Status check ──
if [ "$ENV" = "status" ]; then
  echo "Checking wrangler secrets..."
  npx wrangler secret list 2>&1 | grep -E "PADDLE|LLM|CLERK" || echo "No Paddle secrets found"
  exit 0
fi

# ── Validate ──
if ! command -v npx &> /dev/null; then
  echo -e "${RED}❌ npx not found. Install Node.js first.${NC}"
  exit 1
fi

if [ ! -f "$PRICE_IDS_FILE" ]; then
  echo -e "${YELLOW}⚠️  Price IDs file not found at $PRICE_IDS_FILE${NC}"
  echo -e "   Run paddle_setup.js first:"
  echo -e "   ${CYAN}node paddle_setup.js${NC}"
  echo ""

  # Allow manual entry
  read -p "Enter price IDs manually? (y/N): " manual
  if [ "$manual" != "y" ] && [ "$manual" != "Y" ]; then
    exit 1
  fi

  echo ""
  read -p "PADDLE_API_KEY (paddle_...): " PADDLE_API_KEY
  read -p "PADDLE_PRICE_PRO_MONTHLY (pri_...): " PADDLE_PRICE_PRO_MONTHLY
  read -p "PADDLE_PRICE_PRO_YEARLY (pri_...): " PADDLE_PRICE_PRO_YEARLY
  read -p "PADDLE_PRICE_CREDITS_100 (pri_...): " PADDLE_PRICE_CREDITS_100
  read -p "PADDLE_PRICE_CREDITS_500 (pri_...): " PADDLE_PRICE_CREDITS_500
  read -p "PADDLE_WEBHOOK_SECRET (whsec_...): " PADDLE_WEBHOOK_SECRET
else
  # Read from file
  PADDLE_API_KEY=$(python3 -c "import json; d=json.load(open('$PRICE_IDS_FILE')); print(d.get('PADDLE_API_KEY',''))")
  PADDLE_PRICE_PRO_MONTHLY=$(python3 -c "import json; d=json.load(open('$PRICE_IDS_FILE')); print(d.get('PADDLE_PRICE_PRO_MONTHLY',''))")
  PADDLE_PRICE_PRO_YEARLY=$(python3 -c "import json; d=json.load(open('$PRICE_IDS_FILE')); print(d.get('PADDLE_PRICE_PRO_YEARLY',''))")
  PADDLE_PRICE_CREDITS_100=$(python3 -c "import json; d=json.load(open('$PRICE_IDS_FILE')); print(d.get('PADDLE_PRICE_CREDITS_100',''))")
  PADDLE_PRICE_CREDITS_500=$(python3 -c "import json; d=json.load(open('$PRICE_IDS_FILE')); print(d.get('PADDLE_PRICE_CREDITS_500',''))")
fi

# Validate required values
if [ -z "$PADDLE_API_KEY" ] || [ -z "$PADDLE_PRICE_PRO_MONTHLY" ]; then
  echo -e "${RED}❌ Missing required values. Need at least PADDLE_API_KEY and PADDLE_PRICE_PRO_MONTHLY.${NC}"
  exit 1
fi

# Webhook secret (always prompt if not in file)
if [ -z "$PADDLE_WEBHOOK_SECRET" ]; then
  echo -e "\n${YELLOW}PADDLE_WEBHOOK_SECRET not found in price IDs file.${NC}"
  echo "Get it from: Paddle dashboard → Developer Tools → Webhooks → Create webhook"
  echo "Webhook URL: https://api.welian.app/ai/paddle/webhook"
  echo ""
  read -p "Enter PADDLE_WEBHOOK_SECRET (whsec_...): " PADDLE_WEBHOOK_SECRET
fi

echo -e "\n${GREEN}📋 Values to configure:${NC}"
echo "  PADDLE_API_KEY:           ${PADDLE_API_KEY:0:15}..."
echo "  PADDLE_PRICE_PRO_MONTHLY: $PADDLE_PRICE_PRO_MONTHLY"
echo "  PADDLE_PRICE_PRO_YEARLY:  $PADDLE_PRICE_PRO_YEARLY"
echo "  PADDLE_PRICE_CREDITS_100: $PADDLE_PRICE_CREDITS_100"
echo "  PADDLE_PRICE_CREDITS_500: $PADDLE_PRICE_CREDITS_500"
echo "  PADDLE_WEBHOOK_SECRET:    ${PADDLE_WEBHOOK_SECRET:0:10}..."
echo "  PADDLE_ENVIRONMENT:       $ENV"
echo ""

read -p "Proceed with setting secrets? (y/N): " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Aborted."
  exit 0
fi

# ── Set wrangler secrets ──
echo -e "\n${CYAN}🔐 Setting wrangler secrets...${NC}"

set_secret() {
  local name="$1"
  local value="$2"
  if [ -z "$value" ]; then
    echo -e "  ${YELLOW}⚠️  Skipping $name (empty)${NC}"
    return
  fi
  echo -n "  Setting $name... "
  echo "$value" | npx wrangler secret put "$name" 2>&1 | grep -v "^$" || true
  echo -e "${GREEN}✓${NC}"
}

set_secret "PADDLE_API_KEY" "$PADDLE_API_KEY"
set_secret "PADDLE_PRICE_PRO_MONTHLY" "$PADDLE_PRICE_PRO_MONTHLY"
set_secret "PADDLE_PRICE_PRO_YEARLY" "$PADDLE_PRICE_PRO_YEARLY"
set_secret "PADDLE_PRICE_CREDITS_100" "$PADDLE_PRICE_CREDITS_100"
set_secret "PADDLE_PRICE_CREDITS_500" "$PADDLE_PRICE_CREDITS_500"
set_secret "PADDLE_WEBHOOK_SECRET" "$PADDLE_WEBHOOK_SECRET"

# ── Update wrangler.toml PADDLE_ENVIRONMENT ──
echo -e "\n${CYAN}📝 Updating wrangler.toml...${NC}"
if [ "$ENV" = "production" ]; then
  sed -i.bak 's/PADDLE_ENVIRONMENT = "sandbox"/PADDLE_ENVIRONMENT = "production"/' wrangler.toml
  echo -e "  ${GREEN}✓ PADDLE_ENVIRONMENT set to production${NC}"
else
  sed -i.bak 's/PADDLE_ENVIRONMENT = "production"/PADDLE_ENVIRONMENT = "sandbox"/' wrangler.toml
  echo -e "  ${GREEN}✓ PADDLE_ENVIRONMENT set to sandbox${NC}"
fi

# ── Update frontend Paddle environment ──
echo -e "\n${CYAN}📝 Updating frontend Paddle init...${NC}"
INDEX_HTML="$SCRIPT_DIR/../public/index.html"

if [ -f "$INDEX_HTML" ]; then
  if [ "$ENV" = "production" ]; then
    # Need production client-side token from Paddle dashboard
    echo -e "  ${YELLOW}⚠️  For production, update Paddle.Initialize token in index.html${NC}"
    echo -e "  Get client-side token from: Paddle dashboard → Developer Tools → Authentication"
    echo -e "  Current: Paddle.Initialize({ token: \"test_...\" })"
    read -p "  Enter production client-side token: " CLIENT_TOKEN
    if [ -n "$CLIENT_TOKEN" ]; then
      sed -i.bak "s/Paddle.Environment.set(\"sandbox\")/Paddle.Environment.set(\"production\")/" "$INDEX_HTML"
      sed -i.bak "s/Paddle.Initialize({ token: \"[^\"]*\" })/Paddle.Initialize({ token: \"$CLIENT_TOKEN\" })/" "$INDEX_HTML"
      echo -e "  ${GREEN}✓ Frontend updated to production${NC}"
    fi
  else
    sed -i.bak "s/Paddle.Environment.set(\"production\")/Paddle.Environment.set(\"sandbox\")/" "$INDEX_HTML"
    echo -e "  ${GREEN}✓ Frontend set to sandbox${NC}"
  fi
else
  echo -e "  ${YELLOW}⚠️  index.html not found at $INDEX_HTML${NC}"
fi

# ── Deploy worker ──
echo -e "\n${CYAN}🚢 Deploying Cloudflare Worker...${NC}"
npx wrangler deploy 2>&1 || true

# ── Deploy frontend ──
echo -e "\n${CYAN}🚢 Deploying frontend (Cloudflare Pages)...${NC}"
cd "$SCRIPT_DIR/.."
if [ -f "scripts/deploy.cjs" ]; then
  node scripts/deploy.cjs 2>&1 || echo -e "  ${YELLOW}⚠️  Frontend deploy failed (may need manual run)${NC}"
else
  echo -e "  ${YELLOW}⚠️  No deploy script found. Deploy manually.${NC}"
fi

echo -e "\n${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Paddle deployment complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "Next steps:"
echo "  1. Configure webhook in Paddle dashboard:"
echo "     URL: https://api.welian.app/ai/paddle/webhook"
echo "     Events: transaction.completed, subscription.created, subscription.updated, subscription.canceled"
echo ""
echo "  2. Test checkout at https://welian.app"
echo ""
echo "  3. Verify webhook signature:"
echo "     curl https://api.welian.app/ai/paddle/webhook -X POST -d '{}' -H 'Content-Type: application/json'"
echo "     (Should return 401 — signature verification failed, which means it's working)"
