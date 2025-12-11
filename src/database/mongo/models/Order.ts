import mongoose, { Schema, Document } from 'mongoose';

// The structure of a single "Fill" event inside the history array
interface IFillData {
  txHash: string;
  logIndex: number;
  taker: string;
  srcAmountIn: string;
  dstAmountOut: string;
  dstFee: string;
  timestamp: Date;
}

export interface IOrder extends Document {
  // --- Identifiers ---
  orderId: number;
  chainId: number;        // Chain ID for multi-chain support
  chainName: string;      // Chain name for easier identification
  maker: string;
  exchange: string; // The DEX address

  // --- Order Configuration (From 'Ask') ---
  srcToken: string;
  dstToken: string;
  srcAmount: string;      // Total amount to sell
  srcBidAmount: string;   // Chunk size
  dstMinAmount: string;   // Min buy amount per chunk
  deadline: number;       // Unix timestamp
  bidDelay: number;
  fillDelay: number;

  // --- Live Status ---
  status: 'OPEN' | 'COMPLETED' | 'CANCELED';
  totalFilledAmount: string; // How much sold so far (The field you asked for)
  percentFilled: number;     // Helper for UI (0-100)

  // --- Transaction History (Embedded) ---
  fills: IFillData[];     // Array of all fills for this order

  // --- Metadata ---
  txHashCreated: string;  // TxHash of creation
  createdAt: Date;
  lastUpdated: Date;
}

const OrderSchema: Schema = new Schema({
  orderId: { type: Number, required: true, index: true },
  chainId: { type: Number, required: true, index: true },
  chainName: { type: String, required: true, index: true },
  maker: { type: String, required: true, index: true },
  exchange: { type: String, required: true },

  // Config
  srcToken: { type: String, required: true },
  dstToken: { type: String, required: true },
  srcAmount: { type: String, required: true },
  srcBidAmount: { type: String, required: true },
  dstMinAmount: { type: String, required: true },
  deadline: { type: Number, required: true },
  bidDelay: { type: Number, required: true },
  fillDelay: { type: Number, required: true },

  // Status
  status: { type: String, enum: ['OPEN', 'COMPLETED', 'CANCELED'], default: 'OPEN' },
  totalFilledAmount: { type: String, default: '0' },
  percentFilled: { type: Number, default: 0 },

  // History (Embedded Array)
  fills: [{
    txHash: { type: String, required: true },
    logIndex: { type: Number, required: true }, // To distinguish multiple fills in 1 tx
    taker: { type: String, required: true },
    srcAmountIn: { type: String, required: true },
    dstAmountOut: { type: String, required: true },
    dstFee: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
  }],

  txHashCreated: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  lastUpdated: { type: Date, default: Date.now }
});

// Compound unique index: orderId must be unique per chain
OrderSchema.index({ orderId: 1, chainId: 1 }, { unique: true });
OrderSchema.index({ maker: 1, createdAt: -1 });
OrderSchema.index({ maker: 1, status: 1 });

export default mongoose.model<IOrder>('Order', OrderSchema);