/**
 * Uniswap V3 Configuration
 *
 * Contains router, quoter, and factory addresses for supported chains.
 * Reference: https://docs.uniswap.org/contracts/v3/reference/deployments
 */

export interface UniswapV3Config {
  chainId: number;
  chainName: string;
  // Uniswap V3 contracts
  swapRouter02: string;
  quoterV2: string;
  factory: string;
  // Pool fees (in basis points: 100 = 0.01%, 500 = 0.05%, 3000 = 0.3%, 10000 = 1%)
  supportedFees: number[];
  // Wrapped native token address
  wrappedNative: string;
  wrappedNativeSymbol: string;
}

/**
 * Uniswap V3 contract addresses by chain
 */
export const UNISWAP_V3_CONFIGS: Record<string, UniswapV3Config> = {
  // Ethereum Mainnet
  ethereum: {
    chainId: 1,
    chainName: 'ethereum',
    swapRouter02: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    quoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    supportedFees: [100, 500, 3000, 10000],
    wrappedNative: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    wrappedNativeSymbol: 'WETH',
  },

  // Arbitrum One
  arbitrum: {
    chainId: 42161,
    chainName: 'arbitrum',
    swapRouter02: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    quoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    supportedFees: [100, 500, 3000, 10000],
    wrappedNative: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    wrappedNativeSymbol: 'WETH',
  },

  // Polygon
  polygon: {
    chainId: 137,
    chainName: 'polygon',
    swapRouter02: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    quoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    supportedFees: [100, 500, 3000, 10000],
    wrappedNative: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    wrappedNativeSymbol: 'WMATIC',
  },

  // Base
  base: {
    chainId: 8453,
    chainName: 'base',
    swapRouter02: '0x2626664c2603336E57B271c5C0b26F421741e481',
    quoterV2: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
    factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    supportedFees: [100, 500, 3000, 10000],
    wrappedNative: '0x4200000000000000000000000000000000000006',
    wrappedNativeSymbol: 'WETH',
  },

  // Optimism
  optimism: {
    chainId: 10,
    chainName: 'optimism',
    swapRouter02: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    quoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    supportedFees: [100, 500, 3000, 10000],
    wrappedNative: '0x4200000000000000000000000000000000000006',
    wrappedNativeSymbol: 'WETH',
  },
};

/**
 * Common token addresses by chain
 */
export const COMMON_TOKENS: Record<string, Record<string, string>> = {
  ethereum: {
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    DAI: '0x6B175474E89094C44Da98b954EescdeCB5BE3830',
    WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  },
  arbitrum: {
    WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    'USDC.e': '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
    USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    DAI: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
  },
  polygon: {
    WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    'USDC.e': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    DAI: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
    WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    WBTC: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
  },
  base: {
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
    DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
  },
  optimism: {
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    'USDC.e': '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
    USDT: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
    DAI: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    WBTC: '0x68f180fcCe6836688e9084f035309E29Bf0A2095',
  },
};

/**
 * Native token identifiers (case-insensitive)
 */
export const NATIVE_TOKEN_IDENTIFIERS = ['ETH', 'NATIVE', 'MATIC'];

/**
 * Get Uniswap V3 configuration for a network
 */
export function getUniswapConfig(network: string): UniswapV3Config {
  const normalizedNetwork = network.toLowerCase();
  const config = UNISWAP_V3_CONFIGS[normalizedNetwork];

  if (!config) {
    throw new Error(
      `Uniswap V3 not supported on network: ${network}. ` +
      `Supported networks: ${Object.keys(UNISWAP_V3_CONFIGS).join(', ')}`
    );
  }

  return config;
}

/**
 * Check if a token identifier represents native currency
 */
export function isNativeToken(tokenIdentifier: string): boolean {
  return NATIVE_TOKEN_IDENTIFIERS.includes(tokenIdentifier.toUpperCase());
}

/**
 * Get supported networks for Uniswap V3
 */
export function getSupportedUniswapNetworks(): string[] {
  return Object.keys(UNISWAP_V3_CONFIGS);
}
