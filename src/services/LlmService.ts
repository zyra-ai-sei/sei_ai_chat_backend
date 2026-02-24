import { FunctionResponse, GoogleGenAI, Part } from "@google/genai";
import fetch from "node-fetch";
import { inject, injectable } from "inversify";
import { ILlmService, LlmStreamChunk } from "./interfaces/ILlmService";
import env from "../envConfig";
import { TYPES } from "../ioc-container/types";
import { UserService } from "./UserService";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI, ChatOpenAICallOptions } from "@langchain/openai";
import {
  HumanMessage,
  SystemMessage,
  trimMessages,
} from "@langchain/core/messages";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { StructuredTool } from "@langchain/core/tools";
import { MongoClient } from "mongodb";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import {
  bridgeTools,
  cryptoTools,
  databaseTools,
  twitterTools,
} from "../tools/langGraphTools";
import { getGeneralSystemPrompt, TrackingSystemPrompt } from "../utils/prompts";
import fs, { mkdirSync, writeFileSync } from "fs";
import { json } from "stream/consumers";
import path from "path";
import { randomUUID } from "crypto";
import { LanguageModelLike } from "@langchain/core/language_models/base";

@injectable()
export class LlmService {
  private genAI: LanguageModelLike;
  private model: string;
  private sessionId: string;
  private mongoClient: MongoClient;
  private checkpointer: MongoDBSaver;
  private activeStreams: Map<string, AbortController> = new Map();

  constructor(@inject(TYPES.UserService) private userService: UserService) {
    console.log("constructor");
    // this.genAI = new ChatGoogleGenerativeAI({
    //   model: "gemini-2.5-flash",
    //   temperature: 0,
    //   apiKey: env.GEMINI_API_KEY,
    // });

    this.genAI = new ChatOpenAI({
      model: "gpt-5-mini-2025-08-07",
      apiKey: env.OPENAI_API_KEY,
    });

    // Initialize MongoDB client once with connection pooling
    this.mongoClient = new MongoClient(env.MONGO_URI, {
      maxPoolSize: 10, // Maximum connections in the pool
      minPoolSize: 2, // Minimum connections to maintain
      maxIdleTimeMS: 30000, // Close idle connections after 30s
    });

    // Initialize checkpointer with the pooled client
    this.checkpointer = new MongoDBSaver({ client: this.mongoClient });
  }

  async clearChat(userId: string) {
    await this.checkpointer.deleteThread(userId);
  }

