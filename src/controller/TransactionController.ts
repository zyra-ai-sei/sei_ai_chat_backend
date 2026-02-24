import { controller, httpGet, request } from "inversify-express-utils";
import { TYPES } from "../ioc-container/types";
import { inject } from "inversify";
import { TransactionService } from "../services/TransactionService";
import { type Request } from "express";
import { AuthenticatedRequest, NetworkRequest } from "../types/requestTypes";

@controller(
  "/transactions",
  TYPES.AuthMiddleware,
  TYPES.NetworkMiddleware,
  TYPES.AddressMiddleware
)
export class TransactionController {
  constructor(
    @inject(TYPES.TransactionService)
    private transactionService: TransactionService
  ) {}

  @httpGet("/details")
  async getTransactionDetails(
    @request() req: AuthenticatedRequest & NetworkRequest
  ) {
    const { txHash } = req.query;
    const userId = req.userId;
    const network = req.network;
    return await this.transactionService.addTransaction(
      userId,
      String(txHash),
      network
    );
  }
}
