import mongoose, { Schema, Document } from "mongoose";

export interface ITokenTransfer extends Document {
  trackedAddress: string; // The address being tracked that this event relates to
  chain: string;
  symbol?: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  tokenAddress: string;
  blockNumber: number;
  timestamp: number;
  type: "INCOMING" | "OUTGOING";
}

const TokenTransferSchema: Schema = new Schema(
  {
    trackedAddress: { type: String, required: true, index: true },
    chain: { type: String, required: true },
    symbol: {type: String,},
    hash: { type: String, required: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
    value: { type: String, required: true },
    tokenAddress: { type: String, required: true },
    blockNumber: { type: Number, required: true },
    timestamp: { type: Number, required: true },
    type: { type: String, enum: ["INCOMING", "OUTGOING"], required: true },
  },
  { timestamps: true }
);

// Compound index for uniqueness to prevent duplicates if we re-process
TokenTransferSchema.index({ hash: 1, trackedAddress: 1, type: 1 }, { unique: true });

export const TokenTransfer = mongoose.model<ITokenTransfer>(
  "TokenTransfer",
  TokenTransferSchema
);
