import {
  controller,
  httpGet,
  httpPost,
  request,
  response,
} from "inversify-express-utils";
import { inject } from "inversify";
import { TYPES } from "../ioc-container/types";
import { Response } from "express";
import { ILlmService } from "../services/interfaces/ILlmService";
import AuthMiddleware from "../middleware/AuthMiddleware";
import { AuthenticatedRequest, NetworkRequest } from "../types/requestTypes";
import { ethers } from "ethers";
import { StreamRegistry } from "../services/StreamRegistry";
import ToolQueryResult from "../database/mongo/models/ToolQueryResult";
import { getSafeAddress } from "../utils";
import { LlmService } from "../services/LlmService";

@controller(
  "/llm",
  TYPES.AuthMiddleware,
  TYPES.NetworkMiddleware,
  TYPES.AddressMiddleware,
)
export class LlmController {
  constructor(
    @inject(TYPES.LlmService) private llmService: LlmService,
    @inject(TYPES.StreamRegistry) private streamRegistry: StreamRegistry,
  ) {}

  @httpPost("/chat")
  private async chat(
    @request() req: AuthenticatedRequest & NetworkRequest,
    @response() res: Response,
  ): Promise<void> {
    const { prompt, messageType, requestId } = req.body;
    const { userId, network } = req;
    const address = req.query.address as string;

    // Send an immediate 202 Accepted so the POST request doesn't hang
    res.status(202).json({ success: true, message: "Generation started" });

    try {
      // Consume the generator
      for await (const chunk of this.llmService.streamMessage(
        prompt,
        userId,
        requestId,
        address,
        network,
        undefined,
        messageType || "human",
      )) {
        // Push each chunk to the user's persistent SSE connection
        this.streamRegistry.sendToUser(userId, {
          type: chunk.type, // e.g., 'token' or 'llm_chunk'
          data: chunk,
        });
      }

      // Signal end of stream
      this.streamRegistry.sendToUser(userId, {
        type: "end",
        data: { requestId },
      });
    } catch (error) {
      console.error("Error in background stream:", error);
      this.streamRegistry.sendToUser(userId, {
        type: "error",
        data: { message: "Stream failed", requestId },
      });
    }
  }

