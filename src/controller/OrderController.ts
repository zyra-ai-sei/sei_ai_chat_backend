import { controller, httpGet, request } from "inversify-express-utils";
import { TYPES } from "../ioc-container/types";
import { inject } from "inversify";
import { OrderService } from "../services/OrderService";
import { AuthenticatedRequest } from "../types/requestTypes";

@controller("/orders", TYPES.AuthMiddleware)
export class OrderController {
  constructor(@inject(TYPES.OrderService) private orderService: OrderService) {}

  @httpGet("/")
  async getOrders(@request() req: AuthenticatedRequest) {
    const { page, limit } = req.query;
  const address = req.query.address;
    if (
      !(address == req.embeddedAddress) &&
      !(address == req.injectedAddress)
    ) {
      throw new Error(`User request not authorized`);
    }

    return await this.orderService.getUserOrders(
      address,
      Number(page),
      Number(limit)
    );
  }
}
