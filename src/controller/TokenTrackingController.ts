import {
  controller,
  httpGet,
  httpPost,
  request,
} from "inversify-express-utils";
import { inject } from "inversify";
import { TYPES } from "../ioc-container/types";
import { TokenTrackingService } from "../services/TokenTrackingService";
import { Request } from "express";
import { AuthenticatedRequest } from "../types/requestTypes";

@controller("/tracking", TYPES.AuthMiddleware)
export class TokenTrackingController {
  constructor(
    @inject(TYPES.TokenTrackingService)
    private trackingService: TokenTrackingService
  ) {}

  @httpGet("/addresses")
  private async getTrackedAddresses(@request() req: AuthenticatedRequest) {
    const userId = req.userId;
    if (!userId) {
      throw new Error("User not authenticated");
    }
    const addresses = await this.trackingService.getTrackedAddresses(userId);
    return addresses;
  }

  @httpGet("/history")
  private async getHistory(@request() req: AuthenticatedRequest) {
    const userId = req.userId;
    if (!userId) {
      throw new Error("User not authenticated");
    }
    const history = await this.trackingService.getHistory(userId);
    return history;
  }

  @httpPost("/subscribe")
  private async subscribe(@request() req: AuthenticatedRequest) {
    const { address, chains } = req.body;
    const userId = req.userId; // Assuming AuthMiddleware populates this

    if (!userId) {
      throw new Error("User not authenticated");
    }

    // Default to ["sei"] if no chains provided, supporting either array or single string for migration
    const chainList = Array.isArray(chains) ? chains : (chains ? [chains] : ["sei"]);

    await this.trackingService.subscribe(userId, address, chainList);
    return { success: true, message: `Subscribed to ${address} on ${chainList.join(", ")}` };
  }

  @httpPost("/update")
  private async updateSubscription(@request() req: AuthenticatedRequest) {
    const { address, chains } = req.body;
    const userId = req.userId;

    if (!userId) {
      throw new Error("User not authenticated");
    }

    if (!Array.isArray(chains)) {
      throw new Error("Chains must be an array");
    }

    await this.trackingService.updateSubscription(userId, address, chains);
    return { success: true, message: `Updated subscription for ${address} to ${chains.join(", ")}` };
  }

  @httpPost("/unsubscribe")
  private async unsubscribe(@request() req: AuthenticatedRequest) {
    const { address, chain } = req.body;
    const userId = req.userId;

    if (!userId) {
      throw new Error("User not authenticated");
    }

    await this.trackingService.unsubscribe(userId, address, chain);
    return { success: true, message: `Unsubscribed from ${address}` };
  }
}
