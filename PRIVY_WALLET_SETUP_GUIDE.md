# Privy Wallet Policy Setup Guide

This guide explains how to set up wallet policies in Privy to enable the hybrid signing model (user + server delegation).

## Overview

Our implementation supports two transaction flows:

1. **Immediate Transactions** (User Online)
   - User signs in real-time with their JWT
   - Server co-signs with authorization key (2-of-2 quorum)
   - Transaction executes immediately

2. **Delegated Transactions** (User Can Be Offline)
   - User pre-authorizes by creating order when online
   - Server executes later when conditions are met
   - Uses stored user JWT + server key

## Step 1: Create Authorization Keys

### 1.1 Generate Authorization Key Pair

```bash
# Using OpenSSL to generate P-256 key pair
openssl ecparam -name prime256v1 -genkey -noout -out private.pem
openssl ec -in private.pem -pubout -out public.pem

# Convert private key to base64 (for storage)
cat private.pem | base64
```

### 1.2 Register Authorization Key in Privy

1. Go to [Privy Dashboard](https://dashboard.privy.io/)
2. Navigate to **Settings** → **Authorization Keys**
3. Click **Create Authorization Key**
4. Paste your **public key** (from `public.pem`)
5. Give it a name (e.g., "Server Signing Key")
6. Save the **Key ID** (this is your `PRIVY_KEY_QUORUM_ID`)

### 1.3 Store Keys Securely

Add to your `.env`:

```bash
# Privy Configuration
PRIVY_APP_ID=your_app_id
PRIVY_APP_SECRET=your_app_secret
PRIVY_VERIFICATION_KEY=your_verification_key

# Authorization Key (base64 encoded private key)
PRIVY_AUTHORIZATION_PRIVATE_KEY=<base64-encoded-private-key>

# Key Quorum ID
PRIVY_KEY_QUORUM_ID=<key-id-from-dashboard>
```

## Step 2: Configure Wallet Policies

### 2.1 Understanding Wallet Policies

Wallet policies define who can sign transactions:

- **1-of-1 (User Only)**: Only user can sign
- **1-of-1 (Server Only)**: Only server can sign (full delegation)
- **2-of-2 (User + Server)**: Both must sign (recommended for security)

### 2.2 Recommended Policy Configuration

For our hybrid model, we recommend **2-of-2** (user + server):

1. Go to **Dashboard** → **Wallets** → **Policies**
2. Create a new policy:
   - **Name**: "User + Server Signing"
   - **Type**: Key Quorum
   - **Required Signers**: 2
   - **Signers**:
     - User (from embedded wallet)
     - Server Authorization Key

### 2.3 Policy for Delegated Transactions

When user creates a delegated order:
- User's JWT is stored (encrypted)
- Server uses stored JWT + server key when executing
- Both signatures are present (2-of-2 satisfied)

## Step 3: Create Embedded Wallets with Delegation

### 3.1 Enable Embedded Wallets

1. **Dashboard** → **Embedded Wallets** → **Enable**
2. Configure wallet creation settings:
   - Auto-create on user signup
   - Enable session keys (for delegated signing)

### 3.2 Configure Session Keys (Delegated Signers)

Session keys allow server to sign on behalf of users:

```typescript
// When user creates delegated order, we store their JWT
// This JWT represents their permission for the specific transaction
```

**In Privy Dashboard:**
1. Navigate to **Embedded Wallets** → **Session Keys**
2. Enable **Delegated Signing**
3. Set **Session Duration** (how long JWT is valid)
4. Configure **Permissions**:
   - Allow transaction signing
   - Set spending limits (optional)

## Step 4: Implementation Flow

### 4.1 User Creates Delegated Order

```typescript
POST /v1/privy-transactions/delegated

// User must be online to authorize
// User's JWT is captured and stored
{
  "walletId": "user-wallet-id",
  "transactionType": "limit_order",
  "transactionData": {
    "to": "0xContractAddress",
    "value": "1000000000000000000",
    "chainId": 1
  },
  "executionConditions": {
    "targetPrice": 2000,
    "expiresAt": "2024-12-31T00:00:00Z"
  }
}
```

**What happens:**
1. User's JWT is validated
2. Order is saved to database with JWT (encrypted)
3. User has now "pre-authorized" this specific transaction

### 4.2 Server Executes When Conditions Met

```typescript
// Monitoring service detects conditions met
// Retrieves order with stored user JWT
// Executes using stored JWT + server key (2-of-2)

const result = await privyClient.wallets().ethereum().sendTransaction(walletId, {
  transaction: {...},
  authorization_context: {
    user_jwts: [storedUserJwt],  // User's prior authorization
    authorization_private_keys: [serverKey]  // Server key
  }
});
```

## Step 5: Security Best Practices

### 5.1 JWT Storage

**IMPORTANT:** User JWTs must be encrypted before storage:

```typescript
// TODO: Implement encryption
import { encrypt, decrypt } from './encryption-utils';

// When storing
const encryptedJwt = encrypt(userJwt, process.env.ENCRYPTION_KEY);

// When retrieving
const userJwt = decrypt(encryptedJwt, process.env.ENCRYPTION_KEY);
```

### 5.2 JWT Validation

Before storing user JWT, validate it:

```typescript
// In createDelegatedOrder
const verifiedClaims = await privy.utils().auth().verifyAuthToken(userJwt);

// Check claims
if (verifiedClaims.userId !== userId) {
  throw new Error('Invalid JWT: User ID mismatch');
}
```

### 5.3 Order Expiration

Always set expiration on delegated orders:

```typescript
executionConditions: {
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
}
```

### 5.4 Spending Limits

Configure spending limits in Privy Dashboard:
- Per transaction limit
- Daily/weekly limits
- Token whitelists

## Step 6: Testing

### 6.1 Test Immediate Transaction

```bash
curl -X POST http://localhost:3000/v1/privy-transactions/immediate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <USER_JWT>" \
  -d '{
    "walletId": "wallet-id",
    "to": "0xRecipientAddress",
    "value": "1000000000000000000",
    "chainId": 1
  }'
```

### 6.2 Test Delegated Order Creation

```bash
curl -X POST http://localhost:3000/v1/privy-transactions/delegated \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <USER_JWT>" \
  -d '{
    "walletId": "wallet-id",
    "transactionType": "limit_order",
    "transactionData": {
      "to": "0xContractAddress",
      "value": "1000000000000000000",
      "chainId": 1
    },
    "executionConditions": {
      "targetPrice": 2000,
      "expiresAt": "2024-12-31T00:00:00Z"
    }
  }'
```

### 6.3 Test Order Execution

```bash
curl -X POST http://localhost:3000/v1/privy-transactions/execute/<ORDER_ID> \
  -H "Authorization: Bearer <USER_JWT>"
```

## Step 7: Monitoring & Execution Service

Create a background service to monitor and execute delegated orders:

```typescript
// services/OrderMonitoringService.ts
class OrderMonitoringService {
  async monitorOrders() {
    // Run every minute
    setInterval(async () => {
      // Get orders ready for execution
      const orders = await this.privyTransactionService.getOrdersReadyForExecution();

      for (const order of orders) {
        // Check if conditions are met (price, time, etc.)
        if (await this.checkConditions(order)) {
          // Execute order
          await this.privyTransactionService.executeDelegatedOrder(order.orderId);
        }
      }
    }, 60000);
  }

  async checkConditions(order) {
    // Implement your condition checking logic
    // e.g., check current price vs target price
    // check if executeAt time has passed, etc.
  }
}
```

## API Endpoints Summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/privy-transactions/test` | POST | Test wallet fetching |
| `/v1/privy-transactions/immediate` | POST | Send immediate transaction (user online) |
| `/v1/privy-transactions/delegated` | POST | Create delegated order (user pre-authorizes) |
| `/v1/privy-transactions/execute/:orderId` | POST | Execute delegated order |
| `/v1/privy-transactions/orders` | GET | Get user's orders (with optional status filter) |
| `/v1/privy-transactions/orders/:orderId` | DELETE | Cancel a delegated order |

## Troubleshooting

### Issue: "Insufficient signers"
- Check wallet policy has 2-of-2 configured
- Verify authorization key is registered
- Ensure user JWT is valid

### Issue: "Authorization failed"
- Verify `PRIVY_AUTHORIZATION_PRIVATE_KEY` is correct
- Check key ID matches registered key
- Validate user JWT hasn't expired

### Issue: "Order execution failed"
- Check if order has expired
- Verify stored JWT is still valid
- Ensure wallet has sufficient funds

## Next Steps

1. ✅ Implement JWT encryption/decryption
2. ✅ Add JWT validation before storing
3. ✅ Create monitoring service for order execution
4. ✅ Implement price checking logic
5. ✅ Add spending limit validation
6. ✅ Set up error notifications
7. ✅ Implement order history tracking
8. ✅ Add webhook notifications for order execution

## Resources

- [Privy Documentation](https://docs.privy.io/)
- [Authorization Keys Guide](https://docs.privy.io/controls/authorization-keys)
- [Signing Requests](https://docs.privy.io/controls/authorization-keys/using-owners/sign)
- [Embedded Wallets](https://docs.privy.io/wallets/embedded-wallets)
