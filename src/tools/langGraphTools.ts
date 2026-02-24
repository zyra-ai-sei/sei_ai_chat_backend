import { z } from "zod";
import axios from "axios";
import * as services from "./core/services/index";
import {
  DEFAULT_NETWORK,
  getRpcUrl,
  getSupportedNetworks,
  resolveChainId,
} from "./core/chains";
import { OrderTypeEnum } from "./enums/orderTypeEnum";
import { parseDeadlineToTimestamp } from "./core/helper";
import { parseUnits } from "ethers";
import {tokenMappings} from "./utils/coingeckoTokenMappings"
import env from "../envConfig";
import { getTrackedTransfers } from "./database/services";
import { getLatestTwitterTweets, getTopTwitterTweets } from "./twitter/services";
import { StructuredTool } from "langchain";
import { LatestTwitterTweetsTool, TopTwitterTweetsTool } from "./twitter/tools";
import container from "../ioc-container/ioc.config";
import { TYPES } from "../ioc-container/types";
import { TokenTrackingService } from "../services/TokenTrackingService";
import { stargateTools } from "./blockchain/bridges/stargate/tools";
import {
  createQueryResponse,
  createTransactionResponse,
  createAsyncResponse,
  createErrorResponse,
  extractConfig,
} from "./types";

// Interface for LangChain tool function
interface LangChainTool {
  tool: (fn: any, config: any) => any;
}

const langchainTools = require("@langchain/core/tools") as LangChainTool;

export const getTransactionTool = langchainTools.tool(
  async ({
    txHash,
    network = DEFAULT_NETWORK,
  }: {
    txHash: string;
    network?: string;
  }) => {
    try {
      const transaction = await services.getTransaction(
        txHash as `0x${string}`,
        network
      );

      return createQueryResponse({
        toolName: 'get_transaction',
        text: `Transaction details for ${txHash} on ${network}`,
        data: transaction,
      });
    } catch (error) {
      return createErrorResponse({
        kind: 'query',
        toolName: 'get_transaction',
        error: error instanceof Error ? error : String(error),
      });
    }
  },
  {
    name: "get_transaction",
    description: "Get transaction details by hash",
    schema: z.object({
      txHash: z.string().describe("The transaction hash"),
      network: z
        .string()
        .optional()
        .describe("Network name or chain ID. Defaults to sei."),
    }),
  }
);

// NETWORK INFORMATION TOOLS

export const getChainInfoTool = langchainTools.tool(
  async ({ network = DEFAULT_NETWORK }: { network?: string }) => {
    try {
      const chainId = resolveChainId(network);
      const blockNumber = await services.getBlockNumber(network);
      const rpcUrl = getRpcUrl(network);

      const data = { network, chainId, blockNumber: blockNumber.toString(), rpcUrl };
      return createQueryResponse({
        toolName: 'get_chain_info',
        text: `Chain info for ${network}: chainId=${chainId}, block=${blockNumber}`,
        data,
      });
    } catch (error) {
      return createErrorResponse({
        kind: 'query',
        toolName: 'get_chain_info',
        error: error instanceof Error ? error : String(error),
      });
    }
  },
  {
    name: "get_chain_info",
    description: "Get information about Sei network",
    schema: z.object({
      network: z
        .string()
        .optional()
        .describe(
          "Network name (e.g., 'sei', 'sei-testnet', 'sei-devnet', etc.) or chain ID. Supports all Sei networks. Defaults to sei."
        ),
    }),
  }
);

export const getSupportedNetworksTool = langchainTools.tool(
  async () => {
    try {
      const networks = getSupportedNetworks();

      return createQueryResponse({
        toolName: 'get_supported_networks',
        text: `Supported networks: ${networks.map((n: any) => n.name || n).join(', ')}`,
        data: { supportedNetworks: networks },
      });
    } catch (error) {
      return createErrorResponse({
        kind: 'query',
        toolName: 'get_supported_networks',
        error: error instanceof Error ? error : String(error),
      });
    }
  },
  {
    name: "get_supported_networks",
    description: "Get a list of supported EVM networks",
    schema: z.object({}),
  }
);

// BLOCK TOOLS

export const getBlockByNumberTool = langchainTools.tool(
  async ({
    blockNumber,
    network = DEFAULT_NETWORK,
  }: {
    blockNumber: number;
    network?: string;
  }) => {
    try {
      const block = await services.getBlockByNumber(blockNumber, network);

      const data = {
        network,
        block: {
          number: block.number?.toString(),
          hash: block.hash,
          timestamp: block.timestamp?.toString(),
          transactionCount: block.transactions?.length || 0,
        },
      };
      return createQueryResponse({
        toolName: 'get_block_by_number',
        text: `Block #${blockNumber} on ${network}: hash=${block.hash}, txCount=${block.transactions?.length || 0}`,
        data,
      });
    } catch (error) {
      return createErrorResponse({
        kind: 'query',
        toolName: 'get_block_by_number',
        error: error instanceof Error ? error : String(error),
      });
    }
  },
  {
    name: "get_block_by_number",
    description: "Get a block by its block number",
    schema: z.object({
      blockNumber: z.number().describe("The block number to fetch"),
      network: z
        .string()
        .optional()
        .describe("Network name or chain ID. Defaults to sei."),
    }),
  }
);

export const getLatestBlockTool = langchainTools.tool(
  async ({ network = DEFAULT_NETWORK }: { network?: string }) => {
    try {
      const blockNumber = await services.getBlockNumber(network);

      return createQueryResponse({
        toolName: 'get_latest_block',
        text: `Latest block on ${network}: ${blockNumber.toString()}`,
        data: { network, latestBlockNumber: blockNumber.toString() },
      });
    } catch (error) {
      return createErrorResponse({
        kind: 'query',
        toolName: 'get_latest_block',
        error: error instanceof Error ? error : String(error),
      });
    }
  },
  {
    name: "get_latest_block",
    description: "Get the latest block",
    schema: z.object({
      network: z
        .string()
        .optional()
        .describe("Network name or chain ID. Defaults to sei."),
    }),
  }
);

