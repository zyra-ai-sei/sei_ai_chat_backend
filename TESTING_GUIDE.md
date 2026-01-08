# Testing Guide: Delegated Transaction Flow

This guide will help you test the hybrid signing infrastructure without needing price oracles.

## Prerequisites

### 1. Environment Setup

Ensure your `.env` has these values:

```bash
# Basic Privy Config
PRIVY_APP_ID=your_app_id
PRIVY_APP_SECRET=your_app_secret
PRIVY_VERIFICATION_KEY=your_verification_key

# Authorization Key (for server signing)
PRIVY_AUTHORIZATION_PRIVATE_KEY=your_private_key
PRIVY_KEY_QUORUM_ID=your_key_quorum_id

# Server
PORT=3000
MONGO_URI=mongodb://localhost:27017/seiChat
```

### 2. Start the Server

```bash
# Install dependencies
yarn install

# Start server
yarn dev
# or
npm run dev
```

### 3. Get a User JWT

You need a valid Privy JWT token from your frontend. You can get this by:

1. Login via your frontend app
2. Extract the JWT from the response
3. Or use Privy Dashboard to generate a test token

Store it as an environment variable:
```bash
export USER_JWT="your-privy-jwt-token-here"
```

### 4. Get a Wallet ID

You need the wallet ID from Privy. You can get it from:
- Your frontend after user creates a wallet
- Privy Dashboard → Users → Select user → Wallets

Store it:
```bash
export WALLET_ID="wallet-id-from-privy"
```

## Test Flow

### Step 1: Test Wallet Access (Sanity Check)

First, verify that the server can access user wallets:

```bash
curl -X POST http://localhost:3000/v1/privy-transactions/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_JWT"
```

**Expected Response:**
```json
{
  "success": true,
  "userId": "did:privy:...",
  "wallets": [
    {
      "id": "wallet-id",
      "type": "wallet",
      "address": "0x...",
      ...
    }
  ]
}
```

✅ If you see wallets, proceed to next step.

---

### Step 2: Test Immediate Transaction (User Signs in Real-Time)

This tests the user-initiated flow where both user and server sign together.

**Important:** You'll need a testnet for this (Sepolia, Goerli, etc.)

```bash
curl -X POST http://localhost:3000/v1/privy-transactions/immediate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_JWT" \
  -d '{
    "walletId": "'$WALLET_ID'",
    "to": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "value": "1000000000000000",
    "chainId": 11155111
  }'
```

**Parameters:**
- `walletId`: Your Privy wallet ID
- `to`: Recipient address (use a test address)
- `value`: Amount in wei (0.001 ETH in this example)
- `chainId`: 11155111 = Sepolia testnet

**Expected Response:**
```json
{
  "success": true,
  "transactionHash": "0x...",
  "walletId": "wallet-id"
}
```

**What's happening:**
1. Server receives request with user's JWT
2. Builds authorization context with user JWT + server key (2-of-2)
3. Sends transaction to blockchain
4. Both signatures are included

---

### Step 3: Create a Delegated Order (User Pre-Authorizes)

This is the key test - user creates an order when online, server will execute later.

#### Option A: Time-Based Execution (Recommended for Testing)

Create an order that executes 2 minutes from now:

```bash
# Calculate time 2 minutes from now
EXECUTE_AT=$(date -u -v+2M +"%Y-%m-%dT%H:%M:%SZ")  # macOS
# or for Linux:
# EXECUTE_AT=$(date -u -d "+2 minutes" +"%Y-%m-%dT%H:%M:%SZ")

# Create the order
curl -X POST http://localhost:3000/v1/privy-transactions/delegated \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_JWT" \
  -d '{
    "walletId": "'$WALLET_ID'",
    "transactionType": "scheduled",
    "transactionData": {
      "to": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "value": "1000000000000000",
      "chainId": 11155111
    },
    "executionConditions": {
      "executeAt": "'$EXECUTE_AT'",
      "expiresAt": "2025-12-31T00:00:00Z"
    },
    "description": "Test scheduled transaction - execute in 2 minutes"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "authorized",
  "message": "Order created and authorized successfully"
}
```

**Save the orderId:**
```bash
export ORDER_ID="<orderId-from-response>"
```

**What just happened:**
1. User was online and signed authorization
2. User's JWT was stored in database (encrypted in production)
3. Order is now waiting for execution time
4. User can now go offline

#### Option B: Manual Price-Based Order (Without Oracle)

For testing without a price oracle, create a limit order but execute it manually:

```bash
curl -X POST http://localhost:3000/v1/privy-transactions/delegated \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_JWT" \
  -d '{
    "walletId": "'$WALLET_ID'",
    "transactionType": "limit_order",
    "transactionData": {
      "to": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "value": "1000000000000000",
      "chainId": 11155111
    },
    "executionConditions": {
      "targetPrice": 2000,
      "expiresAt": "2025-12-31T00:00:00Z"
    },
    "description": "Test limit order - manual execution"
  }'
```

