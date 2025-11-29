import { controller, httpGet, request, response } from "inversify-express-utils";
import { inject } from "inversify";
import { TYPES } from "../ioc-container/types";
import { Request, Response } from "express";
import { ICryptoMarketService } from "../services/interfaces/ICryptoMarketService";

@controller("/crypto")
export class CryptoMarketController {
  constructor(
    @inject(TYPES.CryptoMarketService) private cryptoMarketService: ICryptoMarketService
  ) {}

  /**
   * GET /v1/crypto/market-data
   * Query params:
   *   - coinId: string (e.g., "bitcoin", "ethereum")
   *   - timeframe: string (e.g., "24h", "7d", "1m", "3m", "1y")
   *
   * Example: /v1/crypto/market-data?coinId=bitcoin&timeframe=7d
   */
  @httpGet("/market-data")
  private async getMarketData(
    @request() req: Request,
    @response() res: Response
  ): Promise<any> {
    try {
      const coinId = req.query.coinId as string;
      const timeframe = req.query.timeframe as string;

      // Validation
      if (!coinId || !timeframe) {
        return res.status(400).json({
          success: false,
          message: "Missing required parameters: coinId and timeframe",
        });
      }

      // Valid timeframes
      const validTimeframes = ["24h", "7d", "1m", "3m", "1y"];
      if (!validTimeframes.includes(timeframe)) {
        return res.status(400).json({
          success: false,
          message: `Invalid timeframe. Valid options: ${validTimeframes.join(", ")}`,
        });
      }

      // Fetch data from service
      const marketData = await this.cryptoMarketService.getCoinMarketData(
        coinId,
        timeframe
      );

      return res.status(200).json({
        success: true,
        data: marketData,
      });
    } catch (error) {
      console.error("Error in getMarketData:", error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }
}
