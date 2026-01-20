import { randomUUID } from "crypto";
import { TokenTransfer } from "../../database/mongo/models/TokenTransfer";

export async function getTrackedTransfers(address: string) {
  // Convert srcAmount to proper decimals

  const transactions = await TokenTransfer.find({ trackedAddress: address })
    .sort({ timestamp: -1 })
    .lean();

  // Return both the transaction and metadata
  return {
    transactions: transactions,
    executionId: randomUUID(),
  };
}
