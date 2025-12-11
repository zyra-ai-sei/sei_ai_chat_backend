import { controller, httpGet, httpPost, request, response } from "inversify-express-utils";
import { inject } from "inversify";
import { TYPES } from "../ioc-container/types";
import { Response } from "express";
import { ILlmService } from "../services/interfaces/ILlmService";
import AuthMiddleware from "../middleware/AuthMiddleware";
import { AuthenticatedRequest, NetworkRequest } from "../types/requestTypes";

@controller("/llm", TYPES.AuthMiddleware, TYPES.NetworkMiddleware)
export class LlmController {
  constructor(@inject(TYPES.LlmService) private llmService: ILlmService) {}

  @httpPost("/init")
  private async init(
    @request() req: AuthenticatedRequest & NetworkRequest
  ): Promise<{ success: boolean }> {
    const address = req.userAddress;
    const network = req.network;
    const response = await this.llmService.initChat(address, network);
    return { success: true };
  }

  @httpPost("/chat")
  private async chat(
    @request()
    req: AuthenticatedRequest & NetworkRequest
  ): Promise<string | object> {
    const { prompt, messageType } = req.body;
    const address = req.userAddress
    const network = req.network;
    const type = (messageType === "human" || messageType === "system") ? messageType : "human";
    return this.llmService.sendMessage(prompt, address, network, type);
  }

  @httpGet("/stream")
  private async stream(
    @request() req: AuthenticatedRequest & NetworkRequest,
    @response() res: Response
  ): Promise<void> {
    const promptParam = req.query.prompt;
    const prompt = Array.isArray(promptParam) ? promptParam.join(" ") : promptParam;
    
    const messageTypeParam = req.query.messageType;
    const messageType = (typeof messageTypeParam === "string" && (messageTypeParam === "human" || messageTypeParam === "system")) 
      ? messageTypeParam 
      : "human";

    if (typeof prompt !== "string" || !prompt.trim()) {
      res.status(400).json({ success: false, message: "prompt query parameter is required" });
      return;
    }

    const address = req.userAddress;
    const network = req.network;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let closed = false;
    const handleClose = () => {
      closed = true;
    };

    req.on("close", handleClose);

    try {
      for await (const chunk of this.llmService.streamMessage(prompt, address, network, undefined, messageType)) {
        if (closed) {
          break;
        }
        console.log('stream', JSON.stringify(chunk))
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      if (!closed) {
        res.write("event: end\ndata: {}\n\n");
      }
    } catch (error) {
      console.error("Error streaming LLM response:", error);
      if (!closed) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: "Stream failed" })}\n\n`);
      }
    } finally {
      req.off("close", handleClose);
      if (!closed) {
        res.end();
      }
    }
  }

  @httpGet("/getChatHistory")
  private async getChatHistory(
    @request()
    req: AuthenticatedRequest & NetworkRequest
  ): Promise<string | object> {
    const address = req.userAddress;
    const network = req.network;
    return this.llmService.getChatHistory(address, network);
  }

  @httpPost("/updateMessageState")
  private async updateMessageState(
    @request()
    req: AuthenticatedRequest & NetworkRequest
  ): Promise<{ success: boolean; message?: string }> {
    const address = req.userAddress;
    const network = req.network;
    const { executionId, executionState, txnHash } = req.body;
    
    if (!executionId || !executionState) {
      return { success: false, message: "Missing executionId or executionState" };
    }
    
    if (!["completed", "pending", "failed"].includes(executionState)) {
      return { success: false, message: "Invalid executionState. Must be completed, pending, or failed" };
    }
    
    const success = await this.llmService.updateMessageById(
      address, 
      network,
      executionId, 
      executionState,
      txnHash
    );
    
    return { success, message: success ? "Message updated successfully" : "Failed to update message" };
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