---

### Step 4: View User's Orders

Check the orders you created:

```bash
# Get all orders
curl -X GET http://localhost:3000/v1/privy-transactions/orders \
  -H "Authorization: Bearer $USER_JWT"

# Get only authorized orders (waiting for execution)
curl -X GET "http://localhost:3000/v1/privy-transactions/orders?status=authorized" \
  -H "Authorization: Bearer $USER_JWT"
```

**Expected Response:**
```json
{
  "success": true,
  "userId": "did:privy:...",
  "orders": [
    {
      "orderId": "550e8400-...",
      "transactionType": "scheduled",
      "status": "authorized",
      "executionConditions": {
        "executeAt": "2024-01-06T12:30:00Z"
      },
      "createdAt": "2024-01-06T12:28:00Z"
    }
  ]
}
```

---

### Step 5: Execute Delegated Order (Server Signs)

Now, simulate what the server will do when conditions are met.

**Important:** The user can be completely offline for this step!

```bash
curl -X POST http://localhost:3000/v1/privy-transactions/execute/$ORDER_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_JWT"
```

**Expected Response:**
```json
{
  "success": true,
  "orderId": "550e8400-...",
  "transactionHash": "0x...",
  "walletId": "wallet-id"
}
```

**What happened:**
1. Server retrieved order from database
2. Got stored user JWT from order
3. Built authorization context with stored JWT + server key
4. Executed transaction (user was offline!)
5. Both signatures were included (2-of-2 satisfied)

---

### Step 6: Verify Order Status

Check that the order status changed:

```bash
curl -X GET http://localhost:3000/v1/privy-transactions/orders \
  -H "Authorization: Bearer $USER_JWT" | json_pp
```

You should see the order status changed to `"executed"` with a transaction hash.

---

### Step 7: Cancel an Order (Optional)

To test cancellation:

1. Create another order (repeat Step 3)
2. Cancel it before execution:

```bash
curl -X DELETE http://localhost:3000/v1/privy-transactions/orders/$ORDER_ID \
  -H "Authorization: Bearer $USER_JWT"
```

**Expected Response:**
```json
{
  "success": true,
  "orderId": "550e8400-...",
  "status": "cancelled"
}
```

---

## Testing Checklist

- [ ] ✅ Server starts without errors
- [ ] ✅ Can fetch user wallets (Step 1)
- [ ] ✅ Can send immediate transaction with user online (Step 2)
- [ ] ✅ Can create delegated order with user authorization (Step 3)
- [ ] ✅ Order appears in database and user's order list (Step 4)
- [ ] ✅ Server can execute order using stored authorization (Step 5)
- [ ] ✅ Order status updates to "executed" (Step 6)
- [ ] ✅ Can cancel orders (Step 7)
- [ ] ✅ Expired orders don't execute
- [ ] ✅ Can't execute same order twice

---

## Troubleshooting

### Error: "User JWT is required in Authorization header"

**Solution:** Make sure you're passing the JWT in the Authorization header:
```bash
-H "Authorization: Bearer YOUR_JWT_HERE"
```

### Error: "Invalid JWT" or "JWT expired"

**Solution:**
1. Get a fresh JWT from your frontend
2. Check that `PRIVY_VERIFICATION_KEY` in `.env` is correct
3. Ensure JWT hasn't expired (Privy JWTs typically expire after a few hours)

### Error: "Wallet not found"

**Solution:**
1. Verify the wallet ID is correct
2. Check that the wallet belongs to the user making the request
3. Ensure the user has an embedded wallet created in Privy

### Error: "Insufficient signers" or "Authorization failed"

**Solution:**
1. Verify `PRIVY_AUTHORIZATION_PRIVATE_KEY` is set correctly in `.env`
2. Check that the authorization key is registered in Privy Dashboard
3. Ensure wallet policy allows 2-of-2 signing (user + server)

### Error: "Order not found" or "Order cannot be executed"

**Solution:**
1. Check the order ID is correct
2. Verify order status is "authorized" (not already executed/cancelled)
3. Check if order has expired

### Database Errors

**Solution:**
1. Ensure MongoDB is running: `mongosh` or `mongo`
2. Check connection string in `.env`: `MONGO_URI`
3. Verify database permissions

---

## Next: Automated Execution

Once manual execution works, you can build the automated monitoring service:

