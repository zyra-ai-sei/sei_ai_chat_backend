// @ts-nocheck
/**
 * Uniswap V3 Swap Service
 *
 * Provides swap transaction building for Uniswap V3 supported chains.
 * Supports both single-hop and multi-hop (smart routed) swaps.
 *
 * Supported chains: Ethereum, Arbitrum, Polygon, Base, Optimism
 * For SEI, use the existing TWAP/Orbs system (place_order tool).
 */

import {
  createPublicClient,
  http,
  encodeFunctionData,
  parseUnits,
  formatUnits,
  getContract,
  type Address,
} from 'viem';
import { mainnet, arbitrum, polygon, base, optimism } from 'viem/chains';
import { Token } from '@uniswap/sdk-core';
import { Pool, FeeAmount } from '@uniswap/v3-sdk';
import { randomUUID } from 'crypto';
import {
  getUniswapConfig,
  isNativeToken,
  UNISWAP_V3_CONFIGS,
} from '../../../config/uniswap';
import { getRpcUrl } from '../chains';

// ============ TYPES ============

export interface SwapQuoteResult {
  amountOut: string;
  amountOutRaw: string;
  gasEstimate?: string;
}

export interface SwapTransactionResult {
  transaction: {
    to: string;
    data: string;
    value: string;
    chainId: number;
    gas?: string;
    // ABI format fields (for frontend writeContract)
    address?: string;
    abi?: any[];
    functionName?: string;
    args?: any[];
  };
  approval?: {
    address: string;
    abi: any[];
    functionName: string;
    args: any[];
    value: string;
    chainId: number;
    label: string;
  };
  metadata: {
    tokenIn: {
      address: string;
      symbol: string;
      decimals: number;
      amount: string;
    };
    tokenOut: {
      address: string;
      symbol: string;
      decimals: number;
      expectedAmount: string;
      minimumAmount: string;
    };
    route: string[];
    fee: number;
    slippage: string;
    deadline: number;
    network: string;
  };
  executionId: string;
}

export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippageTolerance?: number;
  deadline?: number;
  recipient: string;
  network: string;
  fee?: number;
}

// ============ CHAIN MAPPING ============

const CHAIN_MAP = {
  ethereum: mainnet,
  arbitrum: arbitrum,
  polygon: polygon,
  base: base,
  optimism: optimism,
};

// ============ ABIs ============