// BALANCE TOOLS

export const getBalanceTool = langchainTools.tool(
  async ({
    address,
    network = DEFAULT_NETWORK,
  }: {
    address: string;
    network?: string;
  }) => {
    try {
      const balance = await services.getBalance(address, network);
      const data = { address, network, balance: { wei: balance.wei.toString(), ether: balance.sei } };
      return createQueryResponse({
        toolName: 'get_balance',
        text: `Balance for ${address} on ${network}: ${balance.sei} SEI`,
        data,
      });
    } catch (error) {
      return createErrorResponse({
        kind: 'query',
        toolName: 'get_balance',
        error: error instanceof Error ? error : String(error),
      });
    }
  },
  {
    name: "get_balance",
    description: "Get the native token balance (Sei) for an address",
    schema: z.object({
      address: z
        .string()
        .describe(
          "The wallet address (e.g., '0x1234...') to check the balance for"
        ),
      network: z
        .string()
        .optional()
        .describe(
          "Network name (e.g., 'sei', 'sei-testnet', 'sei-devnet', etc.) or chain ID. Supports all Sei networks. Defaults to sei."
        ),
    }),
  }
);

export const getErc20BalanceTool = langchainTools.tool(
  async ({ address, tokenAddress, network = DEFAULT_NETWORK }) => {
    try {
      const balance = await services.getERC20Balance(
        tokenAddress,
        address,
        network
      );

      const data = {
        address, tokenAddress, network,
        balance: { raw: balance.raw.toString(), formatted: balance.formatted, decimals: balance.token.decimals },
      };
      return createQueryResponse({
        toolName: 'get_erc20_balance',
        text: `ERC20 balance for ${address}: ${balance.formatted} (${balance.token.decimals} decimals)`,
        data,
      });
    } catch (error) {
      return createErrorResponse({
        kind: 'query',
        toolName: 'get_erc20_balance',
        error: error instanceof Error ? error : String(error),
      });
    }
  },
  {
    name: "get_erc20_balance",
    description: "Get the ERC20 token balance for an address",
    schema: z.object({
      address: z
        .string()
        .describe("The wallet address to check the balance for"),
      tokenAddress: z
        .string()
        .describe("The contract address of the ERC20 token"),
      network: z
        .string()
        .optional()
        .describe("Network name or chain ID. Defaults to sei."),
    }),
  }
);

export const getTokenBalanceTool = langchainTools.tool(
  async ({
    tokenAddress,
    ownerAddress,
    network = DEFAULT_NETWORK,
  }): Promise<any> => {
    try {
      const balance = await services.getERC20Balance(
        tokenAddress,
        ownerAddress,
        network
      );

      const data = {
        tokenAddress, owner: ownerAddress, network,
        raw: balance.raw.toString(), formatted: balance.formatted,
        symbol: balance.token.symbol, decimals: balance.token.decimals,
      };
      return createQueryResponse({
        toolName: 'get_token_balance',
        text: `Token balance for ${ownerAddress}: ${balance.formatted} ${balance.token.symbol}`,
        data,
      });
    } catch (error) {
      return createErrorResponse({
        kind: 'query',
        toolName: 'get_token_balance',
        error: error instanceof Error ? error : String(error),
      });
    }
  },
  {
    name: "get_token_balance",
    description:
      "Get the token balance for an address using token symbol or address",
    schema: z.object({
      tokenAddress: z
        .string()
        .describe(
          "The contract address name of the ERC20 token (e.g., '0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1')"
        ),
      ownerAddress: z
        .string()
        .describe(
          "The wallet address name to check the balance for (e.g., '0x1234...')"
        ),
      network: z
        .string()
        .optional()
        .describe(
          "Network name (e.g., 'sei', 'sei-testnet', 'sei-devnet', etc.) or chain ID. Supports all Sei networks. Defaults to sei."
        ),
    }),
  }
);

// TRANSACTION TOOLS

export const getTransactionReceiptTool = langchainTools.tool(
  async ({
    txHash,
    network = DEFAULT_NETWORK,
  }: {
    txHash: string;
    network?: string;
  }) => {
    try {
      const receipt = await services.getTransactionReceipt(
        txHash as `0x${string}`,
        network
      );

      return createQueryResponse({
        toolName: 'get_transaction_receipt',
        text: `Transaction receipt for ${txHash} on ${network}`,
        data: receipt,
      });
    } catch (error) {
      return createErrorResponse({
        kind: 'query',
        toolName: 'get_transaction_receipt',
        error: error instanceof Error ? error : String(error),
      });
    }
  },
  {
    name: "get_transaction_receipt",
    description: "Get transaction receipt by hash",
    schema: z.object({
      txHash: z.string().describe("The transaction hash"),
      network: z
        .string()
        .optional()
        .describe("Network name or chain ID. Defaults to sei."),
    }),
  }
);

// TRANSFER TOOLS

export const transferSeiTool = langchainTools.tool(
  ({
    to,
    amount,
    network = DEFAULT_NETWORK,
  }: {
    to: string;
    amount: string;
    network?: string;
  }, config: any) => {
    const { userId, requestId } = extractConfig(config);

    return createTransactionResponse({
      toolName: 'transfer_sei',
      text: `Preparing SEI transfer of ${amount} SEI to ${to} on ${network}.`,
      requestId,
      userId,
      meta: { amount: `${amount} SEI`, recipient: to, network },
      buildTx: async () => {
        const unsignedTx = await services.buildSeiTransferTx(to, amount, network);
        return { transactions: [unsignedTx] };
      },
    });
  },
  {
    name: "transfer_sei",
    description: "Transfer native SEI tokens to an address",
    schema: z.object({
      to: z.string().describe("The recipient address"),
      amount: z.string().describe("The amount to transfer in SEI"),
      network: z
        .string()
        .optional()
        .describe("Network name or chain ID. Defaults to sei."),
    }),
  }
);

