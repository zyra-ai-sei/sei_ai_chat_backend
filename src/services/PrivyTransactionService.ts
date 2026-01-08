import { inject, injectable } from "inversify";
import { TYPES } from "../ioc-container/types";
import { AuthService } from "./AuthService";
import { DelegatedTransactionOp } from "../database/mongo/DelegatedTransactionOp";
import { getPrivyClient } from "../config/privy.config";
import { AuthorizationContextBuilder } from "../utils/privy/authorizationContextBuilder";
import {
  TransactionSigningMode,
  TransactionType,
  DelegatedOrder,
  OrderStatus,
  TransactionAuthContext
} from "../types/transaction.types";
import { v4 as uuidv4 } from "uuid";

/**
 * PrivyTransactionService
 *
 * Handles both immediate and delegated Privy transactions with flexible signing
 *
 * Transaction Flows:
 * 1. Immediate (User Online): User signs transaction in real-time
 * 2. Delegated (User Offline): User pre-authorizes, server executes when conditions met
 */
@injectable()
export class PrivyTransactionService {
  private privyClient = getPrivyClient();

  constructor(
    @inject(TYPES.AuthService) private authService: AuthService,
    @inject(TYPES.DelegatedTransactionOp)
    private delegatedTransactionOp: DelegatedTransactionOp
  ) {}

  /**
   * TEST METHOD: Get user's wallets with delegated signers
   *
   * @param userId - The user's DID (e.g., 'did:privy:...')
   */
  async sendTransaction(userId: string) {
    try {
      // Get user's wallets with delegated signers from Privy
      const wallets = await this.authService.getUserWalletsWithSigners(userId);

      // Console log the result
      console.log(
        "User wallets with signers:",
        JSON.stringify(wallets, null, 2)
      );

      return wallets;
    } catch (error) {
      console.error("Error in sendTransaction:", error);
      throw error;
    }
  }

