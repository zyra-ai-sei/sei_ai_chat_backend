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
    const { address } = req.body;
    const userId = req.userId; // Assuming AuthMiddleware populates this

    if (!userId) {
      throw new Error("User not authenticated");
    }

    await this.trackingService.subscribe(userId, address);
    return { success: true, message: `Subscribed to ${address}` };
  }

  @httpPost("/unsubscribe")
  private async unsubscribe(@request() req: AuthenticatedRequest) {
    const { address } = req.body;
    const userId = req.userId;

    if (!userId) {
      throw new Error("User not authenticated");
    }

    await this.trackingService.unsubscribe(userId, address);
    return { success: true, message: `Unsubscribed from ${address}` };
  }
}
