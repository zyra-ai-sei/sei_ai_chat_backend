import { controller, httpGet, request } from "inversify-express-utils";
import { TYPES } from "../ioc-container/types";
import { inject } from "inversify";
import { PortfolioService } from "../services/PortfolioService";
import { AuthenticatedRequest } from "../types/requestTypes";
import { Address } from "viem";

@controller("/portfolio", TYPES.AuthMiddleware)
export class PortfolioController {
  constructor(
    @inject(TYPES.PortfolioService) private portfolioService: PortfolioService
  ) {}

  @httpGet("/totalBalance/")
  async getTotalBalance(@request() req: AuthenticatedRequest) {
    const address = req.query.address;
    if (
      !(address == req.embeddedAddress) &&
      !(address == req.injectedAddress)
    ) {
      throw new Error(`User request not authorized`);
    }
    return this.portfolioService.getTotalBalance(address as Address);
  }

  @httpGet("/defiPositions")
  async getDefiPositions(@request() req: AuthenticatedRequest) {
    const address = req.query.address;
    if (
      !(address == req.embeddedAddress) &&
      !(address == req.injectedAddress)
    ) {
      console.log('addresses',req.injectedAddress)
      throw new Error(`User request not authorized`);
    }
    return this.portfolioService.getDefiPositions(address as Address);
  }

  @httpGet("/summary")
  async getSummary(@request() req: AuthenticatedRequest) {
    const address = req.query.address;
    if (
      !(address == req.embeddedAddress) &&
      !(address == req.injectedAddress)
    ) {
      throw new Error(`User request not authorized`);
    }
    return this.portfolioService.getWalletSummary(address as Address);
  }
}