const POOL_ABI = [
  {
    inputs: [],
    name: 'slot0',
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'observationIndex', type: 'uint16' },
      { name: 'observationCardinality', type: 'uint16' },
      { name: 'observationCardinalityNext', type: 'uint16' },
      { name: 'feeProtocol', type: 'uint8' },
      { name: 'unlocked', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'liquidity',
    outputs: [{ name: '', type: 'uint128' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const ERC20_ABI = [
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'name',
    outputs: [{ type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const QUOTER_V2_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'fee', type: 'uint24' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'quoteExactInputSingle',
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

// SwapRouter02 ABI (different from V1 SwapRouter - no deadline in struct)
const SWAP_ROUTER_02_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'exactInputSingle',
    outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'deadline', type: 'uint256' },
      { name: 'data', type: 'bytes[]' },
    ],
    name: 'multicall',
    outputs: [{ name: 'results', type: 'bytes[]' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'amountMinimum', type: 'uint256' },
      { name: 'recipient', type: 'address' },
    ],
    name: 'unwrapWETH9',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;

// Max uint256 for unlimited approval
const MAX_UINT256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

// ============ HELPER FUNCTIONS ============

/**
 * Get viem public client for a network
 */
function getViemClient(network: string) {
  const chain = CHAIN_MAP[network.toLowerCase()];
  if (!chain) {
    throw new Error(`Unsupported network: ${network}`);
  }

  const rpcUrl = getRpcUrl(network);
  return createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
}

/**
 * Get token info (decimals, symbol, name) from contract
 */
async function getTokenInfo(
  tokenAddress: string,
  network: string
): Promise<{ decimals: number; symbol: string; name: string }> {
  const client = getViemClient(network);

  const contract = getContract({
    address: tokenAddress as Address,
    abi: ERC20_ABI,
    client,
  });

  const [decimals, symbol, name] = await Promise.all([
    contract.read.decimals(),
    contract.read.symbol().catch(() => 'UNKNOWN'),
    contract.read.name().catch(() => 'Unknown Token'),
  ]);

  return { decimals, symbol, name };
}

/**
 * Create a Token object from address
 */
async function createToken(
  tokenAddress: string,
  network: string
): Promise<Token> {
  const config = getUniswapConfig(network);
  const tokenInfo = await getTokenInfo(tokenAddress, network);

  return new Token(
    config.chainId,
    tokenAddress,
    tokenInfo.decimals,
    tokenInfo.symbol,
    tokenInfo.name
  );
}

/**
 * Get the token to use for swapping (handles native token wrapping)
 *
 * isNative is true when:
 * - tokenIdentifier is 'ETH', 'NATIVE', or 'MATIC'
 * - tokenIdentifier equals the wrapped native address for the network (WETH, WMATIC)
 *
 * When isNative is true, the swap will use msg.value (ETH) and the router wraps it.
 * No ERC-20 approval is needed for native tokens.
 */
async function getSwapToken(
  tokenIdentifier: string,
  network: string
): Promise<{ token: Token; isNative: boolean }> {
  const config = getUniswapConfig(network);

  // Check if it's a native token identifier ('ETH', 'NATIVE', 'MATIC')
  if (isNativeToken(tokenIdentifier)) {
    console.log(`[Swap] Token ${tokenIdentifier} detected as native (keyword match)`);
    const wrappedToken = await createToken(config.wrappedNative, network);
    return { token: wrappedToken, isNative: true };
  }

  // Check if the address equals the wrapped native token address for this network
  // This handles cases where the LLM passes WETH address instead of 'ETH'
  if (tokenIdentifier.toLowerCase() === config.wrappedNative.toLowerCase()) {
    console.log(`[Swap] Token ${tokenIdentifier} detected as native (WETH address match)`);
    const wrappedToken = await createToken(config.wrappedNative, network);
    return { token: wrappedToken, isNative: true };
  }

  const token = await createToken(tokenIdentifier, network);
  console.log(`[Swap] Token ${tokenIdentifier} is ERC-20 (not native)`);
  return { token, isNative: false };
}

/**
 * Fetch pool state from on-chain
 */
async function getPoolState(
  poolAddress: string,
  network: string
): Promise<{
  sqrtPriceX96: string;
  liquidity: string;
  tick: number;
}> {
  const client = getViemClient(network);

  const poolContract = getContract({
    address: poolAddress as Address,
    abi: POOL_ABI,
    client,
  });

  const [slot0, liquidity] = await Promise.all([
    poolContract.read.slot0(),
    poolContract.read.liquidity(),
  ]);

  return {
    sqrtPriceX96: slot0[0].toString(),
    liquidity: liquidity.toString(),
    tick: slot0[1],
  };
}

/**
 * Convert fee number to FeeAmount enum
 */
function toFeeAmount(fee: number): FeeAmount {
  switch (fee) {
    case 100:
      return FeeAmount.LOWEST;
    case 500:
      return FeeAmount.LOW;
    case 3000:
      return FeeAmount.MEDIUM;
    case 10000:
      return FeeAmount.HIGH;
    default:
      return FeeAmount.MEDIUM;
  }
}

// ============ QUOTING FUNCTIONS ============

/**
 * Get quote for a single-hop swap using Quoter contract
 */
export async function getSwapQuote(params: {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  fee?: number;
  network: string;
}): Promise<SwapQuoteResult> {
  const { tokenIn, tokenOut, amountIn, fee = 3000, network } = params;
  const config = getUniswapConfig(network);
  const client = getViemClient(network);

  // Get tokens
  const { token: tokenInObj } = await getSwapToken(tokenIn, network);
  const { token: tokenOutObj } = await getSwapToken(tokenOut, network);

  // Parse amount
  const amountInRaw = parseUnits(amountIn, tokenInObj.decimals);

  // Call quoter using simulateContract (callStatic equivalent)
  try {
    const { result } = await client.simulateContract({
      address: config.quoterV2 as Address,
      abi: QUOTER_V2_ABI,
      functionName: 'quoteExactInputSingle',
      args: [
        {
          tokenIn: tokenInObj.address as Address,
          tokenOut: tokenOutObj.address as Address,
          amountIn: amountInRaw,
          fee: fee,
          sqrtPriceLimitX96: BigInt(0),
        },
      ],
    });

    const amountOut = result[0].toString();

    return {
      amountOut: formatUnits(BigInt(amountOut), tokenOutObj.decimals),
      amountOutRaw: amountOut,
      gasEstimate: result[3].toString(),
    };
  } catch (error) {
    throw new Error(
      `Failed to get quote: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
      `This may indicate no liquidity for ${tokenInObj.symbol}/${tokenOutObj.symbol} at fee tier ${fee/10000}%`
    );
  }
}

// ============ SINGLE-HOP SWAP ============

/**
 * Build a single-hop swap transaction using Uniswap V3 SwapRouter02
 *
 * Uses SwapRouter02 ABI directly (NOT the SDK's SwapRouter class which
 * generates V1 SwapRouter calldata with a different struct layout).
 *
 * SwapRouter02 differences from V1:
 * - exactInputSingle struct has NO deadline field
 * - Deadline is handled via multicall(uint256 deadline, bytes[] data)
 * - Native ETH: send as msg.value, use WETH address as tokenIn
 * - Native ETH output: set recipient to router address(2), add unwrapWETH9 call
 */
export async function buildSwapExactInputSingle(params: SwapParams): Promise<SwapTransactionResult> {
  const {
    tokenIn,
    tokenOut,
    amountIn,
    slippageTolerance = 0.5,
    deadline = 20 * 60,
    recipient,
    network,
    fee = 3000,
  } = params;

  const config = getUniswapConfig(network);

  // Get tokens (resolves native ETH → WETH address)
  const { token: tokenInObj, isNative: isNativeIn } = await getSwapToken(tokenIn, network);
  const { token: tokenOutObj, isNative: isNativeOut } = await getSwapToken(tokenOut, network);

  console.log(`[Swap] Building swap: ${tokenIn} → ${tokenOut}`);
  console.log(`[Swap] isNativeIn=${isNativeIn}, isNativeOut=${isNativeOut}`);
  console.log(`[Swap] TokenIn resolved to: ${tokenInObj.address} (${tokenInObj.symbol})`);
  console.log(`[Swap] TokenOut resolved to: ${tokenOutObj.address} (${tokenOutObj.symbol})`);

  // Parse amount
  const amountInRaw = parseUnits(amountIn, tokenInObj.decimals);

  // Get quote
  const quote = await getSwapQuote({
    tokenIn: tokenInObj.address,
    tokenOut: tokenOutObj.address,
    amountIn,
    fee,
    network,
  });

  // Calculate minimum amount out with slippage
  const slippageMultiplier = 1 - slippageTolerance / 100;
  const minimumAmountOutRaw = BigInt(
    Math.floor(Number(quote.amountOutRaw) * slippageMultiplier)
  );
  const minimumAmountOut = (
    parseFloat(quote.amountOut) * slippageMultiplier
  ).toFixed(tokenOutObj.decimals);

  // Calculate deadline timestamp
  const deadlineTimestamp = Math.floor(Date.now() / 1000) + deadline;

  // For native ETH output: swap recipient is the router (address(2) signals this),
  // then unwrapWETH9 sends ETH to the actual recipient
  const swapRecipient = isNativeOut
    ? '0x0000000000000000000000000000000000000002' as Address
    : recipient as Address;

  // Encode exactInputSingle calldata for SwapRouter02
  const swapCalldata = encodeFunctionData({
    abi: SWAP_ROUTER_02_ABI,
    functionName: 'exactInputSingle',
    args: [
      {
        tokenIn: tokenInObj.address as Address,
        tokenOut: tokenOutObj.address as Address,
        fee: fee,
        recipient: swapRecipient,
        amountIn: amountInRaw,
        amountOutMinimum: minimumAmountOutRaw,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });

  // Build multicall data array
  const multicallData: `0x${string}`[] = [swapCalldata];

  // If output is native ETH, add unwrapWETH9 call
  if (isNativeOut) {
    const unwrapCalldata = encodeFunctionData({
      abi: SWAP_ROUTER_02_ABI,
      functionName: 'unwrapWETH9',
      args: [minimumAmountOutRaw, recipient as Address],
    });
    multicallData.push(unwrapCalldata);
  }

  // Wrap in multicall with deadline
  const finalCalldata = encodeFunctionData({
    abi: SWAP_ROUTER_02_ABI,
    functionName: 'multicall',
    args: [BigInt(deadlineTimestamp), multicallData],
  });

  // Determine ETH value to send
  // For native ETH input, user sends ETH with the transaction (msg.value)
  // For ERC-20 input, value is 0 (tokens pulled via transferFrom after approval)
  const txValue = isNativeIn ? amountInRaw : 0n;
  console.log(`[Swap] Transaction value (ETH to send): ${txValue} wei (isNativeIn=${isNativeIn})`);

  // Estimate gas
  const client = getViemClient(network);
  let gasEstimate: bigint;
  try {
    gasEstimate = await client.estimateGas({
      account: recipient as Address,
      to: config.swapRouter02 as Address,
      data: finalCalldata,
      value: txValue,
    });
    // Add 20% buffer for safety
    gasEstimate = (gasEstimate * 120n) / 100n;
  } catch (error) {
    console.warn('[Swap] Gas estimation failed, using default:', error);
    gasEstimate = 350000n;
  }

  // Build multicall ABI (only the multicall function needed for writeContract)
  const multicallAbi = [
    {
      inputs: [
        { name: 'deadline', type: 'uint256' },
        { name: 'data', type: 'bytes[]' },
      ],
      name: 'multicall',
      outputs: [{ name: 'results', type: 'bytes[]' }],
      stateMutability: 'payable',
      type: 'function',
    },
  ];

  // Check ERC-20 allowance for non-native tokens
  // Native tokens (ETH, MATIC) don't need approval - they're sent as msg.value
  let approval: SwapTransactionResult['approval'] | undefined;
  if (isNativeIn) {
    console.log(`[Swap] Skipping approval check for native token (isNativeIn=true)`);
  } else {
    console.log(`[Swap] Checking ERC-20 allowance for ${tokenInObj.symbol}...`);
    try {
      const currentAllowance = await client.readContract({
        address: tokenInObj.address as Address,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [recipient as Address, config.swapRouter02 as Address],
      });

      if (currentAllowance < amountInRaw) {
        console.log(`[Swap] Insufficient allowance (${currentAllowance} < ${amountInRaw}), approval needed`);
        approval = {
          address: tokenInObj.address,
          abi: [
            {
              inputs: [
                { name: 'spender', type: 'address' },
                { name: 'amount', type: 'uint256' },
              ],
              name: 'approve',
              outputs: [{ name: '', type: 'bool' }],
              stateMutability: 'nonpayable',
              type: 'function',
            },
          ],
          functionName: 'approve',
          args: [config.swapRouter02, MAX_UINT256.toString()],
          value: '0',
          chainId: config.chainId,
          label: `Approve ${tokenInObj.symbol || 'token'} for swap`,
        };
      }
    } catch (error) {
      console.warn('[Swap] Allowance check failed, including approval step:', error);
      // If we can't check, include approval to be safe
      approval = {
        address: tokenInObj.address,
        abi: [
          {
            inputs: [
              { name: 'spender', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
            name: 'approve',
            outputs: [{ name: '', type: 'bool' }],
            stateMutability: 'nonpayable',
            type: 'function',
          },
        ],
        functionName: 'approve',
        args: [config.swapRouter02, MAX_UINT256.toString()],
        value: '0',
        chainId: config.chainId,
        label: `Approve ${tokenInObj.symbol || 'token'} for swap`,
      };
    }
  }

  return {
    transaction: {
      // Raw format (for delegated orders / server-side execution)
      to: config.swapRouter02,
      data: finalCalldata,
      value: txValue.toString(),
      chainId: config.chainId,
      gas: gasEstimate.toString(),
      // ABI format (for frontend writeContract via wagmi)
      address: config.swapRouter02,
      abi: multicallAbi,
      functionName: 'multicall',
      args: [deadlineTimestamp, multicallData],
    },
    approval,
    metadata: {
      tokenIn: {
        address: isNativeIn ? 'NATIVE' : tokenInObj.address,
        symbol: isNativeIn ? config.wrappedNativeSymbol.replace('W', '') : tokenInObj.symbol || 'UNKNOWN',
        decimals: tokenInObj.decimals,
        amount: amountIn,
      },
      tokenOut: {
        address: isNativeOut ? 'NATIVE' : tokenOutObj.address,
        symbol: isNativeOut ? config.wrappedNativeSymbol.replace('W', '') : tokenOutObj.symbol || 'UNKNOWN',
        decimals: tokenOutObj.decimals,
        expectedAmount: quote.amountOut,
        minimumAmount: minimumAmountOut,
      },
      route: [tokenInObj.symbol || 'UNKNOWN', tokenOutObj.symbol || 'UNKNOWN'],
      fee,
      slippage: `${slippageTolerance}%`,
      deadline: deadlineTimestamp,
      network,
    },
    executionId: randomUUID(),
  };
}

// ============ MAIN ENTRY POINT ============

/**
 * Build a swap transaction - main entry point
 *
 * Currently supports single-hop swaps. For multi-hop, the AlphaRouter
 * requires ethers v5 which conflicts with this project's ethers v6.
 *
 * @param params Swap parameters
 * @param params.tokenIn Input token address or 'ETH'/'NATIVE' for native token
 * @param params.tokenOut Output token address or 'ETH'/'NATIVE' for native token
 * @param params.amountIn Human-readable amount to swap
 * @param params.slippageTolerance Slippage tolerance in percentage (default: 0.5%)
 * @param params.deadline Transaction deadline in seconds from now (default: 20 minutes)
 * @param params.recipient Address to receive output tokens
 * @param params.network Network name (ethereum, arbitrum, polygon, base, optimism)
 * @param params.useSmartRouting Not currently supported due to ethers version conflict
 * @param params.fee Fee tier for swap (default: 3000 = 0.3%)
 */
export async function buildSwapTransaction(params: {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippageTolerance?: number;
  deadline?: number;
  recipient: string;
  network: string;
  useSmartRouting?: boolean;
  fee?: number;
}): Promise<SwapTransactionResult> {
  const { useSmartRouting = false, ...swapParams } = params;

  // Validate network
  const supportedNetworks = Object.keys(UNISWAP_V3_CONFIGS);
  if (!supportedNetworks.includes(params.network.toLowerCase())) {
    throw new Error(
      `Network '${params.network}' is not supported for Uniswap V3 swaps. ` +
      `Supported networks: ${supportedNetworks.join(', ')}. ` +
      'For SEI, use the place_order tool with TWAP/Orbs system.'
    );
  }

  if (useSmartRouting) {
    console.warn(
      '[Swap] Smart routing (AlphaRouter) is not available due to ethers version conflict. ' +
      'Falling back to single-hop swap. For complex routes, specify intermediate tokens manually.'
    );
  }

  // Use single-hop swap
  return buildSwapExactInputSingle(swapParams);
}

/**
 * Get supported fee tiers for a network
 */
export function getSupportedFeeTiers(network: string): number[] {
  const config = getUniswapConfig(network);
  return config.supportedFees;
}

/**
 * Check if a token pair has a direct pool at a given fee tier
 */
export async function hasDirectPool(params: {
  tokenIn: string;
  tokenOut: string;
  fee: number;
  network: string;
}): Promise<boolean> {
  const { tokenIn, tokenOut, fee, network } = params;

  try {
    const { token: tokenInObj } = await getSwapToken(tokenIn, network);
    const { token: tokenOutObj } = await getSwapToken(tokenOut, network);

    const poolAddress = Pool.getAddress(tokenInObj, tokenOutObj, toFeeAmount(fee));
    const client = getViemClient(network);

    const code = await client.getCode({ address: poolAddress as Address });
    return code !== undefined && code !== '0x';
  } catch {
    return false;
  }
}

/**
 * Find the best fee tier for a token pair
 */
export async function findBestFeeTier(params: {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  network: string;
}): Promise<{ fee: number; amountOut: string } | null> {
  const { tokenIn, tokenOut, amountIn, network } = params;
  const feeTiers = getSupportedFeeTiers(network);

  let bestQuote: { fee: number; amountOut: string } | null = null;

  for (const fee of feeTiers) {
    try {
      const quote = await getSwapQuote({
        tokenIn,
        tokenOut,
        amountIn,
        fee,
        network,
      });

      if (!bestQuote || parseFloat(quote.amountOut) > parseFloat(bestQuote.amountOut)) {
        bestQuote = { fee, amountOut: quote.amountOut };
      }
    } catch {
      // Pool doesn't exist at this fee tier, continue
    }
  }

  return bestQuote;
}