export const transferTokenTool = langchainTools.tool(
  ({ tokenAddress, toAddress, amount, network = DEFAULT_NETWORK }: {
    tokenAddress: string;
    toAddress: string;
    amount: string;
    network?: string;
  }, config: any) => {
    const { userId, requestId } = extractConfig(config);

    return createTransactionResponse({
      toolName: 'transfer_token',
      text: `Preparing ERC20 token transfer of ${amount} tokens to ${toAddress} on ${network}.`,
      requestId,
      userId,
      meta: { amount, tokenAddress, recipient: toAddress, network },
      buildTx: async () => {
        const unsignedTx = await services.buildTransferERC20(tokenAddress, toAddress, amount, network);
        return { transactions: [unsignedTx] };
      },
    });
  },
  {
    name: "transfer_token",
    description:
      "Transfer ERC20 tokens to another address. This creates an unsigned transaction that can then be signed by the user.",
    schema: z.object({
      tokenAddress: z
        .string()
        .describe("The address of the ERC20 token contract"),
      toAddress: z.string().describe("The recipient address"),
      amount: z
        .string()
        .describe(
          "The amount of tokens to send (in token units, e.g., '10' for 10 tokens, dont include decimals)"
        ),
      network: z
        .string()
        .optional()
        .describe(
          "Network name (e.g., 'sei', 'sei-testnet', 'sei-devnet') or chain ID. Defaults to sei."
        ),
    }),
  }
);

// NFT TOOLS

export const transferNftTool = langchainTools.tool(
  ({
    fromAddress,
    to,
    tokenAddress,
    tokenId,
    network = DEFAULT_NETWORK,
  }: {
    fromAddress: string;
    to: string;
    tokenAddress: string;
    tokenId: string;
    network?: string;
  }, config: any) => {
    const { userId, requestId } = extractConfig(config);

    return createTransactionResponse({
      toolName: 'transfer_nft',
      text: `Preparing ERC721 NFT transfer of token #${tokenId} from ${fromAddress} to ${to}.`,
      requestId,
      userId,
      meta: { tokenId, tokenAddress, from: fromAddress, to, network },
      buildTx: async () => {
        const result = await services.buildTransferERC721(
          tokenAddress as `0x${string}`,
          fromAddress,
          to as `0x${string}`,
          BigInt(tokenId),
          network
        );
        return { transactions: [result] };
      },
    });
  },
  {
    name: "transfer_nft",
    description: "Transfer an NFT (ERC721) to an address",
    schema: z.object({
      fromAddress: z.string().describe("The current owner address"),
      to: z.string().describe("The recipient address"),
      tokenAddress: z.string().describe("The contract address of the NFT"),
      tokenId: z.string().describe("The token ID of the NFT"),
      network: z
        .string()
        .optional()
        .describe("Network name or chain ID. Defaults to sei."),
    }),
  }
);

export const transferErc1155Tool = langchainTools.tool(
  ({
    tokenAddress,
    fromAddress,
    toAddress,
    tokenId,
    amount,
    network = DEFAULT_NETWORK,
  }: {
    tokenAddress: string;
    fromAddress: string;
    toAddress: string;
    tokenId: string;
    amount: string;
    network?: string;
  }, config: any) => {
    const { userId, requestId } = extractConfig(config);

    return createTransactionResponse({
      toolName: 'transfer_erc1155',
      text: `Preparing ERC1155 transfer of ${amount}x token #${tokenId} from ${fromAddress} to ${toAddress}.`,
      requestId,
      userId,
      meta: { tokenId, tokenAddress, amount, from: fromAddress, to: toAddress, network },
      buildTx: async () => {
        const unsignedTx = await services.buildTransferERC1155(
          tokenAddress, fromAddress, toAddress, BigInt(tokenId), amount, network
        );
        return { transactions: [unsignedTx] };
      },
    });
  },
  {
    name: "transfer_erc1155",
    description: "Transfer ERC1155 tokens to an address",
    schema: z.object({
      tokenAddress: z
        .string()
        .describe("The address of the ERC1155 token contract"),
      fromAddress: z.string().describe("The current owner address"),
      toAddress: z.string().describe("The recipient address"),
      tokenId: z.string().describe("The token ID to transfer (e.g., '1234')"),
      amount: z
        .string()
        .describe(
          "The amount of tokens to transfer (e.g., '1' for NFTs or '10' for fungible tokens)"
        ),
      network: z
        .string()
        .optional()
        .describe(
          "Network name (e.g., 'sei', 'sei-testnet', 'sei-devnet') or chain ID. Defaults to sei."
        ),
    }),
  }
);

// APPROVAL TOOLS

export const approveTokenSpendingTool = langchainTools.tool(
  ({
    spender,
    amount,
    tokenAddress,
    network = DEFAULT_NETWORK,
  }: {
    spender: string;
    amount: string;
    tokenAddress: string;
    network?: string;
  }, config: any) => {
    const { userId, requestId } = extractConfig(config);

    return createTransactionResponse({
      toolName: 'approve_token_spending',
      text: `Preparing approval of ${amount} tokens from ${tokenAddress} for spender ${spender}.`,
      requestId,
      userId,
      meta: { spender, amount, tokenAddress, network },
      buildTx: async () => {
        const result = await services.buildApproveERC20(
          spender as `0x${string}`, amount, tokenAddress as `0x${string}`, network
        );
        return { transactions: [result] };
      },
    });
  },
  {
    name: "approve_token_spending",
    description: "Approve a spender to spend tokens on your behalf",
    schema: z.object({
      spender: z
        .string()
        .describe("The address that will be approved to spend tokens"),
      amount: z.string().describe("The amount to approve"),
      tokenAddress: z.string().describe("The contract address of the token"),
      network: z
        .string()
        .optional()
        .describe("Network name or chain ID. Defaults to sei."),
    }),
  }
);