  /**
   * Send an immediate transaction (user signs in real-time)
   *
   * Flow:
   * 1. User is online and initiates transaction
   * 2. User JWT is used to sign (2-of-2: user + server)
   * 3. Transaction executed immediately
   *
   * @param userId - Privy user DID
   * @param walletId - Privy wallet ID
   * @param userJwt - User's valid JWT token
   * @param transactionData - Transaction details
   */
  async sendImmediateTransaction(
    userId: string,
    walletId: string,
    userJwt: string,
    transactionData: {
      to: string;
      value?: string;
      data?: string;
      chainId: number;
    }
  ) {
    try {
      console.log(
        `[Immediate Transaction] User: ${userId}, Wallet: ${walletId}`
      );

      // Build authorization context for user-initiated transaction
      const authContext: TransactionAuthContext = {
        mode: TransactionSigningMode.USER_INITIATED,
        userJwt,
        authorizationPrivateKey: process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY!
      };

      const authorizationContext =
        AuthorizationContextBuilder.buildContext(authContext);

      // Convert value to hex format (Privy requires 0x prefix)
      const valueInHex = transactionData.value
        ? `0x${BigInt(transactionData.value).toString(16)}`
        : "0x0";

      // Send transaction using Privy SDK with authorization context
      const result = await this.privyClient
        .wallets()
        .ethereum()
        .sendTransaction(walletId, {
          caip2: `eip155:${transactionData.chainId}`, // CAIP-2 format
          params: {
            transaction: {
              to: transactionData.to,
              value: valueInHex,
              data: transactionData.data || "0x",
              chain_id: transactionData.chainId
            }
          },
          authorization_context: authorizationContext
        });

      console.log(
        `[Immediate Transaction] Success: ${result.hash}`
      );

      return {
        success: true,
        transactionHash: result.hash,
        transactionId: result.transaction_id
      };
    } catch (error) {
      console.error("[Immediate Transaction] Error:", error);
      throw new Error(
        `Failed to send immediate transaction: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Create a delegated transaction order (user pre-authorizes for later execution)
   *
   * Flow:
   * 1. User is online and creates order (e.g., limit order, stop loss)
   * 2. User signs authorization with their JWT (security check)
   * 3. Order stored in database with user's JWT
   * 4. Server will execute later when conditions are met (user can be offline)
   *
   * @param userId - Privy user DID
   * @param walletId - Privy wallet ID
   * @param userJwt - User's JWT for authorization
   * @param orderDetails - Order configuration
   */
  async createDelegatedOrder(
    userId: string,
    walletId: string,
    userJwt: string,
    orderDetails: {
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
        executeAt?: Date;
        expiresAt?: Date;
      };
      description?: string;
    }
  ) {
    try {
      const orderId = uuidv4();

      console.log(
        `[Create Delegated Order] User: ${userId}, Type: ${orderDetails.transactionType}`
      );

      // Validate user JWT before storing
      // TODO: Add JWT validation here

      // Create delegated order in database
      const order: Partial<DelegatedOrder> = {
        orderId,
        userId,
        walletId,
        transactionType: orderDetails.transactionType,
        status: OrderStatus.AUTHORIZED,
        transactionData: orderDetails.transactionData,
        executionConditions: orderDetails.executionConditions,
        userJwt, // Store user's JWT for later execution (TODO: encrypt)
        createdAt: new Date(),
        authorizedAt: new Date()
      };

      const savedOrder = await this.delegatedTransactionOp.createOrder(order);

      console.log(
        `[Create Delegated Order] Success: Order ID ${savedOrder.orderId}`
      );

      return {
        success: true,
        orderId: savedOrder.orderId,
        status: savedOrder.status,
        message: "Order created and authorized successfully"
      };
    } catch (error) {
      console.error("[Create Delegated Order] Error:", error);
      throw new Error(
        `Failed to create delegated order: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Execute a delegated transaction (server executes when conditions are met)
   *
   * Flow:
   * 1. Monitoring service detects conditions are met
   * 2. Retrieves stored order with user's JWT
   * 3. Server signs and executes using stored JWT + server key (2-of-2)
   * 4. User can be offline during execution
   *
   * @param orderId - The order ID to execute
   */
  async executeDelegatedOrder(orderId: string) {
    try {
      console.log(`[Execute Delegated Order] Order ID: ${orderId}`);

      // Get order from database
      const order = await this.delegatedTransactionOp.getOrderById(orderId);

      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      if (order.status !== OrderStatus.AUTHORIZED) {
        throw new Error(
          `Order cannot be executed. Current status: ${order.status}`
        );
      }

      // Check if expired
      if (
        order.executionConditions.expiresAt &&
        new Date() > order.executionConditions.expiresAt
      ) {
        await this.delegatedTransactionOp.updateOrderStatus(
          orderId,
          OrderStatus.EXPIRED
        );
        throw new Error("Order has expired");
      }

      // Update status to executing
      await this.delegatedTransactionOp.updateOrderStatus(
        orderId,
        OrderStatus.EXECUTING
      );

      // Build authorization context
      // Using SERVER_ONLY since wallet is configured with 1-of-1 authorization key
      const authContext: TransactionAuthContext = {
        mode: TransactionSigningMode.SERVER_ONLY,
        authorizationPrivateKey: process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY!,
        orderId
      };

      const authorizationContext =
        AuthorizationContextBuilder.buildContext(authContext);

      // Convert value to hex format (Privy requires 0x prefix)
      const valueInHex = order.transactionData.value
        ? `0x${BigInt(order.transactionData.value).toString(16)}`
        : "0x0";

      // Execute transaction using Privy SDK
      const result = await this.privyClient
        .wallets()
        .ethereum()
        .sendTransaction(order.walletId, {
          caip2: `eip155:${order.transactionData.chainId}`, // CAIP-2 format
          params: {
            transaction: {
              to: order.transactionData.to,
              value: valueInHex,
              data: order.transactionData.data || "0x",
              chain_id: order.transactionData.chainId
            }
          },
          authorization_context: authorizationContext
        });

      // Update order status to executed
      await this.delegatedTransactionOp.updateOrderStatus(
        orderId,
        OrderStatus.EXECUTED,
        {
          transactionHash: result.hash
        }
      );

      console.log(
        `[Execute Delegated Order] Success: ${result.hash}`
      );

      return {
        success: true,
        orderId,
        transactionHash: result.hash,
        transactionId: result.transaction_id
      };
    } catch (error) {
      console.error("[Execute Delegated Order] Error:", error);

      // Update order status to failed
      await this.delegatedTransactionOp.updateOrderStatus(
        orderId,
        OrderStatus.FAILED,
        {
          errorMessage: error instanceof Error ? error.message : "Unknown error",
          errorDetails: error
        }
      );

      throw new Error(
        `Failed to execute delegated order: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Get user's delegated orders
   */
  async getUserOrders(userId: string, status?: OrderStatus) {
    try {
      return await this.delegatedTransactionOp.getUserOrders(userId, status);
    } catch (error) {
      console.error("[Get User Orders] Error:", error);
      throw error;
    }
  }

  /**
   * Cancel a delegated order
   */
  async cancelOrder(orderId: string, userId: string) {
    try {
      // Verify order belongs to user
      const order = await this.delegatedTransactionOp.getOrderById(orderId);

      if (!order) {
        throw new Error("Order not found");
      }

      if (order.userId !== userId) {
        throw new Error("Unauthorized: Order does not belong to user");
      }

      const cancelled = await this.delegatedTransactionOp.cancelOrder(orderId);

      return {
        success: true,
        orderId: cancelled?.orderId,
        status: cancelled?.status
      };
    } catch (error) {
      console.error("[Cancel Order] Error:", error);
      throw error;
    }
  }

  /**
   * Get orders ready for execution (for monitoring service)
   */
  async getOrdersReadyForExecution() {
    try {
      return await this.delegatedTransactionOp.getOrdersReadyForExecution();
    } catch (error) {
      console.error("[Get Orders Ready] Error:", error);
      throw error;
    }
  }
}
