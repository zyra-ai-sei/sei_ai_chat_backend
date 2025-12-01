export interface CoinMarketData {
  coinId: string;
  timeframe: string;
  dataPoints: number;
  chartData: [number, number, number][]; // [timestamp, price, marketCap]
}

export interface CompleteCoinData {
  id: string;
  symbol: string;
  name: string;
  image: {
    thumb: string;
    small: string;
    large: string;
  };
  categories: string[];
  market_data: {
    current_price: { usd: number };
    price_change_percentage_1h_in_currency?: { usd: number };
    price_change_percentage_24h_in_currency?: { usd: number };
    price_change_percentage_7d_in_currency?: { usd: number };
    price_change_percentage_30d_in_currency?: { usd: number };
    high_24h: { usd: number };
    low_24h: { usd: number };
    ath: { usd: number };
    ath_change_percentage: { usd: number };
    ath_date: { usd: string };
    market_cap: { usd: number };
    market_cap_rank: number;
    total_volume: { usd: number };
    circulating_supply: number;
    max_supply: number | null;
  };
  sentiment_votes_up_percentage?: number;
  sentiment_votes_down_percentage?: number;
  watchlist_portfolio_users?: number;
  tickers?: Array<{
    base: string;
    target: string;
    market: {
      name: string;
      identifier: string;
    };
    last: number;
    volume: number;
    converted_last: { usd: number };
    converted_volume: { usd: number };
    trust_score: string;
    bid_ask_spread_percentage: number;
  }>;
}

export interface ICryptoMarketService {
  getCoinMarketData(coinId: string, timeframe: string): Promise<CoinMarketData>;
  getCompleteCoinData(coinId: string): Promise<CompleteCoinData>;
}
