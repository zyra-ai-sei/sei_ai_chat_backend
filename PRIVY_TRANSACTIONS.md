# Privy Server-Initiated Transactions

This document describes how to use the Privy server-initiated transaction system to execute blockchain transactions on behalf of users when they're offline.

## Overview

The Privy transaction system enables automated blockchain transactions for features like:
- **Limit Orders**: Execute trades when price conditions are met
- **DCA (Dollar Cost Averaging)**: Automated recurring purchases
- **Portfolio Rebalancing**: Automatic portfolio adjustments
- **Scheduled Transactions**: Any transaction that needs to execute when the user is offline

## Architecture

### Components

1. **Privy Client Configuration** (`src/config/privy.config.ts`)
   - Initializes the Privy client with app credentials
   - Manages authorization private key for signing transactions

2. **PrivyTransactionService** (`src/services/PrivyTransactionService.ts`)
   - Core service for sending transactions on behalf of users
   - Handles transaction signing and broadcasting
   - Provides methods for different transaction types

3. **PrivyTransactionController** (`src/controller/PrivyTransactionController.ts`)
   - REST API endpoints for transaction execution
   - Authentication and authorization checks
   - Input validation

## Configuration

### Environment Variables

Add the following to your `.env` file:

```bash
# Privy App Configuration
PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_app_secret
PRIVY_VERIFICATION_KEY=your_privy_verification_key

# Privy Server-Initiated Transactions
PRIVY_AUTHORIZATION_PRIVATE_KEY=your_authorization_private_key
PRIVY_KEY_QUORUM_ID=your_key_quorum_id
```

**Note**: Replace `YOUR_AUTHORIZATION_PRIVATE_KEY_HERE` in the `.env` file with your actual authorization private key from Privy.

### Getting Privy Credentials

1. Go to your Privy Dashboard
2. Navigate to Settings > Keys
3. Create an authorization key following Privy's "Signing on the Server" guide
4. Copy the private key and add it to your `.env` file
5. Copy the Key Quorum ID and add it to your `.env` file

## API Endpoints

All endpoints are prefixed with `/v1/privy-transactions` and require authentication.

### 1. Execute Transaction

**POST** `/v1/privy-transactions/execute`

Execute a generic transaction on behalf of a user.

#### Request Body

```json
{
  "walletId": "wallet_abc123",
  "to": "0x742d35Cc6635C0532925a3b8c17d6d1E9C2F7ca",
  "value": "0x2386F26FC10000",
  "chainId": 1329,
  "sponsor": false
}
```

#### Parameters

- `walletId` (string, required): User's embedded wallet ID
- `to` (string, required): Recipient address
- `value` (string, optional): Amount in wei as hex string
- `data` (string, optional): Contract call data as hex string
- `chainId` (number, optional): Chain ID (defaults to 1329 for SEI)
- `sponsor` (boolean, optional): Whether to sponsor gas (defaults to false)
- `gasLimit` (string, optional): Gas limit as hex string
- `maxFeePerGas` (string, optional): Max fee per gas as hex string
- `maxPriorityFeePerGas` (string, optional): Max priority fee per gas as hex string

#### Response

```json
{
  "success": true,
  "data": {
    "hash": "0x1234567890abcdef...",
    "caip2": "eip155:1329"
  }
}
```

#### Example

```bash
curl -X POST http://localhost:3000/v1/privy-transactions/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "walletId": "wallet_abc123",
    "to": "0x742d35Cc6635C0532925a3b8c17d6d1E9C2F7ca",
    "value": "0x2386F26FC10000",
    "chainId": 1329
  }'
```

### 2. Execute Contract Call

**POST** `/v1/privy-transactions/contract-call`

Execute a contract interaction on behalf of a user.

#### Request Body

```json
{
  "walletId": "wallet_abc123",
  "contractAddress": "0xContractAddress",
  "data": "0x095ea7b3...",
  "value": "0x0",
  "chainId": 1329,
  "sponsor": false
}
```

#### Parameters

- `walletId` (string, required): User's embedded wallet ID
- `contractAddress` (string, required): Contract address to interact with
- `data` (string, required): Encoded contract call data
- `value` (string, optional): Amount in wei as hex string
- `chainId` (number, optional): Chain ID (defaults to 1329 for SEI)
- `sponsor` (boolean, optional): Whether to sponsor gas

#### Example: Token Approval

```bash
curl -X POST http://localhost:3000/v1/privy-transactions/contract-call \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "walletId": "wallet_abc123",
    "contractAddress": "0xTokenAddress",
    "data": "0x095ea7b3000000000000000000000000spenderaddress00000000000000000000000000000000000000000000000000000000000000000000ffffffffffffffff",
    "chainId": 1329
  }'
```

### 3. Execute Limit Order

**POST** `/v1/privy-transactions/limit-order`

Execute a limit order transaction on behalf of a user.

#### Request Body

```json
{
  "walletId": "wallet_abc123",
  "orderData": "0x...",
  "orderContractAddress": "0xOrderContract",
  "chainId": 1329,
  "sponsor": true
}
```

#### Parameters

- `walletId` (string, required): User's embedded wallet ID
- `orderData` (string, required): Encoded order execution data
- `orderContractAddress` (string, required): Address of the order execution contract
- `chainId` (number, optional): Chain ID (defaults to 1329 for SEI)
- `sponsor` (boolean, optional): Whether to sponsor gas

## Usage in Code

### Service Usage

You can inject the `PrivyTransactionService` into your services:

```typescript
import { inject, injectable } from "inversify";
import { TYPES } from "../ioc-container/types";
import { PrivyTransactionService } from "../services/PrivyTransactionService";

@injectable()
export class MyAutomationService {
  constructor(
    @inject(TYPES.PrivyTransactionService)
    private privyTxService: PrivyTransactionService
  ) {}

  async executeLimitOrder(walletId: string, orderDetails: any) {
    // Check if order conditions are met
    if (this.checkOrderConditions(orderDetails)) {
      // Execute the transaction
      const result = await this.privyTxService.sendTransaction(
        walletId,
        {
          to: orderDetails.targetContract,
          data: orderDetails.encodedData,
          chainId: 1329,
        },
        true // sponsor gas
      );

      console.log("Order executed:", result.hash);
      return result;
    }
  }
}
```

### Example: Automated Limit Order Execution

Here's how you might implement a cron job to check and execute limit orders:

```typescript
import cron from "node-cron";
import { PrivyTransactionService } from "./services/PrivyTransactionService";

// Run every minute
cron.schedule("* * * * *", async () => {
  // Get pending limit orders from database
  const pendingOrders = await getPendingLimitOrders();

  for (const order of pendingOrders) {
    // Check if price condition is met
    const currentPrice = await getCurrentPrice(order.tokenPair);

    if (shouldExecuteOrder(order, currentPrice)) {
      try {
        const result = await privyTransactionService.executeLimitOrder(
          order.walletId,
          order.encodedData,
          order.contractAddress,
          1329,
          true
        );

        // Update order status in database
        await updateOrderStatus(order.id, "executed", result.hash);
      } catch (error) {
        console.error("Failed to execute order:", error);
      }
    }
  }
});
```

## Security Considerations

### Authorization Checks

**IMPORTANT**: The TODO comments in the controller indicate where you MUST implement authorization checks:

1. **Wallet Ownership Verification**
   ```typescript
   // Verify the walletId belongs to the authenticated user
   const userWallet = await this.userService.getUserWallet(req.userId);
   if (userWallet.walletId !== body.walletId) {
     throw new Error("Unauthorized: Wallet does not belong to user");
   }
   ```

2. **Order Authorization**
   ```typescript
   // Verify the user created and authorized this specific order
   const order = await this.orderService.getOrder(orderId);
   if (order.userId !== req.userId) {
     throw new Error("Unauthorized: Order does not belong to user");
   }
   if (order.status === "executed") {
     throw new Error("Order already executed");
   }
   ```

3. **Transaction Limits**
   - Implement rate limiting per user
   - Set maximum transaction values
   - Track daily/monthly transaction volumes

### Key Management

- **Never commit** the authorization private key to version control
- Store the key securely in environment variables
- Rotate keys periodically
- Use different keys for development and production
- Consider using a key management service (AWS KMS, HashiCorp Vault, etc.)

### Logging

The service includes console logging for transactions:
- Transaction parameters (without sensitive data)
- Transaction hashes after successful execution
- Error messages for failed transactions

**Important**: Ensure logs never contain:
- Private keys
- User authentication tokens
- Sensitive user data

## Gas Sponsorship

You can sponsor gas for transactions by setting `sponsor: true`:

```typescript
await privyTransactionService.sendTransaction(
  walletId,
  {
    to: recipientAddress,
    value: amount,
    chainId: 1329,
  },
  true // sponsor gas
);
```

When gas sponsorship is enabled:
- The transaction gas fees are paid by your Privy app
- Users don't need to hold native tokens for gas
- Configure gas sponsorship limits in your Privy Dashboard

## Error Handling

The service throws errors for:
- Invalid transaction parameters
- Network errors
- Privy API errors
- Authorization failures

Example error handling:

```typescript
try {
  const result = await privyTransactionService.sendTransaction(
    walletId,
    txParams,
    false
  );
  console.log("Success:", result.hash);
} catch (error) {
  if (error.message.includes("insufficient funds")) {
    // Handle insufficient balance
  } else if (error.message.includes("Unauthorized")) {
    // Handle authorization error
  } else {
    // Handle other errors
  }
}
```

## Monitoring Transactions

After sending a transaction, you receive a transaction hash. You can:

1. **Monitor transaction status** using a blockchain explorer
2. **Wait for confirmation** using ethers.js or viem:
   ```typescript
   const provider = new ethers.JsonRpcProvider(RPC_URL);
   const receipt = await provider.waitForTransaction(txHash);
   console.log("Transaction confirmed in block:", receipt.blockNumber);
   ```

3. **Handle failed transactions** (transactions can be broadcasted but still fail):
   ```typescript
   if (receipt.status === 0) {
     console.error("Transaction failed");
     // Handle failed transaction
   }
   ```

## Testing

### Test in Development

1. Use Privy's testnet configuration
2. Set up test wallets
3. Use testnet tokens
4. Test all transaction types

### Example Test

```bash
# Send a test transaction
curl -X POST http://localhost:3000/v1/privy-transactions/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <test-token>" \
  -d '{
    "walletId": "test_wallet_123",
    "to": "0x742d35Cc6635C0532925a3b8c17d6d1E9C2F7ca",
    "value": "0x2386F26FC10000",
    "chainId": 1329
  }'
```

## Next Steps

1. **Add Authorization Checks**: Implement the TODO items in the controller
2. **Set up Cron Jobs**: Create scheduled jobs for automated transactions
3. **Implement Order Matching**: Build logic to match limit orders with market conditions
4. **Add Monitoring**: Set up alerts for failed transactions
5. **Rate Limiting**: Implement rate limiting on the API endpoints
6. **Database Integration**: Store transaction history and order status

## Resources

- [Privy Documentation](https://docs.privy.io)
- [Privy Server-Initiated Transactions](https://docs.privy.io/wallets/using-wallets/ethereum/send-transactions)
- [SEI Network Documentation](https://docs.sei.io)

## Support

For issues or questions:
1. Check the Privy documentation
2. Review the code comments
3. Contact your team lead
4. Reach out to Privy support if needed