export const approveErc20Tool = langchainTools.tool(
  ({
    spender,
    amount,
    tokenAddress,
    network = DEFAULT_NETWORK,
  }: {
    spender: string;
    amount: string;
    tokenAddress: string;
    network?: string;
  }, config: any) => {
    const { userId, requestId } = extractConfig(config);

    return createTransactionResponse({
      toolName: 'approve_erc20',
      text: `Preparing ERC20 approval of ${amount} tokens from ${tokenAddress} for spender ${spender}.`,
      requestId,
      userId,
      meta: { spender, amount, tokenAddress, network },
      buildTx: async () => {
        const result = await services.buildApproveERC20(
          spender as `0x${string}`, amount, tokenAddress as `0x${string}`, network
        );
        return { transactions: [result] };
      },
    });
  },
  {
    name: "approve_erc20",
    description: "Approve an ERC20 token for spending",
    schema: z.object({
      spender: z
        .string()
        .describe("The address that will be approved to spend tokens"),
      amount: z.string().describe("The amount to approve"),
      tokenAddress: z
        .string()
        .describe("The contract address of the ERC20 token"),
      network: z
        .string()
        .optional()
        .describe("Network name or chain ID. Defaults to sei."),
    }),
  }
);

// TOKEN INFO TOOLS

export const getTokenInfoTool = langchainTools.tool(
  async ({
    tokenAddress,
    network = DEFAULT_NETWORK,
  }: {
    tokenAddress: string;
    network?: string;
  }) => {
    try {
      const tokenInfo = await services.getERC20TokenInfo(
        tokenAddress as `0x${string}`,
        network
      );

      return createQueryResponse({
        toolName: 'get_token_info',
        text: `Token info for ${tokenAddress}: ${(tokenInfo as any).symbol || 'unknown'} (${(tokenInfo as any).name || 'unknown'})`,
        data: tokenInfo,
      });
    } catch (error) {
      return createErrorResponse({
        kind: 'query',
        toolName: 'get_token_info',
        error: error instanceof Error ? error : String(error),
      });
    }
  },
  {
    name: "get_token_info",
    description: "Get information about an ERC20 token",
    schema: z.object({
      tokenAddress: z.string().describe("The contract address of the token"),
      network: z
        .string()
        .optional()
        .describe("Network name or chain ID. Defaults to sei."),
    }),
  }
);

export const getNftInfoTool = langchainTools.tool(
  async ({
    tokenAddress,
    tokenId,
    network = DEFAULT_NETWORK,
  }: {
    tokenAddress: string;
    tokenId: string;
    network?: string;
  }) => {
    try {
      const nftInfo = await services.getERC721TokenMetadata(
        tokenAddress as `0x${string}`,
        BigInt(tokenId),
        network
      );

      return createQueryResponse({
        toolName: 'get_nft_info',
        text: `NFT info for token #${tokenId} at ${tokenAddress}`,
        data: nftInfo,
      });
    } catch (error) {
      return createErrorResponse({
        kind: 'query',
        toolName: 'get_nft_info',
        error: error instanceof Error ? error : String(error),
      });
    }
  },
  {
    name: "get_nft_info",
    description: "Get information about an NFT",
    schema: z.object({
      tokenAddress: z.string().describe("The contract address of the NFT"),
      tokenId: z.string().describe("The token ID"),
      network: z
        .string()
        .optional()
        .describe("Network name or chain ID. Defaults to sei."),
    }),
  }
);

export const getNftBalanceTool = langchainTools.tool(
  async ({
    address,
    tokenAddress,
    network = DEFAULT_NETWORK,
  }: {
    address: string;
    tokenAddress: string;
    network?: string;
  }) => {
    try {
      const balance = { address, tokenAddress, network, balance: "0" }; // Placeholder

      return createQueryResponse({
        toolName: 'get_nft_balance',
        text: `NFT balance for ${address} at ${tokenAddress}: ${balance.balance}`,
        data: balance,
      });
    } catch (error) {
      return createErrorResponse({
        kind: 'query',
        toolName: 'get_nft_balance',
        error: error instanceof Error ? error : String(error),
      });
    }
  },
  {
    name: "get_nft_balance",
    description: "Get the NFT balance for an address",
    schema: z.object({
      address: z.string().describe("The wallet address to check"),
      tokenAddress: z.string().describe("The contract address of the NFT"),
      network: z
        .string()
        .optional()
        .describe("Network name or chain ID. Defaults to sei."),
    }),
  }
);

export const getErc1155BalanceTool = langchainTools.tool(
  async ({
    address,
    tokenAddress,
    tokenId,
    network = DEFAULT_NETWORK,
  }: {
    address: string;
    tokenAddress: string;
    tokenId: string;
    network?: string;
  }) => {
    try {
      const balance = { address, tokenAddress, tokenId, network, balance: "0" }; // Placeholder

      return createQueryResponse({
        toolName: 'get_erc1155_balance',
        text: `ERC1155 balance for token #${tokenId} at ${tokenAddress} for ${address}: ${balance.balance}`,
        data: balance,
      });
    } catch (error) {
      return createErrorResponse({
        kind: 'query',
        toolName: 'get_erc1155_balance',
        error: error instanceof Error ? error : String(error),
      });
    }
  },
  {
    name: "get_erc1155_balance",
    description: "Get the ERC1155 token balance for an address",
    schema: z.object({
      address: z.string().describe("The wallet address to check"),
      tokenAddress: z
        .string()
        .describe("The contract address of the ERC1155 token"),
      tokenId: z.string().describe("The token ID"),
      network: z
        .string()
        .optional()
        .describe("Network name or chain ID. Defaults to sei."),
    }),
  }
);

// WALLET TOOLS

export const getAddressFromPrivateKeyTool = langchainTools.tool(
  async ({ privateKey }: { privateKey: string }) => {
    try {
      const { privateKeyToAccount } = await import("viem/accounts");
      const account = privateKeyToAccount(privateKey as `0x${string}`);

      return createQueryResponse({
        toolName: 'get_address_from_private_key',
        text: `Address derived: ${account.address}`,
        data: { privateKey: privateKey.slice(0, 10) + "...", address: account.address },
      });
    } catch (error) {
      return createErrorResponse({
        kind: 'query',
        toolName: 'get_address_from_private_key',
        error: error instanceof Error ? error : String(error),
      });
    }
  },
  {
    name: "get_address_from_private_key",
    description: "Get wallet address from private key",
    schema: z.object({
      privateKey: z.string().describe("The private key"),
    }),
  }
);

