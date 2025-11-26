import { inject, injectable } from "inversify";
import { TYPES } from "../ioc-container/types";
import { UserService } from "./UserService";
import { Transaction } from "../types/user";
import { getTransactionTool } from "../tools/langGraphTools";

@injectable()
export class TransactionService {
  constructor(@inject(TYPES.UserService) private userService: UserService) {}

  async addTransaction(
    address: string,
    txHash: string
  ): Promise<{ data: Transaction }> {
    try {
      // Ensure MCP connection
      // Call get_transaction tool directly
      const toolResult = await getTransactionTool.call({ txHash });

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
        const response = await this.userService.addUserTransaction(address, {
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
}