```typescript
// services/OrderMonitoringService.ts
class OrderMonitoringService {
  async start() {
    // Check every minute
    setInterval(async () => {
      const orders = await this.privyTransactionService.getOrdersReadyForExecution();

      for (const order of orders) {
        // For time-based orders
        if (order.executionConditions.executeAt) {
          if (new Date() >= order.executionConditions.executeAt) {
            await this.privyTransactionService.executeDelegatedOrder(order.orderId);
          }
        }

        // For price-based orders (add when you have oracle)
        if (order.executionConditions.targetPrice) {
          const currentPrice = await this.getPriceFromOracle();
          if (currentPrice >= order.executionConditions.targetPrice) {
            await this.privyTransactionService.executeDelegatedOrder(order.orderId);
          }
        }
      }
    }, 60000); // Every minute
  }
}
```

---

## Understanding the Flow

### User Online (Authorization Phase)
```
Frontend → POST /delegated → Backend
                              ├── Validates user JWT
                              ├── Stores JWT (encrypted)
                              ├── Saves order to DB
                              └── Returns order ID

User can now go offline ✈️
```

### User Offline (Execution Phase)
```
Monitoring Service → Checks conditions
                     ├── Time reached? ✅
                     ├── Price met? (later)
                     └── Execute order
                         ├── Retrieves stored user JWT
                         ├── Builds auth context (JWT + server key)
                         ├── Sends transaction
                         └── Updates order status

Transaction executed without user! 🎉
```

---

## Production Checklist (Before Going Live)

- [ ] Implement JWT encryption (currently TODO in code)
- [ ] Add JWT validation before storing
- [ ] Set up monitoring service for automatic execution
- [ ] Integrate price oracle (Chainlink, CoinGecko)
- [ ] Add spending limits validation
- [ ] Implement retry logic with exponential backoff
- [ ] Set up error alerting (Sentry, etc.)
- [ ] Add comprehensive logging
- [ ] Test on testnet extensively
- [ ] Implement rate limiting
- [ ] Add webhook notifications for order execution
- [ ] Set up order expiration cleanup job

---

## Testing with Multiple Transaction Types

### Scheduled Transaction
```json
{
  "transactionType": "scheduled",
  "executionConditions": {
    "executeAt": "2024-01-06T15:00:00Z"
  }
}
```

### Limit Order (manual execution for now)
```json
{
  "transactionType": "limit_order",
  "executionConditions": {
    "targetPrice": 2000
  }
}
```

### Stop Loss (manual execution for now)
```json
{
  "transactionType": "stop_loss",
  "executionConditions": {
    "stopPrice": 1500
  }
}
```

### DCA (Dollar Cost Averaging - recurring)
```json
{
  "transactionType": "dca",
  "executionConditions": {
    "executeAt": "2024-01-06T15:00:00Z"
  }
}
```

---

## Success Metrics

You'll know it's working when:

✅ User creates order while online
✅ Order is stored with authorization
✅ Server can execute order later (user offline)
✅ Transaction appears on blockchain
✅ Order status updates correctly
✅ User sees executed order in their list

---

## Quick Test Script

Save this as `test-flow.sh`:

```bash
#!/bin/bash

# Configuration
export USER_JWT="your-jwt-here"
export WALLET_ID="your-wallet-id"
export BASE_URL="http://localhost:3000/v1/privy-transactions"

echo "🧪 Testing Delegated Transaction Flow"
echo "======================================"

# Step 1: Test wallet access
echo "\n📝 Step 1: Testing wallet access..."
curl -s -X POST $BASE_URL/test \
  -H "Authorization: Bearer $USER_JWT" | json_pp

# Step 2: Create delegated order
echo "\n📝 Step 2: Creating delegated order..."
EXECUTE_AT=$(date -u -v+2M +"%Y-%m-%dT%H:%M:%SZ")
ORDER_RESPONSE=$(curl -s -X POST $BASE_URL/delegated \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_JWT" \
  -d '{
    "walletId": "'$WALLET_ID'",
    "transactionType": "scheduled",
    "transactionData": {
      "to": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "value": "1000000000000000",
      "chainId": 11155111
    },
    "executionConditions": {
      "executeAt": "'$EXECUTE_AT'"
    }
  }')

echo $ORDER_RESPONSE | json_pp
ORDER_ID=$(echo $ORDER_RESPONSE | jq -r '.orderId')

# Step 3: View orders
echo "\n📝 Step 3: Viewing user orders..."
curl -s -X GET $BASE_URL/orders \
  -H "Authorization: Bearer $USER_JWT" | json_pp

# Step 4: Execute order (after 2 minutes, or manually)
echo "\n⏰ Waiting 2 minutes before execution..."
sleep 120

echo "\n📝 Step 4: Executing order..."
curl -s -X POST $BASE_URL/execute/$ORDER_ID \
  -H "Authorization: Bearer $USER_JWT" | json_pp

echo "\n✅ Test complete!"
```

Make it executable and run:
```bash
chmod +x test-flow.sh
./test-flow.sh
```
