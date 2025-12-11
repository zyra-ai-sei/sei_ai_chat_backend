import { inject, injectable } from "inversify";
import { TYPES } from "../ioc-container/types";
import { OrderOp } from "../database/mongo/OrderOp";


@injectable()
export class OrderService {
    constructor(@inject(TYPES.OrderOp) private orderOp:OrderOp){}

    getUserOrders(address:string, page:number, limit: number) {
        return this.orderOp.getOrderByAddress(address, page, limit);
    }
}