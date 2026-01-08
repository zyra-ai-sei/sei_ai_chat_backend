/**
 * Test script for Privy Server-Initiated Transactions
 *
 * This script helps you test the transaction endpoints
 */

const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:3000';
const AUTH_TOKEN = 'YOUR_AUTH_TOKEN_HERE'; // Replace with actual auth token

// Test data
const testTransaction = {
  walletId: 'YOUR_WALLET_ID_HERE', // Replace with actual wallet ID from Privy
  to: '0x742d35Cc6635C0532925a3b8c17d6d1E9C2F7ca', // Test recipient address
  value: '0x2386F26FC10000', // 0.01 ETH in wei (hex) = 10000000000000 wei
  chainId: 1329, // SEI mainnet
  sponsor: false // Set to true if you want to sponsor gas
};

async function testExecuteTransaction() {
  try {
    console.log('🚀 Testing Privy Transaction Execution...\n');
    console.log('Transaction Details:');
    console.log('  - Wallet ID:', testTransaction.walletId);
    console.log('  - To:', testTransaction.to);
    console.log('  - Value:', testTransaction.value, '(~0.01 ETH)');
    console.log('  - Chain ID:', testTransaction.chainId);
    console.log('  - Gas Sponsor:', testTransaction.sponsor);
    console.log('\n');

    const response = await axios.post(
      `${BASE_URL}/v1/privy-transactions/execute`,
      testTransaction,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AUTH_TOKEN}`
        }
      }
    );

    console.log('✅ Transaction Sent Successfully!\n');
    console.log('Response:', JSON.stringify(response.data, null, 2));

    if (response.data.data && response.data.data.hash) {
      const txHash = response.data.data.hash;
      console.log('\n📝 Transaction Hash:', txHash);
      console.log('🔍 View on Explorer:');
      console.log(`   https://seitrace.com/tx/${txHash}`);
    }

    return response.data;
  } catch (error) {
    console.error('❌ Transaction Failed!\n');

    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Error:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('No response received from server');
      console.error('Check if server is running on', BASE_URL);
    } else {
      console.error('Error:', error.message);
    }

    throw error;
  }
}

async function testContractCall() {
  try {
    console.log('\n🚀 Testing Contract Call...\n');

    // Example: ERC20 token approval
    // This is the encoded data for approve(spender, amount)
    const approveData = '0x095ea7b3' + // Function selector for approve(address,uint256)
      '000000000000000000000000742d35Cc6635C0532925a3b8c17d6d1E9C2F7ca' + // Spender address (padded)
      '00000000000000000000000000000000000000000000000000000000000186a0'; // Amount (100000)

    const contractCallData = {
      walletId: testTransaction.walletId,
      contractAddress: '0xYourTokenAddress', // Replace with actual token contract
      data: approveData,
      chainId: 1329,
      sponsor: false
    };

    console.log('Contract Call Details:');
    console.log('  - Wallet ID:', contractCallData.walletId);
    console.log('  - Contract:', contractCallData.contractAddress);
    console.log('  - Data:', contractCallData.data);
    console.log('\n');

    const response = await axios.post(
      `${BASE_URL}/v1/privy-transactions/contract-call`,
      contractCallData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AUTH_TOKEN}`
        }
      }
    );

    console.log('✅ Contract Call Sent Successfully!\n');
    console.log('Response:', JSON.stringify(response.data, null, 2));

    return response.data;
  } catch (error) {
    console.error('❌ Contract Call Failed!');
    console.error('Error:', error.response?.data || error.message);
    throw error;
  }
}

// Main execution
async function main() {
  console.log('================================================');
  console.log('  Privy Server-Initiated Transaction Test');
  console.log('================================================\n');

  // Check configuration
  if (AUTH_TOKEN === 'YOUR_AUTH_TOKEN_HERE') {
    console.error('❌ Please set AUTH_TOKEN in the script');
    process.exit(1);
  }

  if (testTransaction.walletId === 'YOUR_WALLET_ID_HERE') {
    console.error('❌ Please set walletId in the script');
    console.error('   Get wallet ID from your Privy dashboard or user data');
    process.exit(1);
  }

  // Run tests
  try {
    // Test 1: Simple transaction
    await testExecuteTransaction();

    // Uncomment to test contract calls
    // await testContractCall();

    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('\n❌ Tests failed');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { testExecuteTransaction, testContractCall };
