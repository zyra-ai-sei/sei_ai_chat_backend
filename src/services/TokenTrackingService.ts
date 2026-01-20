import { inject, injectable } from "inversify";
import { TYPES } from "../ioc-container/types";
import { SocketService } from "./SocketService";
import { TrackedAddress } from "../database/mongo/models/TrackedAddress";
import { TokenTransfer } from "../database/mongo/models/TokenTransfer";
import { ethers } from "ethers";
import env from "../envConfig";
import { erc20Abi } from "viem";

@injectable()
export class TokenTrackingService {
  private provider: ethers.JsonRpcProvider;
  private activeListeners: Set<string> = new Set();

  constructor(
    @inject(TYPES.SocketService) private socketService: SocketService
  ) {
    this.provider = new ethers.JsonRpcProvider(env.RPC_URL);
  }

  public async startTracking() {
    console.log("Starting Token Tracking Service...");
    const trackedAddresses = await TrackedAddress.find({});
    for (const tracked of trackedAddresses) {
      this.setupListener(tracked.address);
    }
  }

  public async getTrackedAddresses(userId: string) {
    const tracked = await TrackedAddress.find({ subscribers: userId });
    const addresses = tracked.map((t) => t.address);
    return addresses;
  }

  public async getHistory(userId: string) {
    // Find all addresses this user is subscribed to
    const tracked = await TrackedAddress.find({ subscribers: userId });
    const addresses = tracked.map((t) => t.address);

    // Find all transfers for these addresses
    const transfers = await TokenTransfer.find({
      trackedAddress: { $in: addresses },
    })
      .sort({ timestamp: -1 })
      .limit(100)
      .lean(); // Ensure plain JS array

    return transfers;
  }

  public async subscribe(userId: string, address: string) {
    const normalizedAddress = ethers.getAddress(address);

    let tracked = await TrackedAddress.findOne({ address: normalizedAddress });
    if (!tracked) {
      tracked = new TrackedAddress({
        address: normalizedAddress,
        subscribers: [userId],
        chains: ["sei"], // Default to sei for now
      });
      await tracked.save();
      this.setupListener(normalizedAddress);
    } else {
      if (!tracked.subscribers.includes(userId)) {
        tracked.subscribers.push(userId);
        await tracked.save();
      }
    }
    return tracked;
  }

  public async unsubscribe(userId: string, address: string) {
    const normalizedAddress = ethers.getAddress(address);
    const tracked = await TrackedAddress.findOne({
      address: normalizedAddress,
    });
    if (tracked) {
      tracked.subscribers = tracked.subscribers.filter((id) => id !== userId);
      if (tracked.subscribers.length === 0) {
        await TrackedAddress.deleteOne({ _id: tracked._id });
        this.removeListener(normalizedAddress);
      } else {
        await tracked.save();
      }
    }
  }

  private setupListener(address: string) {
    if (this.activeListeners.has(address)) return;

    console.log(`Setting up listener for ${address}`);
    const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
    const paddedAddress = ethers.zeroPadValue(address, 32);

    // Filter for Incoming Transfers (To: address)
    const filterIncoming = {
      topics: [TRANSFER_TOPIC, null, paddedAddress],
    };

    // Filter for Outgoing Transfers (From: address)
    const filterOutgoing = {
      topics: [TRANSFER_TOPIC, paddedAddress],
    };

    const handleLog = async (log: any, type: "INCOMING" | "OUTGOING") => {
      try {
        const tracked = await TrackedAddress.findOne({ address });
        if (!tracked) return;

        const tx = await this.provider.getTransaction(log.transactionHash);

        const eventData = {
          trackedAddress: address,
          type,
          hash: log.transactionHash,
          from:
            type === "INCOMING"
              ? ethers.stripZerosLeft(log.topics[1])
              : address,
          to:
            type === "OUTGOING"
              ? ethers.stripZerosLeft(log.topics[2])
              : address,
          value: log.data, // Needs decoding based on decimals, sending raw for now
          tokenAddress: log.address,
          timestamp: Math.floor(Date.now() / 1000),
          chainId: "sei", // Hardcoded for Sei for now
          blockNumber: log.blockNumber,
        };

        const contract = new ethers.Contract(
          log.address,
          erc20Abi,
          this.provider
        );

        const decimals = await contract.decimals();
        const symbol = await contract.symbol();

        const exactAmount = ethers.formatUnits(BigInt(log.data),decimals);

        // Save to DB
        try {
          await TokenTransfer.create({
            trackedAddress: address,
            chain: "sei",
            hash: eventData.hash,
            symbol: symbol,
            from: eventData.from,
            to: eventData.to,
            value: exactAmount,
            tokenAddress: eventData.tokenAddress,
            blockNumber: eventData.blockNumber,
            timestamp: eventData.timestamp,
            type: type,
          });
        } catch (dbErr: any) {
          // Ignore duplicate key errors (E11000)
          if (dbErr.code !== 11000) {
            console.error("Error saving token transfer:", dbErr);
          }
        }

        // Broadcast to all subscribers
        for (const userId of tracked.subscribers) {
          this.socketService.emitToUser(userId, "token-transfer", eventData);
        }
      } catch (err) {
        console.error(`Error processing log for ${address}:`, err);
      }
    };

    this.provider.on(filterIncoming, (log) => handleLog(log, "INCOMING"));
    this.provider.on(filterOutgoing, (log) => handleLog(log, "OUTGOING"));

    this.activeListeners.add(address);
  }

  private removeListener(address: string) {
    if (!this.activeListeners.has(address)) return;

    console.log(`Removing listener for ${address}`);
    // Ethers v6 doesn't have a simple "off" for specific filters easily without storing the exact function reference
    // For now, we might need to restart the service or implement a more complex listener manager.
    // However, since we are using anonymous functions in setupListener, we can't easily remove them individually
    // unless we store the handler.

    // TODO: Implement proper listener cleanup.
    // For this MVP, we will just remove from active set, but the listener might persist until restart.
    // To fix this, we need to store the callback functions in a map.

    this.activeListeners.delete(address);
  }
}