// SEI WRAPPING TOOLS

export const wrapSeiTool = langchainTools.tool(
  ({
    amount,
    network = DEFAULT_NETWORK,
  }: {
    amount: string;
    network?: string;
  }, config: any) => {
    const { userId, requestId } = extractConfig(config);

    return createTransactionResponse({
      toolName: 'wrap_sei',
      text: `Preparing transaction to wrap ${amount} SEI to wSEI on ${network}.`,
      requestId,
      userId,
      meta: { amount: `${amount} SEI`, network, action: 'wrap' },
      buildTx: async () => {
        const result = await services.buildDepositSEITx(amount, network);
        return { transactions: [result] };
      },
    });
  },
  {
    name: "wrap_sei",
    description: "Wrap SEI tokens to wSEI",
    schema: z.object({
      amount: z.string().describe("The amount of SEI to wrap"),
      network: z
        .string()
        .optional()
        .describe("Network name or chain ID. Defaults to sei."),
    }),
  }
);

export const unwrapSeiTool = langchainTools.tool(
  ({
    amount,
    network = DEFAULT_NETWORK,
  }: {
    amount: string;
    network?: string;
  }, config: any) => {
    const { userId, requestId } = extractConfig(config);

    return createTransactionResponse({
      toolName: 'unwrap_sei',
      text: `Preparing transaction to unwrap ${amount} wSEI to SEI on ${network}.`,
      requestId,
      userId,
      meta: { amount: `${amount} wSEI`, network, action: 'unwrap' },
      buildTx: async () => {
        const result = await services.buildWithdrawSEITx(amount, network);
        return { transactions: [result] };
      },
    });
  },
  {
    name: "unwrap_sei",
    description: "Unwrap wSEI tokens to SEI",
    schema: z.object({
      amount: z.string().describe("The amount of wSEI to unwrap"),
      network: z
        .string()
        .optional()
        .describe("Network name or chain ID. Defaults to sei."),
    }),
  }
);

// PRICE TOOLS

export const getTokenPricesTool = langchainTools.tool(
  async ({ tokens }: { tokens: string[] }) => {
    try {
      const prices = tokens.map((token) => ({ token, price: "N/A" }));

      return createQueryResponse({
        toolName: 'get_token_prices',
        text: `Prices for ${tokens.length} tokens retrieved`,
        data: prices,
      });
    } catch (error) {
      return createErrorResponse({
        kind: 'query',
        toolName: 'get_token_prices',
        error: error instanceof Error ? error : String(error),
      });
    }
  },
  {
    name: "get_token_prices",
    description: "Get prices for multiple tokens",
    schema: z.object({
      tokens: z
        .array(z.string())
        .describe("Array of token symbols or addresses"),
    }),
  }
);

export const getCurrentTokenPricesTool = langchainTools.tool(
  async ({ network = DEFAULT_NETWORK }: { network?: string } = {}) => {
    try {
      const prices = await services.getCurrentPrices(network);

      return createQueryResponse({
        toolName: 'get_current_token_prices',
        text: `Current token prices on ${network} retrieved`,
        data: prices,
      });
    } catch (error) {
      return createErrorResponse({
        kind: 'query',
        toolName: 'get_current_token_prices',
        error: error instanceof Error ? error : String(error),
      });
    }
  },
  {
    name: "get_current_token_prices",
    description: "Get current prices for commonly traded tokens",
    schema: z.object({}),
  }
);

export const getPriceOfTokenTool = langchainTools.tool(
  async ({
    token,
    network = DEFAULT_NETWORK,
  }: {
    token: string;
    network?: string;
  }) => {
    try {
      const price = await services.getPriceForToken(token, network);
      return createQueryResponse({
        toolName: 'get_price_of_token',
        text: `Price for ${token} on ${network}: ${price}`,
        data: { token, price, network },
      });
    } catch (error) {
      return createErrorResponse({
        kind: 'query',
        toolName: 'get_price_of_token',
        error: error instanceof Error ? error : String(error),
      });
    }
  },
  {
    name: "get_price_of_token",
    description: "Get the current price of a specific token",
    schema: z.object({
      token: z.string().describe("Token symbol or address"),
    }),
  }
);

// TRADING/SWAP TOOLS

