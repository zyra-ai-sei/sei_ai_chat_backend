import { tool } from "@langchain/core/tools";
import { z } from "zod";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { SUPPORTED_NETWORKS } from "../../../../config/networks";
import { getDecimals } from "../../utils/erc20";
import { createQueryResponse, createTransactionResponse, createErrorResponse, extractConfig } from "../../../types";

const STARGATE_API_BASE = "https://stargate.finance/api/v1";

interface LangChainTool {
  tool: (fn: any, config: any) => any;
}

const langchainTools = require("@langchain/core/tools") as LangChainTool;

export const listStargateChains = tool(
  async () => {
    try {
      const response = await fetch(`${STARGATE_API_BASE}/chains`);
      const data: any = await response.json();
      const chains = data.chains;

      let markdown =
        "| chainKey | Name | Chain ID | Native Symbol |\n|------|------------|-----------|---------------|\n";
      chains.forEach((chain: any) => {
        markdown += `| ${chain.chainKey} | ${chain.name} | ${chain.chainId} | ${chain.nativeCurrency.symbol} |\n`;
      });
      return createQueryResponse({
        toolName: 'list_stargate_chains',
        text: markdown,
        data: { chains: chains.map((c: any) => ({ chainKey: c.chainKey, name: c.name, chainId: c.chainId, nativeSymbol: c.nativeCurrency.symbol })) },
      });
    } catch (error) {
      return createErrorResponse({
        kind: 'query',
        toolName: 'list_stargate_chains',
        error: error instanceof Error ? error : String(error),
      });
    }
  },
  {
    name: "list_stargate_chains",
    description:
      "Retrieve a list of all blockchain networks supported by Stargate for bridging.",
  },
);

export const getStargateQuotes = langchainTools.tool(
  async ({ srcChain, dstChain, srcToken, dstToken, amount, userAddress }, config: any) => {
    try {
      const { userId, requestId } = extractConfig(config);

      // 1. Get token decimals first
      const tokenRes = await fetch(`${STARGATE_API_BASE}/tokens`);
      const tokenData: any = await tokenRes.json();
      const srcTokenInfo = tokenData.tokens.find(
        (t: any) =>
          t.chainKey === srcChain &&
          t.address.toLowerCase() === srcToken.toLowerCase(),
      );

      if (!srcTokenInfo) {
        return createErrorResponse({
          kind: 'transaction',
          toolName: 'get_stargate_bridge_quote',
          error: 'Source token not found on this chain.',
        });
      }

      const amountRaw = BigInt(amount * 10 ** srcTokenInfo.decimals).toString();

      // 2. Get Quote
      const params = new URLSearchParams({
        srcChainKey: srcChain,
        dstChainKey: dstChain,
        srcToken: srcToken,
        dstToken: dstToken,
        srcAddress: userAddress,
        dstAddress: userAddress,
        srcAmount: amountRaw,
        dstAmountMin: "0",
      });

      const response = await fetch(`${STARGATE_API_BASE}/quotes?${params}`);
      const data: any = await response.json();

      // Store debug data locally for inspection
      fs.writeFileSync(
        path.join(process.cwd(), "stargate_debug.json"),
        JSON.stringify(data, null, 2),
      );

      if (!data.quotes || data.quotes.length === 0) {
        return createErrorResponse({
          kind: 'transaction',
          toolName: 'get_stargate_bridge_quote',
          error: 'No bridge routes available.',
        });
      }

      const quote = data.quotes[0];
      const srcDecimals = await getDecimals({
        chain: quote.srcChainKey,
        token: quote.srcToken,
      });
      const dstDecimals = await getDecimals({
        chain: quote.dstChainKey,
        token: quote.dstToken,
      });

      return await createTransactionResponse({
        toolName: 'get_stargate_bridge_quote',
        text: `Bridge quote ready: ${amount} tokens from ${srcChain} to ${dstChain} via Stargate.`,
        requestId,
        userId,
        meta: {
          type: 'bridge',
          srcChain,
          dstChain,
          srcToken: quote.srcToken,
          dstToken: quote.dstToken,
          srcAmount: quote.srcAmount,
          dstAmount: quote.dstAmount,
        },
        buildTx: async () => {
          const transactions = quote.steps?.map((txn: any) => ({
            transaction: txn.transaction,
            type: 'bridge',
            metaData: {
              function: txn?.type,
              network: txn.chainKey,
              srcAmount: quote.srcAmount,
              dstAmount: quote.dstAmount,
              srcDecimals,
              dstDecimals,
              srcToken: quote.srcToken,
              dstToken: quote.dstToken,
              srcNetwork: quote.srcChainKey,
              dstNetwork: quote.dstChainKey,
            },
          })) || [];
          return { transactions };
        },
      });
    } catch (error) {
      return createErrorResponse({
        kind: 'transaction',
        toolName: 'get_stargate_bridge_quote',
        error: error instanceof Error ? error : String(error),
      });
    }
  },
  {
    name: "get_stargate_bridge_quote",
    description:
      "Get bridge quotes and transaction data for moving tokens across chains via Stargate.",
    schema: z.object({
      srcChain: z.string().describe("e.g. 'ethereum', 'arbitrum'"),
      dstChain: z.string().describe("e.g. 'polygon', 'base'"),
      srcToken: z.string().describe("Token contract address on source chain"),
      dstToken: z
        .string()
        .describe("Token contract address on destination chain"),
      amount: z.number().describe("Human readable amount (e.g. 0.5)"),
      userAddress: z.string().describe("The wallet address of the user"),
    }),
  },
);

export const stargateTools = [listStargateChains, getStargateQuotes];
