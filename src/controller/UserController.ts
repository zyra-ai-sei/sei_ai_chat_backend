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
    const address = req.userAddress;
    const result = await this.userService.getUserTransactions(address);
    return result;
  }
}