  async getChatHistory(
    userId: string,
    address: string,
    network: string,
  ): Promise<any> {
    try {
      const chat = await this.initChat(address, network);
      if (!chat) throw new Error("Chat session not initialized");

      const initialState = await chat.getState({
        configurable: { thread_id: userId },
      });

      const state = initialState?.values?.messages || [];

      // Track current requestId - it's set by HumanMessage and applies to all following messages
      // until the next HumanMessage
      let currentRequestId: string | null = null;

      const messages = state
        .filter((message: any) => {
          if (message.constructor.name === "SystemMessage") return false;
          if (
            message.constructor.name === "HumanMessage" &&
            message.additional_kwargs?.type === "system"
          )
            return false;
          return true;
        })
        .map((message: any) => {
          // Update currentRequestId when we see a HumanMessage
          if (message.constructor.name === "HumanMessage") {
            currentRequestId = message.additional_kwargs?.requestId || null;
          }

          if (message.constructor.name === "ToolMessage") {
            try {
              const parsedContent = JSON.parse(message.content);

              // ── New unified ToolResponse format ──────────────────
              if (parsedContent.kind) {
                return {
                  type: "ToolMessage",
                  result: parsedContent,
                  requestId: currentRequestId,
                  toolCallId: message.tool_call_id || null,
                  toolName: message.name || parsedContent.toolName,
                  timestamp: new Date().toISOString(),
                };
              }

              // ── Legacy format (pre-migration messages) ───────────
              let executionId = parsedContent._dataRef?.executionId || null;
              let displayText = "";
              if (
                parsedContent.content &&
                Array.isArray(parsedContent.content)
              ) {
                const textItem = parsedContent.content.find(
                  (item: any) => item.type === "text",
                );
                displayText = textItem
                  ? textItem.text
                  : JSON.stringify(parsedContent.content);
              } else if (parsedContent.result?.content) {
                displayText =
                  typeof parsedContent.result.content === "string"
                    ? parsedContent.result.content
                    : JSON.stringify(parsedContent.result.content);
              } else if (parsedContent.text) {
                displayText = parsedContent.text;
              } else {
                displayText = JSON.stringify(parsedContent);
              }

              const baseResponse = {
                type: message.constructor.name,
                content: displayText,
                requestId: currentRequestId,
                toolCallId: message.tool_call_id || null,
                executionId,
                isAsync: parsedContent._dataRef?.isAsync || false,
                dataType: parsedContent._dataRef?.dataType || null,
                status:
                  parsedContent._dataRef?.status ||
                  parsedContent.status ||
                  "unexecuted",
                hash: parsedContent.hash,
                toolName:
                  message.name ||
                  parsedContent._dataRef?.toolName ||
                  parsedContent.toolName,
                timestamp: parsedContent.timestamp || new Date().toISOString(),
              };

              if (parsedContent.tool_output) {
                return {
                  ...baseResponse,
                  tool_output: parsedContent.tool_output,
                };
              } else {
                return {
                  ...baseResponse,
                  data_output: parsedContent.data_output,
                };
              }
            } catch (parseError) {
              console.warn("Failed to parse tool message content:", parseError);
              return {
                type: message.constructor.name,
                content: message.content,
                requestId: currentRequestId,
                toolCallId: message.tool_call_id || null,
                status: "unexecuted",
                timestamp: new Date().toISOString(),
              };
            }
          }

          // Handle AIMessage with tool_calls
          if (
            message.constructor.name === "AIMessage" ||
            message.constructor.name === "AIMessageChunk"
          ) {
            const toolCalls = message.tool_calls || [];
            return {
              type: message.constructor.name,
              content: message.content,
              requestId: currentRequestId,
              timestamp: new Date().toISOString(),
              // Include tool_calls array so frontend can link to ToolMessages via toolCallId
              tool_calls: toolCalls.map((tc: any) => ({
                id: tc.id,
                name: tc.name,
                args: tc.args,
              })),
            };
          }

          // Default case (HumanMessage and others)
          return {
            type: message.constructor.name,
            content: message.content,
            requestId: currentRequestId,
            timestamp: new Date().toISOString(),
          };
        });
      return messages;
    } catch (error) {
      console.error("Error getting chat history:", error);
      throw new Error(`Failed to retrieve chat history: ${error.message}`);
    }
  }

  /**
   * Cleanup method to close MongoDB connection pool
   * Call this on application shutdown
   */
  async dispose(): Promise<void> {
    try {
      await this.mongoClient.close();
      console.log("MongoDB connection pool closed");
    } catch (error) {
      console.error("Error closing MongoDB connection pool:", error);
    }
  }

  // Initialize and store a chat session for a sessionId (generate if not provided)
  async initChat(address: string, network: string): Promise<any> {
    console.log("reached initChat");

    const allTools = [
      ...cryptoTools,
      ...databaseTools,
      ...twitterTools,
      ...bridgeTools,
    ];

    const agent = createReactAgent({
      llm: this.genAI,
      tools: allTools,
      checkpointSaver: this.checkpointer,
      // Limit agent iterations to prevent excessive tool calls (most requests need 1-3 iterations)
      stateModifier: async (state: any) => {
        const systemPrompt = getGeneralSystemPrompt(address, network);
        const messages = state.messages;

        // 1. Minimum messages to trigger truncation (e.g., keep last 20)
        const K = 20;

        if (messages.length <= K) {
          return [new SystemMessage(systemPrompt), ...messages];
        }

        // 2. Start looking back from the K-th message from the end
        let sliceIndex = messages.length - K;

        // 3. CRITICAL: Walk backwards until we find a HumanMessage.
        // This ensures the history the model sees always starts with a fresh user intent,
        // and automatically includes all associated AI thoughts and Tool results that followed it.
        while (
          sliceIndex > 0 &&
          messages[sliceIndex].constructor.name !== "HumanMessage"
        ) {
          sliceIndex--;
        }

        // 4. Return system prompt + the safe windowed slice
        return [new SystemMessage(systemPrompt), ...messages.slice(sliceIndex)];
      },
    });

    return agent;
  }