export const createOrderTool = langchainTools.tool(
  ({
    amount,
    destTokenAddress,
    srcTokenAddress,
    fillDelay,
    limitPrice = "0",
    chunks = 1,
    deadline,
    orderType,
    network = DEFAULT_NETWORK,
    userAddress,
  }: {
    amount: string;
    destTokenAddress: string;
    srcTokenAddress: string;
    fillDelay?: string;
    limitPrice?: string;
    chunks?: number;
    deadline: string;
    orderType?: string;
    network?: string;
    userAddress: string;
  }, config: any) => {
    const { userId, requestId } = extractConfig(config);

    return createTransactionResponse({
      toolName: 'place_order',
      text: `Preparing ${orderType || 'order'} to swap ${amount} tokens. Transaction(s) will be ready shortly.`,
      requestId,
      userId,
      meta: {
        orderType: orderType || 'MARKET_ORDER',
        amount,
        srcToken: srcTokenAddress,
        destToken: destTokenAddress,
        chunks,
        deadline,
        network,
      },
      buildTx: async () => {
        // The TWAP contract is the spender
        const twapConfig = services.getTwapConfig(network);
        const spenderAddress = twapConfig.twapAddress;

        // Check current allowance
        const allowance = await services.getAllowance(
          srcTokenAddress,
          userAddress,
          spenderAddress,
          network
        );

        const requiredAmount = parseUnits(amount, allowance.token.decimals);

        const unsignedtxns = [];
        // If allowance is less than the required amount, ask for approval.
        if (allowance.raw < requiredAmount) {
          const unsingedTx = await services.buildApproveERC20(
            srcTokenAddress,
            spenderAddress,
            amount,
            network
          );
          unsignedtxns.push(unsingedTx);
        }

        // If we have enough allowance, proceed with building the limit order transaction.
        const deadlineTimestamp = parseDeadlineToTimestamp(deadline);
        const fillDelayInSeconds = fillDelay
          ? parseDeadlineToTimestamp(fillDelay)
          : null;
        const unsignedTx = await services.buildask(
          srcTokenAddress,
          destTokenAddress,
          amount,
          fillDelayInSeconds,
          chunks,
          deadlineTimestamp,
          limitPrice,
          orderType as unknown as OrderTypeEnum,
          network
        );
        unsignedtxns.push(unsignedTx);

        return {
          transactions: unsignedtxns,
          orderDetails: {
            srcTokenAddress,
            destTokenAddress,
            amount,
            limitPrice,
            chunks,
            deadline,
            orderType,
            network,
          },
          requiresApproval: unsignedtxns.length > 1,
          txCount: unsignedtxns.length,
          builtAt: new Date().toISOString(),
        };
      },
    });
  },
  {
    name: "place_order",
    description:
      'Place limit order or market order for a pair of tokens. This creates an unsigned transaction that can be signed by the user. For deadline, you can enter durations like "1 week", "3 days", or an exact date like "3 August 2025" or if its something informal like 3rd aug 25 then convert it in standard format like 3 August 2025 before feeding to the tool.The tool has Helper to parse duration or date string to timestamp. IMPORTANT: If the from or to token is a native token (sei) then it needs to be wrapped or unwrapped to wsei accordingly using appropriate tool in the MCP along with this tool. If user wants to buy tokens over a period then use chunks and limit price',
    schema: z.object({
      amount: z
        .string()
        .describe(
          "The src Amount user wants to swap for, imp: its human readeable amount"
        ),
      destTokenAddress: z
        .string()
        .describe("The token address which the user wants to swap for"),
      srcTokenAddress: z
        .string()
        .describe("The token address the user wants to swap in"),
      fillDelay: z
        .string()
        .optional()
        .describe("Delay value in seconds or minutes or hours"),
      limitPrice: z
        .string()
        .optional()
        .describe(
          "The min price at which the user wants to sell source tokens"
        ),
      chunks: z
        .number()
        .optional()
        .describe("The number of chunks user wants to divide the order"),
      deadline: z
        .string()
        .describe(
          "The deadline for the limit order. Accepts durations like '1 week', '3 days', or a date like '3 August 2025'."
        ),
      orderType: z
        .enum([
          "DCA_MARKET_ORDER",
          "DCA_LIMIT_ORDER",
          "MARKET_ORDER",
          "LIMIT_ORDER",
          "SNIPER_DCA",
          "LIMIT_LADDER",
        ])
        .optional()
        .describe(
          "Choose one of the order type to execute, its an optional filed."
        ),

      network: z
        .string()
        .optional()
        .describe(
          "Network name (e.g., 'sei', 'sei-testnet', 'sei-devnet') or chain ID. Defaults to sei."
        ),
      userAddress: z.string().describe("The user address"),
    }),
  }
);

// UTILITY TOOLS

export const convertTokenSymbolToAddressTool = langchainTools.tool(
  async ({
    symbol,
    network = DEFAULT_NETWORK,
  }: {
    symbol: string;
    network?: string;
  }) => {
    try {
      const tokenAddress = await services.resolveToken(symbol, network);

      return createQueryResponse({
        toolName: 'convert_token_symbol_to_address',
        text: `Token ${symbol} on ${network}: ${tokenAddress}`,
        data: { symbol, address: tokenAddress, network },
      });
    } catch (error) {
      return createErrorResponse({
        kind: 'query',
        toolName: 'convert_token_symbol_to_address',
        error: error instanceof Error ? error : String(error),
      });
    }
  },
  {
    name: "convert_token_symbol_to_address",
    description: "Convert a token symbol to its contract address for a specific network",
    schema: z.object({
      symbol: z.string().describe("Token symbol (e.g., 'USDC', 'WSEI')"),
      network: z
        .string()
        .optional()
        .describe("Network name or chain ID (e.g., 'sei', 'ethereum', 'polygon', 'arbitrum', 'optimism'). Defaults to sei."),
    }),
  }
);

export const convertAddressToTokenSymbolTool = langchainTools.tool(
  async ({
    address,
    network = DEFAULT_NETWORK,
  }: {
    address: string;
    network?: string;
  }) => {
    try {
      const tokenInfo = await services.getERC20TokenInfo(
        address as `0x${string}`,
        network
      );

      return createQueryResponse({
        toolName: 'convert_address_to_token_symbol',
        text: `Address ${address} on ${network}: ${tokenInfo.symbol} (${tokenInfo.name})`,
        data: { address, symbol: tokenInfo.symbol, name: tokenInfo.name, network },
      });
    } catch (error) {
      return createErrorResponse({
        kind: 'query',
        toolName: 'convert_address_to_token_symbol',
        error: error instanceof Error ? error : String(error),
      });
    }
  },
  {
    name: "convert_address_to_token_symbol",
    description: "Convert a contract address to its token symbol",
    schema: z.object({
      address: z.string().describe("Token contract address"),
      network: z
        .string()
        .optional()
        .describe("Network name or chain ID. Defaults to sei."),
    }),
  }
);

// CRYPTO MARKET DATA TOOLS

