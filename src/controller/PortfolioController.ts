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
    ) {

    }

    @httpGet('/totalBalance/')
    async getTotalBalance(
        @request() req: AuthenticatedRequest
    ) {
        const address = req.userAddress;
        return this.portfolioService.getTotalBalance(address as Address);
    }

    @httpGet('/defiPositions')
    async getDefiPositions(
        @request() req: AuthenticatedRequest
    ) {
        const address = "0xd100d8b69c5ae23d6aa30c6c3874bf47539b95fd";
        return this.portfolioService.getDefiPositions(address as Address);
    }

    @httpGet('/summary')
    async getSummary(
        @request() req: AuthenticatedRequest
    ) {
        const address = "0x07aE8551Be970cB1cCa11Dd7a11F47Ae82e70E67";
        return this.portfolioService.getWalletSummary(address as Address)
    }
}