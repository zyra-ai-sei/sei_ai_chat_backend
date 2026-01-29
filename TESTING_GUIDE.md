# 🧪 Testing Guide: Offline Transaction Monitoring

## Quick Start (5 Minutes)

### Step 1: Get Your Credentials

**A) Get JWT Token:**
```bash
curl -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"address": "your_wallet_address"}'
```

**B) Get Wallet ID:**
```bash
curl -X POST http://localhost:3000/v1/privy-transactions/test \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

### Step 2: Set Environment Variables (USE QUOTES!)

```bash
export JWT_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
export WALLET_ID="clxyz123abc456..."
```

### Step 3: Run the Test

```bash
./test-monitoring.sh
```

## What You're Testing

**BUY Order:** Buy $1 of ETH when price < $3330  
**SELL Order:** Sell that ETH when price > $3331

**Current ETH Price:** ~$3330.76 (perfect for testing!)

## Success Looks Like

```
✅ BUY Order Created: buy-order-abc123
✅ SELL Order Created: sell-order-def456

Every 2 minutes in logs:
[Monitoring] Checking 2 orders...
[PriceChecker] ETH $3330.76 <= $3330? false (not yet)
```

When price drops below $3330:
```
[Monitoring] 🚀 Executing BUY order!
✅ Transaction sent
✅ SELL order activated
```
