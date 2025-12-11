import { ethers, JsonRpcProvider, WebSocketProvider } from "ethers";
import Order from "../../database/mongo/models/Order";
import { inject, injectable } from "inversify";
import { TYPES } from "../../ioc-container/types";
import { TWAP_CONFIGS } from "../../config/twap";
import { SUPPORTED_NETWORKS } from "../../config/networks";
import { UserOp } from "../../database/mongo/UserOp";

// Simple ABI for the events we care about
const TWAP_ABI = [
  "event OrderCreated( uint64 indexed id, address indexed maker, address indexed exchange, tuple( address exchange, address srcToken, address dstToken, uint256 srcAmount, uint256 srcBidAmount, uint256 dstMinAmount, uint32 deadline, uint32 bidDelay, uint32 fillDelay, bytes data ) ask )",
  "event OrderFilled(uint64 indexed id, address indexed maker, address indexed exchange, address taker, uint256 srcAmountIn, uint256 dstAmountOut, uint256 dstFee, uint256 srcFilledAmount)",
  "event OrderCompleted(uint64 indexed id, address indexed maker, address indexed exchange, address taker)",
  "event OrderCanceled(uint64 indexed id, address indexed maker, address sender)",
];

interface ChainContracts {
  chainName: string;
  wsContract: ethers.Contract;
  httpContract: ethers.Contract;
  wsProvider: WebSocketProvider;
  httpProvider: JsonRpcProvider;
}

@injectable()
export class TwapEventService {
  private chainContracts: Map<string, ChainContracts> = new Map();

  constructor(@inject(TYPES.UserOp) private userOp: UserOp) {
    this.initializeChainContracts();
  }

  private initializeChainContracts() {
    console.log('🔧 Initializing blockchain providers...');

    for (const [chainKey, twapConfig] of Object.entries(TWAP_CONFIGS)) {
      const networkConfig = SUPPORTED_NETWORKS[chainKey];

      if (!networkConfig) {
        console.warn(`⚠️  Network config not found for chain: ${chainKey}`);
        continue;
      }

      // Skip if no WSS URL (required for real-time listening)
      if (!networkConfig.wssUrl || networkConfig.wssUrl === undefined) {
        console.warn(`⚠️  No WSS URL configured for chain: ${chainKey}, skipping event listener`);
        continue;
      }

      try {
        console.log(`🔧 Initializing ${chainKey}...`);

        const wsProvider = new ethers.WebSocketProvider(networkConfig.wssUrl);
        const httpProvider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);

        const wsContract = new ethers.Contract(
          twapConfig.twapAddress,
          TWAP_ABI,
          wsProvider
        );

        const httpContract = new ethers.Contract(
          twapConfig.twapAddress,
          TWAP_ABI,
          httpProvider
        );

        this.chainContracts.set(chainKey, {
          chainName: chainKey,
          wsContract,
          httpContract,
          wsProvider,
          httpProvider,
        });

        console.log(`✅ Initialized contracts for ${chainKey} (chainId: ${networkConfig.chainId})`);
      } catch (error: any) {
        console.error(`❌ Failed to initialize ${chainKey}:`, error?.message || error);
      }
    }

