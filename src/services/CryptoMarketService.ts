import { injectable } from "inversify";
import { ICryptoMarketService, CoinMarketData, CompleteCoinData } from "./interfaces/ICryptoMarketService";
import env from "../envConfig";

@injectable()
export class CryptoMarketService implements ICryptoMarketService {
  private readonly baseUrl = "https://api.coingecko.com/api/v3";
  private readonly apiKey = env.COINGECKO_API_KEY;

  // Mapping timeframe to days
  private readonly timeframeToDays: Record<string, number> = {
    "24h": 1,
    "7d": 7,
    "1m": 30,
    "3m": 90,
    "1y": 365,
  };

  async getCoinMarketData(coinId: string, timeframe: string): Promise<CoinMarketData> {
    try {
      // Get days from timeframe
      const days = this.timeframeToDays[timeframe];
      if (!days) {
        throw new Error(`Invalid timeframe: ${timeframe}. Valid options: 24h, 7d, 1m, 3m, 1y`);
      }

      // Build API URL
      const url = new URL(`${this.baseUrl}/coins/${coinId}/market_chart`);
      url.searchParams.append("vs_currency", "usd");
      url.searchParams.append("days", days.toString());

      // Set precision to full for better accuracy
      url.searchParams.append("precision", "full");

      // Let CoinGecko auto-select granularity based on days
      // Don't force "daily" interval as it limits data points for short timeframes
      // CoinGecko will automatically choose appropriate granularity

      // Add API key if available (optional for CoinGecko free tier)
      if (this.apiKey) {
        url.searchParams.append("x_cg_demo_api_key", this.apiKey);
      }

      console.log(`[CryptoMarketService] Fetching ${coinId} data for ${timeframe} (${days} days) from CoinGecko...`);
      console.log(`[CryptoMarketService] API URL: ${url.toString()}`);

      // Fetch data from CoinGecko
      const response = await fetch(url.toString());

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[CryptoMarketService] CoinGecko API error:`, {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Extract and format data
      const prices = data.prices || [];
      const marketCaps = data.market_caps || [];

      console.log(`[CryptoMarketService] Raw data received:`, {
        priceCount: prices.length,
        marketCapCount: marketCaps.length,
        firstPrice: prices[0],
        lastPrice: prices[prices.length - 1]
      });

      // Combine into [timestamp, price, marketCap] format
      const chartData: [number, number, number][] = [];
      for (let i = 0; i < prices.length; i++) {
        if (prices[i] && marketCaps[i]) {
          const timestamp = prices[i][0];
          const price = prices[i][1];
          const marketCap = marketCaps[i][1];
          chartData.push([timestamp, price, marketCap]);
        }
      }

      const firstDate = new Date(chartData[0][0]);
      const lastDate = new Date(chartData[chartData.length - 1][0]);
      const daysDiff = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);

      console.log(`[CryptoMarketService] Successfully fetched ${chartData.length} data points for ${coinId} (${timeframe})`);
      console.log(`[CryptoMarketService] Date range: ${firstDate.toISOString()} to ${lastDate.toISOString()}`);
      console.log(`[CryptoMarketService] Actual days of data: ${daysDiff.toFixed(1)} days (requested: ${days} days)`);

      return {
        coinId,
        timeframe,
        dataPoints: chartData.length,
        chartData,
      };
    } catch (error) {
      console.error("Error fetching coin market data:", error);
      throw new Error(`Failed to fetch market data for ${coinId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getCompleteCoinData(coinId: string): Promise<CompleteCoinData> {
    try {
      // Build API URL for complete coin data
      const url = new URL(`${this.baseUrl}/coins/${coinId}`);
      url.searchParams.append("localization", "false");
      url.searchParams.append("tickers", "true");
      url.searchParams.append("market_data", "true");
      url.searchParams.append("community_data", "true");
      url.searchParams.append("developer_data", "false");
      url.searchParams.append("sparkline", "false");

      // Add API key if available
      if (this.apiKey) {
        url.searchParams.append("x_cg_demo_api_key", this.apiKey);
      }

      console.log(`[CryptoMarketService] Fetching complete data for ${coinId} from CoinGecko...`);
      console.log(`[CryptoMarketService] API URL: ${url.toString()}`);

      // Fetch data from CoinGecko
      const response = await fetch(url.toString());

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[CryptoMarketService] CoinGecko API error:`, {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      console.log(`[CryptoMarketService] Successfully fetched complete data for ${coinId}`);

      // Return the complete coin data
      return {
        id: data.id,
        symbol: data.symbol,
        name: data.name,
        image: {
          thumb: data.image?.thumb || "",
          small: data.image?.small || "",
          large: data.image?.large || ""
        },
        categories: data.categories || [],
        market_data: {
          current_price: { usd: data.market_data?.current_price?.usd || 0 },
          price_change_percentage_1h_in_currency: { usd: data.market_data?.price_change_percentage_1h_in_currency?.usd || 0 },
          price_change_percentage_24h_in_currency: { usd: data.market_data?.price_change_percentage_24h_in_currency?.usd || 0 },
          price_change_percentage_7d_in_currency: { usd: data.market_data?.price_change_percentage_7d_in_currency?.usd || 0 },
          price_change_percentage_30d_in_currency: { usd: data.market_data?.price_change_percentage_30d_in_currency?.usd || 0 },
          high_24h: { usd: data.market_data?.high_24h?.usd || 0 },
          low_24h: { usd: data.market_data?.low_24h?.usd || 0 },
          ath: { usd: data.market_data?.ath?.usd || 0 },
          ath_change_percentage: { usd: data.market_data?.ath_change_percentage?.usd || 0 },
          ath_date: { usd: data.market_data?.ath_date?.usd || new Date().toISOString() },
          market_cap: { usd: data.market_data?.market_cap?.usd || 0 },
          market_cap_rank: data.market_data?.market_cap_rank || 0,
          total_volume: { usd: data.market_data?.total_volume?.usd || 0 },
          circulating_supply: data.market_data?.circulating_supply || 0,
          max_supply: data.market_data?.max_supply
        },
        sentiment_votes_up_percentage: data.sentiment_votes_up_percentage || 0,
        sentiment_votes_down_percentage: data.sentiment_votes_down_percentage || 0,
        watchlist_portfolio_users: data.watchlist_portfolio_users || 0,
        tickers: data.tickers ? data.tickers.slice(0, 10).map((ticker: any) => ({
          base: ticker.base || "",
          target: ticker.target || "",
          market: {
            name: ticker.market?.name || "",
            identifier: ticker.market?.identifier || ""
          },
          last: ticker.last || 0,
          volume: ticker.volume || 0,
          converted_last: { usd: ticker.converted_last?.usd || 0 },
          converted_volume: { usd: ticker.converted_volume?.usd || 0 },
          trust_score: ticker.trust_score || "white",
          bid_ask_spread_percentage: ticker.bid_ask_spread_percentage || 0
        })) : []
      } as CompleteCoinData;
    } catch (error) {
      console.error("Error fetching complete coin data:", error);
      throw new Error(`Failed to fetch complete data for ${coinId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
