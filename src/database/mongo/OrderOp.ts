import { injectable } from "inversify";
import Order, { IOrder } from "./models/Order";

type IOrderData = Omit<IOrder, keyof Document>;


@injectable()
export class OrderOp {
  constructor() {}

  async getOrderByAddress(address: string, page: number, limit: number): Promise<{data:IOrderData[], pagination:{currentPage:number,totalPages:number,totalItems:number,hasNextPage:boolean,hasPrevPage:boolean}}> {
    try {
      const skip = (page - 1) * limit;

      const result = await Order.find({ maker: address })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      // 4. (Optional) Get Total Count for Frontend UI
      // useful so your frontend knows if it should disable the "Next" button
      const totalDocs = await Order.countDocuments({ maker: address });
      const totalPages = Math.ceil(totalDocs / limit);

      // 5. Return Data + Meta Info
      return {
        data: result,
        pagination: {
          currentPage: page,
          totalPages: totalPages,
          totalItems: totalDocs,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      };
    } catch (e) {}
  }
}
