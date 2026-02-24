import { TokenTransfer } from "../../database/mongo/models/TokenTransfer";

export async function getTrackedTransfers(address: string) {
  const transactions = await TokenTransfer.find({ trackedAddress: address })
    .sort({ timestamp: -1 })
    .lean();

  return {
    transactions,
  };
}
