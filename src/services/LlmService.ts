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
import { HumanMessage, SystemMessage, trimMessages } from "@langchain/core/messages";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { StructuredTool } from "@langchain/core/tools";
import { MongoClient } from "mongodb";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import {
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
export class LlmService implements ILlmService {
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
          if (message.constructor.name === "ToolMessage") {
            const test = JSON.stringify(message);
            // Parse tool content and include status if available
            try {
              const parsedContent = JSON.parse(message.content);
              // Extract tool_output from the parsed content
              let toolOutput = parsedContent.tool_output;

              let dataOutput = parsedContent.data_output;

              // Extract display text from content array if it exists
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
              } else {
                displayText = JSON.stringify(parsedContent);
              }
              if (toolOutput) {
                return {
                  type: message.constructor.name,
                  content: displayText,
                  id: message.id, // Include the message ID
                  status: parsedContent.status || "unexecuted",
                  hash: parsedContent.hash,
                  toolName:
                    message.name ||
                    message.tool_call_id ||
                    parsedContent.toolName,
                  timestamp:
                    parsedContent.timestamp || new Date().toISOString(),
                  tool_output: toolOutput,
                };
              } else
                return {
                  type: message.constructor.name,
                  content: displayText,
                  id: message.id, // Include the message ID
                  status: parsedContent.status || "unexecuted",
                  hash: parsedContent.hash,
                  toolName:
                    message.name ||
                    message.tool_call_id ||
                    parsedContent.toolName,
                  timestamp:
                    parsedContent.timestamp || new Date().toISOString(),
                  data_output: dataOutput,
                };
            } catch (parseError) {
              console.warn("Failed to parse tool message content:", parseError);
              return {
                type: message.constructor.name,
                content: message.content,
                status: "unexecuted",
                timestamp: new Date().toISOString(),
              };
            }
          }

          return {
            type: message.constructor.name,
            content: message.content,
            id: message.id, // Include the message ID
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
   * Update a specific message by its execution ID in tool_output
   */
  async updateMessageById(
    userId: string,
    address: string,
    network: string,
    executionId: string,
    executionState: "completed" | "pending" | "failed",
    txnHash?: string,
  ): Promise<boolean> {
    try {
      // Get the chat agent (same way as getChatHistory)
      const chat = await this.initChat(address, network);
      if (!chat) {
        return false;
      }

      // Get current state
      const currentState = await chat.getState({
        configurable: { thread_id: userId },
      });

      if (!currentState?.values?.messages) {
        return false;
      }

      const messages = currentState.values.messages;
      let messageUpdated = false;

      // Iterate through messages to find the one with the matching executionId
      for (const message of messages) {
        if (message.constructor.name === "ToolMessage") {
          try {
            const parsedContent = JSON.parse(message.content);

            // Check if tool_output exists and is an array
            if (
              parsedContent.tool_output &&
              Array.isArray(parsedContent.tool_output)
            ) {
              const toolOutputs = parsedContent.tool_output;

              // Find the output with the matching executionId
              const outputIndex = toolOutputs.findIndex(
                (output: any) => output.executionId === executionId,
              );

              if (outputIndex !== -1) {
                // Update the specific output
                const output = toolOutputs[outputIndex];

                // Reconstruct object to place new fields after executionId
                const newOutput: any = {};
                for (const key of Object.keys(output)) {
                  newOutput[key] = output[key];
                  if (key === "executionId") {
                    newOutput.executionStatus = executionState;
                    if (txnHash) {
                      newOutput.txnHash = txnHash;
                    }
                  }
                }

                // Ensure fields are added if executionId wasn't the key (though it should be)
                if (!newOutput.executionStatus) {
                  newOutput.executionStatus = executionState;
                  if (txnHash) newOutput.txnHash = txnHash;
                }

                toolOutputs[outputIndex] = newOutput;

                // Update the message content
                message.content = JSON.stringify(parsedContent);
                messageUpdated = true;
                break; // Stop searching after finding the match
              }
            }
          } catch (parseError) {
            // Ignore parsing errors for non-JSON content
            continue;
          }
        }
      }

      if (!messageUpdated) {
        console.log(
          `No tool output found with executionId ${executionId} for userId: ${userId}`,
        );
        return false;
      }

      // Update the state back to the graph
      await chat.updateState(
        { configurable: { thread_id: userId } },
        { messages: messages },
      );
      return true;
    } catch (error) {
      console.error("Error updating message by execution ID:", error);
      return false;
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

    const allTools = [...cryptoTools, ...databaseTools, ...twitterTools];

    const agent = createReactAgent({
      llm: this.genAI,
      tools: allTools,
      checkpointSaver: this.checkpointer,
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
        while (sliceIndex > 0 && messages[sliceIndex].constructor.name !== "HumanMessage") {
          sliceIndex--;
        }

        // 4. Return system prompt + the safe windowed slice
        return [
          new SystemMessage(systemPrompt),
          ...messages.slice(sliceIndex)
        ];
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
    address: string,
    network: string,
    abortSignal?: AbortSignal,
    messageType: "human" | "system" = "human",
  ): AsyncGenerator<LlmStreamChunk> {
    try {
      // await this.sanitizeHistory(address);
      const chat = await this.initChat(address, network);
      console.log("reached chat creating", prompt);
      if (!chat) {
        throw new Error("Chat session not initialized");
      }

      const message =
        messageType === "system"
          ? new HumanMessage({
              content: prompt,
              additional_kwargs: { type: "system" },
            })
          : new HumanMessage(prompt);

      const stream = chat.streamEvents(
        { messages: [message] },
        {
          configurable: { thread_id: userId },
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

          // The chunk is an AIMessageChunk with content property
          if (chunk && chunk.text && typeof chunk.text === "string") {
            yield { type: "token", text: chunk.text } as LlmStreamChunk;
          }
        }
        // Handle tool execution completion
        else if (event.event === "on_tool_end") {
          const output = event.data?.output;

          // Skip if we've already processed this tool call
          const toolCallId = output?.tool_call_id;

          if (toolCallId && seenToolCalls.has(toolCallId)) {
            continue;
          }

          if (toolCallId) {
            seenToolCalls.add(toolCallId);
          }

          const toolName = output?.name || "unknown";

          let toolContent = "";
          let toolOutput: any[] = [];
          let data_output: any;

          // Extract content from the tool output
          if (output && typeof output === "object") {
            const rawContent = output.content;

            toolContent =
              typeof rawContent === "string"
                ? rawContent
                : JSON.stringify(rawContent);

            // Try to parse the content JSON
            try {
              const parsed = JSON.parse(toolContent);
              // Extract executionId if present

              if (parsed.data_output) {
                data_output = parsed.data_output;
                yield {
                  type: "data",
                  content: toolContent,
                  data_output,
                } as LlmStreamChunk;
                continue;
              }

              // Check if it has tool_output field (our custom format)
              if (parsed.tool_output) {
                toolOutput = this.normalizeToolOutputs(
                  parsed.tool_output,
                  toolIndex,
                );
              }

              if (!toolOutput.length) {
                const fallbackContent = this.safeJsonParse(toolContent);
                toolOutput = this.normalizeToolOutputs(
                  fallbackContent,
                  toolIndex,
                );
              }

              if (!toolOutput.length) {
                continue;
              }

              yield {
                type: "tool",
                toolName,
                content: toolContent,
                tool_output: toolOutput,
              } as LlmStreamChunk;

              toolIndex += toolOutput.length;
            } catch {
              // If parsing fails, treat content as plain text
            }
          }

          // Add ID if not present
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
              // Parse the JSON string content
              const parsed = JSON.parse(msg.content);

              if (parsed && typeof parsed === "object") {
                // MCP tool response structure
                const mcpResponse = parsed;
                let content = "";

                // Extract text from content array
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

                // Extract tool_output and add ID
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
                // Fallback
                return {
                  id: toolIndex,
                  content: msg.content || "",
                  tool_output: undefined,
                };
              }
            } catch (error) {
              // If parsing fails, return as-is
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
}
