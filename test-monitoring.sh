#!/bin/bash

# Test Script for Offline Transaction Monitoring System
# Usage: ./test-monitoring.sh

set -e

BASE_URL="http://localhost:3000"
API_BASE="${BASE_URL}/v1"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Offline Transaction Monitoring Test${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Check if JWT token is provided
if [ -z "$JWT_TOKEN" ]; then
    echo -e "${RED}❌ Error: JWT_TOKEN environment variable not set${NC}"
    echo -e "${YELLOW}Please set your JWT token:${NC}"
    echo -e "export JWT_TOKEN=\"eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImNrVTVON2xDUF9kQWZTeUp2U2ZxQ0VWSG1XaGswREQtRGZoNTdkdm5FbzQifQ.eyJzaWQiOiJjbWtna3RkemcwMXVmanIwYnViaDBzdDBpIiwiaXNzIjoicHJpdnkuaW8iLCJpYXQiOjE3Njg1NDk2NzksImF1ZCI6ImNtamIzd2FqbDAwN2hqeDBjenE5em5zZGYiLCJzdWIiOiJkaWQ6cHJpdnk6Y21qY203MnF4MDBkbmp1MGNnMDQyaDNyOSIsImV4cCI6MTc2ODU1MzI3OX0.Cgh0BOdNnEaw0wKq64sMKefmPQ0d6jLCfNwXob_YlBjWLXrdpaFCQ_tSSxJjOJTSgt5kaYhGCmEJMvNvWpvqiA\""
    echo ""
    echo -e "${YELLOW}Or get one from your auth endpoint:${NC}"
    echo "curl -X POST ${API_BASE}/auth/login -H \"Content-Type: application/json\" -d '{\"address\": \"your_wallet_address\"}'"
    exit 1
fi

# Check if wallet ID is provided
if [ -z "$WALLET_ID" ]; then
    echo -e "${RED}❌ Error: WALLET_ID environment variable not set${NC}"
    echo -e "${YELLOW}Please set your Privy wallet ID:${NC}"
    echo -e "export WALLET_ID=\"jo74tk0j1wnowhvt6uqnla1d\""
    echo ""
    echo -e "${YELLOW}Or get it from:${NC}"
    echo "curl -X POST ${API_BASE}/privy-transactions/test -H \"Authorization: Bearer \$JWT_TOKEN\""
    exit 1
fi

echo -e "${GREEN}✅ JWT Token: ${JWT_TOKEN:0:20}...${NC}"
echo -e "${GREEN}✅ Wallet ID: $WALLET_ID${NC}\n"

# Get current ETH price
CURRENT_PRICE=$(curl -s 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd' | jq '.ethereum.usd')
echo -e "${BLUE}Current ETH Price: \$${CURRENT_PRICE}${NC}\n"

# Test 1: Create a BUY limit order
echo -e "${BLUE}Test 1: Creating BUY limit order${NC}"
echo -e "${YELLOW}Order: Buy \$1 of ETH on Ethereum mainnet when price < \$3303${NC}"
echo -e "${YELLOW}Note: This is a TEST order. Transaction data is minimal for monitoring testing.${NC}\n"

BUY_ORDER=$(curl -s -X POST "${API_BASE}/privy-transactions/delegated" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "walletId": "'"$WALLET_ID"'",
    "transactionType": "limit_order",
    "transactionData": {
      "to": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      "value": "1000000000000000",
      "data": "0x",
      "chainId": 1
    },
    "executionConditions": {
      "targetPrice": 3310,
      "priceDirection": "below",
      "targetTokenSymbol": "ethereum",
      "expiresAt": "2026-02-01T00:00:00Z"
    },
    "metadata": {
      "description": "Test BUY: $1 of ETH when price < $3303"
    }
  }')

echo "$BUY_ORDER" | jq '.'

BUY_ORDER_ID=$(echo "$BUY_ORDER" | jq -r '.orderId // .data.orderId // empty')

if [ -z "$BUY_ORDER_ID" ]; then
    echo -e "${RED}❌ Failed to create BUY order${NC}"
    echo "$BUY_ORDER"
    exit 1
fi

echo -e "\n${GREEN}✅ BUY Order Created: $BUY_ORDER_ID${NC}\n"

# Wait a moment
sleep 2

# Test 2: Create a SELL limit order (linked)
echo -e "${BLUE}Test 2: Creating SELL limit order (linked to BUY)${NC}"
echo -e "${YELLOW}Order: Sell that \$1 of ETH on Ethereum mainnet when price > \$3304 (after BUY executes)${NC}"
echo -e "${YELLOW}This order will only activate AFTER the BUY order executes${NC}\n"

SELL_ORDER=$(curl -s -X POST "${API_BASE}/privy-transactions/delegated" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "walletId": "'"$WALLET_ID"'",
    "transactionType": "limit_order",
    "transactionData": {
      "to": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      "value": "1000000000000000",
      "data": "0x",
      "chainId": 1
    },
    "executionConditions": {
      "targetPrice": 3310.5,
      "priceDirection": "above",
      "targetTokenSymbol": "ethereum",
      "dependsOn": "'"$BUY_ORDER_ID"'",
      "expiresAt": "2026-03-01T00:00:00Z"
    },
    "metadata": {
      "description": "Test SELL: $1 of ETH when price > $3304"
    }
  }')

echo "$SELL_ORDER" | jq '.'

SELL_ORDER_ID=$(echo "$SELL_ORDER" | jq -r '.orderId // .data.orderId // empty')

if [ -z "$SELL_ORDER_ID" ]; then
    echo -e "${RED}❌ Failed to create SELL order${NC}"
    echo "$SELL_ORDER"
else
    echo -e "\n${GREEN}✅ SELL Order Created: $SELL_ORDER_ID${NC}\n"
fi

# Test 3: Get user orders
echo -e "${BLUE}Test 3: Fetching your orders${NC}\n"

ORDERS=$(curl -s -X GET "${API_BASE}/privy-transactions/orders" \
  -H "Authorization: Bearer $JWT_TOKEN")

echo "$ORDERS" | jq '.'

ORDER_COUNT=$(echo "$ORDERS" | jq '.orders | length // .data.orders | length // 0')
echo -e "\n${GREEN}✅ Total Orders: $ORDER_COUNT${NC}\n"

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✅ BUY Order ID: $BUY_ORDER_ID${NC}"
if [ -n "$SELL_ORDER_ID" ]; then
    echo -e "${GREEN}✅ SELL Order ID: $SELL_ORDER_ID${NC}"
fi
echo ""
echo -e "${YELLOW}What Happens Next:${NC}"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${BLUE}📊 Current Setup:${NC}"
echo -e "   Current ETH Price: ~\$${CURRENT_PRICE}"
echo -e "   BUY trigger:  < \$3303 (needs to drop \$$(echo "$CURRENT_PRICE - 3303" | bc) more)"
echo -e "   SELL trigger: > \$3304 (activates after BUY)"
echo ""
echo -e "${BLUE}🔄 Execution Flow:${NC}"
echo -e "   1️⃣  Monitoring checks every 2 minutes"
echo -e "   2️⃣  When ETH < \$3303 → BUY executes on Ethereum mainnet"
echo -e "   3️⃣  SELL order automatically activates"
echo -e "   4️⃣  When ETH > \$3304 → SELL executes on Ethereum mainnet"
echo ""
echo -e "${YELLOW}📝 Next Steps:${NC}"
echo -e "   1. Watch server logs: ${GREEN}tail -f logs/server.log${NC}"
echo -e "   2. Check MongoDB: ${GREEN}db.delegatedtransactions.find().pretty()${NC}"
echo -e "   3. Monitor ETH price: ${GREEN}watch -n 10 'curl -s \"https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd\" | jq'${NC}"
echo ""
echo -e "${BLUE}🔍 What to Look For in Logs:${NC}"
echo -e "   ${GREEN}[Monitoring]${NC} ========== Starting check cycle =========="
echo -e "   ${GREEN}[PriceChecker]${NC} ethereum \$3302 <= \$3303? true ✅"
echo -e "   ${GREEN}[Monitoring]${NC} 🚀 Executing order..."
echo ""
echo -e "${YELLOW}⚠️  Important Notes:${NC}"
echo -e "   • Executes on Ethereum mainnet (chainId: 1)"
echo -e "   • Orders use minimal transaction data (testing monitoring only)"
echo -e "   • For production swaps, use proper DEX-encoded data"
echo -e "   • Price range: \$3303 (BUY) to \$3304 (SELL)"
echo -e "   • Orders expire on Feb 1, 2026 / Mar 1, 2026"
