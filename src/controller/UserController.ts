import { inject } from "inversify";
import {
  controller,
  httpGet,
  httpPost,
  request,
} from "inversify-express-utils";
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
  @httpGet("/getOrderStatus")
  private async getOrderStatus(
    @request()
    req: AuthenticatedRequest
  ): Promise<any> {
    const address = req.userAddress;
    return this.userService.getOrderStatus(address);
  }

  @httpPost("/addModelKey")
  private async addModelKey(
    @request() req: AuthenticatedRequest
  ): Promise<boolean> {
    return this.userService.addModelKey(
      req.userId,
      req.body.family,
      req.body.apikey
    );
  }
}
