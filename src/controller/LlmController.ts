import { controller, httpGet, httpPost, request } from "inversify-express-utils";
import { inject } from "inversify";
import { TYPES } from "../ioc-container/types";
import { type Request } from "express";
import { ILlmService } from "../services/interfaces/ILlmService";
import AuthMiddleware from "../middleware/AuthMiddleware";
import { AuthenticatedRequest } from "../types/requestTypes";

@controller("/llm", TYPES.AuthMiddleware)
export class LlmController {
  constructor(@inject(TYPES.LlmService) private llmService: ILlmService) {}

  @httpPost("/init")
  private async init(
    @request() req: AuthenticatedRequest
  ): Promise<{ success: boolean }> {
    const address = req.userAddress;
    const response = await this.llmService.initChat(address);
    return { success: true };
  }

  @httpPost("/chat")
  private async chat(
    @request()
    req: AuthenticatedRequest
  ): Promise<string | object> {
    const { prompt, family, model } = req.body;
    const address = req.userAddress
    const userId = req.userId
    return this.llmService.sendMessage(prompt, address, family, model, userId);
  }

  @httpPost("/addtxn")
  private async addtxn(
    @request()
    req: AuthenticatedRequest
  ): Promise<string | object> {
    const {prompt, family, model} = req.body;
    const address = req.userAddress;
    const userId = req.userId;
    const {orderId} = req.query;
    return this.llmService.addtxn(prompt, address, family, model, userId, orderId as string);
  }

  @httpGet("/getChatHistory")
  private async getChatHistory(
    @request()
    req: AuthenticatedRequest
  ): Promise<string | object> {
    const address = req.userAddress;
    return this.llmService.getChatHistory(address);
  }

  @httpGet("/clearChat")
  private async clearChat(
    @request()
    req: AuthenticatedRequest
  ): Promise<{ success: boolean }> {
    const address = req.userAddress;
    await this.llmService.clearChat(address);
    return { success: true };
  }
}
