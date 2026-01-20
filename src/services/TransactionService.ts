import { inject, injectable } from "inversify";
import { TYPES } from "../ioc-container/types";
import { UserService } from "./UserService";
import { Transaction } from "../types/user";
import { getTransactionTool } from "../tools/langGraphTools";
import { getTransactionReceipt } from "../tools/core/services/transactions";
import { ethers } from "ethers";
import { twapABI } from "./twapABI";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount)",
  "function approve(address spender, uint256 amount)",
  "function transferFrom(address from, address to, uint256 amount)",
  "function ask(tuple(address exchange, address srcToken, address dstToken, uint256 srcAmount, uint256 srcBidAmount, uint256 dstMinAmount, uint32 deadline, uint32 bidDelay, uint32 fillDelay, bytes data) _ask)"
];

@injectable()
export class TransactionService {
  constructor(@inject(TYPES.UserService) private userService: UserService) {}

  async addTransaction(
    userId: string,
    txHash: string,
    network: string
  ): Promise<{ data: Transaction }> {
    try {
      // Ensure MCP connection
      // Call get_transaction tool directly
      const toolResult = await getTransactionTool.call({ txHash, network });

      console.dir(toolResult, {
        depth: null, // unlimited depth
        colors: true, // syntax highlighting
        showHidden: true, // include non-enumerable & symbol properties
        maxArrayLength: null, // do not truncate arrays
        compact: false, // multi-line output
      });

      let text = "";
      if (typeof toolResult === "string") {
        text = toolResult;
      } else if (toolResult?.content && Array.isArray(toolResult.content)) {
        text = toolResult.content[0]?.text ?? "";
      } else if (toolResult?.text) {
        text = toolResult.text;
      }

      console.log("Parsed tool output:", text);
      const txObject = JSON.parse(text);
      if (txObject) {
        const response = await this.userService.addUserTransaction(userId, {
          hash: txObject?.hash,
          value: txObject?.value,
          token: txObject?.token,
          gas: txObject?.gas,
          gasPrice: txObject?.gasPrice,
          from: txObject?.from,
          to: txObject?.to,
          type: txObject?.type,
          input: txObject?.input,
          blockNumber: txObject?.blockNumber,
          network: network,
          status: 'PENDING'
        });
        return {
          data: response,
        };
      } else {
        throw new Error("Error in fetching transaction info");
      }
    } catch (err) {
      throw new Error(`Error in fetching transaction info ${err}`);
    }
  }

  startListener() {
    console.log("🎧 Starting Transaction Listener...");
    setInterval(async () => {
      await this.checkPendingTransactions();
    }, 10000); // Check every 10 seconds
  }

  async checkPendingTransactions() {
    try {
      const pendingTxs = await this.userService.getPendingTransactions();
      for (const tx of pendingTxs) {
        if (!tx.hash || !tx.network) continue;
        
        try {
          const receipt = await getTransactionReceipt(tx.hash as `0x${string}`, tx.network);
          if (receipt) {
            const status = receipt.status === 'success' ? 'SUCCESS' : 'FAILED';
            
            let functionName = "";
            if (tx.input && tx.input !== "0x") {
               try {
                  const iface = new ethers.Interface(twapABI);
                  const decoded = iface.parseTransaction({ data: tx.input });
                  if (decoded) {
                     functionName = decoded.name;
                  }
               } catch (e) {
                  // Try ERC20
                  try {
                     const iface = new ethers.Interface(ERC20_ABI);
                     const decoded = iface.parseTransaction({ data: tx.input });
                     if (decoded) {
                        functionName = decoded.name;
                     }
                  } catch (e2) {
                     // Failed to decode
                  }
               }
            }

            await this.userService.updateTransactionStatus(
              tx.hash, 
              status, 
              receipt.blockNumber.toString(),
              receipt.gasUsed.toString(),
              functionName
            );
            console.log(`✅ Transaction ${tx.hash} updated to ${status} (Function: ${functionName || 'Unknown'})`);
          }
        } catch (err) {
          // Receipt might not be available yet
          // console.log(`Transaction ${tx.hash} still pending or error:`, err);
        }
      }
    } catch (err) {
      console.error("Error in transaction listener:", err);
    }
  }
}
