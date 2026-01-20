import { inject } from "inversify";
import { controller, httpGet, request } from "inversify-express-utils";
import { TYPES } from "../ioc-container/types";
import { UserService } from "../services/UserService";
import { AuthenticatedRequest } from "../types/requestTypes";
import AuthMiddleware from "../middleware/AuthMiddleware";

@controller("/user", TYPES.AuthMiddleware)
export class UserController {
  constructor(@inject(TYPES.UserService) private userService: UserService) {}

  @httpGet("/transactions")
  private async getTransactions(@request() req: AuthenticatedRequest) {
    const userId = req.userId;
    const address = req.query.address;
    console.log('fuck txn',address, req.injectedAddress)
    if (
      !(address == req.embeddedAddress) &&
      !(address == req.injectedAddress)
    ) {
      throw new Error(`User request not authorized`);
    }
    const result = await this.userService.getUserTransactions(userId as string);
    return result;
  }
}