export const getCryptoMarketDataTool = langchainTools.tool(
  ({
    coinName = "bitcoin",
    timeframe = "7d",
  }: {
    coinName?: string;
    timeframe?: string;
  }, config: any) => {
    const { userId, requestId } = extractConfig(config);
    const coinId = tokenMappings[coinName?.toLowerCase()] || coinName?.toLowerCase();
    
    const timeframeToDays: Record<string, number> = {
      "24h": 1,
      "7d": 7,
      "1m": 30,
      "3m": 90,
      "1y": 365,
    };
    const days = timeframeToDays[timeframe] || 7;

    return createAsyncResponse({
      toolName: 'get_crypto_or_token_data',
      text: `Fetching market data for ${coinName} (${timeframe} timeframe). Data will be available shortly.`,
      dataType: 'CRYPTO_MARKET_DATA',
      requestId,
      userId,
      meta: { coin: coinName, timeframe },
      fetch: async () => {
        // Fetch complete coin data (includes all market info, sentiment, liquidity, etc.)
        const completeCoinUrl = new URL(
          `https://api.coingecko.com/api/v3/coins/${coinId}`
        );
        completeCoinUrl.searchParams.append("localization", "false");
        completeCoinUrl.searchParams.append("tickers", "true");
        completeCoinUrl.searchParams.append("market_data", "true");
        completeCoinUrl.searchParams.append("community_data", "true");
        completeCoinUrl.searchParams.append("developer_data", "false");
        completeCoinUrl.searchParams.append("sparkline", "false");

        const completeCoinResponse = await fetch(completeCoinUrl.toString(), {
          method: 'GET',
          headers: {
            "x-cg-demo-api-key": env.COINGECKO_API_KEY
          }
        });
        if (!completeCoinResponse.ok) {
          throw new Error(
            `CoinGecko API error: ${completeCoinResponse.status} ${completeCoinResponse.statusText}`
          );
        }
        const completeCoinData = await completeCoinResponse.json();

        // Fetch chart data separately
        const chartUrl = new URL(
          `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart`
        );
        chartUrl.searchParams.append("vs_currency", "usd");
        chartUrl.searchParams.append("days", days.toString());

        const chartResponse = await fetch(chartUrl.toString(), {
          method: 'GET',
          headers: {
            "x-cg-demo-api-key": env.COINGECKO_API_KEY
          }
        });
        if (!chartResponse.ok) {
          throw new Error(
            `CoinGecko chart API error: ${chartResponse.status} ${chartResponse.statusText}`
          );
        }
        const chartData = await chartResponse.json();

        // CoinGecko returns { prices: [[timestamp, price], ...], market_caps: [[timestamp, cap], ...] }
        const prices = chartData.prices || [];
        const marketCaps = chartData.market_caps || [];

        // Combine into [timestamp, price, marketCap][]
        const formattedChartData: [number, number, number][] = [];
        for (let i = 0; i < prices.length; i++) {
          formattedChartData.push([
            prices[i][0],
            prices[i][1],
            marketCaps[i] ? marketCaps[i][1] : 0,
          ]);
        }

        // Full payload for frontend (stored in MongoDB)
        return {
          type: "CRYPTO_MARKET_DATA",
          coinId: completeCoinData.id,
          symbol: completeCoinData.symbol,
          name: completeCoinData.name,
          image: completeCoinData.image,
          categories: completeCoinData.categories || [],
          timeframe,
          dataPoints: formattedChartData.length,
          chartData: formattedChartData,
          market_data: completeCoinData.market_data,
          sentiment_votes_up_percentage:
            completeCoinData.sentiment_votes_up_percentage || 0,
          sentiment_votes_down_percentage:
            completeCoinData.sentiment_votes_down_percentage || 0,
          watchlist_portfolio_users:
            completeCoinData.watchlist_portfolio_users || 0,
          tickers: completeCoinData.tickers
            ? completeCoinData.tickers.slice(0, 10)
            : [],
        };
      },
    });
  },
  {
    name: "get_crypto_or_token_data",
    description:
      "Get comprehensive cryptocurrency or token data including price charts, market cap, sentiment, and liquidity for popular coins and tokens. Use this when users ask about crypto prices, market performance, sentiment, or investment advice for any cryptocurrency or even general query (like tell me about a token).Default timeframe is 7 days",
    schema: z.object({
      coinName: z
        .string()
        .optional()
        .describe("The name or symbol of token or cryptocurrency"),
      timeframe: z
        .string()
        .optional()
        .describe(
          "Time period: '24h', '7d', '1m', '3m', or '1y'. Defaults to '7d'."
        ),
    }),
  }
);

export const simulateDCAStrategyTool = langchainTools.tool(
  ({
    coin,
    total_investment,
    frequency,
    duration_days,
  }: {
    coin: string;
    total_investment: number;
    frequency: "daily" | "weekly";
    duration_days: number;
  }, config: any) => {
    const { userId, requestId } = extractConfig(config);

    return createAsyncResponse({
      toolName: 'simulate_dca_strategy',
      text: `Running ${frequency} DCA simulation for ${coin.toUpperCase()} over ${duration_days} days with $${total_investment}. Results will be available shortly.`,
      dataType: 'DCA_SIMULATION',
      requestId,
      userId,
      meta: {
        coin: coin.toUpperCase(),
        totalInvestment: `$${total_investment}`,
        frequency,
        durationDays: duration_days,
      },
      fetch: async () => {
        const STRATEGY_ENGINE_URL =
          process.env.STRATEGY_ENGINE_URL ||
          "http://localhost:3001/v1/strategies/dca/simulate";

        const response = await axios.post(STRATEGY_ENGINE_URL, {
          coin,
          total_investment,
          frequency,
          duration_days,
        });

        return response.data;
      },
    });
  },
  {
    name: "simulate_dca_strategy",
    description:
      "Simulate a DCA (Dollar-Cost Averaging) strategy for any cryptocurrency. Use this when the user asks things like: 'simulate DCA for SEI', 'weekly DCA for bitcoin', '30-day DCA backtest', 'should I DCA into ethereum?', etc.",
    schema: z.object({
      coin: z.string().describe("The coin symbol (e.g., sei, btc, eth)"),
      total_investment: z
        .number()
        .describe("Total amount invested over the entire DCA period"),
      frequency: z
        .enum(["daily", "weekly"])
        .describe("How often investments are made"),
      duration_days: z
        .number()
        .describe("How many days of price history to backtest (e.g., 30, 90, 365)"),
    }),
  }
);

