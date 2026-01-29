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

      return {
        text: services.helpers.formatJson(transaction),
      };
    } catch (error) {
      return {
        text: `Error fetching transaction ${txHash}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        isError: true,
      };
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

      return {
        text: JSON.stringify(
          {
            network,
            chainId,
            blockNumber: blockNumber.toString(),
            rpcUrl,
          },
          null,
          2
        ),
      };
    } catch (error) {
      return {
        text: `Error fetching chain info: ${
          error instanceof Error ? error.message : String(error)
        }`,
        isError: true,
      };
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

      return {
        text: JSON.stringify(
          {
            supportedNetworks: networks,
          },
          null,
          2
        ),
      };
    } catch (error) {
      return {
        text: `Error fetching supported networks: ${
          error instanceof Error ? error.message : String(error)
        }`,
        isError: true,
      };
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

      return {
        text: JSON.stringify(
          {
            network,
            block: {
              number: block.number?.toString(),
              hash: block.hash,
              timestamp: block.timestamp?.toString(),
              transactionCount: block.transactions?.length || 0,
            },
          },
          null,
          2
        ),
      };
    } catch (error) {
      return {
        text: `Error fetching block ${blockNumber}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        isError: true,
      };
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

      return {
        text: JSON.stringify(
          {
            network,
            latestBlockNumber: blockNumber.toString(),
          },
          null,
          2
        ),
      };
    } catch (error) {
      return {
        text: `Error fetching latest block: ${
          error instanceof Error ? error.message : String(error)
        }`,
        isError: true,
      };
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
      return {
        text: JSON.stringify(
          {
            address,
            network,
            balance: {
              wei: balance.wei.toString(),
              ether: balance.sei,
            },
          },
          null,
          2
        ),
      };
    } catch (error) {
      return {
        text: `Error fetching balance for ${address}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        isError: true,
      };
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

      return {
        text: JSON.stringify(
          {
            address,
            tokenAddress,
            network,
            balance: {
              raw: balance.raw.toString(),
              formatted: balance.formatted,
              decimals: balance.token.decimals,
            },
          },
          null,
          2
        ),
      };
    } catch (error) {
      return {
        text: `Error fetching ERC20 balance for ${address}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        isError: true,
      };
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

      return {
        text: JSON.stringify(
          {
            tokenAddress,
            owner: ownerAddress,
            network,
            raw: balance.raw.toString(),
            formatted: balance.formatted,
            symbol: balance.token.symbol,
            decimals: balance.token.decimals,
          },
          null,
          2
        ),
      };
    } catch (error) {
      return {
        text: `Error fetching token balance: ${
          error instanceof Error ? error.message : String(error)
        }`,
        isError: true,
      };
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

      return {
        text: JSON.stringify(receipt, null, 2),
      };
    } catch (error) {
      return {
        text: `Error fetching transaction receipt ${txHash}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        isError: true,
      };
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
  async ({
    to,
    amount,
    network = DEFAULT_NETWORK,
  }: {
    to: string;
    amount: string;
    network?: string;
  }) => {
    try {
      const unsignedTx = await services.buildSeiTransferTx(to, amount, network);

      return {
        text: "An unsigned SEI transfer transaction has been prepared. Please sign and send it using your wallet.",
        tool_output: [unsignedTx],
      };
    } catch (error) {
      return {
        text: `Error transferring ${amount} SEI to ${to}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        isError: true,
      };
    }
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
  async ({ tokenAddress, toAddress, amount, network = DEFAULT_NETWORK }) => {
    try {
      const unsignedTx = await services.buildTransferERC20(
        tokenAddress,
        toAddress,
        amount,
        network
      );
      return {
        text: "An unsigned ERC20 transfer transaction has been prepared. Please sign and send it using your wallet.",
        tool_output: [unsignedTx],
      };
    } catch (error) {
      return {
        text: `Error building ERC20 transfer transaction: ${
          error instanceof Error ? error.message : String(error)
        }`,
        isError: true,
      };
    }
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
  async ({
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
  }) => {
    try {
      const result = await services.buildTransferERC721(
        tokenAddress as `0x${string}`,
        fromAddress,
        to as `0x${string}`,
        BigInt(tokenId),
        network
      );

      return {
        text: "An unsigned ERC721 (NFT) transfer transaction has been prepared. Please sign and send it using your wallet.",
        tool_output: [result],
      };
    } catch (error) {
      return {
        text: `Error transferring NFT ${tokenId} from ${tokenAddress} to ${to}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        isError: true,
      };
    }
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
  async ({
    tokenAddress,
    fromAddress,
    toAddress,
    tokenId,
    amount,
    network = DEFAULT_NETWORK,
  }) => {
    try {
      const unsignedTx = await services.buildTransferERC1155(
        tokenAddress,
        fromAddress,
        toAddress,
        BigInt(tokenId),
        amount,
        network
      );

      return {
        text: "An unsigned ERC1155 transfer transaction has been prepared. Please sign and send it using your wallet.",
        tool_output: [unsignedTx],
      };
    } catch (error) {
      return {
        text: `Error building ERC1155 transfer transaction: ${
          error instanceof Error ? error.message : String(error)
        }`,
        isError: true,
      };
    }
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
  async ({
    spender,
    amount,
    tokenAddress,
    network = DEFAULT_NETWORK,
  }: {
    spender: string;
    amount: string;
    tokenAddress: string;
    network?: string;
  }) => {
    try {
      const result = await services.buildApproveERC20(
        spender as `0x${string}`,
        amount,
        tokenAddress as `0x${string}`,
        network
      );

      return {
        text: JSON.stringify(result, null, 2),
        tool_output: [result],
        executionId: result.executionId,
      };
    } catch (error) {
      return {
        text: `Error approving ${amount} tokens from ${tokenAddress} for spender ${spender}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        tool_output: null,
        isError: true,
      };
    }
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
  async ({
    spender,
    amount,
    tokenAddress,
    network = DEFAULT_NETWORK,
  }: {
    spender: string;
    amount: string;
    tokenAddress: string;
    network?: string;
  }) => {
    try {
      const result = await services.buildApproveERC20(
        spender as `0x${string}`,
        amount,
        tokenAddress as `0x${string}`,
        network
      );

      return {
        text: JSON.stringify(result, null, 2),
        tool_output: [result],
      };
    } catch (error) {
      return {
        text: `Error approving ${amount} ERC20 tokens from ${tokenAddress} for spender ${spender}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        tool_output: null,
        isError: true,
      };
    }
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

      return {
        text: JSON.stringify(tokenInfo, null, 2),
      };
    } catch (error) {
      return {
        text: `Error fetching token info for ${tokenAddress}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        tool_output: null,
        isError: true,
      };
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

      return {
        text: JSON.stringify(nftInfo, null, 2),
      };
    } catch (error) {
      return {
        text: `Error fetching NFT info for token ${tokenId} at ${tokenAddress}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        isError: true,
      };
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
      // For ERC721, we need to implement a balance check - this would typically require checking ownership
      // This is a placeholder implementation - you may need to implement specific ERC721 balance logic
      const balance = { address, tokenAddress, network, balance: "0" }; // Placeholder

      return {
        text: JSON.stringify(balance, null, 2),
      };
    } catch (error) {
      return {
        text: `Error fetching NFT balance for ${address} from ${tokenAddress}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        isError: true,
      };
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
      // For ERC1155 balance, we need to implement balance checking for specific token IDs
      // This is a placeholder implementation
      const balance = { address, tokenAddress, tokenId, network, balance: "0" }; // Placeholder

      return {
        text: JSON.stringify(balance, null, 2),
      };
    } catch (error) {
      return {
        text: `Error fetching ERC1155 balance for token ${tokenId} at ${tokenAddress} for ${address}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        isError: true,
      };
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
      // Import viem functions for address derivation
      const { privateKeyToAccount } = await import("viem/accounts");
      const account = privateKeyToAccount(privateKey as `0x${string}`);

      return {
        text: JSON.stringify(
          {
            privateKey: privateKey.slice(0, 10) + "...", // Mask private key for security
            address: account.address,
          },
          null,
          2
        ),
      };
    } catch (error) {
      return {
        text: `Error deriving address from private key: ${
          error instanceof Error ? error.message : String(error)
        }`,
        tool_output: null,
        isError: true,
      };
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
  async ({
    amount,
    network = DEFAULT_NETWORK,
  }: {
    amount: string;
    network?: string;
  }) => {
    try {
      const result = await services.buildDepositSEITx(amount, network);

      return {
        text: JSON.stringify(result, null, 2),
        tool_output: [result],
      };
    } catch (error) {
      return {
        text: `Error wrapping ${amount} SEI: ${
          error instanceof Error ? error.message : String(error)
        }`,
        tool_output: null,
        isError: true,
      };
    }
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
  async ({
    amount,
    network = DEFAULT_NETWORK,
  }: {
    amount: string;
    network?: string;
  }) => {
    try {
      const result = await services.buildWithdrawSEITx(amount, network);

      return {
        text: JSON.stringify(result, null, 2),
        tool_output: [result],
        executionId: result.executionId,
      };
    } catch (error) {
      return {
        text: `Error unwrapping ${amount} wSEI: ${
          error instanceof Error ? error.message : String(error)
        }`,
        tool_output: null,
        isError: true,
      };
    }
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
      // Get prices for multiple tokens - placeholder implementation
      const prices = tokens.map((token) => ({ token, price: "N/A" }));

      return {
        text: JSON.stringify(prices, null, 2),
      };
    } catch (error) {
      return {
        text: `Error fetching token prices: ${
          error instanceof Error ? error.message : String(error)
        }`,
        isError: true,
      };
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

      return {
        text: JSON.stringify(prices, null, 2),
      };
    } catch (error) {
      return {
        text: `Error fetching current token prices: ${
          error instanceof Error ? error.message : String(error)
        }`,
        isError: true,
      };
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
      return {
        text: JSON.stringify({ token, price, network }, null, 2),
      };
    } catch (error) {
      return {
        text: `Error fetching price for token ${token}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        isError: true,
      };
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
  async ({
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
  }) => {
    try {
      // The TWAP contract is the spender
      const spenderAddress = "0xde737dB24548F8d41A4a3Ca2Bac8aaaDc4DBA099";

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
        text: "An unsigned limit order transaction has been prepared. Please sign and send it using your wallet.",
        tool_output: [...unsignedtxns],
      };
    } catch (error) {
      return {
        text: `Error building limit order transaction: ${
          error instanceof Error ? error.message : String(error)
        }`,
        tool_output: null,
        isError: true,
      };
    }
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

      return {
        text: JSON.stringify(
          {
            symbol,
            address: tokenAddress,
            network,
          },
          null,
          2
        ),
      };
    } catch (error) {
      return {
        text: `Error converting token symbol ${symbol} to address: ${
          error instanceof Error ? error.message : String(error)
        }`,
        isError: true,
      };
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

      return {
        text: JSON.stringify(
          {
            address,
            symbol: tokenInfo.symbol,
            name: tokenInfo.name,
            network,
          },
          null,
          2
        ),
      };
    } catch (error) {
      return {
        text: `Error converting address ${address} to token symbol: ${
          error instanceof Error ? error.message : String(error)
        }`,
        isError: true,
      };
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
  async ({
    coinName = "bitcoin",
    timeframe = "7d",
  }: {
    coinName?: string;
    timeframe?: string;
  }) => {
    try {
      // Map timeframes to days
      const timeframeToDays: Record<string, number> = {
        "24h": 1,
        "7d": 7,
        "1m": 30,
        "3m": 90,
        "1y": 365,
      };

      const coinId = tokenMappings[coinName?.toLowerCase()];

      const days = timeframeToDays[timeframe] || 7;

      // Fetch complete coin data (includes all market info, sentiment, liquidity, etc.)
      const completeCoinUrl = new URL(
        `https://api.coingecko.com/api/v3/coins/${coinId}`,
        
      );
      completeCoinUrl.searchParams.append("localization", "false");
      completeCoinUrl.searchParams.append("tickers", "true");
      completeCoinUrl.searchParams.append("market_data", "true");
      completeCoinUrl.searchParams.append("community_data", "true");
      completeCoinUrl.searchParams.append("developer_data", "false");
      completeCoinUrl.searchParams.append("sparkline", "false");
      

      const completeCoinResponse = await fetch(completeCoinUrl.toString());
      if (!completeCoinResponse.ok) {
        throw new Error(
          `CoinGecko API error: ${completeCoinResponse.status} ${completeCoinResponse.statusText}`
        );
      }
      const completeCoinData: any = await completeCoinResponse.json();

      // Fetch chart data separately
      const chartUrl = new URL(
        `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart`
      );
      chartUrl.searchParams.append("vs_currency", "usd");
      chartUrl.searchParams.append("days", days.toString());

      const chartResponse = await fetch(chartUrl.toString(),{
        method:'GET',
        headers:{
          "x-cg-demo-api-key": env.COINGECKO_API_KEY
        }
      });
      if (!chartResponse.ok) {
        throw new Error(
          `CoinGecko chart API error: ${chartResponse.status} ${chartResponse.statusText}`
        );
      }
      const chartData: any = await chartResponse.json();

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

      // Return complete coin data with chart
      return {
        text: `I've fetched complete market data for ${coinId} including price, market cap, sentiment, and liquidity information.`,
        data_output: {
          type: "crypto_market_data",
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
        },
      };
    } catch (error) {
      return {
        text: `Error fetching crypto market data: ${
          error instanceof Error ? error.message : String(error)
        }`,
        isError: true,
      };
    }
  },
  {
    name: "get_crypto_or_token_data",
    description:
      "Get comprehensive cryptocurrency or token data including price charts, market cap, sentiment, and liquidity for popular coins and tokens. Use this when users ask about crypto prices, market performance, sentiment, or investment advice for any cryptocurrency or even general query (like tell me about a token).",
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
  async ({
    coin,
    total_investment,
    frequency,
    duration_days,
  }: {
    coin: string;
    total_investment: number;
    frequency: "daily" | "weekly";
    duration_days: number;
  }) => {
    try {
      const STRATEGY_ENGINE_URL =
        process.env.STRATEGY_ENGINE_URL ||
        "http://localhost:3001/v1/strategies/dca/simulate";

      const response = await axios.post(STRATEGY_ENGINE_URL, {
        coin,
        total_investment,
        frequency,
        duration_days,
      });

      console.log(`[simulateDCAStrategyTool] Successfully simulated DCA strategy for ${response.data.summary.buy_count}`);

      // Your tools MUST return JSON as string in the "text" field
      return {
        text: JSON.stringify(response?.data?.summary, null, 2),
        data_output: {
          type: "dca_strategy",
          ...response.data,
        },
      };
    } catch (error: any) {
      return {
        text: `Error simulating DCA strategy for ${coin}: ${
          error?.response?.data?.detail || error.message
        }`,
        isError: true,
      };
    }
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
  async ({
    coin,
    total_investment,
    duration_days,
  }: {
    coin: string;
    total_investment: number;
    duration_days: number;
  }) => {
    try {
      const STRATEGY_ENGINE_URL =
        process.env.STRATEGY_ENGINE_URL ||
        "http://localhost:3001/v1/strategies/lump-sum/simulate";

      const response = await axios.post(STRATEGY_ENGINE_URL, {
        coin,
        total_investment,
        duration_days,
      });

      return {
        // LLM MUST receive JSON string here
        text: JSON.stringify(response?.data?.summary, null, 2),

        // Zyra frontend receives rich data here
        data_output: {
          type: "lump_sum_strategy",
          ...response.data,
        },
      };
    } catch (error: any) {
      return {
        text: `Error simulating Lump Sum strategy for ${coin}: ${
          error?.response?.data?.detail || error.message
        }`,
        isError: true,
      };
    }
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

// ============ UNISWAP V3 SWAP TOOL ============

/**
 * Fetch USD price of a token from CoinGecko
 * Maps common token identifiers to CoinGecko IDs
 */
async function getTokenUSDPrice(tokenIdentifier: string): Promise<number> {
  const coingeckoIdMap: Record<string, string> = {
    // Native tokens
    "eth": "ethereum",
    "native": "ethereum",
    "weth": "ethereum",
    "matic": "matic-network",
    "wmatic": "matic-network",
    // Stablecoins
    "usdc": "usd-coin",
    "usdt": "tether",
    "dai": "dai",
    // Common tokens
    "wbtc": "wrapped-bitcoin",
    "link": "chainlink",
    "uni": "uniswap",
    "aave": "aave",
    "arb": "arbitrum",
    "op": "optimism",
    // Common contract addresses (lowercase)
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "ethereum", // WETH mainnet
    "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": "ethereum", // WETH arbitrum
    "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619": "ethereum", // WETH polygon
    "0x4200000000000000000000000000000000000006": "ethereum", // WETH base/optimism
    "0xaf88d065e77c8cc2239327c5edb3a432268e5831": "usd-coin", // USDC arbitrum
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "usd-coin", // USDC mainnet
    "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359": "usd-coin", // USDC polygon
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "usd-coin", // USDC base
    "0x0b2c639c533813f4aa9d7837caf62653d097ff85": "usd-coin", // USDC optimism
  };

  const key = tokenIdentifier.toLowerCase();
  const coinId = coingeckoIdMap[key];

  if (!coinId) {
    throw new Error(
      `Cannot determine USD price for token '${tokenIdentifier}'. ` +
      `Use amountIn (token amount) instead of amountInUSD for this token.`
    );
  }

  const response = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
    {
      method: "GET",
      headers: { "x-cg-demo-api-key": env.COINGECKO_API_KEY },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch price from CoinGecko: ${response.status}`);
  }

  const data = await response.json();
  const price = data[coinId]?.usd;

  if (!price || price <= 0) {
    throw new Error(`Could not get USD price for ${coinId}`);
  }

  return price;
}

export const swapTokensTool = langchainTools.tool(
  async ({
    tokenIn,
    tokenOut,
    amountIn,
    amountInUSD,
    slippageTolerance = 0.5,
    deadline = "20 minutes",
    recipient,
    network,
    useSmartRouting = true,
    fee = 3000,
    // Conditional order parameters
    orderType = "immediate",
    targetPrice,
    priceDirection,
    targetTokenSymbol,
    expiresAt,
    executeAt,
    executeAfterMinutes,
  }: {
    tokenIn: string;
    tokenOut: string;
    amountIn?: string;
    amountInUSD?: number;
    slippageTolerance?: number;
    deadline?: string;
    recipient: string;
    network: string;
    useSmartRouting?: boolean;
    fee?: number;
    // Conditional order parameters
    orderType?: "immediate" | "limit_order" | "stop_loss" | "scheduled";
    targetPrice?: number;
    priceDirection?: "above" | "below";
    targetTokenSymbol?: string;
    expiresAt?: string;
    executeAt?: string;
    executeAfterMinutes?: number;
  }) => {
    try {
      // Calculate executeAt from executeAfterMinutes if provided (more reliable than LLM-generated timestamps)
      let resolvedExecuteAt = executeAt;
      if (executeAfterMinutes !== undefined && executeAfterMinutes > 0) {
        resolvedExecuteAt = new Date(Date.now() + executeAfterMinutes * 60 * 1000).toISOString();
        console.log(`[Swap Tool] Calculated executeAt from executeAfterMinutes: ${executeAfterMinutes} mins -> ${resolvedExecuteAt}`);
      }

      console.log(`[Swap Tool] Called with orderType=${orderType}, targetPrice=${targetPrice}, priceDirection=${priceDirection}, expiresAt=${expiresAt}, executeAt=${resolvedExecuteAt}, executeAfterMinutes=${executeAfterMinutes}`);

      // Validate network - SEI should use place_order tool
      const supportedNetworks = ["ethereum", "arbitrum", "polygon", "base", "optimism"];
      if (!supportedNetworks.includes(network.toLowerCase())) {
        return {
          text: `Network '${network}' is not supported for Uniswap V3 swaps. ` +
            `Supported networks: ${supportedNetworks.join(", ")}. ` +
            `For SEI, please use the place_order tool instead.`,
          isError: true,
        };
      }

      // Resolve amount: convert USD to token amount if amountInUSD is provided
      let resolvedAmountIn: string;
      let usdValue: number | undefined;

      if (amountInUSD !== undefined && amountInUSD > 0) {
        // User specified a dollar amount - convert to token amount
        const tokenPrice = await getTokenUSDPrice(tokenIn);
        const tokenAmount = amountInUSD / tokenPrice;
        resolvedAmountIn = tokenAmount.toFixed(18).replace(/0+$/, '').replace(/\.$/, '');
        usdValue = amountInUSD;
        console.log(`[Swap] Converting $${amountInUSD} to ${resolvedAmountIn} ${tokenIn} (price: $${tokenPrice})`);
      } else if (amountIn) {
        resolvedAmountIn = amountIn;
      } else {
        return {
          text: "Either amountIn (token amount) or amountInUSD (dollar amount) must be provided.",
          isError: true,
        };
      }

      // Parse deadline string to seconds
      const deadlineSeconds = parseDeadlineToTimestamp(deadline);

      // Build swap transaction
      const result = await services.buildSwapTransaction({
        tokenIn,
        tokenOut,
        amountIn: resolvedAmountIn,
        slippageTolerance,
        deadline: deadlineSeconds,
        recipient,
        network: network.toLowerCase(),
        useSmartRouting,
        fee,
      });

      // Determine if this is a conditional order
      // Price-based: limit_order or stop_loss with targetPrice
      // Time-based: scheduled with executeAt
      const isConditional = orderType !== "immediate";
      console.log(`[Swap Tool] isConditional=${isConditional}, orderType=${orderType}, targetPrice=${targetPrice}, executeAt=${executeAt}`);

      // Build the output with transactionType and executionConditions for frontend
      const toolOutput: any = {
        ...result,
        label: `Swap ${result.metadata.tokenIn.symbol} → ${result.metadata.tokenOut.symbol}`,
        // Transaction type for frontend to detect
        transactionType: orderType,
        // Execution conditions for delegated orders
        ...(isConditional && {
          executionConditions: {
            // Price-based conditions (for limit_order / stop_loss)
            ...(targetPrice !== undefined && {
              targetPrice,
              priceDirection: priceDirection || "below",
              targetTokenSymbol: targetTokenSymbol || "ethereum",
            }),
            // Time-based conditions (for scheduled orders)
            ...(resolvedExecuteAt && { executeAt: resolvedExecuteAt }),
            expiresAt: expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Default 7 days
          },
        }),
      };

      // Embed approval info into the swap transaction (frontend handles inline)
      if (result.approval) {
        toolOutput.transaction.approvalNeeded = {
          address: result.approval.address,
          abi: result.approval.abi,
          functionName: result.approval.functionName,
          args: result.approval.args,
        };
      }

      // Build response text based on order type
      const amountDisplay = usdValue
        ? `$${usdValue} worth of ${result.metadata.tokenIn.symbol} (${result.metadata.tokenIn.amount} ${result.metadata.tokenIn.symbol})`
        : `${result.metadata.tokenIn.amount} ${result.metadata.tokenIn.symbol}`;
      let responseText = `Swap transaction prepared: ${amountDisplay} → ~${result.metadata.tokenOut.expectedAmount} ${result.metadata.tokenOut.symbol} (minimum: ${result.metadata.tokenOut.minimumAmount}). Route: ${result.metadata.route.join(" → ")}. Slippage: ${result.metadata.slippage}.`;

      if (result.approval) {
        responseText += ` Token approval will be requested automatically before the swap.`;
      }

      if (isConditional) {
        if (orderType === "scheduled" && resolvedExecuteAt) {
          responseText += ` This is a scheduled order that will execute at ${resolvedExecuteAt}.`;
        } else if (targetPrice !== undefined) {
          responseText += ` This is a ${orderType.replace("_", " ")} that will execute when ${targetTokenSymbol || "the token"} price goes ${priceDirection || "below"} $${targetPrice}.`;
        } else {
          responseText += ` This is a ${orderType.replace("_", " ")} order.`;
        }
      }

      // Debug: Log the final tool output being returned
      console.log('[Swap Tool] Final toolOutput:', JSON.stringify({
        transactionType: toolOutput.transactionType,
        hasExecutionConditions: !!toolOutput.executionConditions,
        executionConditions: toolOutput.executionConditions,
        transaction: {
          to: toolOutput.transaction.to,
          value: toolOutput.transaction.value,
          gas: toolOutput.transaction.gas,
          address: toolOutput.transaction.address,
          functionName: toolOutput.transaction.functionName,
          hasAbi: !!toolOutput.transaction.abi,
          hasApprovalNeeded: !!toolOutput.transaction.approvalNeeded,
        }
      }, null, 2));

      return {
        text: responseText,
        tool_output: [toolOutput],
      };
    } catch (error) {
      return {
        text: `Error building swap transaction: ${
          error instanceof Error ? error.message : String(error)
        }`,
        tool_output: null,
        isError: true,
      };
    }
  },
  {
    name: "swap_tokens",
    description:
      "Swap tokens using Uniswap V3. Supports Ethereum, Arbitrum, Polygon, Base, and Optimism. " +
      "For SEI chain, use the place_order tool instead. " +
      "This tool builds an unsigned swap transaction that the user can sign and execute. " +
      "Supports both IMMEDIATE swaps (user signs now) and CONDITIONAL orders (limit orders, stop loss) " +
      "that execute automatically when price conditions are met. " +
      "For native token swaps (ETH, MATIC), use 'ETH' or 'NATIVE' as the token identifier. " +
      "IMPORTANT: When the user specifies a DOLLAR amount (e.g., '$1 of ETH', '$50 worth of ETH'), " +
      "use amountInUSD (e.g., 1 for $1). When the user specifies a TOKEN amount (e.g., '1 ETH', '100 USDC'), " +
      "use amountIn (e.g., '1' for 1 ETH). " +
      "When user says 'when price reaches X' or 'when price drops/rises', use orderType='limit_order' with targetPrice. " +
      "When user says 'after X minutes', 'in 1 hour', use orderType='scheduled' with executeAfterMinutes (number of minutes from now). " +
      "IMPORTANT: For scheduled orders, ALWAYS use executeAfterMinutes instead of executeAt for accurate timing.",
    schema: z.object({
      tokenIn: z
        .string()
        .describe(
          "Input token address, or 'ETH'/'NATIVE' for native token (will be wrapped automatically)"
        ),
      tokenOut: z
        .string()
        .describe(
          "Output token address, or 'ETH'/'NATIVE' for native token"
        ),
      amountIn: z
        .string()
        .optional()
        .describe(
          "Amount to swap in TOKEN units (e.g., '1' for 1 ETH, '100' for 100 USDC). " +
          "Use this when the user specifies a token amount. " +
          "Either amountIn or amountInUSD must be provided."
        ),
      amountInUSD: z
        .number()
        .optional()
        .describe(
          "Amount to swap in USD (e.g., 1 for $1, 50 for $50). " +
          "Use this when the user specifies a dollar amount like '$1 of ETH' or '$50 worth of ETH'. " +
          "The tool will automatically convert to the correct token amount using current market price. " +
          "Either amountIn or amountInUSD must be provided."
        ),
      slippageTolerance: z
        .number()
        .optional()
        .describe("Slippage tolerance in percentage (default: 0.5 for 0.5%)"),
      deadline: z
        .string()
        .optional()
        .describe(
          "Transaction deadline as duration (e.g., '20 minutes', '1 hour'). Default: 20 minutes"
        ),
      recipient: z
        .string()
        .describe("Address that will receive the output tokens (usually the user's address)"),
      network: z
        .enum(["ethereum", "arbitrum", "polygon", "base", "optimism"])
        .describe("Network to execute the swap on"),
      useSmartRouting: z
        .boolean()
        .optional()
        .describe(
          "Use Uniswap AlphaRouter for optimal multi-hop routing (default: true). " +
          "Set to false for direct single-hop swap."
        ),
      fee: z
        .number()
        .optional()
        .describe(
          "Fee tier for single-hop swaps: 100 (0.01%), 500 (0.05%), 3000 (0.3%), 10000 (1%). " +
          "Default: 3000. Only used when useSmartRouting is false."
        ),
      // Conditional order parameters
      orderType: z
        .enum(["immediate", "limit_order", "stop_loss", "scheduled"])
        .optional()
        .describe(
          "Type of order: 'immediate' for instant execution (default), " +
          "'limit_order' for execution when target price is reached, " +
          "'stop_loss' for execution when price drops below stop price, " +
          "'scheduled' for time-based execution (e.g., 'after 1 minute', 'at 3pm')"
        ),
      targetPrice: z
        .number()
        .optional()
        .describe(
          "Target price for conditional orders (limit_order/stop_loss). " +
          "Required when orderType is not 'immediate'. " +
          "Example: 3000 means execute when price reaches $3000"
        ),
      priceDirection: z
        .enum(["above", "below"])
        .optional()
        .describe(
          "Price direction for limit orders: 'above' to execute when price rises above target, " +
          "'below' to execute when price drops below target. Default: 'below'"
        ),
      targetTokenSymbol: z
        .string()
        .optional()
        .describe(
          "Token symbol to monitor for price conditions (e.g., 'ethereum', 'bitcoin'). " +
          "This is the CoinGecko ID. Default: 'ethereum'"
        ),
      expiresAt: z
        .string()
        .optional()
        .describe(
          "Expiration date for conditional orders in ISO format (e.g., '2024-12-31T00:00:00Z'). " +
          "Default: 7 days from now"
        ),
      executeAt: z
        .string()
        .optional()
        .describe(
          "Execution time for scheduled orders in ISO format (e.g., '2025-01-28T15:30:00Z'). " +
          "DEPRECATED: Prefer using executeAfterMinutes instead for more accurate timing."
        ),
      executeAfterMinutes: z
        .number()
        .optional()
        .describe(
          "Number of minutes from NOW to execute the scheduled order. " +
          "Use this instead of executeAt for scheduled orders. " +
          "Examples: 1 for 'after 1 minute', 5 for 'in 5 minutes', 60 for 'in 1 hour'. " +
          "The server will calculate the exact execution time based on the current time when the order is created."
        ),
    }),
  }
);

const toolsList = [
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
  swapTokensTool,

  // Utility Tools
  convertTokenSymbolToAddressTool,
  convertAddressToTokenSymbolTool,

  // Crypto Market Data Tools
  getCryptoMarketDataTool,
  simulateDCAStrategyTool,
  simulateLumpSumStrategyTool
];

export default toolsList;