    console.log(`📊 Successfully initialized ${this.chainContracts.size} chain(s)`);
  }

  // 1. Start Real-time Listener
  async startListener() {
    console.log("🎧 Starting Real-time Event Listeners for all chains...");

    if (this.chainContracts.size === 0) {
      console.error("❌ No chain contracts initialized. Cannot start listeners.");
      console.error("❌ Please check your Alchemy API key and WebSocket permissions.");
      return;
    }

    // Set up listeners for each chain
    for (const [chainKey, contracts] of this.chainContracts.entries()) {
      this.setupChainListeners(chainKey, contracts);
    }

    console.log(`✅ Listening to events on ${this.chainContracts.size} chains`);
  }

  private setupChainListeners(chainKey: string, contracts: ChainContracts) {
    const { wsContract } = contracts;
    const twapConfig = TWAP_CONFIGS[chainKey];
    const networkConfig = SUPPORTED_NETWORKS[chainKey];

    // Listen for NEW Orders
    wsContract.on(
      "OrderCreated",
      async (id, maker, exchange, ask, event) => {
        try {
          // Check if user exists before creating order
          const userExists = await this.userOp.userExists(maker);

          if (!userExists) {
            console.log(`[${chainKey}] Skipping Order #${id} - User ${maker} not in database`);
            return;
          }

          await Order.create({
            orderId: Number(id),
            chainId: networkConfig.chainId,
            chainName: chainKey,
            maker: maker,
            exchange: exchange,
            // Map the 'Ask' struct fields
            srcToken: ask.srcToken,
            dstToken: ask.dstToken,
            srcAmount: ask.srcAmount.toString(),
            srcBidAmount: ask.srcBidAmount.toString(),
            dstMinAmount: ask.dstMinAmount.toString(),
            deadline: Number(ask.deadline),
            bidDelay: Number(ask.bidDelay),
            fillDelay: Number(ask.fillDelay),
            // Init Status
            status: "OPEN",
            totalFilledAmount: "0",
            fills: [],
            txHashCreated: event.log.transactionHash,
          });
          console.log(`[${chainKey}] [NEW] Order #${id} created for user ${maker}`);
        } catch (err) {
          console.error(`[${chainKey}] Error saving new order:`, err);
        }
      }
    );

    // Listen for FILLS
    wsContract.on(
      "OrderFilled",
      async (
        id,
        maker,
        exchange,
        taker,
        srcIn,
        dstOut,
        fee,
        srcFilledAmount,
        event
      ) => {
        try {
          const orderId = Number(id);
          const txHash = event.log.transactionHash;
          const logIndex = event.log.index;

          const result = await Order.findOneAndUpdate(
            {
              orderId: orderId,
              chainId: networkConfig.chainId,
              // IDEMPOTENCY CHECK: Ensure we haven't added this specific fill already
              "fills.txHash": { $ne: txHash },
            },
            {
              $set: {
                totalFilledAmount: srcFilledAmount.toString(),
                lastUpdated: new Date(),
              },
              $push: {
                fills: {
                  txHash: txHash,
                  logIndex: logIndex,
                  taker: taker,
                  srcAmountIn: srcIn.toString(),
                  dstAmountOut: dstOut.toString(),
                  dstFee: fee.toString(),
                  timestamp: new Date(),
                },
              },
            },
            { new: true } // Return updated doc
          );

          if (result) {
            // Post-update: calculate percent filled
            const total = BigInt(result.srcAmount);
            const filled = BigInt(result.totalFilledAmount);
            const percent = Number((filled * BigInt(100)) / total);

            await result.updateOne({ percentFilled: percent });

            console.log(`[${chainKey}] [FILL] Order #${id}: ${percent}% filled`);
          } else {
            console.log(`[${chainKey}] [SKIP] Duplicate or missing order #${id}`);
          }
        } catch (err) {
          console.error(`[${chainKey}] Error processing fill:`, err);
        }
      }
    );

    // Listen for COMPLETION
    wsContract.on(
      "OrderCompleted",
      async (id, maker, exchange, taker, event) => {
        try {
          await Order.findOneAndUpdate(
            { orderId: Number(id), chainId: networkConfig.chainId },
            { status: "COMPLETED", percentFilled: 100, lastUpdated: new Date() }
          );
          console.log(`[${chainKey}] [DONE] Order #${id} completed`);
        } catch (err) {
          console.error(`[${chainKey}] Error marking order completed:`, err);
        }
      }
    );

    // Listen for CANCEL
    wsContract.on("OrderCanceled", async (id, maker, sender, event) => {
      try {
        await Order.findOneAndUpdate(
          { orderId: Number(id), chainId: networkConfig.chainId },
          { status: "CANCELED", lastUpdated: new Date() }
        );
        console.log(`[${chainKey}] [CANCEL] Order #${id} canceled`);
      } catch (err) {
        console.error(`[${chainKey}] Error marking order canceled:`, err);
      }
    });

    console.log(`🎧 [${chainKey}] Event listeners set up successfully`);
  }

  // 2. Manual Sync (Used by Cron)
  // Checks the last blocks for events we might have missed
  // Uses HTTP provider for more stable historical queries
  async syncRecentHistory() {
    console.log(`🔄 Cron: Starting sync across all chains...`);

    for (const [chainKey, contracts] of this.chainContracts.entries()) {
      try {
        await this.syncChainHistory(chainKey, contracts);
      } catch (error) {
        console.error(`Failed to sync history for ${chainKey}:`, error);
      }
    }
  }

  private async syncChainHistory(chainKey: string, contracts: ChainContracts) {
    try {
      const { httpContract, httpProvider } = contracts;
      const networkConfig = SUPPORTED_NETWORKS[chainKey];
      const currentBlock = await httpProvider.getBlockNumber();
      const fromBlock = currentBlock - 50; // Look back ~50 blocks

      console.log(`🔄 [${chainKey}] Syncing blocks ${fromBlock} to ${currentBlock}...`);

      const filter = httpContract.filters.OrderCompleted();
      const events = await httpContract.queryFilter(
        filter,
        fromBlock,
        currentBlock
      );

      for (const event of events) {
        if ("args" in event) {
          const id = Number(event.args[0]);
          // Idempotency: Only update if not already marked completed
          const exists = await Order.findOne({
            orderId: id,
            chainId: networkConfig.chainId,
            status: "COMPLETED",
          });
          if (!exists) {
            await Order.findOneAndUpdate(
              { orderId: id, chainId: networkConfig.chainId },
              { status: "COMPLETED", lastUpdated: new Date() }
            );
            console.log(`[${chainKey}] [RECOVERY] Found missed completion for Order #${id}`);
          }
        }
      }
    } catch (error) {
      console.error(`Error syncing chain history for ${chainKey}:`, error);
    }
  }
}