  async initStatelessChat(systemPrompt: string) {
    const agent = createReactAgent({
      llm: this.genAI,
      tools: databaseTools,
      stateModifier: systemPrompt,
    });
    return agent;
  }

  async statelessChat(prompt: string, trackedAddress: string) {
    const systemPrompt = TrackingSystemPrompt(trackedAddress);

    const chat = await this.initStatelessChat(systemPrompt);

    const response = await chat.invoke(
      { messages: [prompt] }, // Use the actual prompt instead of hardcoded message
      { configurable: { thread_id: randomUUID() } }, // Use address as thread_id
    );

    return response.messages;
  }

  async *streamMessage(
    prompt: string,
    userId: string,
    requestId: string,
    address: string,
    network: string,
    abortSignal?: AbortSignal,
    messageType: "human" | "system" = "human",
  ): AsyncGenerator<LlmStreamChunk> {
    // Generate a unique requestId for this entire request
    // This groups all AI messages, tool calls, and responses together

    try {
      // await this.sanitizeHistory(address);
      const chat = await this.initChat(address, network);
      console.log("reached chat creating", prompt);
      if (!chat) {
        throw new Error("Chat session not initialized");
      }

      // Include requestId in the message's additional_kwargs for persistence
      const message =
        messageType === "system"
          ? new HumanMessage({
              content: prompt,
              additional_kwargs: { type: "system", requestId },
            })
          : new HumanMessage({
              content: prompt,
              additional_kwargs: { requestId },
            });

      const stream = chat.streamEvents(
        { messages: [message] },
        {
          configurable: { thread_id: userId, requestId },
          version: "v2",
          // signal: controller.signal,
        },
      );

      let toolIndex = 0;
      const seenToolCalls = new Set<string>();

      for await (const event of stream) {
        // Handle streaming text chunks from the model
        if (event.event === "on_chat_model_stream") {
          const chunk = event.data?.chunk;

          // Extract text content from the chunk
          let text = "";
          if (chunk) {
            if (typeof chunk.content === "string") {
              text = chunk.content;
            } else if (Array.isArray(chunk.content)) {
              text = chunk.content
                .filter((c: any) => c.type === "text")
                .map((c: any) => c.text)
                .join("");
            } else if (chunk.text) {
              text = chunk.text;
            }
          }

          if (text) {
            yield { type: "token", text, requestId } as LlmStreamChunk;
          }
        }
        // Handle tool execution completion
        else if (event.event === "on_tool_end") {
          const output = event.data?.output;
          const toolCallId = output?.tool_call_id || event.run_id;

          if (toolCallId && seenToolCalls.has(toolCallId)) continue;
          if (toolCallId) seenToolCalls.add(toolCallId);

          if (output) {
            let parsed: any;

            // output might be the direct tool result object, or a ToolMessage with .content string
            if (typeof output.content === "string") {
              try {
                parsed = JSON.parse(output.content);
              } catch {
                parsed = output.content;
              }
            } else if (output.content) {
              parsed = output.content;
            } else {
              parsed = output;
            }

            try {
              // ── New unified ToolResponse format ──────────────────
              if (parsed && typeof parsed === "object" && parsed.kind) {
                yield {
                  type: "tool_result",
                  result: parsed,
                  toolCallId: toolCallId || undefined,
                  requestId,
                } as LlmStreamChunk;
                continue;
              }

              // ── Legacy fallback (pre-migration messages) ────────
              if (parsed && typeof parsed === "object" && parsed._dataRef) {
                const {
                  executionId,
                  dataType,
                  toolName: refToolName,
                  status,
                  isAsync,
                } = parsed._dataRef;
                yield {
                  type: "tool_result",
                  result: {
                    kind: isAsync ? "async" : "query",
                    executionId: executionId || randomUUID(),
                    toolName: refToolName || output?.name || "unknown",
                    requestId,
                    text: parsed.text || "",
                    isError: false,
                    ...(isAsync
                      ? {
                          dataType: dataType || "UNKNOWN",
                          dataStatus: status || "pending",
                        }
                      : { data: parsed }),
                  } as any,
                  toolCallId: toolCallId || undefined,
                  requestId,
                } as LlmStreamChunk;
                if (!parsed.tool_output) continue;
              }

              if (parsed && typeof parsed === "object" && parsed.data_output) {
                yield {
                  type: "tool_result",
                  result: {
                    kind: "query",
                    executionId: randomUUID(),
                    toolName: output?.name || "unknown",
                    requestId,
                    text: "",
                    isError: false,
                    data: parsed.data_output,
                  } as any,
                  toolCallId: toolCallId || undefined,
                  requestId,
                } as LlmStreamChunk;
                continue;
              }

              if (parsed && typeof parsed === "object" && parsed.tool_output) {
                const toolOutputs = this.normalizeToolOutputs(
                  parsed.tool_output,
                  toolIndex,
                );
                if (toolOutputs.length) {
                  yield {
                    type: "tool_result",
                    result: {
                      kind: "transaction",
                      executionId: randomUUID(),
                      toolName: output?.name || "unknown",
                      requestId,
                      text: parsed.text || "",
                      isError: false,
                    } as any,
                    toolCallId: toolCallId || undefined,
                    requestId,
                  } as LlmStreamChunk;
                  toolIndex += toolOutputs.length;
                }
                continue;
              }
            } catch (err) {
              console.error("Error parsing tool result in streamMessage:", err);
            }
          }
        }
      }
    } catch (error: any) {
      console.error("Error in streamMessage:", error);

      if (error.status === 429 || error.lc_error_code === "MODEL_RATE_LIMIT") {
        yield {
          type: "token",
          text: "\n\n⚠️ **Rate limit reached.** The conversation history has become too large or too many requests were sent. Please wait a moment or try clearing the chat history.",
        } as LlmStreamChunk;
      } else {
        yield {
          type: "token",
          text: "\n\n❌ **Error:** I encountered an issue while processing your request. Please try again later.",
        } as LlmStreamChunk;
      }
    } finally {
      // Clean up the active stream controller
      this.activeStreams.delete(userId);
    }
  }

