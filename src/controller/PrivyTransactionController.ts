import { controller, httpPost, httpGet, httpDelete, request, requestBody, requestParam } from "inversify-express-utils";
import { TYPES } from "../ioc-container/types";
import { inject } from "inversify";
import { PrivyTransactionService } from "../services/PrivyTransactionService";
import { AuthenticatedRequest } from "../types/requestTypes";
import { TransactionType, OrderStatus } from "../types/transaction.types";

/**
 * PrivyTransactionController
 *
 * Controller for Privy transaction management (immediate and delegated)
 */
@controller("/privy-transactions", TYPES.AuthMiddleware)
export class PrivyTransactionController {
  constructor(
    @inject(TYPES.PrivyTransactionService)
    private privyTransactionService: PrivyTransactionService
  ) {}

  /**
   * POST /v1/privy-transactions/test
   *
   * Test endpoint to fetch and display user's wallets with signers
   */
  @httpPost("/test")
  async testWallets(@request() req: AuthenticatedRequest) {
    try {
      console.log("User ID from request:", req.userId);

      // Call the service to get wallets with signers
      const wallets = await this.privyTransactionService.sendTransaction(req.userId);

      return {
        success: true,
        userId: req.userId,
        wallets: wallets,
      };
    } catch (error) {
      console.error("Error in testWallets endpoint:", error);
      throw error;
    }
  }

  /**
   * POST /v1/privy-transactions/immediate
   *
   * Send an immediate transaction (user signs in real-time)
   *
   * Body:
   * {
   *   "walletId": "wallet-id",
   *   "to": "0x...",
   *   "value": "1000000000000000000",
   *   "data": "0x...",
   *   "chainId": 1
   * }
   */
  @httpPost("/immediate")
  async sendImmediateTransaction(
    @request() req: AuthenticatedRequest,
    @requestBody() body: {
      walletId: string;
      to: string;
      value?: string;
      data?: string;
      chainId: number;
    }
  ) {
    try {
      // Get user JWT from authorization header
      const authHeader = req.headers.authorization;
      const userJwt = authHeader?.replace('Bearer ', '');

      if (!userJwt) {
        throw new Error('User JWT is required in Authorization header');
      }

      const result = await this.privyTransactionService.sendImmediateTransaction(
        req.userId,
        body.walletId,
        userJwt,
        {
          to: body.to,
          value: body.value,
          data: body.data,
          chainId: body.chainId
        }
      );

      return result;
    } catch (error) {
      console.error("Error in sendImmediateTransaction:", error);
      throw error;
    }
  }

  /**
   * POST /v1/privy-transactions/delegated
   *
   * Create a delegated transaction order (user pre-authorizes for later execution)
   *
   * Body:
   * {
   *   "walletId": "wallet-id",
   *   "transactionType": "limit_order" | "stop_loss" | "scheduled" | "dca",
   *   "transactionData": {
   *     "to": "0x...",
   *     "value": "1000000000000000000",
   *     "data": "0x...",
   *     "chainId": 1
   *   },
   *   "executionConditions": {
   *     "targetPrice": 2000,
   *     "stopPrice": 1500,
   *     "executeAt": "2024-12-31T00:00:00Z",
   *     "expiresAt": "2025-01-01T00:00:00Z"
   *   },
   *   "description": "Limit order to sell ETH at $2000"
   * }
   */
  @httpPost("/delegated")
  async createDelegatedOrder(
    @request() req: AuthenticatedRequest,
    @requestBody() body: {
      walletId: string;
      transactionType: TransactionType;
      transactionData: {
        to: string;
        value?: string;
        data?: string;
        chainId: number;
      };
      executionConditions: {
        targetPrice?: number;
        stopPrice?: number;
        executeAt?: string;
        expiresAt?: string;
      };
      description?: string;
    }
  ) {
    try {
      // Get user JWT from authorization header
      const authHeader = req.headers.authorization;
      const userJwt = authHeader?.replace('Bearer ', '');

      if (!userJwt) {
        throw new Error('User JWT is required in Authorization header');
      }

      const result = await this.privyTransactionService.createDelegatedOrder(
        req.userId,
        body.walletId,
        userJwt,
        {
          transactionType: body.transactionType,
          transactionData: body.transactionData,
          executionConditions: {
            targetPrice: body.executionConditions.targetPrice,
            stopPrice: body.executionConditions.stopPrice,
            executeAt: body.executionConditions.executeAt ? new Date(body.executionConditions.executeAt) : undefined,
            expiresAt: body.executionConditions.expiresAt ? new Date(body.executionConditions.expiresAt) : undefined
          },
          description: body.description
        }
      );

      return result;
    } catch (error) {
      console.error("Error in createDelegatedOrder:", error);
      throw error;
    }
  }

  /**
   * POST /v1/privy-transactions/execute/:orderId
   *
   * Execute a delegated transaction (for testing or manual triggers)
   */
  @httpPost("/execute/:orderId")
  async executeDelegatedOrder(
    @request() req: AuthenticatedRequest,
    @requestParam("orderId") orderId: string
  ) {
    try {
      const result = await this.privyTransactionService.executeDelegatedOrder(orderId);
      return result;
    } catch (error) {
      console.error("Error in executeDelegatedOrder:", error);
      throw error;
    }
  }

  /**
   * GET /v1/privy-transactions/orders
   *
   * Get user's delegated orders
   *
   * Query params:
   * - status: optional, filter by status (authorized, executing, executed, failed, cancelled, expired)
   */
  @httpGet("/orders")
  async getUserOrders(
    @request() req: AuthenticatedRequest
  ) {
    try {
      const status = req.query.status as OrderStatus | undefined;
      const orders = await this.privyTransactionService.getUserOrders(req.userId, status);

      return {
        success: true,
        userId: req.userId,
        orders: orders
      };
    } catch (error) {
      console.error("Error in getUserOrders:", error);
      throw error;
    }
  }

  /**
   * DELETE /v1/privy-transactions/orders/:orderId
   *
   * Cancel a delegated order
   */
  @httpDelete("/orders/:orderId")
  async cancelOrder(
    @request() req: AuthenticatedRequest,
    @requestParam("orderId") orderId: string
  ) {
    try {
      const result = await this.privyTransactionService.cancelOrder(orderId, req.userId);
      return result;
    } catch (error) {
      console.error("Error in cancelOrder:", error);
      throw error;
    }
  }
}
