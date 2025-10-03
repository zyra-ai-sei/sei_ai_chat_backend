import { FunctionResponse, GoogleGenAI, Part } from "@google/genai";
import fetch from "node-fetch";
import { inject, injectable } from "inversify";
import { ILlmService } from "./interfaces/ILlmService";
import env from "../envConfig";
import { TYPES } from "../ioc-container/types";
import { UserService } from "./UserService";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage } from "@langchain/core/messages";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { StructuredTool } from "@langchain/core/tools";
import { MongoClient } from "mongodb";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import toolsList from "../tools/langGraphTools";

// The prompt is static and can be defined once.
const systemPrompt = (
  address: string
) => `You are Zyra, a helpful assistant whose job is to automate, plan and execute trades on behalf of the user. You have access to the conversation history. Use it to answer the user's questions. User's address is ${address}. Note the following points:
- You are doing transactions on Sei chain. The native token on Sei is sei.
- For transactions involving sei, it needs to be converted into an erc20 wsei token first(wrap), then the transaction can be executed. If sei is the destination, do the transaction in wsei then unwrap it into sei.
- For some transacrtions, you may get a response that allowance is insufficient, in that case, use the approve_erc20 tool to get the allowance.
- You can send multiple unsigned tx to the user, the user will sign them one by one.
- For trades, suggest values, and strategies for the user.
- For token transfers, or tx involving token transfers, first check if the user has enough funds.
- Keep your responses brief, and to the point.

IMPORTANT: When using tools, ensure that tool responses follow the strict schema format where the output from tools should be directly be sent to the user without modification.`;
// const prompt = ChatPromptTemplate.fromMessages([
//   ["system", systemPrompt],
// ]);
@injectable()
export class LlmService implements ILlmService {
  private genAI: ChatGoogleGenerativeAI;
  private model: string;
  private sessionId: string;
  private client: any;

  constructor(
    @inject(TYPES.UserService) private userService: UserService
  ) {
    console.log("constructor");
    this.genAI = new ChatGoogleGenerativeAI({
      model: "gemini-2.5-flash",
      temperature: 0,
      apiKey: env.GEMINI_API_KEY,
    });
  }

  async clearChat(address: string) {
    const client = new MongoClient(env.MONGO_URI);
    const checkpointer = new MongoDBSaver({ client });
    await checkpointer.deleteThread(address);
  }

