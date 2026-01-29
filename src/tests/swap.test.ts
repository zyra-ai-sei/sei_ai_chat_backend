/**
 * Uniswap V3 Swap Service Test
 *
 * Run with: npx ts-node --transpile-only src/tests/swap.test.ts
 */

import {
  buildSwapTransaction,
  getSwapQuote,
  getSupportedFeeTiers,
  findBestFeeTier,
} from '../tools/core/services/swap';
import { getUniswapConfig, getSupportedUniswapNetworks } from '../config/uniswap';

// Test configurations
const TEST_CASES = {
  // Arbitrum: USDC → WETH (high liquidity pair)
  arbitrumUsdcToWeth: {
    tokenIn: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC on Arbitrum
    tokenOut: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH on Arbitrum
    amountIn: '100',
    recipient: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e', // Test address (checksummed)
    network: 'arbitrum',
    fee: 500, // 0.05% pool (most liquid for USDC/WETH)
  },
};

async function testConfig() {
  console.log('\n========== CONFIG TEST ==========\n');

  const networks = getSupportedUniswapNetworks();
  console.log('Supported Networks:', networks);

  for (const network of networks) {
    const config = getUniswapConfig(network);
    console.log(`\n${network.toUpperCase()}:`);
    console.log(`  ChainId: ${config.chainId}`);
    console.log(`  SwapRouter02: ${config.swapRouter02}`);
    console.log(`  QuoterV2: ${config.quoterV2}`);
    console.log(`  Fee Tiers: ${getSupportedFeeTiers(network).join(', ')}`);
  }
}

async function testQuote() {
  console.log('\n========== QUOTE TEST (Arbitrum USDC → WETH) ==========\n');

  const params = TEST_CASES.arbitrumUsdcToWeth;

  try {
    console.log('Getting quote for 100 USDC → WETH on Arbitrum...');

    const quote = await getSwapQuote({
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountIn: params.amountIn,
      fee: params.fee,
      network: params.network,
    });

    console.log('\n✅ Quote Result:');
    console.log(`  Amount Out: ${quote.amountOut} WETH`);
    console.log(`  Amount Out (raw): ${quote.amountOutRaw}`);
    console.log(`  Gas Estimate: ${quote.gasEstimate}`);
    return true;
  } catch (error) {
    console.log('\n❌ Quote Error:', error instanceof Error ? error.message : error);
    return false;
  }
}

async function testFindBestFee() {
  console.log('\n========== FIND BEST FEE TIER TEST ==========\n');

  const params = TEST_CASES.arbitrumUsdcToWeth;

  try {
    console.log('Finding best fee tier for USDC → WETH on Arbitrum...');

    const bestFee = await findBestFeeTier({
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountIn: params.amountIn,
      network: params.network,
    });

    if (bestFee) {
      console.log('\n✅ Best Fee Tier Found:');
      console.log(`  Fee: ${bestFee.fee} (${bestFee.fee / 10000}%)`);
      console.log(`  Amount Out: ${bestFee.amountOut} WETH`);
    } else {
      console.log('\n⚠️ No pools found for this pair');
    }
    return true;
  } catch (error) {
    console.log('\n❌ Error:', error instanceof Error ? error.message : error);
    return false;
  }
}

async function testSwapBuild() {
  console.log('\n========== SWAP BUILD TEST (Arbitrum USDC → WETH) ==========\n');

  const params = TEST_CASES.arbitrumUsdcToWeth;
  console.log('Input:', JSON.stringify(params, null, 2));

  try {
    const result = await buildSwapTransaction({
      ...params,
      slippageTolerance: 0.5,
      deadline: 1200, // 20 minutes
    });

    console.log('\n✅ SUCCESS!\n');
    console.log('Transaction:');
    console.log(`  To: ${result.transaction.to}`);
    console.log(`  Data: ${result.transaction.data.slice(0, 66)}...`);
    console.log(`  Value: ${result.transaction.value}`);
    console.log(`  ChainId: ${result.transaction.chainId}`);

    console.log('\nMetadata:');
    console.log(`  TokenIn: ${result.metadata.tokenIn.amount} ${result.metadata.tokenIn.symbol}`);
    console.log(`  TokenOut: ~${result.metadata.tokenOut.expectedAmount} ${result.metadata.tokenOut.symbol}`);
    console.log(`  Minimum: ${result.metadata.tokenOut.minimumAmount} ${result.metadata.tokenOut.symbol}`);
    console.log(`  Route: ${result.metadata.route.join(' → ')}`);
    console.log(`  Fee: ${result.metadata.fee} (${result.metadata.fee / 10000}%)`);
    console.log(`  Slippage: ${result.metadata.slippage}`);
    console.log(`  Deadline: ${new Date(result.metadata.deadline * 1000).toISOString()}`);

    console.log('\nExecution ID:', result.executionId);

    console.log('\n📋 Ready for Privy Transaction Service:');
    console.log(JSON.stringify({
      transactionData: result.transaction,
      metadata: result.metadata,
    }, null, 2));

    return result;
  } catch (error) {
    console.log('\n❌ ERROR:', error instanceof Error ? error.message : error);
    return null;
  }
}

async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         UNISWAP V3 SWAP SERVICE TEST SUITE                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  // Test 1: Config
  await testConfig();

  // Test 2: Quote
  const quoteOk = await testQuote();

  if (quoteOk) {
    // Test 3: Find best fee
    await testFindBestFee();

    // Test 4: Swap build
    await testSwapBuild();
  }

  console.log('\n========== ALL TESTS COMPLETE ==========\n');
}

// Run tests
runAllTests().catch(console.error);
