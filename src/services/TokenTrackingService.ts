import { inject, injectable } from "inversify";
import { TYPES } from "../ioc-container/types";
import { SocketService } from "./SocketService";
import { TrackedAddress } from "../database/mongo/models/TrackedAddress";
import { TokenTransfer } from "../database/mongo/models/TokenTransfer";
import { ethers } from "ethers";
import env from "../envConfig";
import { erc20Abi } from "viem";
import { SUPPORTED_NETWORKS } from "../config/networks";

@injectable()
export class TokenTrackingService {
  private providers: Map<string, ethers.JsonRpcProvider> = new Map();
  private activeListeners: Map<string, Set<string>> = new Map(); // chain -> Set<address>
  private listenerCallbacks: Map<string, { incoming: any; outgoing: any }> = new Map(); // "chain:address" -> callbacks

  constructor(
    @inject(TYPES.SocketService) private socketService: SocketService
  ) {
    // Initialize providers for all supported networks
    for (const [network, config] of Object.entries(SUPPORTED_NETWORKS)) {
      // Prefer WSS for event listening if available
      const url = config.wssUrl || config.rpcUrl;
      if (url) {
        const provider = url.startsWith("wss") 
          ? new ethers.WebSocketProvider(url)
          : new ethers.JsonRpcProvider(url);
          
        this.providers.set(network, provider as any);
        this.activeListeners.set(network, new Set());
      }
    }
  }

  public async startTracking() {
    console.log("Starting Token Tracking Service...");
    const trackedAddresses = await TrackedAddress.find({});
    for (const tracked of trackedAddresses) {
      for (const chain of tracked.chains) {
        this.setupListener(tracked.address, chain);
      }
    }
  }

  public async getTrackedAddresses(userId: string) {
    const tracked = await TrackedAddress.find({ subscribers: userId });
    return tracked.map((t) => ({ address: t.address, chains: t.chains }));
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
      .lean();

    return transfers;
  }

  public async subscribe(userId: string, address: string, chains: string[] = ["sei"]) {
    const normalizedAddress = ethers.getAddress(address);

    for (const chain of chains) {
      if (!SUPPORTED_NETWORKS[chain]) {
        throw new Error(`Unsupported network: ${chain}`);
      }
    }

    let tracked = await TrackedAddress.findOne({ address: normalizedAddress });
    if (!tracked) {
      tracked = new TrackedAddress({
        address: normalizedAddress,
        subscribers: [userId],
        chains: chains,
      });
      await tracked.save();
      for (const chain of chains) {
        this.setupListener(normalizedAddress, chain);
      }
    } else {
      if (!tracked.subscribers.includes(userId)) {
        tracked.subscribers.push(userId);
      }
      for (const chain of chains) {
        if (!tracked.chains.includes(chain)) {
          tracked.chains.push(chain);
          this.setupListener(normalizedAddress, chain);
        }
      }
      await tracked.save();
    }
    return tracked;
  }

  public async updateSubscription(userId: string, address: string, chains: string[]) {
    const normalizedAddress = ethers.getAddress(address);

    for (const chain of chains) {
      if (!SUPPORTED_NETWORKS[chain]) {
        throw new Error(`Unsupported network: ${chain}`);
      }
    }

    let tracked = await TrackedAddress.findOne({ address: normalizedAddress });
    if (!tracked) {
      throw new Error(`Tracked address not found: ${address}`);
    }

    // Identify chains to add and remove
    const chainsToAdd = chains.filter(c => !tracked.chains.includes(c));
    const chainsToRemove = tracked.chains.filter(c => !chains.includes(c));

    // Update listeners
    for (const chain of chainsToAdd) {
      this.setupListener(normalizedAddress, chain);
    }
    for (const chain of chainsToRemove) {
      this.removeListener(normalizedAddress, chain);
    }

    tracked.chains = chains;
    await tracked.save();

    return tracked;
  }

