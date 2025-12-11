// @ts-nocheck
import {
  type Address,
  Client,
  type Hash,
  getContract,
  parseEther,
  parseUnits,
} from "viem";
import { DEFAULT_NETWORK } from "../chains";
import { getPublicClient, getWalletClientFromProvider } from "./clients";
import * as services from "./index";
import { constructSDK, TimeUnit } from "@orbs-network/twap-sdk";
import { OrderTypeEnum } from "../../enums/orderTypeEnum";
import { randomUUID } from "crypto";
import { TWAP_CONFIGS, TwapConfig } from "../../../config/twap";

const twap_abi = [
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "exchange",
            type: "address",
          },
          {
            internalType: "address",
            name: "srcToken",
            type: "address",
          },
          {
            internalType: "address",
            name: "dstToken",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "srcAmount",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "srcBidAmount",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "dstMinAmount",
            type: "uint256",
          },
          {
            internalType: "uint32",
            name: "deadline",
            type: "uint32",
          },
          {
            internalType: "uint32",
            name: "bidDelay",
            type: "uint32",
          },
          {
            internalType: "uint32",
            name: "fillDelay",
            type: "uint32",
          },
          {
            internalType: "bytes",
            name: "data",
            type: "bytes",
          },
        ],
        internalType: "struct OrderLib.Ask",
        name: "_ask",
        type: "tuple",
      },
    ],
    name: "ask",
    outputs: [
      {
        internalType: "uint64",
        name: "id",
        type: "uint64",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
];


/**
 * Get TWAP configuration for a specific network
 * @param network - Network name (e.g., 'sei', 'polygon', 'ethereum')
 * @returns TWAP configuration for the network
 * @throws Error if network is not supported
 */
function getTwapConfig(network: string): TwapConfig {
  const config = TWAP_CONFIGS[network.toLowerCase()];
  if (!config) {
    throw new Error(
      `TWAP configuration not found for network: ${network}. Supported networks: ${Object.keys(TWAP_CONFIGS).join(", ")}`
    );
  }
  return config;
}

export async function buildask(
  srcTokenAddress: string,
  destTokenAddress: string,
  srcAmount: string,
  fillDelay: number,
  chunks: number,
  deadline: number,
  limitPrice: string,
  orderType: OrderTypeEnum,
  network = "sei"
) {
  const config = getTwapConfig(network);
  const twapSDK = constructSDK({ config });

  // Get decimals from source and destination token contracts
  const publicClient = getPublicClient(network);

  const srcTokenContract = getContract({
    address: srcTokenAddress as Address,
    abi: [
      {
        inputs: [],
        name: "decimals",
        outputs: [{ type: "uint8" }],
        stateMutability: "view",
        type: "function",
      },
    ],
    client: publicClient,
  });
  const srcDecimals = await srcTokenContract.read.decimals();

  const destTokenContract = getContract({
    address: destTokenAddress as Address,
    abi: [
      {
        inputs: [],
        name: "decimals",
        outputs: [{ type: "uint8" }],
        stateMutability: "view",
        type: "function",
      },
    ],
    client: publicClient,
  });
  const destDecimals = await destTokenContract.read.decimals();

  let isMarketOrder;
  let fillDelayValue;
  if (fillDelay == null || fillDelay === NaN) {
    fillDelayValue = twapSDK.getFillDelay(false);
  } else {
    const timeduration = { unit: TimeUnit.Minutes, value: fillDelay / 60 };
    fillDelayValue = twapSDK.getFillDelay(true, timeduration);
  }

  switch (orderType) {
    case OrderTypeEnum.MARKET_ORDER:
      isMarketOrder = true;
      break;
    case OrderTypeEnum.LIMIT_ORDER:
      isMarketOrder = false;
      break;
    case OrderTypeEnum.DCA_MARKET_ORDER:
      isMarketOrder = true;
      deadline = fillDelayValue.unit * fillDelayValue.value * chunks * 2;
      break;
    case OrderTypeEnum.DCA_LIMIT_ORDER:
      isMarketOrder = false;
      deadline = fillDelayValue.unit * fillDelayValue.value * chunks * 2;
      break;
    case OrderTypeEnum.SNIPER_DCA:
      break;
    case OrderTypeEnum.LIMIT_LADDER:
      break;
    default:
      break;
  }

  // Convert srcAmount to proper decimals
  const parsedSrcAmount = parseUnits(srcAmount, srcDecimals);

  // Calculate chunk amount and min amount
  const srcTokenChunkAmount = twapSDK.getSrcTokenChunkAmount(
    parsedSrcAmount.toString(),
    chunks
  );
  const destTokenMinAmount = twapSDK.getDestTokenMinAmount(
    srcTokenChunkAmount,
    limitPrice,
    isMarketOrder,
    srcDecimals
  );
  // required for getAskParams
  const deadlineMS = deadline * 1000;
  // Build ask params
  const askParams = twapSDK.getAskParams({
    destTokenMinAmount,
    destTokenAddress,
    srcTokenAddress,
    srcAmount: parsedSrcAmount.toString(),
    fillDelay: fillDelayValue,
    srcChunkAmount: srcTokenChunkAmount,
    deadline:deadlineMS,
  });

  // Get token symbols for metadata
  const [srcSymbol, destSymbol] = await Promise.all([
    srcTokenContract.read.symbol().catch(() => "Unknown"),
    destTokenContract.read.symbol().catch(() => "Unknown")
  ]);

  const txRequest = {
    address: config.twapAddress,
    abi: twap_abi,
    functionName: "ask",
    args: [askParams],
  };

  // Return both the transaction and metadata
  return {
    transaction: txRequest,
    metadata: {
      types: {
        address: "address",
        args:  [
          "address",    // exchangeAddress
          "erc20",    // srcTokenAddress  
          "erc20",    // destTokenAddress
          "uint256",    // srcAmount
          "uint256",    // srcChunkAmount
          "uint256",    // destTokenMinAmount
          "Date",    // deadline (in seconds)
          "Time",    // bidDelaySeconds
          "Time",    // fillDelaySeconds
          "uint256[]"   // empty array
        ], // The args is a single tuple containing the askParams array
      },
      tokens: {
        srcToken: {
          symbol: srcSymbol,
          decimals: srcDecimals,
          formattedAmount: srcAmount
        },
        destToken: {
          symbol: destSymbol,
          decimals: destDecimals
        }
      },
      order: {
        type: orderType,
        chunks,
        fillDelay: fillDelayValue,
        isMarketOrder
      }, 
      network:network
    },
    executionId: randomUUID()
  };
}