  async getChatHistory(address: string): Promise<any> {
    try {
     

      const chat = await this.initChat(address);
      if (!chat) throw new Error("Chat session not initialized");

      const initialState = await chat.getState({
        configurable: { thread_id: address },
      });

      const state = initialState?.values?.messages;
      const messages = state
        .filter((message) => {
          const hasValidId =
            message.constructor.name === "HumanMessage" ||
            message.constructor.name === "AIMessage" ||
            message.constructor.name === "ToolMessage";
          const hasContent =
            message?.content && typeof message?.content === "string";
          return hasValidId && hasContent;
        })
        .map((message) => {
          if (message.constructor.name === "ToolMessage") {
            // Parse tool content and include status if available
            try {
              const parsedContent = JSON.parse(message.content);
              // Extract text from content array if it exists
              let contentText = parsedContent.result?.content || parsedContent.result || parsedContent;
              if (Array.isArray(contentText) && contentText.length > 0) {
                // Find the first text content
                const textContent = contentText.find(item => item.type === 'text');
                contentText = textContent ? textContent.text : JSON.stringify(contentText);
              }

              return {
                type: message.constructor.name,
                content: contentText,
                status: parsedContent.status || "unexecuted",
                hash: parsedContent.hash, // Include transaction hash
                toolName: message.tool_call_id || parsedContent.toolName,
                timestamp: parsedContent.timestamp || new Date().toISOString(),
                tool_output: parsedContent.result?.tool_output || parsedContent.tool_output,
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
            timestamp: new Date().toISOString(),
          };
        });

      return messages;
    } catch (error) {
      console.error("Error getting chat history:", error);
      throw new Error(`Failed to retrieve chat history: ${error.message}`);
    }
  }

  async updateToolStatus(
    address: string,
    toolId: number,
    status: "completed" | "aborted" | "unexecuted",
    hash?: string
  ): Promise<boolean> {
    let client: MongoClient | null = null;
    try {
      // Initialize MongoDB client
      client = new MongoClient(env.MONGO_URI);
      const checkpointer = new MongoDBSaver({ client });

      // Get current checkpoint
      const threadConfig = { configurable: { thread_id: address } };
      const currentCheckpoint = await checkpointer.getTuple(threadConfig);

      if (!currentCheckpoint?.checkpoint) {
        console.log("No checkpoint found for address:", address);
        return false;
      }

      // Access the checkpoint data correctly
      const checkpointData = currentCheckpoint.checkpoint as any;
      if (!checkpointData.values?.messages) {
        console.log("No messages found in checkpoint");
        return false;
      }

      const messages = checkpointData.values.messages;

      // Find the ToolMessage with the matching toolId
      const targetToolMessageIndex = messages
        .map((msg: any, index: number) => ({ msg, index }))
        .filter(({ msg }: any) => msg.constructor.name === "ToolMessage")
        .map(({ msg, index }) => {
          try {
            const parsed = JSON.parse(msg.content);
            return { parsed, index };
          } catch {
            return null;
          }
        })
        .filter(item => item !== null)
        .find(item => {
          const toolOutput = item!.parsed.tool_output || 
            (item!.parsed.result && typeof item!.parsed.result === 'object' ? item!.parsed.result.tool_output : undefined);
          return toolOutput && toolOutput.id === toolId;
        })?.index;

      if (targetToolMessageIndex === undefined) {
        console.log(`No tool message found with ID ${toolId} for address:`, address);
        return false;
      }

      // Update the tool message content with status
      const toolMessage = messages[targetToolMessageIndex];
      try {
        const parsedContent = JSON.parse(toolMessage.content);

        // Add or update status, hash, and timestamp
        parsedContent.status = status;
        if (hash) {
          parsedContent.hash = hash;
        }
        parsedContent.updatedAt = new Date().toISOString();

        // Update the message content
        toolMessage.content = JSON.stringify(parsedContent);

        // Save the updated checkpoint with proper metadata
        const metadata = {
          source: "update" as const,
          step: (currentCheckpoint.metadata?.step || 0) + 1,
          parents: currentCheckpoint.metadata?.parents || {},
        };

        await checkpointer.put(threadConfig, checkpointData, metadata);

        console.log(`Updated tool status to ${status}${hash ? ` with hash ${hash}` : ''} for tool ID ${toolId} in address ${address}`);
        return true;
      } catch (parseError) {
        console.error("Failed to parse tool message content:", parseError);
        return false;
      }
    } catch (error) {
      console.error("Error updating tool status:", error);
      return false;
    } finally {
      if (client) {
        await client.close();
      }
    }
  }

  async abortLatestTool(address: string): Promise<boolean> {
    // This method is deprecated - use updateToolStatus with specific toolId instead
    console.warn("abortLatestTool is deprecated. Use updateToolStatus with specific toolId.");
    return false;
  }
  // Initialize and store a chat session for a sessionId (generate if not provided)
  async initChat(address: string): Promise<any> {
    
      const convertedLangGraphTools = toolsList
    let langGraphTools: StructuredTool[] = convertedLangGraphTools
    
    // Connect to your Atlas cluster or local Atlas deployment
    const client = new MongoClient(env.MONGO_URI);
    // Initialize the MongoDB checkpointer
    const checkpointer = new MongoDBSaver({ client });
    const agent = createReactAgent({
      llm: this.genAI,
      tools: langGraphTools,
      stateModifier: systemPrompt(address),
      checkpointSaver: checkpointer,
    });

    return agent;
  }

  // Send a prompt to an existing chat session
  async sendMessage(prompt: string, address: string): Promise<string | object> {
    // if (!this.mcpService.isConnected()) {
    //   await this.mcpService.connectToMCP();
    // }
    //only initialize if needed
    const chat = await this.initChat(address);

    if (!chat) throw new Error("Chat session not initialized");

    const initialState = await chat.getState({
      configurable: { thread_id: address },
    });
    console.log("hi");
    console.dir(initialState);

    const agentFinalState = await chat.invoke(
      { messages: [new HumanMessage(prompt)] }, // Use the actual prompt instead of hardcoded message
      { configurable: { thread_id: address } } // Use address as thread_id
    );

    const newMessages = initialState?.values?.messages
      ? agentFinalState.messages.slice(initialState.values.messages.length)
      : agentFinalState.messages;
    console.log("Agent final state:");
    console.dir(agentFinalState);
    console.log("New messages:");
    console.dir(newMessages);

    const res = {
      chat: newMessages[newMessages.length - 1].content,
      tools: newMessages
        .filter((msg: any) => msg.constructor.name === "ToolMessage")
        .map((msg: any, toolIndex: number) => {
          try {
            // Parse the JSON string content
            const parsed = JSON.parse(msg.content);
            console.log('hard luck', parsed)
            
            if (parsed && typeof parsed === 'object') {
              // MCP tool response structure
              const mcpResponse = parsed;
              let content = '';
              
              // Extract text from content array
              if (mcpResponse && typeof mcpResponse === 'object' && mcpResponse.content && Array.isArray(mcpResponse.content) && mcpResponse.content.length > 0) {
                const textItem = mcpResponse.content.find((item: any) => item.type === 'text');
                content = textItem ? textItem.text : JSON.stringify(mcpResponse.content);
              } else {
                content = JSON.stringify(mcpResponse);
              }
              
              // Extract tool_output and add ID
              const toolOutput = parsed.tool_output || (mcpResponse && typeof mcpResponse === 'object' ? mcpResponse.tool_output : undefined);
              if (toolOutput && typeof toolOutput === 'object') {
                toolOutput.id = toolIndex;
              }

              if(toolOutput?.transaction || JSON.parse(content)?.transaction){
                return {
                id: toolIndex,
                content: content,
                tool_output: toolOutput ? toolOutput : JSON.parse(content)
              };
              }
              return {
                id: toolIndex,
                content: content,
                tool_output: undefined
              };
            } else {
              // Fallback
              return {
                id: toolIndex,
                content: msg.content || '',
                tool_output: undefined
              };
            }
          } catch (error) {
            // If parsing fails, return as-is
            return {
              id: toolIndex,
              content: msg.content || '',
              tool_output: undefined
            };
          }
        })
        .filter((msg: any) => msg != null),
    };
    console.log(
      "Response from agent:",
      res,
      newMessages.filter((msg: any) => msg.constructor.name === "ToolMessage")
    );
    return res;
  }

}
