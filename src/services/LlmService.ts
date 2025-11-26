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
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { StructuredTool } from "@langchain/core/tools";
import { MongoClient } from "mongodb";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import toolsList from "../tools/langGraphTools";
import { getSystemPrompt } from "../utils/prompts";
import fs, { mkdirSync, writeFileSync } from "fs";
import { json } from "stream/consumers";
import path from "path";

@injectable()
export class LlmService implements ILlmService {
  private genAI: ChatGoogleGenerativeAI;
  private model: string;
  private sessionId: string;
  private mongoClient: MongoClient;
  private checkpointer: MongoDBSaver;

  constructor(@inject(TYPES.UserService) private userService: UserService) {
    console.log("constructor");
    this.genAI = new ChatGoogleGenerativeAI({
      model: "gemini-2.5-flash",
      temperature: 0,
      apiKey: env.GEMINI_API_KEY,
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

  async clearChat(address: string) {
    await this.checkpointer.deleteThread(address);
  }

  async getChatHistory(address: string): Promise<any> {
    try {
      const chat = await this.initChat(address);
      if (!chat) throw new Error("Chat session not initialized");

      const initialState = await chat.getState({
        configurable: { thread_id: address },
      });

      const state = initialState?.values?.messages || [];
      const messages = state
        .filter((message: any) => {
          if (message.constructor.name === "SystemMessage") return false;
          if (message.constructor.name === "HumanMessage" && message.additional_kwargs?.type === "system") return false;
          return true;
        })
        .map((message: any) => {
        if (message.constructor.name === "ToolMessage") {
          const test = JSON.stringify(message);
          // Parse tool content and include status if available
          try {
            const parsedContent = JSON.parse(message.content);
            // Extract tool_output from the parsed content
            let toolOutput =
              parsedContent.tool_output || parsedContent.result?.tool_output;

            // Extract display text from content array if it exists
            let displayText = "";
            if (parsedContent.content && Array.isArray(parsedContent.content)) {
              const textItem = parsedContent.content.find(
                (item: any) => item.type === "text"
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

            

            return {
              type: message.constructor.name,
              content: displayText,
              id: message.id, // Include the message ID
              status: parsedContent.status || "unexecuted",
              hash: parsedContent.hash,
              toolName:
                message.name || message.tool_call_id || parsedContent.toolName,
              timestamp: parsedContent.timestamp || new Date().toISOString(),
              tool_output: toolOutput,
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
    address: string,
    executionId: string,
    executionState: "completed" | "pending" | "failed",
    txnHash?: string
  ): Promise<boolean> {
    try {
      // Get the chat agent (same way as getChatHistory)
      const chat = await this.initChat(address);
      if (!chat) {
        return false;
      }

      // Get current state
      const currentState = await chat.getState({
        configurable: { thread_id: address },
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
            if (parsedContent.tool_output && Array.isArray(parsedContent.tool_output)) {
              const toolOutputs = parsedContent.tool_output;
              
              // Find the output with the matching executionId
              const outputIndex = toolOutputs.findIndex((output: any) => output.executionId === executionId);
              
              if (outputIndex !== -1) {
                // Update the specific output
                const output = toolOutputs[outputIndex];
                
                // Reconstruct object to place new fields after executionId
                const newOutput: any = {};
                for (const key of Object.keys(output)) {
                  newOutput[key] = output[key];
                  if (key === 'executionId') {
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
        console.log(`No tool output found with executionId ${executionId} for address: ${address}`);
        return false;
      }

      // Update the state back to the graph
      await chat.updateState(
        { configurable: { thread_id: address } },
        { messages: messages }
      );

      console.log(
        `Successfully updated executionId ${executionId} to ${executionState} for address ${address}`
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

  private async sanitizeHistory(address: string): Promise<void> {
    try {
      const config = { configurable: { thread_id: address } };
      const checkpointTuple = await this.checkpointer.getTuple(config);

      if (!checkpointTuple?.checkpoint) return;

      const checkpoint = checkpointTuple.checkpoint;
      const messages = checkpoint.channel_values?.messages;

      if (!Array.isArray(messages)) return;

      let hasChanges = false;
      const sanitizedMessages = messages.map((msg: any) => {
        // Check for SystemMessage (either by class name or type property)
        const isSystemMessage = 
          msg.constructor.name === "SystemMessage" || 
          msg.type === "system" || 
          (msg.lc_id && msg.lc_id.includes("SystemMessage"));

        if (isSystemMessage) {
          hasChanges = true;
          // Convert to HumanMessage with system type flag
          // We need to preserve the ID and content
          return new HumanMessage({
            content: msg.content,
            additional_kwargs: { ...msg.additional_kwargs, type: "system" },
            id: msg.id,
            name: msg.name
          });
        }
        return msg;
      });

      if (hasChanges) {
        const newCheckpoint = {
          ...checkpoint,
          channel_values: {
            ...checkpoint.channel_values,
            messages: sanitizedMessages
          }
        };
        
        // We need to provide newVersions, but since we are just modifying existing messages in place
        // without changing the structure significantly, we might be able to reuse existing versions or pass empty.
        // However, LangGraph might expect versions. 
        // For safety, we can try to pass the existing versions if available, or empty object.
        // The put method signature: put(config, checkpoint, metadata, newVersions)
        
        // We'll use the parent config from the tuple if available, or the config we created
        const writeConfig = checkpointTuple.config || config;
        
        await this.checkpointer.put(
          writeConfig, 
          newCheckpoint, 
          checkpointTuple.metadata, 
        );
      }
    } catch (error) {
      console.error("Error sanitizing history:", error);
      // Don't throw, just log, so we don't block execution if this fails
    }
  }

  // Initialize and store a chat session for a sessionId (generate if not provided)
  async initChat(address: string): Promise<any> {
    const convertedLangGraphTools = toolsList;
    let langGraphTools: StructuredTool[] = convertedLangGraphTools;

    // Use the pooled checkpointer
    const agent = createReactAgent({
      llm: this.genAI,
      tools: langGraphTools,
      stateModifier: getSystemPrompt(address),
      checkpointSaver: this.checkpointer,
    });
    return agent;
  }

  async *streamMessage(
    prompt: string,
    address: string,
    abortSignal?: AbortSignal,
    messageType: "human" | "system" = "human"
  ): AsyncGenerator<LlmStreamChunk> {
    await this.sanitizeHistory(address);
    const chat = await this.initChat(address);

    if (!chat) {
      throw new Error("Chat session not initialized");
    }

    const message = messageType === "system" 
      ? new HumanMessage({ content: prompt, additional_kwargs: { type: "system" } }) 
      : new HumanMessage(prompt);

    const stream = chat.streamEvents(
      { messages: [message] },
      { configurable: { thread_id: address }, version: "v2" }
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
            
            // Check if it has tool_output field (our custom format)
            if (parsed.tool_output) {
              toolOutput = this.normalizeToolOutputs(
                parsed.tool_output,
                toolIndex
              );
            }

            
            if (!toolOutput.length) {
              const fallbackContent = this.safeJsonParse(toolContent);
              toolOutput = this.normalizeToolOutputs(
                fallbackContent,
                toolIndex
              );
            }
            
            if (!toolOutput.length) {
              continue;
            }
            const outputDir = path.resolve(process.cwd(), "test", "output");
            mkdirSync(outputDir, { recursive: true });
            writeFileSync(
              path.join(outputDir, "llm-output.json"),
              JSON.stringify(output, null, 2)
            );
            
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
  }

  // Send a prompt to an existing chat session
  async sendMessage(prompt: string, address: string, messageType: "human" | "system" = "human"): Promise<string | object> {
    // if (!this.mcpService.isConnected()) {
    //   await this.mcpService.connectToMCP();
    // }
    //only initialize if needed
    await this.sanitizeHistory(address);
    const chat = await this.initChat(address);

    if (!chat) throw new Error("Chat session not initialized");

    const initialState = await chat.getState({
      configurable: { thread_id: address },
    });
    console.log("hi");
    console.dir(initialState);

    const message = messageType === "system" 
      ? new HumanMessage({ content: prompt, additional_kwargs: { type: "system" } }) 
      : new HumanMessage(prompt);

    const agentFinalState = await chat.invoke(
      { messages: [message] }, // Use the actual prompt instead of hardcoded message
      { configurable: { thread_id: address } } // Use address as thread_id
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
                  (item: any) => item.type === "text"
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

              if (toolOutput?.transaction || JSON.parse(content)?.transaction) {
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
        Boolean(item && typeof item === "object" && item.transaction)
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