export const simulateLumpSumStrategyTool = langchainTools.tool(
  ({
    coin,
    total_investment,
    duration_days,
  }: {
    coin: string;
    total_investment: number;
    duration_days: number;
  }, config: any) => {
    const { userId, requestId } = extractConfig(config);

    return createAsyncResponse({
      toolName: 'simulate_lump_sum_strategy',
      text: `Running Lump Sum simulation for ${coin.toUpperCase()} over ${duration_days} days with $${total_investment}. Results will be available shortly.`,
      dataType: 'LUMP_SUM_SIMULATION',
      requestId,
      userId,
      meta: {
        coin: coin.toUpperCase(),
        totalInvestment: `$${total_investment}`,
        durationDays: duration_days,
      },
      fetch: async () => {
        const STRATEGY_ENGINE_URL =
          process.env.STRATEGY_ENGINE_URL ||
          "http://localhost:3001/v1/strategies/lump-sum/simulate";

        const response = await axios.post(STRATEGY_ENGINE_URL, {
          coin,
          total_investment,
          duration_days,
        });

        return response.data;
      },
    });
  },

  {
    name: "simulate_lump_sum_strategy",
    description:
      "Simulate a Lump Sum strategy for any cryptocurrency. Use this when the user asks things like: 'simulate lump sum for SEI', 'invest 300 dollars in bitcoin today', 'run a 30-day lump sum backtest', or 'how would a one-time investment perform?'.",
    schema: z.object({
      coin: z.string().describe("The coin symbol (e.g., sei, btc, eth)"),
      total_investment: z
        .number()
        .positive()
        .describe("Total amount invested upfront (e.g., 300 for $300)"),
      duration_days: z
        .number()
        .positive()
        .describe("How many days of historical price data to backtest"),
    }),
  }
);
export const trackRecordsTool = langchainTools.tool(
  async ({
    address
  }: {
    address:string
  }, config: any) => {
    try {
      const { userId, requestId } = extractConfig(config);

      return createAsyncResponse({
        toolName: 'trackRecords',
        text: `Retrieving transaction records for address ${address}.`,
        dataType: 'TRANSACTION_RECORDS',
        requestId,
        userId,
        meta: { address },
        fetch: async () => {
          const response = await getTrackedTransfers(address);
          return response;
        },
      });
    } catch (error: any) {
      return createErrorResponse({
        kind: 'async',
        toolName: 'trackRecords',
        error: error instanceof Error ? error : String(error),
      });
    }
  },

  {
    name: "trackRecords",
    description:
      "Get transaction records of an address. This tool is used to get previous transaction records of an address accross multiple chains at once.",
    schema: z.object({
      address: z.string().describe("records of this address would be tracked"),
    }),
  }
);

export const subscribeToAddressTool = langchainTools.tool(
  async ({
    address,
    chains = ["sei"]
  }: {
    address: string;
    chains?: string[];
  }, config: any) => {
    try {
      const { userId } = extractConfig(config);
      if (!userId) {
        return createErrorResponse({
          kind: 'query',
          toolName: 'subscribeToAddress',
          error: 'User ID not found in session context.',
        });
      }

      const trackingService = container.get<TokenTrackingService>(TYPES.TokenTrackingService);
      await trackingService.subscribe(userId, address, chains);

      return createQueryResponse({
        toolName: 'subscribeToAddress',
        text: `Successfully subscribed to ${address} on ${chains.join(", ")}. You will now receive notifications for token transfers involving this address on these networks.`,
        data: { address, chains, subscribed: true },
      });
    } catch (error: any) {
      return createErrorResponse({
        kind: 'query',
        toolName: 'subscribeToAddress',
        error: error instanceof Error ? error : String(error),
      });
    }
  },
  {
    name: "subscribeToAddress",
    description: "Subscribe to real-time transfer alerts for a wallet address on one or more chains (e.g., sei, ethereum, arbitrum, polygon, base).",
    schema: z.object({
      address: z.string().describe("The wallet address to track"),
      chains: z.array(z.string()).optional().describe("The networks to track on (sei, ethereum, arbitrum, polygon, base). Defaults to ['sei']."),
    }),
  }
);

export const cryptoTools:StructuredTool[] = [
  // Network Tools
  getChainInfoTool,
  getSupportedNetworksTool,

  // Block Tools
  getBlockByNumberTool,
  getLatestBlockTool,

  // Balance Tools
  getBalanceTool,
  getErc20BalanceTool,
  getTokenBalanceTool,

  // Transaction Tools
  getTransactionTool,
  getTransactionReceiptTool,

  // Transfer Tools
  transferSeiTool,
  transferTokenTool,
  transferNftTool,
  transferErc1155Tool,

  // Approval Tools
  approveTokenSpendingTool,
  approveErc20Tool,

  // Token Info Tools
  getTokenInfoTool,
  getNftInfoTool,
  getNftBalanceTool,
  getErc1155BalanceTool,

  // Wallet Tools
  getAddressFromPrivateKeyTool,

  // SEI Wrapping Tools
  wrapSeiTool,
  unwrapSeiTool,

  // Price Tools
  getTokenPricesTool,
  getCurrentTokenPricesTool,
  getPriceOfTokenTool,

  // Trading/Swap Tools
  createOrderTool,

  // Utility Tools
  convertTokenSymbolToAddressTool,
  convertAddressToTokenSymbolTool,

  // Crypto Market Data Tools
  getCryptoMarketDataTool,
  simulateDCAStrategyTool,
  simulateLumpSumStrategyTool,

];

export const databaseTools: StructuredTool[] = [
    trackRecordsTool,
    subscribeToAddressTool,
]

export const twitterTools:StructuredTool[] = [
    LatestTwitterTweetsTool,
    TopTwitterTweetsTool
]

export const bridgeTools:StructuredTool[] = [
  ...stargateTools
]

