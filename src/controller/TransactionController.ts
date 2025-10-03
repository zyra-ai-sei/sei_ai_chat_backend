import { controller, httpGet , request} from "inversify-express-utils";
import { TYPES } from "../ioc-container/types";
import { inject } from "inversify";
import { TransactionService } from "../services/TransactionService";
import { type Request } from "express";
import { AuthenticatedRequest } from "../types/requestTypes";

@controller("/transactions",TYPES.AuthMiddleware)
export class TransactionController {

    constructor(
        @inject(TYPES.TransactionService) private transactionService: TransactionService
    ){}

    @httpGet("/details")
    async getTransactionDetails(
         @request() req: AuthenticatedRequest
    ) {
        const {txHash} = req.query;
        const address = req.userAddress;
        return await this.transactionService.addTransaction(address,String(txHash));
    }
}