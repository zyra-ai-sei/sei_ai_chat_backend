# Testing Privy Server-Initiated Transactions

## Prerequisites

Before testing, you need:

1. ✅ **Authorization Private Key** - Already added to `.env`
2. ⚠️ **Auth Token** - JWT token for an authenticated user
3. ⚠️ **Wallet ID** - The user's Privy embedded wallet ID

## Step 1: Get a Test Wallet ID

You need a wallet ID from a user who has logged in via Privy. You can get this from:

### Option A: From Your Frontend
When a user logs in with Privy on your frontend, you can get their wallet:

```javascript
const { user } = usePrivy();
const embeddedWallet = user.linkedAccounts.find(
  account => account.type === 'wallet' && account.walletClientType === 'privy'
);
console.log('Wallet ID:', embeddedWallet.address);
```

### Option B: From Privy Dashboard
1. Go to your Privy Dashboard
2. Navigate to Users
3. Click on a test user
4. Copy their embedded wallet ID

### Option C: Create a Test User via API
You can create a test user programmatically (see Privy docs).

## Step 2: Get an Auth Token

Get a JWT token for your test user. This depends on your auth implementation in `AuthController.ts`.

For testing purposes, you can temporarily check what your auth system returns.

## Step 3: Test with curl

### Test 1: Simple Transaction

```bash
curl -X POST http://localhost:3000/v1/privy-transactions/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "walletId": "0xYourWalletAddress",
    "to": "0x742d35Cc6635C0532925a3b8c17d6d1E9C2F7ca",
    "value": "0x2386F26FC10000",
    "chainId": 1329,
    "sponsor": false
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "hash": "0x1234567890abcdef...",
    "caip2": "eip155:1329"
  }
}
```

### Test 2: With Gas Sponsorship

```bash
curl -X POST http://localhost:3000/v1/privy-transactions/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "walletId": "0xYourWalletAddress",
    "to": "0x742d35Cc6635C0532925a3b8c17d6d1E9C2F7ca",
    "value": "0x0",
    "chainId": 1329,
    "sponsor": true
  }'
```

### Test 3: Contract Call (Token Approval)

```bash
# Example: Approve token spending
curl -X POST http://localhost:3000/v1/privy-transactions/contract-call \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "walletId": "0xYourWalletAddress",
    "contractAddress": "0xTokenContractAddress",
    "data": "0x095ea7b3000000000000000000000000742d35Cc6635C0532925a3b8c17d6d1E9C2F7ca00000000000000000000000000000000000000000000000000000000000186a0",
    "chainId": 1329,
    "sponsor": false
  }'
```

## Step 4: Use the Test Script

I've created `test-privy-transaction.js` for you:

```bash
# 1. Edit the file and set your credentials
# Replace AUTH_TOKEN and walletId

# 2. Run the test
node test-privy-transaction.js
```

## Step 5: Monitor the Transaction

After sending a transaction, you'll receive a transaction hash. Monitor it:

### On SEI Explorer
```
https://seitrace.com/tx/YOUR_TX_HASH
```

### Using ethers.js
```javascript
const { ethers } = require('ethers');

const provider = new ethers.JsonRpcProvider('YOUR_RPC_URL');
const receipt = await provider.waitForTransaction(txHash);

if (receipt.status === 1) {
  console.log('✅ Transaction confirmed!');
} else {
  console.log('❌ Transaction failed');
}
```

## Common Issues & Solutions

### Issue 1: "walletId is required"
**Solution:** Make sure you're passing the wallet ID in the request body.

### Issue 2: "Unauthorized"
**Solution:** Check that:
- Your auth token is valid
- The AuthMiddleware is working correctly
- The token is passed in the Authorization header

### Issue 3: "Failed to send transaction"
**Solution:** Check:
- Authorization private key is correctly set in `.env`
- Key is base64-encoded PKCS8 format without PEM headers
- Wallet has sufficient balance (if not using gas sponsorship)

### Issue 4: Transaction broadcasted but failed
**Solution:**
- Check the transaction on the explorer
- Verify the contract address and data are correct
- Check gas limits

## Testing Checklist

- [ ] Authorization private key added to `.env`
- [ ] Server is running (`npm run dev`)
- [ ] Got test wallet ID from Privy
- [ ] Got valid auth token
- [ ] Tested simple transaction
- [ ] Verified transaction on SEI explorer
- [ ] Tested with gas sponsorship (optional)
- [ ] Tested contract call (optional)
- [ ] Implemented authorization checks in controller
- [ ] Set up error monitoring

## Next Steps After Testing

1. **Implement Authorization Checks** - See TODO comments in `PrivyTransactionController.ts`
2. **Set Up Monitoring** - Add alerts for failed transactions
3. **Rate Limiting** - Implement rate limiting on endpoints
4. **Database Integration** - Store transaction history
5. **Build Automation** - Create cron jobs for limit orders, DCA, etc.

## Example Automation: Limit Order Executor

```javascript
// cron job that runs every minute
cron.schedule('* * * * *', async () => {
  const pendingOrders = await Order.find({ status: 'pending' });

  for (const order of pendingOrders) {
    const currentPrice = await getCurrentPrice(order.tokenPair);

    if (shouldExecute(order, currentPrice)) {
      try {
        const result = await axios.post(
          'http://localhost:3000/v1/privy-transactions/limit-order',
          {
            walletId: order.walletId,
            orderData: order.encodedData,
            orderContractAddress: order.contractAddress,
            chainId: 1329,
            sponsor: true
          },
          {
            headers: {
              'Authorization': `Bearer ${order.userToken}`
            }
          }
        );

        await Order.updateOne(
          { _id: order._id },
          { status: 'executed', txHash: result.data.data.hash }
        );
      } catch (error) {
        console.error('Failed to execute order:', error);
      }
    }
  }
});
```

## Support

For issues:
1. Check server logs: `npm run dev`
2. Review `PRIVY_TRANSACTIONS.md` documentation
3. Check Privy documentation: https://docs.privy.io
4. Verify your configuration in `.env`