  public async unsubscribe(userId: string, address: string, chain?: string) {
    const normalizedAddress = ethers.getAddress(address);
    const tracked = await TrackedAddress.findOne({
      address: normalizedAddress,
    });

    if (tracked) {
      tracked.subscribers = tracked.subscribers.filter((id) => id !== userId);
      
      if (tracked.subscribers.length === 0) {
        // If no subscribers left, stop tracking on all chains
        for (const c of tracked.chains) {
          this.removeListener(normalizedAddress, c);
        }
        await TrackedAddress.deleteOne({ _id: tracked._id });
      } else {
        // If chain specified, maybe just stop tracking that user's interest in that chain? 
        // But subscribers are global to the address in this model.
        // For now, keep it simple: if you unsubscribe from an address, you're removed from its subscriber list.
        await tracked.save();
      }
    }
  }

  private setupListener(address: string, chain: string) {
    const provider = this.providers.get(chain);
    const chainListeners = this.activeListeners.get(chain);

    if (!provider || !chainListeners) {
      console.warn(`No provider or listener set for chain: ${chain}`);
      return;
    }

    if (chainListeners.has(address)) return;

    console.log(`Setting up listener for ${address} on ${chain}`);
    const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
    const paddedAddress = ethers.zeroPadValue(address, 32);

    const filterIncoming = {
      topics: [TRANSFER_TOPIC, null, paddedAddress],
    };

    const filterOutgoing = {
      topics: [TRANSFER_TOPIC, paddedAddress],
    };

    const handleLog = async (log: any, type: "INCOMING" | "OUTGOING") => {
      try {
        const tracked = await TrackedAddress.findOne({ address });
        if (!tracked) return;

        // Skip if this chain is not being tracked for this address anymore
        if (!tracked.chains.includes(chain)) return;

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
          value: log.data,
          tokenAddress: log.address,
          timestamp: Math.floor(Date.now() / 1000),
          chainId: chain,
          blockNumber: log.blockNumber,
        };

        const contract = new ethers.Contract(log.address, erc20Abi, provider);

        let decimals = 18;
        let symbol = "UNKNOWN";
        try {
          [decimals, symbol] = await Promise.all([
            contract.decimals(),
            contract.symbol(),
          ]);
        } catch (e) {
          console.warn(`Could not fetch decimals/symbol for ${log.address} on ${chain}`);
        }

        const exactAmount = ethers.formatUnits(BigInt(log.data), decimals);

        // Save to DB
        try {
          await TokenTransfer.create({
            trackedAddress: address,
            chain: chain,
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
          if (dbErr.code !== 11000) {
            console.error("Error saving token transfer:", dbErr);
          }
        }

        // Broadcast to all subscribers
        const broadcastData = { ...eventData, symbol, value: exactAmount };
        for (const userId of tracked.subscribers) {
          this.socketService.emitToUser(userId, "token-transfer", broadcastData);
        }
      } catch (err) {
        console.error(`Error processing log for ${address} on ${chain}:`, err);
      }
    };

    const incomingCallback = (log: any) => handleLog(log, "INCOMING");
    const outgoingCallback = (log: any) => handleLog(log, "OUTGOING");

    provider.on(filterIncoming, incomingCallback);
    provider.on(filterOutgoing, outgoingCallback);

    this.listenerCallbacks.set(`${chain}:${address}`, {
      incoming: incomingCallback,
      outgoing: outgoingCallback,
    });
    chainListeners.add(address);
  }

  private removeListener(address: string, chain: string) {
    const provider = this.providers.get(chain);
    const chainListeners = this.activeListeners.get(chain);
    const callbacks = this.listenerCallbacks.get(`${chain}:${address}`);

    if (provider && callbacks) {
      console.log(`Removing listener for ${address} on ${chain}`);
      const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
      const paddedAddress = ethers.zeroPadValue(address, 32);

      const filterIncoming = {
        topics: [TRANSFER_TOPIC, null, paddedAddress],
      };

      const filterOutgoing = {
        topics: [TRANSFER_TOPIC, paddedAddress],
      };

      provider.off(filterIncoming, callbacks.incoming);
      provider.off(filterOutgoing, callbacks.outgoing);
    }

    if (chainListeners) {
      chainListeners.delete(address);
    }
    this.listenerCallbacks.delete(`${chain}:${address}`);
  }
}
