import { injectable } from 'inversify';
import {
  DelegatedTransactionData,
  IDelegatedTransaction
} from './models/DelegatedTransaction';
import {
  DelegatedOrder,
  OrderStatus,
  TransactionType
} from '../../types/transaction.types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Delegated Transaction Operations
 *
 * Database operations for delegated transactions
 */
@injectable()
export class DelegatedTransactionOp {
  constructor() {}

  /**
   * Create a new delegated transaction order
   */
  async createOrder(order: Partial<DelegatedOrder>): Promise<IDelegatedTransaction> {
    try {
      const orderId = order.orderId || uuidv4();

      const delegatedTx = new DelegatedTransactionData({
        orderId,
        userId: order.userId,
        walletId: order.walletId,
        transactionType: order.transactionType,
        status: OrderStatus.AUTHORIZED,
        transactionData: order.transactionData,
        executionConditions: order.executionConditions,
        authorization: {
          userJwtEncrypted: order.userJwt, // TODO: Encrypt before storing
          userAuthorizationSignature: order.userAuthorizationSignature,
          authorizedAt: new Date()
        },
        execution: {
          attemptCount: 0
        },
        metadata: {}
      });

      return await delegatedTx.save();
    } catch (error) {
      console.error('Error creating delegated transaction:', error);
      throw new Error('Failed to create delegated transaction');
    }
  }

  /**
   * Get order by ID
   */
  async getOrderById(orderId: string): Promise<IDelegatedTransaction | null> {
    try {
      return await DelegatedTransactionData.findOne({ orderId }).lean();
    } catch (error) {
      console.error('Error fetching order:', error);
      throw new Error('Failed to fetch order');
    }
  }

  /**
   * Get all orders for a user
   */
  async getUserOrders(
    userId: string,
    status?: OrderStatus
  ): Promise<IDelegatedTransaction[]> {
    try {
      const query: any = { userId };
      if (status) {
        query.status = status;
      }
      return await DelegatedTransactionData.find(query)
        .sort({ createdAt: -1 })
        .lean();
    } catch (error) {
      console.error('Error fetching user orders:', error);
      throw new Error('Failed to fetch user orders');
    }
  }

  /**
   * Get orders ready for execution (conditions met, not expired)
   */
  async getOrdersReadyForExecution(): Promise<IDelegatedTransaction[]> {
    try {
      const now = new Date();

      return await DelegatedTransactionData.find({
        status: OrderStatus.AUTHORIZED,
        $or: [
          // Scheduled orders that are due
          {
            'executionConditions.executeAt': { $lte: now }
          },
          // Orders without executeAt (price-based, need external check)
          {
            'executionConditions.executeAt': { $exists: false }
          }
        ],
        // Not expired
        $or: [
          { 'executionConditions.expiresAt': { $gt: now } },
          { 'executionConditions.expiresAt': { $exists: false } }
        ]
      }).lean();
    } catch (error) {
      console.error('Error fetching orders ready for execution:', error);
      throw new Error('Failed to fetch orders ready for execution');
    }
  }

  /**
   * Update order status
   */
  async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    executionData?: {
      transactionHash?: string;
      errorMessage?: string;
      errorDetails?: any;
    }
  ): Promise<IDelegatedTransaction | null> {
    try {
      const update: any = {
        status,
        'execution.lastAttemptAt': new Date(),
        $inc: { 'execution.attemptCount': 1 }
      };

      if (status === OrderStatus.EXECUTED && executionData?.transactionHash) {
        update['execution.transactionHash'] = executionData.transactionHash;
        update['execution.executedAt'] = new Date();
      }

      if (status === OrderStatus.FAILED && executionData?.errorMessage) {
        update['execution.errorMessage'] = executionData.errorMessage;
        update['execution.errorDetails'] = executionData.errorDetails;
      }

      return await DelegatedTransactionData.findOneAndUpdate(
        { orderId },
        update,
        { new: true }
      ).lean();
    } catch (error) {
      console.error('Error updating order status:', error);
      throw new Error('Failed to update order status');
    }
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<IDelegatedTransaction | null> {
    try {
      return await DelegatedTransactionData.findOneAndUpdate(
        { orderId, status: OrderStatus.AUTHORIZED },
        { status: OrderStatus.CANCELLED },
        { new: true }
      ).lean();
    } catch (error) {
      console.error('Error cancelling order:', error);
      throw new Error('Failed to cancel order');
    }
  }

  /**
   * Expire old orders
   */
  async expireOldOrders(): Promise<number> {
    try {
      const now = new Date();
      const result = await DelegatedTransactionData.updateMany(
        {
          status: OrderStatus.AUTHORIZED,
          'executionConditions.expiresAt': { $lte: now }
        },
        { status: OrderStatus.EXPIRED }
      );
      return result.modifiedCount;
    } catch (error) {
      console.error('Error expiring old orders:', error);
      throw new Error('Failed to expire old orders');
    }
  }

  /**
   * Get orders by transaction type
   */
  async getOrdersByType(
    transactionType: TransactionType,
    status?: OrderStatus
  ): Promise<IDelegatedTransaction[]> {
    try {
      const query: any = { transactionType };
      if (status) {
        query.status = status;
      }
      return await DelegatedTransactionData.find(query)
        .sort({ createdAt: -1 })
        .lean();
    } catch (error) {
      console.error('Error fetching orders by type:', error);
      throw new Error('Failed to fetch orders by type');
    }
  }
}
