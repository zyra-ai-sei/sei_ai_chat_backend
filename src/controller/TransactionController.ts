import { controller, httpGet, request } from "inversify-express-utils";
import { TYPES } from "../ioc-container/types";
import { inject } from "inversify";
import { TransactionService } from "../services/TransactionService";
import { type Request } from "express";
import { AuthenticatedRequest, NetworkRequest } from "../types/requestTypes";

@controller("/transactions", TYPES.AuthMiddleware, TYPES.NetworkMiddleware)
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
    const address = req.query.address;
    if (
      !(address == req.embeddedAddress) &&
      !(address == req.injectedAddress)
    ) {
      throw new Error(`User request not authorized`);
    }
    const network = req.network;
    return await this.transactionService.addTransaction(
      address,
      String(txHash),
      network
    );
  }
}
