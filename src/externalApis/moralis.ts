import { chainIdToMoralisChain, portfolioChains } from "../data/chains";
import env from "../envConfig";
import { Address } from "viem";

const options = {
  method: "GET",
  headers: {
    accept: "application/json",
    "X-API-Key": env.MORALIS_API,
  },
};

export interface MoralisToken {
  token_address: string;
  symbol: string;
  name: string;
  logo: string | null;
  thumbnail: string | null;
  decimals: number;
  balance: string;
  possible_spam: boolean;
  verified_contract: boolean;
  total_supply: string | null;
  total_supply_formatted: string | null;
  percentage_relative_to_total_supply: number | null;
  security_score: number | null;
  balance_formatted: string;
  usd_price: number;
  usd_price_24hr_percent_change: number;
  usd_price_24hr_usd_change: number;
  usd_value: number;
  usd_value_24hr_usd_change: number;
  native_token: boolean;
  portfolio_percentage: number;
  // Added field to track which chain this token is from
  chainId?: number;
}

export interface DefiPosition {
  protocol_name: string;
  protocol_id: string;
  protocol_url: string;
  protocol_logo: string;
  account_data: Record<string, any>;
  total_projected_earnings_usd: {
    daily: number | null;
    weekly: number | null;
    monthly: number | null;
    yearly: number | null;
  };
  position: {
    label: string;
    address: string;
    balance_usd: number;
    total_unclaimed_usd_value: number | null;
    tokens: Array<{
      token_type: string;
      name: string;
      symbol: string;
      contract_address: string;
      decimals: string;
      logo: string;
      thumbnail: string;
      balance: string;
      balance_formatted: string;
      usd_price: number | null;
      usd_value: number | null;
    }>;
    position_details: Record<string, any>;
  };
    chainId?: number;
}

export interface walletSummary {
  total_count_of_trades: number,
  total_trade_volume: string,
  total_realized_profit_usd: string,
  total_realized_profit_percentage: number,
  total_buys: number,
  total_sells: number,
  total_sold_volume_usd: string,
  total_bought_volume_usd: string,
  chainId?:number
}

interface MoralisResponse {
  cursor: string | null;
  page: number;
  page_size: number;
  block_number: number;
  result: MoralisToken[];
}

async function getTokenBalancesForChain(
  address: Address,
  chainId: number
): Promise<MoralisToken[]> {
  const chainName = chainIdToMoralisChain[chainId];
  if (!chainName) {
    console.warn(`Chain ID ${chainId} not supported by Moralis`);
    return [];
  }

  try {
    const res = await fetch(
      `https://deep-index.moralis.io/api/v2.2/wallets/${address}/tokens?chain=${chainName}&limit=100`,
      options
    );

    if (!res.ok) {
      console.error(
        `Failed to fetch tokens for chain ${chainName}: ${res.status}`
      );
      return [];
    }

    const data: MoralisResponse = await res.json();

    // Add chainId to each token and filter out spam tokens
    return data.result
      .filter((token) => !token.possible_spam)
      .map((token) => ({
        ...token,
        chainId,
      }));
  } catch (error) {
    console.error(`Error fetching tokens for chain ${chainName}:`, error);
    return [];
  }
}

export async function getTokenBalances(
  address: Address
): Promise<MoralisToken[]> {
  const chains = portfolioChains;

  // Fetch balances from all chains in parallel
  const balancePromises = chains.map((chainId) =>
    getTokenBalancesForChain(address, chainId)
  );
  const balancesByChain = await Promise.all(balancePromises);

  // Flatten all tokens into a single array
  const allTokens = balancesByChain.flat();

  return allTokens;
}

export async function getTokenBalancesByChain(
  address: Address
): Promise<Record<number, MoralisToken[]>> {
  const chains = portfolioChains;

  // Fetch balances from all chains in parallel
  const balancePromises = chains.map((chainId) =>
    getTokenBalancesForChain(address, chainId)
  );
  const balancesByChain = await Promise.all(balancePromises);

  // Return as object keyed by chainId
  return chains.reduce((acc, chainId, index) => {
    acc[chainId] = balancesByChain[index];
    return acc;
  }, {} as Record<number, MoralisToken[]>);
}

export async function getDefiPostionsForChain(
  address: Address,
  chainId: number
): Promise<DefiPosition[]> {
  const chainName = chainIdToMoralisChain[chainId];
  if (!chainName) {
    console.warn(`Chain ID ${chainId} not supported by Moralis`);
    return [];
  }

  try {
    const res = await fetch(
      `https://deep-index.moralis.io/api/v2.2/wallets/${address}/defi/positions?chain=${chainName}`,
      options
    );

    if (!res.ok) {
      console.error(
        `Failed to fetch tokens for chain ${chainName}: ${res.status}`
      );
      return [];
    }

    const data: DefiPosition[] = await res.json();


    // Add chainId to each token and filter out spam tokens
    return data
      .map((position) => ({
        ...position,
        chainId,
      }));
  } catch (error) {
    console.error(`Error fetching tokens for chain ${chainName}:`, error);
    return [];
  }
}

export async function getDefiPositions(address: Address): Promise<DefiPosition[]> {
  const chains = portfolioChains;

  // Fetch DeFi positions from all chains in parallel
  const defiPromises = chains.map((chainId) =>
    getDefiPostionsForChain(address, chainId)
  );
  const positionsByChain = await Promise.all(defiPromises);

  // Flatten all positions into a single array
  const allPositions = positionsByChain.flat();

  return allPositions;
}

export async function getSummaryByChain(
  address: Address,
  chainId: number
): Promise<walletSummary | object> {
  const chainName = chainIdToMoralisChain[chainId];
  if (!chainName) {
    console.warn(`Chain ID ${chainId} not supported by Moralis`);
    return {};
  }

  try {
    const res = await fetch(
      `https://deep-index.moralis.io/api/v2.2/wallets/${address}/profitability/summary?chain=${chainName}`,
      options
    );

    if (!res.ok) {
      console.error(
        `Failed to fetch tokens for chain ${chainName}: ${res.status}`
      );
      return {};
    }

    let data: walletSummary = await res.json();

    data = {...data, chainId}

    // Add chainId to each token and filter out spam tokens
    return data
  } catch (error) {
    console.error(`Error fetching tokens for chain ${chainName}:`, error);
    return {};
  }
}

export async function getWalletSummary(address: Address): Promise<walletSummary[]> {
  const chains = portfolioChains;

  // Fetch DeFi positions from all chains in parallel
  const walletSummaries = chains.map((chainId) =>
    getSummaryByChain(address, chainId)
  );
  const positionsByChain = await Promise.all(walletSummaries);

  // Filter out any invalid responses and flatten
  const allPositions = positionsByChain.filter((data): data is walletSummary => 
    data !== null && 
    data !== undefined && 
    typeof data === 'object' && 
    'total_count_of_trades' in data
  );

  return allPositions;
}


