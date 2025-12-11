import { injectable } from "inversify";
import { BaseMiddleware } from "inversify-express-utils";
import { NextFunction, Response } from "express";
import { NetworkRequest } from "../types/requestTypes";
import { isNetworkSupported, getSupportedNetworkNames } from "../config/networks";

/**
 * NetworkMiddleware - Extracts and validates network parameter from query string
 *
 * Usage in controllers:
 *
 * Single middleware:
 * @controller("/orders", TYPES.NetworkMiddleware)
 *
 * Multiple middlewares (Auth + Network):
 * @controller("/orders", TYPES.AuthMiddleware, TYPES.NetworkMiddleware)
 *
 * Then in your route handler:
 * @httpGet("/")
 * async getOrders(@request() req: AuthenticatedNetworkRequest) {
 *   const network = req.network; // "sei", "ethereum", etc.
 *   // ... use network for multichain operations
 * }
 *
 * API call example:
 * GET /orders?network=sei&page=1&limit=10
 */
@injectable()
export default class NetworkMiddleware extends BaseMiddleware {
  constructor() {
    super()
  }

  public async handler(
    req: NetworkRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const network = req.query.network as string;

      if (!network) {
        res.status(400).json({
          error: "Network parameter is required",
          message: "Please provide a network in the query parameters (e.g., ?network=sei)",
        });
        return;
      }

      // Validate network using centralized config
      if (!isNetworkSupported(network)) {
        res.status(400).json({
          error: "Unsupported network",
          message: `Supported networks: ${getSupportedNetworkNames().join(", ")}`,
        });
        return;
      }

      // Attach network to request object
      req.network = network.toLowerCase();
      next();
    } catch (err) {
      next(err);
    }
  }
}
