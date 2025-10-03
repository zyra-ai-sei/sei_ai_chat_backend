import { inject, injectable } from "inversify";
import { isNumberObject } from "util/types";
import { TYPES } from "../ioc-container/types";
import { MCPService } from "./MCPService";
import { UserService } from "./UserService";
import { Transaction } from "../types/user";

@injectable()
export class TransactionService {
  constructor(@inject(TYPES.MCPService) private mcpService: MCPService, @inject(TYPES.UserService) private userService: UserService) {}

  async addTransaction(
    address: string,
    txHash: string
  ): Promise<{ data: Transaction }> {
    try {
      // Ensure MCP connection
      if (!this.mcpService.isConnected()) {
        await this.mcpService.connectToMCP();
      }

      // Call get_transaction tool directly
      const transactionData = await this.mcpService.callTool(
        "get_transaction",
        {
          txHash: txHash,
        }
      );

      if (transactionData && transactionData.result) {
        const txJsonString = transactionData?.result?.content?.[0]?.text;
        const txObject = JSON.parse(txJsonString || "");
       const response =  await this.userService.addUserTransaction(address, {
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
        });
        console.log('this is transaction data',response)
        return {
          data: response,
        };
      }else{
        throw new Error("Error in fetching transaction info")
      }
    } catch (err) {
      throw new Error(`Error in fetching transaction info ${err}`);
    }
  }
}
