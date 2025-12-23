/**
 * Network and Token Configuration
 *
 * This file contains all network configurations and token mappings for multichain support.
 *
 * Usage:
 * - Get network config: getNetworkConfig('sei')
 * - Get token address: getTokenAddress('USDC', 'sei')
 * - Get token symbol: getTokenSymbol('0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392', 'sei')
 * - Validate network: isNetworkSupported('ethereum')
 */

export interface NetworkConfig {
  chainId: number;
  name: string;
  symbol: string;
  rpcUrl?: string;
  wssUrl?: string;
  blockExplorer?: string;
  isTestnet?: boolean;
}

export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  name?: string;
}

import env from "../envConfig";

/**
 * Supported Networks Configuration
 */
export const SUPPORTED_NETWORKS: Record<string, NetworkConfig> = {
  sei: {
    chainId: 1329,
    name: "Sei Network",
    symbol: "SEI",
    rpcUrl: `https://sei-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`,
    wssUrl: `wss://sei-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`,
    blockExplorer: "https://seitrace.com",
    isTestnet: false,
  },
  ethereum: {
    chainId: 1,
    name: "Ethereum Mainnet",
    symbol: "ETH",
    rpcUrl: `https://eth-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`,
    wssUrl: `wss://eth-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`,
    blockExplorer: "https://etherscan.io",
    isTestnet: false,
  },
  polygon: {
    chainId: 137,
    name: "Polygon",
    symbol: "MATIC",
    rpcUrl: `https://polygon-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`,
    wssUrl: `wss://polygon-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`,
    blockExplorer: "https://polygonscan.com",
    isTestnet: false,
  },
  arbitrum: {
    chainId: 42161,
    name: "Arbitrum One",
    symbol: "ETH",
    rpcUrl: `https://arb-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`,
    wssUrl: `wss://arb-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`,
    blockExplorer: "https://arbiscan.io",
    isTestnet: false,
  },
  base: {
    chainId: 8453,
    name: "Base",
    symbol: "ETH",
    rpcUrl: `https://base-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`,
    wssUrl: `wss://base-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`,
    blockExplorer: "https://basescan.org",
    isTestnet: false,
  },
};

/**
 * Token Mappings by Network
 * Structure: { [network]: { [symbol]: TokenInfo } }
 */
export const NETWORK_TOKENS: Record<string, Record<string, TokenInfo>> = {
  sei: {
    WSEI: {
      address: "0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7",
      symbol: "WSEI",
      decimals: 18,
      name: "Wrapped SEI",
    },
    USDC: {
      address: "0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392",
      symbol: "USDC",
      decimals: 6,
      name: "USD Coin",
    },
    WBTC: {
      address: "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c",
      symbol: "WBTC",
      decimals: 8,
      name: "Wrapped Bitcoin",
    },
    ISEI: {
      address: "0x5Cf6826140C1C56Ff49C808A1A75407Cd1DF9423",
      symbol: "ISEI",
      decimals: 18,
      name: "ISEI",
    },
    WETH: {
      address: "0x160345fC359604fC6e70E3c5fAcbdE5F7A9342d8",
      symbol: "WETH",
      decimals: 18,
      name: "Wrapped Ether",
    },
    KAVAUSDT: {
      address: "0xB75D0B03c06A926e488e2659DF1A861F860bD3d1",
      symbol: "KAVAUSDT",
      decimals: 6,
      name: "KAVA USDT",
    },
    USDT: {
      address: "0x9151434b16b9763660705744891fA906F660EcC5",
      symbol: "USDT",
      decimals: 6,
      name: "Tether USD",
    },
    "USDC.N": {
      address: "0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1",
      symbol: "USDC.N",
      decimals: 6,
      name: "Native USDC",
    },
    SEIYAN: {
      address: "0x5f0E07dFeE5832Faa00c63F2D33A0D79150E8598",
      symbol: "SEIYAN",
      decimals: 18,
      name: "Seiyan",
    },
    USDA: {
      address: "0x0Bbda0F76e205Fc6A160B90a09975fa443B3fE44",
      symbol: "USDA",
      decimals: 18,
      name: "USDA",
    },
    APO: {
      address: "0x5b8203e65aA5Be3F1CF53FD7fa21b91BA4038ECC",
      symbol: "APO",
      decimals: 18,
      name: "APO",
    },
    DRG: {
      address: "0x0a526e425809aEA71eb279d24ae22Dee6C92A4Fe",
      symbol: "DRG",
      decimals: 18,
      name: "Dragon",
    },
  },
  ethereum: {
    WETH: {
      address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      symbol: "WETH",
      decimals: 18,
      name: "Wrapped Ether",
    },
    USDC: {
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      symbol: "USDC",
      decimals: 6,
      name: "USD Coin",
    },
    USDT: {
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      symbol: "USDT",
      decimals: 6,
      name: "Tether USD",
    },
    WBTC: {
      address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      symbol: "WBTC",
      decimals: 8,
      name: "Wrapped Bitcoin",
    },
  },
  polygon: {
    WMATIC: {
      address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
      symbol: "WMATIC",
      decimals: 18,
      name: "Wrapped Matic",
    },
    WPOL: {
      address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
      symbol: "WPOL",
      decimals: 18,
      name: "Wrapped POL",
    },
    USDC: {
      address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      symbol: "USDC",
      decimals: 6,
      name: "USD Coin",
    },
    USDT: {
      address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
      symbol: "USDT",
      decimals: 6,
      name: "Tether USD",
    },
    WETH: {
      address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
      symbol: "WETH",
      decimals: 18,
      name: "Wrapped Ether",
    },
  },
  arbitrum: {
    WETH: {
      address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      symbol: "WETH",
      decimals: 18,
      name: "Wrapped Ether",
    },
    USDC: {
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      symbol: "USDC",
      decimals: 6,
      name: "USD Coin",
    },
    USDT: {
      address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      symbol: "USDT",
      decimals: 6,
      name: "Tether USD",
    },
  },
 
  base: {
    WETH: {
      address: "0x4200000000000000000000000000000000000006",
      symbol: "WETH",
      decimals: 18,
      name: "Wrapped Ether",
    },
    USDC: {
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      symbol: "USDC",
      decimals: 6,
      name: "USD Coin",
    },
    USDT: {
      address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
      symbol: "USDT",
      decimals: 6,
      name: "Bridged Tether USD",
    },
    WBTC: {
      address: "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c",
      symbol: "WBTC",
      decimals: 8,
      name: "Wrapped BTC",
    },
  },
   optimism: {
    WETH: {
      address: "0x4200000000000000000000000000000000000006",
      symbol: "WETH",
      decimals: 18,
      name: "Wrapped Ether",
    },
    USDC: {
      address: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607",
      symbol: "USDC",
      decimals: 6,
      name: "USD Coin",
    },
    USDT: {
      address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
      symbol: "USDT",
      decimals: 6,
      name: "Tether USD",
    },
  },
};