  // Send a prompt to an existing chat session
  async sendMessage(
    prompt: string,
    address: string,
    network: string,
    messageType: "human" | "system" = "human",
  ): Promise<string | object> {
    try {
      // if (!this.mcpService.isConnected()) {
      //   await this.mcpService.connectToMCP();
      // }
      //only initialize if needed
      // await this.sanitizeHistory(address);
      const chat = await this.initChat(address, network);

      if (!chat) throw new Error("Chat session not initialized");

      const initialState = await chat.getState({
        configurable: { thread_id: address },
      });

      const message =
        messageType === "system"
          ? new HumanMessage({
              content: prompt,
              additional_kwargs: { type: "system" },
            })
          : new HumanMessage(prompt);

      const agentFinalState = await chat.invoke(
        { messages: [message] }, // Use the actual prompt instead of hardcoded message
        { configurable: { thread_id: address } }, // Use address as thread_id
      );

      const newMessages = initialState?.values?.messages
        ? agentFinalState.messages.slice(initialState.values.messages.length)
        : agentFinalState.messages;

      const res = {
        chat: newMessages[newMessages.length - 1].content,
        tools: newMessages
          .filter((msg: any) => msg.constructor.name === "ToolMessage")
          .map((msg: any, toolIndex: number) => {
            try {
              const parsed = JSON.parse(msg.content);

              // ── New unified ToolResponse format ──────────────────
              if (parsed.kind) {
                return {
                  id: toolIndex,
                  result: parsed,
                  content: parsed.text || "",
                  tool_output:
                    parsed.kind === "transaction"
                      ? { executionId: parsed.executionId }
                      : undefined,
                };
              }

              // ── Legacy format (pre-migration) ───────────────────
              if (parsed && typeof parsed === "object") {
                const mcpResponse = parsed;
                let content = "";

                if (
                  mcpResponse &&
                  typeof mcpResponse === "object" &&
                  mcpResponse.content &&
                  Array.isArray(mcpResponse.content) &&
                  mcpResponse.content.length > 0
                ) {
                  const textItem = mcpResponse.content.find(
                    (item: any) => item.type === "text",
                  );
                  content = textItem
                    ? textItem.text
                    : JSON.stringify(mcpResponse.content);
                } else {
                  content = JSON.stringify(mcpResponse);
                }

                const toolOutput =
                  parsed.tool_output ||
                  (mcpResponse && typeof mcpResponse === "object"
                    ? mcpResponse.tool_output
                    : undefined);
                if (toolOutput && typeof toolOutput === "object") {
                  toolOutput.id = toolIndex;
                }

                if (
                  toolOutput?.transaction ||
                  JSON.parse(content)?.transaction
                ) {
                  return {
                    id: toolIndex,
                    content: content,
                    tool_output: toolOutput ? toolOutput : JSON.parse(content),
                  };
                }
                return {
                  id: toolIndex,
                  content: content,
                  tool_output: undefined,
                };
              } else {
                return {
                  id: toolIndex,
                  content: msg.content || "",
                  tool_output: undefined,
                };
              }
            } catch (error) {
              return {
                id: toolIndex,
                content: msg.content || "",
                tool_output: undefined,
              };
            }
          })
          .filter((msg: any) => msg != null),
      };

      return res;
    } catch (error: any) {
      console.error("Error in sendMessage:", error);
      if (error.status === 429 || error.lc_error_code === "MODEL_RATE_LIMIT") {
        return {
          chat: "⚠️ **Rate limit reached.** The conversation history has become too large. Please try clearing the chat history.",
          tools: [],
        };
      }
      return {
        chat: "❌ **Error:** I encountered an issue while processing your request.",
        tools: [],
      };
    }
  }

