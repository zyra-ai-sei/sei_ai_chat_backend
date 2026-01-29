import { inject, injectable } from 'inversify';
import { TYPES } from '../ioc-container/types';
import { CryptoMarketService } from './CryptoMarketService';
import RedisService from '../utils/redis/RedisService';

/**
 * PriceCheckerService
 *
 * Service for checking current token prices and validating limit order conditions
 * Uses CryptoMarketService (CoinGecko) for price data with caching
 */
@injectable()
export class PriceCheckerService {
  // Cache prices for 30 seconds to avoid API rate limits
  private readonly PRICE_CACHE_TTL = 30;

  constructor(
    @inject(TYPES.CryptoMarketService)
    private cryptoMarketService: CryptoMarketService,
    @inject(TYPES.RedisService)
    private redisService: RedisService
  ) {}

  /**
   * Get current price for a token from CoinGecko
   * @param tokenSymbol - Token symbol (e.g., 'ethereum', 'bitcoin')
   * @returns Current price in USD
   */
  async getCurrentPrice(tokenSymbol: string): Promise<number> {
    try {
      // Try cache first
      const cacheKey = `price:current:${tokenSymbol}`;
      const cachedPrice = await this.redisService.getValue(cacheKey);

      if (cachedPrice) {
        console.log(`[PriceChecker] Cache HIT for ${tokenSymbol}: $${cachedPrice}`);
        return parseFloat(cachedPrice);
      }

      // Fetch from CoinGecko via CryptoMarketService
      console.log(`[PriceChecker] Cache MISS for ${tokenSymbol}, fetching from CoinGecko...`);
      const coinData = await this.cryptoMarketService.getCompleteCoinData(tokenSymbol);

      const currentPrice = coinData.market_data.current_price.usd;

      // Cache for 30 seconds
      await this.redisService.setValue(
        cacheKey,
        currentPrice.toString(),
        this.PRICE_CACHE_TTL
      );

      console.log(`[PriceChecker] Fetched ${tokenSymbol} price: $${currentPrice}`);
      return currentPrice;

    } catch (error) {
      console.error(`[PriceChecker] Error fetching price for ${tokenSymbol}:`, error);
      throw new Error(
        `Failed to fetch price for ${tokenSymbol}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check if a limit order condition is met
   * @param targetPrice - Target price to trigger order
   * @param priceDirection - 'above' for sell orders, 'below' for buy orders
   * @param tokenSymbol - Token symbol (e.g., 'ethereum', 'bitcoin')
   * @returns True if condition is met, false otherwise
   */
  async checkLimitOrderCondition(
    targetPrice: number,
    priceDirection: 'above' | 'below',
    tokenSymbol: string
  ): Promise<boolean> {
    try {
      const currentPrice = await this.getCurrentPrice(tokenSymbol);

      if (priceDirection === 'below') {
        // Buy order: execute when price goes below target
        const conditionMet = currentPrice <= targetPrice;
        console.log(
          `[PriceChecker] BUY condition: ${tokenSymbol} $${currentPrice} <= $${targetPrice}? ${conditionMet}`
        );
        return conditionMet;
      } else {
        // Sell order: execute when price goes above target
        const conditionMet = currentPrice >= targetPrice;
        console.log(
          `[PriceChecker] SELL condition: ${tokenSymbol} $${currentPrice} >= $${targetPrice}? ${conditionMet}`
        );
        return conditionMet;
      }
    } catch (error) {
      console.error('[PriceChecker] Error checking limit order condition:', error);
      // Return false on error to avoid executing orders due to price check failures
      return false;
    }
  }

  /**
   * Check if a stop loss condition is met
   * @param stopPrice - Stop loss price
   * @param tokenSymbol - Token symbol
   * @returns True if price has dropped to or below stop price
   */
  async checkStopLossCondition(
    stopPrice: number,
    tokenSymbol: string
  ): Promise<boolean> {
    try {
      const currentPrice = await this.getCurrentPrice(tokenSymbol);
      const conditionMet = currentPrice <= stopPrice;

      console.log(
        `[PriceChecker] STOP LOSS condition: ${tokenSymbol} $${currentPrice} <= $${stopPrice}? ${conditionMet}`
      );

      return conditionMet;
    } catch (error) {
      console.error('[PriceChecker] Error checking stop loss condition:', error);
      return false;
    }
  }

  /**
   * Get multiple token prices in parallel
   * @param tokenSymbols - Array of token symbols
   * @returns Map of token symbol to price
   */
  async getMultiplePrices(tokenSymbols: string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();

    try {
      const pricePromises = tokenSymbols.map(async (symbol) => {
        try {
          const price = await this.getCurrentPrice(symbol);
          return { symbol, price };
        } catch (error) {
          console.error(`[PriceChecker] Failed to fetch price for ${symbol}:`, error);
          return { symbol, price: null };
        }
      });

      const results = await Promise.all(pricePromises);

      results.forEach(({ symbol, price }) => {
        if (price !== null) {
          prices.set(symbol, price);
        }
      });

      return prices;
    } catch (error) {
      console.error('[PriceChecker] Error fetching multiple prices:', error);
      return prices;
    }
  }
}
