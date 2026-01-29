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
import { EncryptionUtil } from '../../utils/encryption';
import env from '../../envConfig';

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

      // Encrypt JWT if provided
      let encryptedJwt: string | undefined;
      if (order.userJwt) {
        if (!env.ENCRYPTION_KEY) {
          throw new Error('ENCRYPTION_KEY is not configured');
        }
        encryptedJwt = EncryptionUtil.encrypt(order.userJwt, env.ENCRYPTION_KEY);
      }

      const delegatedTx = new DelegatedTransactionData({
        orderId,
        userId: order.userId,
        walletId: order.walletId,
        transactionType: order.transactionType,
        status: OrderStatus.AUTHORIZED,
        transactionData: order.transactionData,
        executionConditions: order.executionConditions,
        authorization: {
          userJwtEncrypted: encryptedJwt,
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
      const MAX_RETRY_ATTEMPTS = 3;

      return await DelegatedTransactionData.find({
        status: OrderStatus.AUTHORIZED,
        $and: [
          // Either scheduled and due, or no schedule (price-based)
          {
            $or: [
              { 'executionConditions.executeAt': { $lte: now } },
              { 'executionConditions.executeAt': { $exists: false } }
            ]
          },
          // Not expired
          {
            $or: [
              { 'executionConditions.expiresAt': { $gt: now } },
              { 'executionConditions.expiresAt': { $exists: false } }
            ]
          },
          // Not exceeded max retry attempts
          {
            'execution.attemptCount': { $lt: MAX_RETRY_ATTEMPTS }
          }
        ]
      })
      .sort({ createdAt: 1 })
      .lean();
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

  /**
   * Activate orders that depend on this order (linked orders)
   * Called when parent order executes successfully
   */
  async activateDependentOrders(parentOrderId: string): Promise<number> {
    try {
      const result = await DelegatedTransactionData.updateMany(
        {
          'executionConditions.dependsOn': parentOrderId,
          status: OrderStatus.AUTHORIZED
        },
        {
          status: OrderStatus.AUTHORIZED,
          'executionConditions.dependsOn': null // Clear dependency after activation
        }
      );
      return result.modifiedCount;
    } catch (error) {
      console.error('Error activating dependent orders:', error);
      throw new Error('Failed to activate dependent orders');
    }
  }

  /**
   * Update executed amount for an order (for linked orders to track parent execution amount)
   */
  async updateExecutedAmount(orderId: string, executedAmount: string): Promise<IDelegatedTransaction | null> {
    try {
      return await DelegatedTransactionData.findOneAndUpdate(
        { orderId },
        { 'execution.executedAmount': executedAmount },
        { new: true }
      ).lean();
    } catch (error) {
      console.error('Error updating executed amount:', error);
      throw new Error('Failed to update executed amount');
    }
  }

  /**
   * Get dependent orders for a parent order
   */
  async getDependentOrders(parentOrderId: string): Promise<IDelegatedTransaction[]> {
    try {
      return await DelegatedTransactionData.find({
        'executionConditions.dependsOn': parentOrderId
      }).lean();
    } catch (error) {
      console.error('Error fetching dependent orders:', error);
      throw new Error('Failed to fetch dependent orders');
    }
  }
}