  private normalizeToolOutputs(rawOutput: any, startIndex: number): any[] {
    if (!rawOutput) {
      return [];
    }

    const outputArray = Array.isArray(rawOutput) ? rawOutput : [rawOutput];

    return outputArray
      .map((item, idx) => {
        if (item && typeof item === "object") {
          return {
            ...item,
            id: item.id ?? startIndex + idx,
          };
        }
        return undefined;
      })
      .filter((item): item is Record<string, any> =>
        Boolean(item && typeof item === "object" && item.transaction),
      );
  }

  private safeJsonParse<T = unknown>(value: string): T | undefined {
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }

  /**
   * Retrieve a single tool query result by executionId
   */
  async getToolQueryResult(executionId: string): Promise<any> {
    try {
      const ToolQueryResult = (
        await import("../database/mongo/models/ToolQueryResult")
      ).default;
      const result = await ToolQueryResult.findOne({ executionId }).lean();
      return result;
    } catch (error) {
      console.error("Error fetching tool query result:", error);
      return null;
    }
  }

  /**
   * Retrieve multiple tool query results by executionIds
   */
  async getToolQueryResults(executionIds: string[]): Promise<Map<string, any>> {
    const resultsMap = new Map<string, any>();
    try {
      const ToolQueryResult = (
        await import("../database/mongo/models/ToolQueryResult")
      ).default;
      const results = await ToolQueryResult.find({
        executionId: { $in: executionIds },
      }).lean();

      for (const result of results) {
        resultsMap.set(result.executionId, result);
      }
      return resultsMap;
    } catch (error) {
      console.error("Error fetching tool query results:", error);
      return resultsMap;
    }
  }

