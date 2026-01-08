import mongoose, { Schema, Document } from 'mongoose';
import {
  TransactionType,
  OrderStatus
} from '../../../types/transaction.types';

/**
 * Delegated Transaction Model
 *
 * Stores transactions that are pre-authorized by users and executed by the server
 * when conditions are met (limit orders, stop losses, scheduled txs, etc.)
 */

export interface IDelegatedTransaction extends Document {
  // Identifiers
  orderId: string;
  userId: string; // Privy user DID
  walletId: string; // Privy wallet ID

  // Transaction type and status
  transactionType: TransactionType;
  status: OrderStatus;

  // Transaction data to execute
  transactionData: {
    to: string;
    value?: string;
    data?: string;
    chainId: number;
    gasLimit?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
  };

  // Execution conditions
  executionConditions: {
    // For limit orders: target price
    targetPrice?: number;
    targetTokenAddress?: string;

    // For stop loss: stop price
    stopPrice?: number;

    // For scheduled: execution time
    executeAt?: Date;

    // Expiration time
    expiresAt?: Date;

    // Additional conditions (JSON for flexibility)
    customConditions?: Record<string, any>;
  };

  // Authorization data (encrypted)
  authorization: {
    // User's JWT token used for authorization (encrypted)
    userJwtEncrypted?: string;

    // User's signature authorizing this transaction
    userAuthorizationSignature?: string;

    // Timestamp when user authorized
    authorizedAt?: Date;
  };

  // Execution tracking
  execution: {
    // Number of execution attempts
    attemptCount: number;

    // Last attempt timestamp
    lastAttemptAt?: Date;

    // Transaction hash when executed
    transactionHash?: string;

    // Execution timestamp
    executedAt?: Date;

    // Error details if failed
    errorMessage?: string;
    errorDetails?: Record<string, any>;
  };

  // Metadata
  metadata: {
    // User-provided description
    description?: string;

    // Tags for categorization
    tags?: string[];

    // Additional metadata
    extra?: Record<string, any>;
  };

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const DelegatedTransactionSchema: Schema = new Schema(
  {
    orderId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    walletId: { type: String, required: true, index: true },

    transactionType: {
      type: String,
      enum: Object.values(TransactionType),
      required: true,
      index: true
    },

    status: {
      type: String,
      enum: Object.values(OrderStatus),
      default: OrderStatus.AUTHORIZED,
      index: true
    },

    transactionData: {
      to: { type: String, required: true },
      value: { type: String },
      data: { type: String },
      chainId: { type: Number, required: true },
      gasLimit: { type: String },
      maxFeePerGas: { type: String },
      maxPriorityFeePerGas: { type: String }
    },

    executionConditions: {
      targetPrice: { type: Number },
      targetTokenAddress: { type: String },
      stopPrice: { type: Number },
      executeAt: { type: Date, index: true },
      expiresAt: { type: Date, index: true },
      customConditions: { type: Schema.Types.Mixed }
    },

    authorization: {
      userJwtEncrypted: { type: String },
      userAuthorizationSignature: { type: String },
      authorizedAt: { type: Date }
    },

    execution: {
      attemptCount: { type: Number, default: 0 },
      lastAttemptAt: { type: Date },
      transactionHash: { type: String, index: true },
      executedAt: { type: Date },
      errorMessage: { type: String },
      errorDetails: { type: Schema.Types.Mixed }
    },

    metadata: {
      description: { type: String },
      tags: [{ type: String }],
      extra: { type: Schema.Types.Mixed }
    }
  },
  {
    timestamps: true
  }
);

// Compound indexes for efficient queries
DelegatedTransactionSchema.index({ userId: 1, status: 1 });
DelegatedTransactionSchema.index({ userId: 1, transactionType: 1 });
DelegatedTransactionSchema.index({ status: 1, 'executionConditions.executeAt': 1 });
DelegatedTransactionSchema.index({ status: 1, 'executionConditions.expiresAt': 1 });

export const DelegatedTransactionData = mongoose.model<IDelegatedTransaction>(
  'DelegatedTransaction',
  DelegatedTransactionSchema
);
