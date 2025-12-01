import { Address } from "viem";
import { inject, injectable } from "inversify";
import fs from "fs";
import { getTokenBalances, MoralisToken, getWalletSummary, getDefiPositions } from "../externalApis/moralis";
import { TYPES } from "../ioc-container/types";
import RedisService from "../utils/redis/RedisService";

const CACHE_TTL_SECONDS = 1800; // 3 minutes

@injectable()
export class PortfolioService {
  constructor(@inject(TYPES.RedisService) private redisService: RedisService) {}

  async getTotalBalance(address: Address): Promise<MoralisToken[]> {
    const cacheKey = this.getCacheKey(address);

    // Try to get from cache first
    const cachedData = await this.redisService.getObj<MoralisToken[]>(cacheKey);

    if (cachedData) {
      console.log(`Cache hit for portfolio: ${address}`);
      return cachedData;
    }

    console.log(
      `Cache miss for portfolio: ${address}, fetching from Moralis...`
    );

    // Fetch from Moralis API
    const balance = await getTokenBalances(address);

    // Cache the result for 3 minutes
    await this.redisService.setValue(
      cacheKey,
      JSON.stringify(balance),
      CACHE_TTL_SECONDS
    );

    return balance;
  }

  async getDefiPositions(address: Address) {
    const cacheKey = `defi:${address.toLowerCase()}`;
    const ONE_DAY_SECONDS = 86400;

    // Try to get from cache first
    const cachedData = await this.redisService.getObj<any[]>(cacheKey);
    if (cachedData) {
      console.log(`Cache hit for defi positions: ${address}`);
      return cachedData;
    }

    console.log(`Cache miss for defi positions: ${address}, fetching from Moralis...`);
    // Fetch from Moralis API
    const positions = await getDefiPositions(address);

    // Cache the result for 1 day
    await this.redisService.setValue(cacheKey, JSON.stringify(positions), ONE_DAY_SECONDS);
    return positions;
  }

  async getWalletSummary(address: Address) {
    const cacheKey = `walletsummary:${address.toLowerCase()}`;
    const ONE_DAY_SECONDS = 86400;

    // Try to get from cache first
    const cachedData = await this.redisService.getObj<any[]>(cacheKey);
    if (cachedData) {
      console.log(`Cache hit for wallet summary: ${address}`);
      return cachedData;
    }

    console.log(`Cache miss for wallet summary: ${address}, fetching from Moralis...`);
    // Fetch from Moralis API
    const summaries = await getWalletSummary(address);

    // Cache the result for 1 day
    await this.redisService.setValue(cacheKey, JSON.stringify(summaries), ONE_DAY_SECONDS);
    return summaries;
  }

  private getCacheKey(address: Address): string {
    return `portfolio:${address.toLowerCase()}`;
  }

  async invalidateCache(address: Address): Promise<void> {
    const cacheKey = this.getCacheKey(address);
    await this.redisService.deleteValue(cacheKey);
    console.log(`Cache invalidated for portfolio: ${address}`);
  }
}