  /**
   * Retrieve tool query results grouped by requestIds
   * Returns a map where key is requestId and value is array of tool outputs
   */
  async getToolQueryResultsByRequestIds(
    requestIds: string[],
  ): Promise<Record<string, any[]>> {
    const resultsMap: Record<string, any[]> = {};

    // Initialize empty arrays for all requested IDs
    for (const requestId of requestIds) {
      resultsMap[requestId] = [];
    }

    try {
      const ToolQueryResult = (
        await import("../database/mongo/models/ToolQueryResult")
      ).default;
      const results = await ToolQueryResult.find({
        requestId: { $in: requestIds },
      }).lean();

      for (const result of results) {
        if (result.requestId && resultsMap[result.requestId]) {
          resultsMap[result.requestId].push({
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
      return resultsMap;
    } catch (error) {
      console.error("Error fetching tool query results by requestIds:", error);
      return resultsMap;
    }
  }

  /**
   * Update the transaction status of a tool query result (for blockchain transactions)
   * This is separate from execution.status which tracks data fetching
   */
  async updateTransactionStatus(
    executionId: string,
    status: "unsigned" | "pending" | "completed" | "failed",
    txHash?: string,
    error?: string,
    transactionIndex: number = 0,
  ): Promise<{ success: boolean; error?: string; data?: any }> {
    try {
      const ToolQueryResult = (
        await import("../database/mongo/models/ToolQueryResult")
      ).default;

      const updateFields: Record<string, any> = {
        [`data.payload.transactions.${transactionIndex}.status`]: status,
      };

      if (status === "pending") {
        updateFields[`data.payload.transactions.${transactionIndex}.signedAt`] =
          new Date();
      }

      if (status === "completed" || status === "failed") {
        updateFields[
          `data.payload.transactions.${transactionIndex}.confirmedAt`
        ] = new Date();
      }

      if (txHash) {
        updateFields[`data.payload.transactions.${transactionIndex}.txHash`] =
          txHash;
      }

      if (error) {
        updateFields[`data.payload.transactions.${transactionIndex}.error`] =
          error;
      }

      const result = await ToolQueryResult.findOneAndUpdate(
        { executionId },
        { $set: updateFields },
        { new: true },
      ).lean();

      if (!result) {
        return {
          success: false,
          error: `No ToolQueryResult found with executionId: ${executionId}`,
        };
      }

      return {
        success: true,
        data: {
          executionId: result.executionId,
          toolName: result.toolName,
        },
      };
    } catch (error: any) {
      console.error("Error updating transaction status:", error);
      return {
        success: false,
        error: `Exception: ${error.message}`,
      };
    }
  }

  /**
   * Update the execution status of a tool query result (for data fetching)
   */
  async updateToolQueryResultStatus(
    executionId: string,
    status: "pending" | "completed" | "failed",
    error?: string,
  ): Promise<boolean> {
    try {
      const ToolQueryResult = (
        await import("../database/mongo/models/ToolQueryResult")
      ).default;

      const updateFields: Record<string, any> = {
        "execution.status": status,
      };

      if (status === "completed" || status === "failed") {
        updateFields["execution.completedAt"] = new Date();
      }

      if (error) {
        updateFields["execution.error"] = error;
      }

      const result = await ToolQueryResult.findOneAndUpdate(
        { executionId },
        { $set: updateFields },
        { new: true },
      );

      return result !== null;
    } catch (error) {
      console.error("Error updating tool query result status:", error);
      return false;
    }
  }
}
