/**
 * Transaction Types and Enums
 *
 * Defines the different types of transactions and their signing requirements
 */

/**
 * Transaction signing modes
 */
export enum TransactionSigningMode {
  /** User must sign the transaction in real-time (user is online) */
  USER_INITIATED = 'user_initiated',

  /** User pre-authorizes, server executes later (user can be offline) */
  DELEGATED_EXECUTION = 'delegated_execution',

  /** Server signs directly without user (for fully automated operations) */
  SERVER_ONLY = 'server_only'
}

/**
 * Transaction types
 */
export enum TransactionType {
  /** Regular user-initiated transaction (swap, transfer, etc.) */
  IMMEDIATE = 'immediate',

  /** Limit order - user authorizes, server executes when conditions met */
  LIMIT_ORDER = 'limit_order',

  /** Stop loss - user authorizes, server executes when price drops */
  STOP_LOSS = 'stop_loss',

  /** DCA (Dollar Cost Averaging) - recurring buys */
  DCA = 'dca',

  /** Scheduled transaction */
  SCHEDULED = 'scheduled'
}

/**
 * Order status for delegated transactions
 */
export enum OrderStatus {
  /** User has authorized, waiting for conditions */
  AUTHORIZED = 'authorized',

  /** Conditions met, executing transaction */
  EXECUTING = 'executing',

  /** Transaction executed successfully */
  EXECUTED = 'executed',

  /** Execution failed */
  FAILED = 'failed',

  /** User cancelled the order */
  CANCELLED = 'cancelled',

  /** Order expired */
  EXPIRED = 'expired'
}

/**
 * Delegated order details
 */
export interface DelegatedOrder {
  orderId: string;
  userId: string;
  walletId: string;
  transactionType: TransactionType;
  status: OrderStatus;

  /** Transaction data to execute when conditions are met */
  transactionData: {
    to: string;
    value?: string;
    data?: string;
    chainId: number;
    gas?: string;
  };

  /** Conditions that trigger execution */
  executionConditions: {
    /** For limit orders: target price */
    targetPrice?: number;

    /** Price direction for limit orders: 'above' for sell, 'below' for buy */
    priceDirection?: 'above' | 'below';

    /** Token symbol for price checking (e.g., 'ethereum', 'bitcoin') */
    targetTokenSymbol?: string;

    /** For stop loss: stop price */
    stopPrice?: number;

    /** For scheduled: execution time */
    executeAt?: Date;

    /** Expiration time */
    expiresAt?: Date;

    /** Order ID this order depends on (for linked orders like buy->sell) */
    dependsOn?: string;

    /** Custom conditions for future extensions */
    customConditions?: Record<string, any>;
  };

  /** User's authorization signature for this specific transaction */
  userAuthorizationSignature?: string;

  /** User JWT used for authorization (stored securely) */
  userJwt?: string;

  /** Timestamps */
  createdAt: Date;
  authorizedAt?: Date;
  executedAt?: Date;

  /** Execution result */
  transactionHash?: string;
  errorMessage?: string;

  /** Amount received from execution (for linked orders) */
  executedAmount?: string;
}

/**
 * Authorization context for transaction signing
 */
export interface TransactionAuthContext {
  mode: TransactionSigningMode;
  userJwt?: string;
  authorizationPrivateKey: string;
  orderId?: string; // For delegated executions
}