  @httpGet("/stream")
  private async stream(
    @request() req: AuthenticatedRequest & NetworkRequest,
    @response() res: Response,
  ): Promise<void> {
    const promptParam = req.query.prompt;
    const requestId = req.query.requestId as string;
    const prompt = Array.isArray(promptParam)
      ? promptParam.join(" ")
      : promptParam;
    const address = req.query.address as string;
    const messageTypeParam = req.query.messageType;
    const messageType =
      typeof messageTypeParam === "string" &&
      (messageTypeParam === "human" || messageTypeParam === "system")
        ? messageTypeParam
        : "human";

    if (typeof prompt !== "string" || !prompt.trim()) {
      res.status(400).json({
        success: false,
        message: "prompt query parameter is required",
      });
      return;
    }

    const userId = req.userId;
    const network = req.network;

    // Set up SSE headers for multiplexed event stream
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
    res.flushHeaders();

    // Register this stream with the StreamRegistry for tx_update events
    this.streamRegistry.registerStream(userId, userId, address, res);

    let closed = false;
    const handleClose = () => {
      closed = true;
      // Unregister from StreamRegistry on close
      this.streamRegistry.unregisterStream(userId, userId);
    };

    req.on("close", handleClose);

    try {
      for await (const chunk of this.llmService.streamMessage(
        prompt,
        userId,
        requestId,
        address,
        network,
        undefined,
        messageType,
      )) {
        if (closed) {
          break;
        }

        // Use SSE named events for multiplexing
        // event: <type>\ndata: <json>\n\n
        const eventType = chunk.type;
        res.write(`event: ${eventType}\n`);
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      if (!closed) {
        res.write("event: end\ndata: {}\n\n");
      }
    } catch (error) {
      console.error("Error streaming LLM response:", error);
      if (!closed) {
        res.write(
          `event: error\ndata: ${JSON.stringify({
            message: "Stream failed",
          })}\n\n`,
        );
      }
    } finally {
      req.off("close", handleClose);
      // Ensure unregistration
      this.streamRegistry.unregisterStream(userId, userId);
      if (!closed) {
        res.end();
      }
    }
  }

  @httpGet("/getChatHistory")
  private async getChatHistory(
    @request()
    req: AuthenticatedRequest & NetworkRequest,
  ): Promise<string | object> {
    const address = req.query.address as string;
    const network = req.network;
    const userId = req.userId;
    return this.llmService.getChatHistory(userId, address, network);
  }

  @httpPost("/updateTransactionStatus")
  private async updateTransactionStatus(
    @request()
    req: AuthenticatedRequest & NetworkRequest,
  ): Promise<{
    success: boolean;
    message?: string;
    error?: string;
    data?: any;
  }> {
    const {
      executionId,
      status,
      txnHash,
      error: txnError,
      transactionIndex = 0,
    } = req.body;

    if (!executionId || !status) {
      return {
        success: false,
        message: "Missing executionId or status",
      };
    }

    if (!["unsigned", "pending", "completed", "failed"].includes(status)) {
      return {
        success: false,
        message:
          "Invalid status. Must be unsigned, pending, completed, or failed",
      };
    }

    const result = await this.llmService.updateTransactionStatus(
      executionId,
      status,
      txnHash,
      txnError,
      transactionIndex,
    );

    return {
      success: result.success,
      message: result.success
        ? "Transaction status updated successfully"
        : result.error || "Failed to update transaction status",
      error: result.error,
      data: result.data,
    };
  }

  @httpGet("/clearChat")
  private async clearChat(
    @request()
    req: AuthenticatedRequest,
  ): Promise<{ success: boolean }> {
    const userId = req.userId;
    const address = req.query.address as string;
    await this.llmService.clearChat(userId);
    return { success: true };
  }

  /**
   * Retrieve tool query result data by execution ID.
   * This is used by the frontend to fetch large payloads that were
   * stored in MongoDB instead of being sent inline.
   */
  @httpGet("/toolData/:executionId")
  private async getToolData(
    @request()
    req: AuthenticatedRequest & NetworkRequest,
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const executionId = req.params.executionId;
    const userId = req.userId;

    if (!executionId) {
      return {
        success: false,
        error: "executionId is required",
      };
    }

    try {
      const result = await this.llmService.getToolQueryResult(executionId);

      if (!result) {
        return {
          success: false,
          error: "Tool data not found",
        };
      }

      // Verify the user owns this data
      if (result.userId !== userId) {
        return {
          success: false,
          error: "Unauthorized access to tool data",
        };
      }

      return {
        success: true,
        data: {
          executionId: result.executionId,
          toolName: result.toolName,
          dataType: result.data.type,
          payload: result.data.payload,
          summary: result.summary,
          execution: result.execution,
          createdAt: result.createdAt,
        },
      };
    } catch (error) {
      console.error("Error fetching tool data:", error);
      return {
        success: false,
        error: "Failed to retrieve tool data",
      };
    }
  }

  /**
   * Poll for tool data status - lightweight check without payload
   * Use this to check if async data is ready before fetching full payload
   */
  @httpGet("/toolData/:executionId/status")
  private async getToolDataStatus(
    @request()
    req: AuthenticatedRequest,
  ): Promise<{
    success: boolean;
    status?: "pending" | "completed" | "failed";
    error?: string;
    completedAt?: Date;
  }> {
    const executionId = req.params.executionId;
    const userId = req.userId;

    if (!executionId) {
      return { success: false, error: "executionId is required" };
    }

    try {
      const result = await ToolQueryResult.findOne(
        { executionId },
        {
          userId: 1,
          "execution.status": 1,
          "execution.completedAt": 1,
          "execution.error": 1,
        },
      ).lean();

      if (!result) {
        return { success: false, error: "Tool data not found" };
      }

      if (result.userId !== userId) {
        return { success: false, error: "Unauthorized" };
      }

      return {
        success: true,
        status: result.execution?.status || "pending",
        completedAt: result.execution?.completedAt,
        error: result.execution?.error,
      };
    } catch (error) {
      console.error("Error checking tool data status:", error);
      return { success: false, error: "Failed to check status" };
    }
  }

  /**
   * Batch fetch multiple tool results by execution IDs
   */
  @httpPost("/toolData/batch")
  private async getToolDataBatch(
    @request()
    req: AuthenticatedRequest,
  ): Promise<{
    success: boolean;
    results?: Record<string, any>;
    error?: string;
  }> {
    const { executionIds } = req.body;
    const userId = req.userId;

    if (!Array.isArray(executionIds) || executionIds.length === 0) {
      return { success: false, error: "executionIds array is required" };
    }

    if (executionIds.length > 20) {
      return { success: false, error: "Maximum 20 executionIds per request" };
    }

    try {
      const results = await ToolQueryResult.find({
        executionId: { $in: executionIds },
        userId,
      }).lean();

      const resultMap: Record<string, any> = {};
      for (const result of results) {
        resultMap[result.executionId] = {
          executionId: result.executionId,
          toolName: result.toolName,
          dataType: result.data?.type,
          payload: result.data?.payload,
          summary: result.summary,
          status: result.execution?.status,
          createdAt: result.createdAt,
        };
      }

      return { success: true, results: resultMap };
    } catch (error) {
      console.error("Error fetching batch tool data:", error);
      return { success: false, error: "Failed to retrieve tool data" };
    }
  }

  /**
   * Batch fetch tool results grouped by request IDs.
   * Returns a map where key is requestId and value is array of tool outputs
   * belonging to that request.
   */
  @httpPost("/toolData/byRequestIds")
  private async getToolDataByRequestIds(
    @request()
    req: AuthenticatedRequest,
  ): Promise<{
    success: boolean;
    results?: Record<string, any[]>;
    error?: string;
  }> {
    const { requestIds } = req.body;
    const userId = req.userId;

    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      return { success: false, error: "requestIds array is required" };
    }

    if (requestIds.length > 50) {
      return { success: false, error: "Maximum 50 requestIds per request" };
    }

    try {
      // Fetch all results for the given requestIds that belong to this user
      const results = await ToolQueryResult.find({
        requestId: { $in: requestIds },
        userId,
      }).lean();

      // Group results by requestId
      const resultMap: Record<string, any[]> = {};

      // Initialize empty arrays for all requested IDs
      for (const requestId of requestIds) {
        resultMap[requestId] = [];
      }

      // Populate with actual results
      for (const result of results) {
        if (result.requestId && resultMap[result.requestId] !== undefined) {
          resultMap[result.requestId].push({
            executionId: result.executionId,
            toolName: result.toolName,
            status: result.execution?.status,
            dataType: result.data?.type,
            payload: result.data?.payload,
            summary: result.summary?.text,
            txHashes: result.data?.payload?.transactions
              ?.map((t: any) => t.txHash)
              .filter(Boolean),
            createdAt: result.createdAt,
            completedAt: result.execution?.completedAt,
          });
        }
      }

      return { success: true, results: resultMap };
    } catch (error) {
      console.error("Error fetching tool data by requestIds:", error);
      return { success: false, error: "Failed to retrieve tool data" };
    }
  }