/**
 * Helper Functions
 */

/**
 * Get network configuration by network name
 */
export function getNetworkConfig(network: string): NetworkConfig | undefined {
  return SUPPORTED_NETWORKS[network.toLowerCase()];
}

/**
 * Check if a network is supported
 */
export function isNetworkSupported(network: string): boolean {
  return network.toLowerCase() in SUPPORTED_NETWORKS;
}

/**
 * Get list of supported network names
 */
export function getSupportedNetworkNames(): string[] {
  return Object.keys(SUPPORTED_NETWORKS);
}

/**
 * Get token address by symbol and network
 * @param symbol - Token symbol (e.g., "USDC", "WETH")
 * @param network - Network name (e.g., "sei", "ethereum")
 * @returns Token address or undefined if not found
 */
export function getTokenAddress(
  symbol: string,
  network: string
): string | undefined {
  const networkTokens = NETWORK_TOKENS[network.toLowerCase()];
  if (!networkTokens) return undefined;

  const token = networkTokens[symbol.toUpperCase()];
  return token?.address;
}

/**
 * Get token symbol by address and network
 * @param address - Token contract address
 * @param network - Network name (e.g., "sei", "ethereum")
 * @returns Token symbol or undefined if not found
 */
export function getTokenSymbol(
  address: string,
  network: string
): string | undefined {
  const networkTokens = NETWORK_TOKENS[network.toLowerCase()];
  if (!networkTokens) return undefined;

  const normalizedAddress = address.toLowerCase();
  for (const [symbol, tokenInfo] of Object.entries(networkTokens)) {
    if (tokenInfo.address.toLowerCase() === normalizedAddress) {
      return symbol;
    }
  }
  return undefined;
}

/**
 * Get complete token info by symbol and network
 * @param symbol - Token symbol (e.g., "USDC", "WETH")
 * @param network - Network name (e.g., "sei", "ethereum")
 * @returns TokenInfo object or undefined if not found
 */
export function getTokenInfo(
  symbol: string,
  network: string
): TokenInfo | undefined {
  const networkTokens = NETWORK_TOKENS[network.toLowerCase()];
  if (!networkTokens) return undefined;

  return networkTokens[symbol.toUpperCase()];
}

/**
 * Get complete token info by address and network
 * @param address - Token contract address
 * @param network - Network name (e.g., "sei", "ethereum")
 * @returns TokenInfo object or undefined if not found
 */
export function getTokenInfoByAddress(
  address: string,
  network: string
): TokenInfo | undefined {
  const networkTokens = NETWORK_TOKENS[network.toLowerCase()];
  if (!networkTokens) return undefined;

  const normalizedAddress = address.toLowerCase();
  for (const tokenInfo of Object.values(networkTokens)) {
    if (tokenInfo.address.toLowerCase() === normalizedAddress) {
      return tokenInfo;
    }
  }
  return undefined;
}

/**
 * Get all tokens for a specific network
 * @param network - Network name (e.g., "sei", "ethereum")
 * @returns Record of token symbols to TokenInfo
 */
export function getNetworkTokens(
  network: string
): Record<string, TokenInfo> | undefined {
  return NETWORK_TOKENS[network.toLowerCase()];
}

/**
 * Get network by chain ID
 * @param chainId - Chain ID number
 * @returns Network name or undefined if not found
 */
export function getNetworkByChainId(chainId: number): string | undefined {
  for (const [network, config] of Object.entries(SUPPORTED_NETWORKS)) {
    if (config.chainId === chainId) {
      return network;
    }
  }
  return undefined;
}

/**
 * Legacy compatibility: Get token address or symbol
 * Maintains backward compatibility with existing code
 */
export function getTokenMapping(
  tokenInfo: string,
  network: string = "sei"
): string | undefined {
  const upperTokenInfo = tokenInfo.toUpperCase();

  // Check if it's a symbol (get address)
  const address = getTokenAddress(upperTokenInfo, network);
  if (address) return address;

  // Check if it's an address (get symbol)
  const symbol = getTokenSymbol(tokenInfo, network);
  if (symbol) return symbol;

  return undefined;
}

/**
 * Export for backward compatibility
 * @deprecated Use getTokenAddress or getTokenSymbol instead
 */
export const TOKEN_ADDRESS_MAPPING = {
  "1329": NETWORK_TOKENS.sei,
  sei: NETWORK_TOKENS.sei,
};