  /**
   * SSE endpoint for subscribing to tool data updates
   * Frontend can subscribe to get notified when async tool data is ready
   */
  @httpGet("/toolDataStream")
  private async toolDataStream(
    @request() req: AuthenticatedRequest,
    @response() res: Response,
  ): Promise<void> {
    const userId = req.userId;
    const address =
      (req.query.address as string) ||
      "0x0000000000000000000000000000000000000000";
    const streamId = `notif-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Register with StreamRegistry to receive all user events (tokens, tool_results, tool_data_ready)
    this.streamRegistry.registerStream(userId, streamId, address, res);

    // Send initial connection confirmation
    res.write(
      `event: connected\ndata: ${JSON.stringify({ userId, timestamp: Date.now() })}\n\n`,
    );

    let closed = false;

    // Heartbeat every 30 seconds (named event for frontend compatibility)
    const heartbeat = setInterval(() => {
      if (!closed) {
        res.write(
          `event: heartbeat\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`,
        );
      }
    }, 30000);

    const handleClose = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      this.streamRegistry.unregisterStream(userId, streamId);
    };

    req.on("close", handleClose);
  }

  /**
   * Get stream registry statistics (for debugging/monitoring)
   */
  @httpGet("/streamStats")
  private async getStreamStats(
    @request()
    req: AuthenticatedRequest,
  ): Promise<{
    totalStreams: number;
    totalUsers: number;
    trackedAddresses: number;
  }> {
    return this.streamRegistry.getStats();
  }
}
